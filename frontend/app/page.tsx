"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const API_URL = "http://127.0.0.1:8000";

type Page =
  | "overview"
  | "change"
  | "evidence"
  | "experiments"
  | "decision"
  | "rollout";

type MetricSet = Record<string, number | string | null | undefined>;

type RolloutStep =
  | string
  | {
      step?: number | string;
      action?: string;
      description?: string;
    };

type ResearchSource = {
  query: string;
  title: string;
  url: string;
  content: string;
  score: number | null;
};

type ResearchData = {
  available: boolean;
  query_count: number;
  source_count: number;
  queries: string[];
  sources: ResearchSource[];
  assessment: {
    available: boolean;
    queries_used: number;
    sources_used: number;
    summary: string;
    risk_mechanism: string;
    research_conclusion: string;
  };
};

type StateData = {
  change: {
    change_id: string;
    title: string;
    component: string;
    description: string;
    current_state: Record<string, unknown>;
    proposed_state: Record<string, unknown>;
    target: {
      environment: string;
      workload: string;
    };
    risk_policy: {
      warn_percent: number;
      block_percent: number;
    };
  };

  analysis: {
    risk_level: string;
    change_summary: string;
    risk_factors: string[];
    requires_experiment: boolean;
  };

  research: {
    available: boolean;
    query_count: number;
    source_count: number;
  };

  research_assessment: {
    available: boolean;
    queries_used: number;
    sources_used: number;
    summary: string;
    risk_mechanism: string;
    research_conclusion: string;
  };

  decision: {
    status: string;
    reason: string;
    recommendation: string;
    baseline_metrics?: MetricSet;
    candidate_metrics?: MetricSet;
    comparison?: MetricSet;
    triggered_rules: string[];
    evidence_chain: string[];
  };

  rollout: {
    status: string;
    action: string;
    steps: RolloutStep[];
    measured_regressions: RolloutStep[];
    policy: string;
  };
};

const navigation: { id: Page; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "◈" },
  { id: "change", label: "Change", icon: "⇄" },
  { id: "evidence", label: "Evidence", icon: "◎" },
  { id: "experiments", label: "Experiments", icon: "◌" },
  { id: "decision", label: "Decision", icon: "◆" },
  { id: "rollout", label: "Rollout", icon: "→" },
];

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, {
          maximumFractionDigits: 2,
        });
  }

  return String(value);
}

function formatMetricName(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeMetricEntries(metrics?: MetricSet | null) {
  if (!metrics || typeof metrics !== "object") {
    return [];
  }

  return Object.entries(metrics).filter(
    ([, value]) => value !== undefined && value !== null
  );
}

function getNumericMetric(
  metrics: MetricSet | undefined,
  keys: string[]
): number | null {
  if (!metrics) {
    return null;
  }

  for (const key of keys) {
    const value = metrics[key];

    if (typeof value === "number") {
      return value;
    }
  }

  return null;
}

function getComparisonValue(
  comparison: MetricSet | undefined,
  possibleKeys: string[]
): number | null {
  return getNumericMetric(comparison, possibleKeys);
}

function comparisonClass(value: number | null): string {
  if (value === null) {
    return "text-slate-400";
  }

  if (value > 20) {
    return "text-red-400";
  }

  if (value > 10) {
    return "text-amber-400";
  }

  if (value < 0) {
    return "text-emerald-400";
  }

  return "text-slate-300";
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function getStepAction(step: RolloutStep): string {
  if (typeof step === "string") {
    return step;
  }

  return step.action || "Rollout action";
}

function getStepDescription(step: RolloutStep): string {
  if (typeof step === "string") {
    return "";
  }

  return step.description || "";
}

function getStepNumber(step: RolloutStep, index: number): string {
  if (typeof step === "object" && step.step !== undefined) {
    return String(step.step);
  }

  return String(index + 1);
}

export default function Home() {
  const [activePage, setActivePage] = useState<Page>("overview");
  const [data, setData] = useState<StateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [validationError, setValidationError] = useState("");
  const [proposedMaxTokens, setProposedMaxTokens] = useState<number>(500);

  const loadState = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/state`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }

      const state = (await response.json()) as StateData;

      setData(state);
      const proposedMax = state?.change?.proposed_state?.max_tokens;
      if (typeof proposedMax === "number") {
        setProposedMaxTokens(proposedMax);
      }
      setError("");
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to load Prelight state:", err);

      setError(
        "Unable to connect to the Prelight backend. Make sure FastAPI is running on port 8000."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const handleValidate = useCallback(async () => {
    if (validating) {
      return;
    }

    setValidating(true);
    setValidationError("");
    setValidationMessage("Starting validation...");

    try {
      setValidationMessage("Analyzing proposed change...");

      const response = await fetch(`${API_URL}/api/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          max_tokens: proposedMaxTokens,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result?.detail ||
            result?.message ||
            "Prelight validation failed."
        );
      }

      setValidationMessage("Validation completed. Refreshing decision...");

      await loadState();
      setActivePage("decision");

      setValidationMessage(
        `Validation complete · ${result.result?.status || "DECISION READY"}`
      );

      setTimeout(() => {
        setValidationMessage("");
      }, 4000);
    } catch (err) {
      console.error(err);

      setValidationError(
        err instanceof Error
          ? err.message
          : "Unable to validate the proposed change."
      );

      setValidationMessage("");
    } finally {
      setValidating(false);
    }
  }, [loadState, proposedMaxTokens, validating]);

  useEffect(() => {
    let cancelled = false;

    const fetchInitialState = async () => {
      try {
        const response = await fetch(`${API_URL}/api/state`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Backend returned ${response.status}`);
        }

        const state = (await response.json()) as StateData;

        if (cancelled) {
          return;
        }

        setData(state);
        const proposedMax = state?.change?.proposed_state?.max_tokens;
        if (typeof proposedMax === "number") {
          setProposedMaxTokens(proposedMax);
        }
        setError("");
        setLastUpdated(new Date());
      } catch (err) {
        if (cancelled) {
          return;
        }

        console.error("Failed to load Prelight state:", err);

        setError(
          "Unable to connect to the Prelight backend. Make sure FastAPI is running on port 8000."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchInitialState();

    const interval = window.setInterval(() => {
      if (!validating) {
        loadState();
      }
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loadState, validating]);

  const pageTitle = useMemo(() => {
    const item = navigation.find((nav) => nav.id === activePage);
    return item?.label ?? "Overview";
  }, [activePage]);

  const decisionStatus = data?.decision?.status || "UNKNOWN";

  if (loading && !data) {
    return (
      <main className="min-h-screen bg-[#07090d] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white" />

          <p className="text-sm text-slate-400">
            Loading Prelight control plane...
          </p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-[#07090d] text-white flex items-center justify-center px-6">
        <div className="max-w-md rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
          <p className="mb-2 text-sm font-semibold text-red-400">
            Backend connection failed
          </p>

          <p className="text-sm leading-6 text-slate-400">{error}</p>

          <button
            onClick={loadState}
            className="mt-5 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  const currentState = data.change.current_state ?? {};
  const proposedState = data.change.proposed_state ?? {};

  const maxTokensCurrent =
    currentState.max_tokens !== undefined
      ? String(currentState.max_tokens)
      : "—";

  const maxTokensProposed =
    proposedState.max_tokens !== undefined
      ? String(proposedState.max_tokens)
      : "—";

  return (
    <main className="min-h-screen bg-[#07090d] text-white">
      <div className="flex min-h-screen">
        {/* SIDEBAR */}
        <aside className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col border-r border-white/[0.07] bg-[#090b10]">
          <div className="border-b border-white/[0.07] px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                <span className="text-lg font-semibold">P</span>
              </div>

              <div>
                <div className="text-[15px] font-semibold tracking-wide">
                  PRELIGHT
                </div>

                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  AI Infrastructure Safety
                </div>
              </div>
            </div>
          </div>

          <div className="px-3 py-5">
            <div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Control Plane
            </div>

            <nav className="space-y-1">
              {navigation.map((item) => {
                const active = activePage === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => setActivePage(item.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                      active
                        ? "bg-white/[0.08] text-white"
                        : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300"
                    }`}
                  >
                    <span
                      className={`w-5 text-center text-sm ${
                        active ? "text-white" : "text-slate-600"
                      }`}
                    >
                      {item.icon}
                    </span>

                    <span>{item.label}</span>

                    {item.id === "decision" && (
                      <span
                        className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          decisionStatus === "BLOCK"
                            ? "bg-red-500/10 text-red-400"
                            : decisionStatus === "WARN"
                              ? "bg-amber-500/10 text-amber-400"
                              : decisionStatus === "SAFE"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-zinc-700/60 text-zinc-300"
                        }`}
                      >
                        {decisionStatus}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="mt-auto border-t border-white/[0.07] p-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    decisionStatus === "BLOCK"
                      ? "bg-red-500"
                      : decisionStatus === "WARN"
                        ? "bg-amber-500"
                        : decisionStatus === "SAFE"
                          ? "bg-emerald-500"
                          : "bg-zinc-500"
                  }`}
                />

                <span className="text-xs font-medium text-slate-300">
                  {decisionStatus}
                </span>
              </div>

              <p className="text-[11px] leading-5 text-slate-600">
                Nemotron · Nebius · NVIDIA workload validation
              </p>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <section className="ml-64 min-h-screen flex-1">
          <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-white/[0.07] bg-[#07090d]/95 px-8 backdrop-blur">
            <div>
              <div className="text-sm font-medium text-slate-300">
                {pageTitle}
              </div>

              <div className="mt-0.5 text-[11px] text-slate-600">
                {data.change.change_id} · Live validation state
              </div>
            </div>

            <div className="flex items-center gap-4">
              {lastUpdated && (
                <span className="text-[11px] text-slate-600">
                  Updated{" "}
                  {lastUpdated.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              )}

              <div className="flex items-center gap-2 text-[11px] text-emerald-400">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    validating
                      ? "animate-pulse bg-amber-400"
                      : "bg-emerald-400"
                  }`}
                />

                {validating ? "VALIDATING" : "LIVE"}
              </div>

              <button
                onClick={handleValidate}
                disabled={validating}
                className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                  validating
                    ? "cursor-not-allowed border border-amber-500/20 bg-amber-500/10 text-amber-400"
                    : "border border-white/10 bg-white text-black hover:bg-slate-200"
                }`}
              >
                {validating ? "Validating..." : "Validate Change"}
              </button>

              <button
                onClick={loadState}
                disabled={validating}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Refresh
              </button>
            </div>
          </header>

          <div className="mx-auto max-w-7xl px-8 py-8">
            {error && (
              <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {validationError && (
              <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
                {validationError}
              </div>
            )}

            {validationMessage && !error && (
              <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] px-4 py-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 text-xs text-emerald-400">
                  ✓
                </span>

                <span className="text-sm text-slate-400">
                  {validationMessage}
                </span>
              </div>
            )}

            {validating && (
              <div className="mb-6 overflow-hidden rounded-xl border border-amber-500/15 bg-amber-500/[0.025]">
                <div className="h-0.5 w-full animate-pulse bg-amber-400/60" />

                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-amber-400" />

                  <div>
                    <div className="text-sm font-medium text-slate-300">
                      Prelight validation running
                    </div>

                    <div className="mt-0.5 text-xs text-slate-600">
                      {validationMessage || "Analyzing change, researching evidence, evaluating experiments, and producing a safety decision."}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activePage === "overview" && (
              <OverviewPage
                data={data}
                maxTokensCurrent={maxTokensCurrent}
                maxTokensProposed={maxTokensProposed}
                onNavigate={setActivePage}
              />
            )}

            {activePage === "change" && (
              <ChangePage
                data={data}
                proposedMaxTokens={proposedMaxTokens}
                setProposedMaxTokens={setProposedMaxTokens}
              />
            )}

            {activePage === "evidence" && <EvidencePage data={data} />}

            {activePage === "experiments" && (
              <ExperimentsPage data={data} />
            )}

            {activePage === "decision" && <DecisionPage data={data} />}

            {activePage === "rollout" && <RolloutPage data={data} />}
          </div>
        </section>
      </div>
    </main>
  );
}

/* ============================================================
   OVERVIEW
============================================================ */

function OverviewPage({
  data,
  maxTokensCurrent,
  maxTokensProposed,
  onNavigate,
}: {
  data: StateData;
  maxTokensCurrent: string;
  maxTokensProposed: string;
  onNavigate: (page: Page) => void;
}) {
  const comparison = data.decision.comparison ?? {};

  const ttft = getComparisonValue(comparison, [
    "mean_ttft_change_percent",
    "ttft_mean_change_percent",
    "mean_ttft_percent",
  ]);

  const p95Ttft = getComparisonValue(comparison, [
    "p95_ttft_change_percent",
    "ttft_p95_change_percent",
    "p95_ttft_percent",
  ]);

  const latency = getComparisonValue(comparison, [
    "mean_latency_change_percent",
    "latency_mean_change_percent",
    "mean_latency_percent",
  ]);

  const p95Latency = getComparisonValue(comparison, [
    "p95_latency_change_percent",
    "latency_p95_change_percent",
    "p95_latency_percent",
  ]);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
          Pre-deployment validation
        </div>

        <h1 className="text-3xl font-semibold tracking-tight">
          Before the change reaches production.
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          Prelight evaluates infrastructure changes experimentally and
          produces an evidence-backed rollout decision.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ValueCard
          label="Decision"
          value={data.decision.status}
          detail="Deterministic safety policy"
          danger={data.decision.status === "BLOCK"}
        />

        <ValueCard
          label="Risk"
          value={data.analysis.risk_level}
          detail="Change analysis"
        />

        <ValueCard
          label="Evidence"
          value={`${data.research.source_count} sources`}
          detail={`${data.research.query_count} research queries`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <DetailPanel title="Active validation">
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            <InfoItem label="Change ID" value={data.change.change_id} />
            <InfoItem label="Component" value={data.change.component} />
            <InfoItem
              label="Environment"
              value={data.change.target.environment}
            />
            <InfoItem label="Workload" value={data.change.target.workload} />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-600">
                Current
              </div>

              <div className="mt-3 text-2xl font-semibold">
                {maxTokensCurrent}
              </div>

              <div className="mt-1 text-xs text-slate-500">
                max generation tokens
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-600">
                Proposed
              </div>

              <div className="mt-3 text-2xl font-semibold">
                {maxTokensProposed}
              </div>

              <div className="mt-1 text-xs text-slate-500">
                max generation tokens
              </div>
            </div>
          </div>
        </DetailPanel>

        <DetailPanel title="Measured impact">
          <div className="space-y-4">
            <MiniStat label="Mean TTFT" value={ttft} suffix="%" />
            <MiniStat label="P95 TTFT" value={p95Ttft} suffix="%" />
            <MiniStat label="Mean latency" value={latency} suffix="%" />
            <MiniStat label="P95 latency" value={p95Latency} suffix="%" />
          </div>
        </DetailPanel>
      </div>

      <DetailPanel title="Evidence chain">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.decision.evidence_chain.map((step, index) => (
            <button
              key={`${step}-${index}`}
              onClick={() => {
                if (step.includes("RESEARCH")) {
                  onNavigate("evidence");
                } else if (step.includes("EXPERIMENT")) {
                  onNavigate("experiments");
                } else if (step.includes("DECISION")) {
                  onNavigate("decision");
                }
              }}
              className="flex items-center gap-4 rounded-xl border border-white/[0.05] bg-white/[0.015] p-4 text-left transition hover:bg-white/[0.04]"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-xs text-slate-500">
                {index + 1}
              </span>

              <span className="text-sm text-slate-300">{step}</span>
            </button>
          ))}
        </div>
      </DetailPanel>
    </div>
  );
}

/* ============================================================
   CHANGE
============================================================ */

function ChangePage({
  data,
  proposedMaxTokens,
  setProposedMaxTokens,
}: {
  data: StateData;
  proposedMaxTokens: number;
  setProposedMaxTokens: (value: number) => void;
}) {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Proposed change"
        title={data.change.title}
        description={data.change.description}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DetailPanel title="Current state">
          <MetricTable metrics={data.change.current_state as MetricSet} />
        </DetailPanel>

        <DetailPanel title="Proposed state">
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
              <div className="mb-3 text-[10px] uppercase tracking-[0.16em] text-slate-600">
                max_tokens
              </div>

              <input
                type="number"
                min={1}
                max={4096}
                value={proposedMaxTokens}
                onChange={(event) =>
                  setProposedMaxTokens(Number(event.target.value) || 1)
                }
                className="w-32 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-white"
              />
            </div>

            <MetricTable metrics={data.change.proposed_state as MetricSet} />
          </div>
        </DetailPanel>
      </div>

      <DetailPanel title="Change analysis">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <InfoItem label="Risk level" value={data.analysis.risk_level} />

          <InfoItem
            label="Experiment required"
            value={data.analysis.requires_experiment ? "Yes" : "No"}
          />

          <InfoItem
            label="Policy"
            value={`Warn > ${data.change.risk_policy.warn_percent}% · Block > ${data.change.risk_policy.block_percent}%`}
          />
        </div>

        <div className="mt-6 rounded-xl border border-amber-500/10 bg-amber-500/[0.03] p-5">
          <div className="mb-3 text-[10px] uppercase tracking-[0.16em] text-amber-500/70">
            Risk factors
          </div>

          <div className="space-y-2">
            {data.analysis.risk_factors.map((factor, index) => (
              <div
                key={index}
                className="flex gap-3 text-sm leading-6 text-slate-400"
              >
                <span className="text-amber-400">•</span>
                <span>{factor}</span>
              </div>
            ))}
          </div>
        </div>
      </DetailPanel>
    </div>
  );
}

/* ============================================================
   EVIDENCE
============================================================ */

function EvidencePage({ data }: { data: StateData }) {
  const [research, setResearch] = useState<ResearchData | null>(null);
  const [loadingResearch, setLoadingResearch] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadResearch = async () => {
      try {
        const response = await fetch(`${API_URL}/api/research`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Research endpoint returned ${response.status}`);
        }

        const result = (await response.json()) as ResearchData;

        if (!cancelled) {
          setResearch(result);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load research:", error);
          setResearch(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingResearch(false);
        }
      }
    };

    loadResearch();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loadingResearch) {
    return (
      <div className="space-y-6">
        <SectionHeader
          eyebrow="External research"
          title="Research evidence"
          description="Prelight is loading the evidence used to evaluate the proposed infrastructure change."
        />

        <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-6">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-white" />

          <span className="text-sm text-slate-500">
            Loading research sources...
          </span>
        </div>
      </div>
    );
  }

  if (!research) {
    return (
      <div className="space-y-6">
        <SectionHeader
          eyebrow="External research"
          title="Research evidence"
          description="Prelight could not load the research evidence."
        />

        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-6 text-sm text-red-300">
          Research endpoint unavailable.
        </div>
      </div>
    );
  }

  const assessment = research.assessment ?? data.research_assessment;

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="External research"
        title="Research evidence"
        description="Prelight researches the proposed change before relying on experiment results for the final safety decision."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ValueCard
          label="Queries"
          value={String(research.query_count)}
          detail="Tavily research queries"
        />

        <ValueCard
          label="Sources"
          value={String(research.source_count)}
          detail="Retrieved evidence sources"
        />

        <ValueCard
          label="Evidence status"
          value={research.available ? "READY" : "UNAVAILABLE"}
          detail="External research state"
        />
      </div>

      <DetailPanel title="Research assessment">
        <div className="space-y-6">
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-slate-600">
              Why Prelight researched this change
            </div>

            <p className="text-sm leading-7 text-slate-400">
              {assessment.summary || "No research summary available."}
            </p>
          </div>

          <div>
            <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-slate-600">
              Risk mechanism identified
            </div>

            <div className="rounded-xl border border-amber-500/10 bg-amber-500/[0.025] p-5">
              <p className="text-sm leading-7 text-slate-400">
                {assessment.risk_mechanism ||
                  "No risk mechanism available."}
              </p>
            </div>
          </div>

          <div>
            <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-slate-600">
              Research conclusion
            </div>

            <p className="text-sm leading-7 text-slate-400">
              {assessment.research_conclusion ||
                "No research conclusion available."}
            </p>
          </div>
        </div>
      </DetailPanel>

      <DetailPanel title="Research queries">
        <div className="space-y-3">
          {Array.isArray(research.queries) &&
            research.queries.map((query, index) => (
              <div
                key={`${query}-${index}`}
                className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-4"
              >
                <div className="mb-2 flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-[10px] text-slate-500">
                    {index + 1}
                  </span>

                  <span className="text-[10px] uppercase tracking-[0.15em] text-slate-600">
                    Tavily query
                  </span>
                </div>

                <p className="text-sm leading-6 text-slate-400">{query}</p>
              </div>
            ))}
        </div>
      </DetailPanel>

      <DetailPanel
        title={`Retrieved sources · ${
          Array.isArray(research.sources) ? research.sources.length : 0
        }`}
      >
        <div className="space-y-4">
          {Array.isArray(research.sources) &&
            research.sources.map((source, index) => {
              const score =
                typeof source.score === "number" ? source.score : null;

              const scorePercent =
                score !== null ? Math.round(score * 100) : null;

              return (
                <div
                  key={`${source.url}-${index}`}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-5 transition hover:border-white/[0.1] hover:bg-white/[0.025]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-[10px] text-slate-600">
                        {String(index + 1).padStart(2, "0")}
                      </span>

                      <div className="min-w-0">
                        <h3 className="text-sm font-medium leading-6 text-slate-300">
                          {source.title || "Untitled source"}
                        </h3>

                        {source.url && (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 block truncate text-xs text-slate-600 transition hover:text-slate-400"
                          >
                            {source.url}
                          </a>
                        )}
                      </div>
                    </div>

                    {scorePercent !== null && (
                      <div className="shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-right">
                        <div className="text-[9px] uppercase tracking-[0.12em] text-slate-600">
                          Relevance
                        </div>

                        <div className="mt-1 text-sm font-semibold text-slate-300">
                          {scorePercent}%
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 rounded-lg border border-white/[0.04] bg-black/10 p-3">
                    <div className="mb-1 text-[9px] uppercase tracking-[0.14em] text-slate-700">
                      Retrieved for query
                    </div>

                    <p className="text-xs leading-5 text-slate-600">
                      {source.query}
                    </p>
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 text-[9px] uppercase tracking-[0.14em] text-slate-700">
                      Evidence
                    </div>

                    <p className="text-sm leading-6 text-slate-500">
                      {source.content || "No extracted content available."}
                    </p>
                  </div>
                </div>
              );
            })}
        </div>
      </DetailPanel>

      <div className="rounded-2xl border border-white/[0.07] bg-[#0a0d12] p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
            ✓
          </div>

          <div>
            <div className="text-sm font-medium text-slate-300">
              Research completed before experiment decision
            </div>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Prelight uses external research to understand the potential risk
              mechanism. The final deployment decision is not based on research
              alone — it is validated against measured baseline and candidate
              experiment results.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   EXPERIMENTS
============================================================ */

function ExperimentsPage({ data }: { data: StateData }) {
  const baseline = data.decision.baseline_metrics ?? {};
  const candidate = data.decision.candidate_metrics ?? {};
  const comparison = data.decision.comparison ?? {};

  const baselineMeanTtft = getNumericMetric(baseline, [
    "ttft_mean_ms",
    "mean_ttft_ms",
  ]);

  const candidateMeanTtft = getNumericMetric(candidate, [
    "ttft_mean_ms",
    "mean_ttft_ms",
  ]);

  const baselineP95Ttft = getNumericMetric(baseline, [
    "ttft_p95_ms",
    "p95_ttft_ms",
  ]);

  const candidateP95Ttft = getNumericMetric(candidate, [
    "ttft_p95_ms",
    "p95_ttft_ms",
  ]);

  const baselineMeanLatency = getNumericMetric(baseline, [
    "latency_mean_ms",
    "mean_latency_ms",
  ]);

  const candidateMeanLatency = getNumericMetric(candidate, [
    "latency_mean_ms",
    "mean_latency_ms",
  ]);

  const baselineP95Latency = getNumericMetric(baseline, [
    "latency_p95_ms",
    "p95_latency_ms",
  ]);

  const candidateP95Latency = getNumericMetric(candidate, [
    "latency_p95_ms",
    "p95_latency_ms",
  ]);

  const baselineTokens = getNumericMetric(baseline, [
    "total_output_tokens",
    "output_tokens",
    "total_tokens",
  ]);

  const candidateTokens = getNumericMetric(candidate, [
    "total_output_tokens",
    "output_tokens",
    "total_tokens",
  ]);

  const baselineThroughput = getNumericMetric(baseline, [
    "aggregate_output_throughput_tokens_per_sec",
    "aggregate_throughput_tokens_per_sec",
    "throughput_tokens_per_sec",
    "output_throughput_tokens_per_sec",
  ]);

  const candidateThroughput = getNumericMetric(candidate, [
    "aggregate_output_throughput_tokens_per_sec",
    "aggregate_throughput_tokens_per_sec",
    "throughput_tokens_per_sec",
    "output_throughput_tokens_per_sec",
  ]);

  const baselineRequests = getNumericMetric(baseline, [
    "total_requests",
    "requests",
    "request_count",
  ]);

  const candidateRequests = getNumericMetric(candidate, [
    "total_requests",
    "requests",
    "request_count",
  ]);

  const baselineErrors = getNumericMetric(baseline, [
    "error_rate_percent",
    "error_percent",
  ]);

  const candidateErrors = getNumericMetric(candidate, [
    "error_rate_percent",
    "error_percent",
  ]);

  const meanTtftChange = getComparisonValue(comparison, [
    "mean_ttft_change_percent",
    "ttft_mean_change_percent",
    "mean_ttft_percent",
  ]);

  const p95TtftChange = getComparisonValue(comparison, [
    "p95_ttft_change_percent",
    "ttft_p95_change_percent",
    "p95_ttft_percent",
  ]);

  const meanLatencyChange = getComparisonValue(comparison, [
    "mean_latency_change_percent",
    "latency_mean_change_percent",
    "mean_latency_percent",
  ]);

  const p95LatencyChange = getComparisonValue(comparison, [
    "p95_latency_change_percent",
    "latency_p95_change_percent",
    "p95_latency_percent",
  ]);

  const successRateBaseline =
    baselineErrors === null ? null : 100 - baselineErrors;

  const successRateCandidate =
    candidateErrors === null ? null : 100 - candidateErrors;

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Controlled experiments"
        title="Baseline vs candidate"
        description="Prelight executed the same workload against the current and proposed configurations and compared the measured behavior."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ValueCard
          label="Baseline"
          value={baselineRequests !== null ? `${baselineRequests}/9` : "—"}
          detail="requests completed"
        />

        <ValueCard
          label="Candidate"
          value={
            candidateRequests !== null ? `${candidateRequests}/9` : "—"
          }
          detail="requests completed"
        />

        <ValueCard
          label="Result"
          value={data.decision.status}
          detail="safety evaluation"
          danger={data.decision.status === "BLOCK"}
        />
      </div>

      <DetailPanel title="Experiment results">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-left">
                <th className="pb-4 text-[10px] font-medium uppercase tracking-[0.15em] text-slate-600">
                  Metric
                </th>

                <th className="pb-4 text-right text-[10px] font-medium uppercase tracking-[0.15em] text-slate-600">
                  Baseline
                </th>

                <th className="pb-4 text-right text-[10px] font-medium uppercase tracking-[0.15em] text-slate-600">
                  Candidate
                </th>

                <th className="pb-4 text-right text-[10px] font-medium uppercase tracking-[0.15em] text-slate-600">
                  Change
                </th>
              </tr>
            </thead>

            <tbody>
              <ExperimentRow
                label="Mean TTFT"
                baseline={baselineMeanTtft}
                candidate={candidateMeanTtft}
                change={meanTtftChange}
                unit="ms"
              />

              <ExperimentRow
                label="P95 TTFT"
                baseline={baselineP95Ttft}
                candidate={candidateP95Ttft}
                change={p95TtftChange}
                unit="ms"
              />

              <ExperimentRow
                label="Mean latency"
                baseline={baselineMeanLatency}
                candidate={candidateMeanLatency}
                change={meanLatencyChange}
                unit="ms"
              />

              <ExperimentRow
                label="P95 latency"
                baseline={baselineP95Latency}
                candidate={candidateP95Latency}
                change={p95LatencyChange}
                unit="ms"
              />

              <ExperimentRow
                label="Output tokens"
                baseline={baselineTokens}
                candidate={candidateTokens}
                change={null}
                unit=""
              />

              <ExperimentRow
                label="Aggregate throughput"
                baseline={baselineThroughput}
                candidate={candidateThroughput}
                change={null}
                unit=" tok/s"
              />

              <ExperimentRow
                label="Error rate"
                baseline={baselineErrors}
                candidate={candidateErrors}
                change={null}
                unit="%"
              />
            </tbody>
          </table>
        </div>
      </DetailPanel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DetailPanel title="Execution health">
          <div className="space-y-5">
            <MetricProgress
              label="Baseline success rate"
              value={successRateBaseline}
            />

            <MetricProgress
              label="Candidate success rate"
              value={successRateCandidate}
            />

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-4">
                <div className="text-[9px] uppercase tracking-[0.14em] text-slate-700">
                  Baseline errors
                </div>

                <div className="mt-2 text-lg font-semibold text-slate-300">
                  {baselineErrors === null ? "—" : `${baselineErrors}%`}
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-4">
                <div className="text-[9px] uppercase tracking-[0.14em] text-slate-700">
                  Candidate errors
                </div>

                <div className="mt-2 text-lg font-semibold text-slate-300">
                  {candidateErrors === null ? "—" : `${candidateErrors}%`}
                </div>
              </div>
            </div>
          </div>
        </DetailPanel>

        <DetailPanel title="Workload output">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-5">
              <div className="text-[9px] uppercase tracking-[0.14em] text-slate-700">
                Baseline tokens
              </div>

              <div className="mt-3 text-2xl font-semibold text-slate-300">
                {baselineTokens === null
                  ? "—"
                  : baselineTokens.toLocaleString()}
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-5">
              <div className="text-[9px] uppercase tracking-[0.14em] text-slate-700">
                Candidate tokens
              </div>

              <div className="mt-3 text-2xl font-semibold text-slate-300">
                {candidateTokens === null
                  ? "—"
                  : candidateTokens.toLocaleString()}
              </div>
            </div>

            <div className="col-span-2 rounded-xl border border-white/[0.05] bg-white/[0.015] p-5">
              <div className="text-[9px] uppercase tracking-[0.14em] text-slate-700">
                Aggregate output throughput
              </div>

              <div className="mt-3 flex items-end gap-3">
                <div className="text-2xl font-semibold text-slate-300">
                  {candidateThroughput === null
                    ? "—"
                    : candidateThroughput.toFixed(2)}
                </div>

                <div className="pb-1 text-xs text-slate-600">tokens/sec</div>
              </div>

              {baselineThroughput !== null &&
                candidateThroughput !== null && (
                  <div className="mt-2 text-xs text-slate-600">
                    Baseline: {baselineThroughput.toFixed(2)} tok/s
                  </div>
                )}
            </div>
          </div>
        </DetailPanel>
      </div>

      <DetailPanel title="Safety threshold evaluation">
        <div className="mb-5 grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-amber-500/10 bg-amber-500/[0.025] p-5">
            <div className="text-[9px] uppercase tracking-[0.14em] text-slate-700">
              Warning threshold
            </div>

            <div className="mt-2 text-xl font-semibold text-amber-400">
              &gt; {data.change.risk_policy.warn_percent}%
            </div>
          </div>

          <div className="rounded-xl border border-red-500/10 bg-red-500/[0.025] p-5">
            <div className="text-[9px] uppercase tracking-[0.14em] text-slate-700">
              Block threshold
            </div>

            <div className="mt-2 text-xl font-semibold text-red-400">
              &gt; {data.change.risk_policy.block_percent}%
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <ThresholdRow
            label="Mean TTFT"
            value={meanTtftChange}
            blockThreshold={data.change.risk_policy.block_percent}
          />

          <ThresholdRow
            label="P95 TTFT"
            value={p95TtftChange}
            blockThreshold={data.change.risk_policy.block_percent}
          />

          <ThresholdRow
            label="Mean latency"
            value={meanLatencyChange}
            blockThreshold={data.change.risk_policy.block_percent}
          />

          <ThresholdRow
            label="P95 latency"
            value={p95LatencyChange}
            blockThreshold={data.change.risk_policy.block_percent}
          />
        </div>
      </DetailPanel>

      <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.035] p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
            !
          </div>

          <div>
            <div className="text-sm font-semibold text-red-300">
              The proposed configuration was experimentally rejected
            </div>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Increasing max_tokens from 300 to 500 produced measurable
              latency regressions. Prelight therefore blocked the rollout
              instead of allowing the change to reach production.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   DECISION
============================================================ */

function DecisionPage({ data }: { data: StateData }) {
  const decisionStatus = data.decision.status || "UNKNOWN";

  const statusStyles =
    decisionStatus === "BLOCK"
      ? "border-red-500/20 bg-red-500/[0.035] text-red-300"
      : decisionStatus === "WARN"
        ? "border-amber-500/20 bg-amber-500/[0.035] text-amber-300"
        : decisionStatus === "SAFE"
          ? "border-emerald-500/20 bg-emerald-500/[0.035] text-emerald-300"
          : "border-zinc-700 bg-zinc-900 text-zinc-300";

  const icon =
    decisionStatus === "BLOCK"
      ? "!"
      : decisionStatus === "WARN"
        ? "!"
        : decisionStatus === "SAFE"
          ? "✓"
          : "?";

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Safety decision"
        title="Deployment decision"
        description="The decision is produced from measured experiment results and deterministic policy thresholds."
      />

      <div className={`rounded-2xl border p-6 ${statusStyles}`}>
        <div className="flex items-center gap-4">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl text-xl ${
              decisionStatus === "SAFE"
                ? "bg-emerald-500/10 text-emerald-400"
                : decisionStatus === "WARN"
                  ? "bg-amber-500/10 text-amber-400"
                  : decisionStatus === "BLOCK"
                    ? "bg-red-500/10 text-red-400"
                    : "bg-zinc-700/60 text-zinc-300"
            }`}
          >
            {icon}
          </div>

          <div>
            <div className="text-2xl font-semibold">
              {decisionStatus}
            </div>

            <div className="mt-1 text-sm text-slate-500">
              {data.decision.recommendation}
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-current/10 pt-5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-600">
            Reason
          </div>

          <p className="mt-2 text-sm leading-7 text-slate-400">
            {data.decision.reason}
          </p>
        </div>
      </div>

      <DetailPanel title="Triggered safety rules">
        <div className="space-y-3">
          {data.decision.triggered_rules.length > 0 ? (
            data.decision.triggered_rules.map((rule, index) => (
              <div
                key={index}
                className="flex gap-3 rounded-xl border border-red-500/10 bg-red-500/[0.02] p-4"
              >
                <span className="text-red-400">×</span>

                <span className="text-sm text-slate-400">{rule}</span>
              </div>
            ))
          ) : (
            <div className="text-sm text-slate-500">
              No safety rules triggered.
            </div>
          )}
        </div>
      </DetailPanel>

      <DetailPanel title="Evidence chain">
        <div className="space-y-3">
          {data.decision.evidence_chain.map((item, index) => (
            <div
              key={`${item}-${index}`}
              className="flex items-center gap-4 rounded-lg border border-white/[0.04] px-4 py-3"
            >
              <span className="text-xs text-slate-600">
                {String(index + 1).padStart(2, "0")}
              </span>

              <span className="text-sm text-slate-400">{item}</span>
            </div>
          ))}
        </div>
      </DetailPanel>
    </div>
  );
}

/* ============================================================
   ROLLOUT
============================================================ */

function RolloutPage({ data }: { data: StateData }) {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Deployment control"
        title="Rollout plan"
        description="The rollout action generated from the measured safety decision."
      />

      <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.035] p-6">
        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-600">
          Action
        </div>

        <div className="mt-2 text-2xl font-semibold text-red-300">
          {data.rollout.action}
        </div>

        <div className="mt-2 text-sm text-slate-500">
          Current validation status: {data.rollout.status}
        </div>
      </div>

      <DetailPanel title="Required actions">
        <div className="space-y-3">
          {Array.isArray(data.rollout.steps) &&
          data.rollout.steps.length > 0 ? (
            data.rollout.steps.map((step, index) => (
              <div
                key={`${getStepNumber(step, index)}-${index}`}
                className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-4"
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-xs text-slate-500">
                    {getStepNumber(step, index)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-300">
                      {getStepAction(step)}
                    </div>

                    {getStepDescription(step) && (
                      <div className="mt-1 text-xs leading-5 text-slate-600">
                        {getStepDescription(step)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-5 text-sm text-slate-600">
              No rollout steps available.
            </div>
          )}
        </div>
      </DetailPanel>

      <DetailPanel title="Measured regressions">
        <div className="space-y-3">
          {data.rollout.measured_regressions?.length > 0 ? (
            data.rollout.measured_regressions.map((item, index) => (
              <div
                key={index}
                className="flex gap-3 text-sm leading-6 text-slate-400"
              >
                <span className="text-red-400">•</span>

                <span>
                  {typeof item === "string"
                    ? item
                    : item.description ||
                      item.action ||
                      "Measured regression recorded."}
                </span>
              </div>
            ))
          ) : (
            <div className="text-sm text-slate-500">
              No measured regressions recorded.
            </div>
          )}
        </div>
      </DetailPanel>

      <DetailPanel title="Policy">
        <p className="text-sm leading-7 text-slate-400">
          {data.rollout.policy}
        </p>
      </DetailPanel>
    </div>
  );
}

/* ============================================================
   EXPERIMENT COMPONENTS
============================================================ */

function ExperimentRow({
  label,
  baseline,
  candidate,
  change,
  unit,
}: {
  label: string;
  baseline: number | null;
  candidate: number | null;
  change: number | null;
  unit: string;
}) {
  return (
    <tr className="border-b border-white/[0.04] last:border-0">
      <td className="py-4 text-sm text-slate-400">{label}</td>

      <td className="py-4 text-right text-sm font-medium text-slate-300">
        {baseline === null ? "—" : `${formatValue(baseline)}${unit}`}
      </td>

      <td className="py-4 text-right text-sm font-medium text-slate-300">
        {candidate === null ? "—" : `${formatValue(candidate)}${unit}`}
      </td>

      <td
        className={`py-4 text-right text-sm font-semibold ${comparisonClass(
          change
        )}`}
      >
        {change === null ? "—" : formatPercent(change)}
      </td>
    </tr>
  );
}

function MetricProgress({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  const safeValue =
    value === null ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-slate-500">{label}</span>

        <span className="text-xs font-medium text-slate-300">
          {value === null ? "—" : `${value.toFixed(1)}%`}
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className="h-full rounded-full bg-emerald-500/60 transition-all"
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}

function ThresholdRow({
  label,
  value,
  blockThreshold,
}: {
  label: string;
  value: number | null;
  blockThreshold: number;
}) {
  const blocked = value !== null && value > blockThreshold;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-white/[0.05] bg-white/[0.015] p-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-400">{label}</div>

        <div className="mt-1 text-xs text-slate-700">
          Block threshold: &gt; {blockThreshold}%
        </div>
      </div>

      <div
        className={`text-sm font-semibold ${
          blocked ? "text-red-400" : "text-slate-400"
        }`}
      >
        {value === null ? "—" : formatPercent(value)}
      </div>

      <div
        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
          blocked
            ? "bg-red-500/10 text-red-400"
            : "bg-emerald-500/10 text-emerald-400"
        }`}
      >
        {blocked ? "BLOCK" : "PASS"}
      </div>
    </div>
  );
}

/* ============================================================
   REUSABLE UI
============================================================ */

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
        {eyebrow}
      </div>

      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
        {description}
      </p>
    </div>
  );
}

function DetailPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0a0d12] p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-300">{title}</h2>

        <span className="h-1.5 w-1.5 rounded-full bg-slate-700" />
      </div>

      {children}
    </section>
  );
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-slate-600">
        {label}
      </div>

      <div className="truncate text-sm text-slate-300">
        {formatValue(value)}
      </div>
    </div>
  );
}

function ValueCard({
  label,
  value,
  detail,
  danger = false,
}: {
  label: string;
  value: string;
  detail: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        danger
          ? "border-red-500/20 bg-red-500/[0.035]"
          : "border-white/[0.07] bg-[#0a0d12]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-600">
        {label}
      </div>

      <div
        className={`mt-3 text-2xl font-semibold ${
          danger ? "text-red-300" : "text-slate-100"
        }`}
      >
        {value}
      </div>

      <div className="mt-1 text-xs text-slate-600">{detail}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | null;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.05] pb-3 last:border-0 last:pb-0">
      <span className="text-xs text-slate-500">{label}</span>

      <span className={`text-sm font-semibold ${comparisonClass(value)}`}>
        {value === null
          ? "—"
          : `${value > 0 ? "+" : ""}${value.toFixed(2)}${suffix ?? ""}`}
      </span>
    </div>
  );
}

function MetricTable({ metrics }: { metrics?: MetricSet | null }) {
  const entries = safeMetricEntries(metrics);

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-5 text-sm text-slate-600">
        No metric data available.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="flex items-center justify-between border-b border-white/[0.04] pb-3 last:border-0 last:pb-0"
        >
          <span className="text-xs text-slate-500">
            {formatMetricName(key)}
          </span>

          <span className="max-w-[55%] truncate text-right text-sm font-medium text-slate-300">
            {formatValue(value)}
          </span>
        </div>
      ))}
    </div>
  );
}