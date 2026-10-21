"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API_URL = (
  process.env.NEXT_PUBLIC_PRELIGHT_API_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

type Page =
  | "overview"
  | "change"
  | "evidence"
  | "experiments"
  | "decision"
  | "rollout";

type MetricSet = Record<string, number | string | null | undefined>;

type ExperimentStatus = {
  running: boolean;
  operation: "validation" | "boundary_scan" | null;
  started_at: string | null;
};

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
    evidence_strength: string;
    metrics: string;
    experiment: string;
  };
};

type BoundaryResult = {
  max_tokens: number;
  status: string;
  comparison?: MetricSet;
  uncertainty?: Record<
    string,
    {
      estimate_percent: number | null;
      lower_percent: number | null;
      upper_percent: number | null;
      sample_count: number;
      confidence_level: number;
    }
  >;
  experiment?: {
    complete_rounds?: number;
    required_rounds?: number;
  };
  analysis?: Record<string, unknown>;
};

type BoundaryReport = {
  tested_values: number[];
  safe_operating_boundary: number | null;
  status: string;
  summary: string;
  results: BoundaryResult[];
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
    evidence_strength: string;
    metrics: string;
    experiment: string;
  };

  decision: {
    status: string;
    reason: string;
    recommendation: string;
    baseline_metrics?: MetricSet;
    candidate_metrics?: MetricSet;
    comparison?: MetricSet;
    uncertainty?: Record<
      string,
      {
        estimate_percent: number | null;
        lower_percent: number | null;
        upper_percent: number | null;
        sample_count: number;
        confidence_level: number;
      }
    >;
    experiment?: {
      type?: string;
      run_id?: string;
      origin?: string;
      model?: string | null;
      started_at?: string | null;
      finished_at?: string | null;
      created_at?: string | null;
      baseline_configuration?: Record<string, unknown> | null;
      candidate_configuration?: Record<string, unknown> | null;
      sample_counts?: {
        baseline_requests?: number;
        candidate_requests?: number;
        paired_rounds?: number;
        complete_rounds?: number;
      };
      paired_rounds?: Array<{
        pair_id: string;
        order: string;
        status: string;
        baseline_started_at?: string | null;
        baseline_finished_at?: string | null;
        candidate_started_at?: string | null;
        candidate_finished_at?: string | null;
        baseline_request_samples?: number;
        candidate_request_samples?: number;
      }>;
      complete_rounds?: number;
      required_rounds?: number;
      round_order?: string[];
    };
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

  boundary?: BoundaryReport;
};

const navigation: { id: Page; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "◈" },
  { id: "change", label: "Change", icon: "⇄" },
  { id: "evidence", label: "Evidence", icon: "◎" },
  { id: "experiments", label: "Experiments", icon: "◌" },
  { id: "decision", label: "Decision", icon: "◆" },
  { id: "rollout", label: "Rollout", icon: "→" },
];

function statusPanel(status?: string): string {
  switch (status) {
    case "BLOCK": return "border-red-500/30 bg-red-500/[0.05] text-red-300";
    case "WARN": return "border-amber-500/30 bg-amber-500/[0.05] text-amber-300";
    case "SAFE": return "border-emerald-500/30 bg-emerald-500/[0.05] text-emerald-300";
    default: return "border-zinc-700 bg-zinc-900 text-zinc-300";
  }
}

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

function formatTimestamp(value?: string | null): string {
  if (!value) {
    return "Unavailable";
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? value
    : timestamp.toLocaleString();
}

function formatConfiguration(
  configuration?: Record<string, unknown> | null
): string {
  if (!configuration || Object.keys(configuration).length === 0) {
    return "Unavailable";
  }

  return Object.entries(configuration)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join(" · ");
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

function stepTarget(step: string): Page {
  if (/CHANGE/.test(step)) return "change";
  if (/RESEARCH/.test(step)) return "evidence";
  if (/BASELINE|ROUND|INTERVAL|EXPERIMENT|EVIDENCE_CHECK/.test(step)) return "experiments";
  if (/ROLLOUT/.test(step)) return "rollout";
  return "decision";
}

function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const [activePage, setActivePage] = useState<Page>("overview");
  const [data, setData] = useState<StateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [validating, setValidating] = useState(false);
  const [experimentStatus, setExperimentStatus] = useState<ExperimentStatus | null>(null);
  const validationInFlight = useRef(false);
  const proposalDirtyRef = useRef(false);
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState("");
  const [validationError, setValidationError] = useState("");
  const [proposedMaxTokens, setProposedMaxTokens] = useState<string>("500");
  const [, setProposalDirty] = useState(false);

  const loadExperimentStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/experiment/status`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }
      setExperimentStatus((await response.json()) as ExperimentStatus);
    } catch {
      setExperimentStatus(null);
    }
  }, []);

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
      if (typeof proposedMax === "number" && !proposalDirtyRef.current) {
        setProposedMaxTokens(String(proposedMax));
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
    if (
      validationInFlight.current ||
      validating ||
      experimentStatus?.running
    ) {
      return;
    }

    const parsedMaxTokens = Number(proposedMaxTokens);
    if (
      !/^\d+$/.test(proposedMaxTokens) ||
      !Number.isSafeInteger(parsedMaxTokens) ||
      parsedMaxTokens < 1 ||
      parsedMaxTokens > 4096
    ) {
      setValidationError("Enter a whole number from 1 to 4096 max tokens.");
      setValidationMessage("");
      return;
    }

    validationInFlight.current = true;
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
          max_tokens: parsedMaxTokens,
        }),
      });

      if (response.status === 409) {
        setValidationMessage("");
        setValidationError("");
        await loadExperimentStatus();
        return;
      }

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result?.detail ||
            result?.message ||
            "Prelight validation failed."
        );
      }

      const completedRunId = result.result?.run_id;
      if (typeof completedRunId !== "string") {
        throw new Error("Validation completed without a run ID.");
      }
      setLiveRunId(completedRunId);

      setValidationMessage("Validation completed. Refreshing decision...");

      setProposalDirty(false);
      proposalDirtyRef.current = false;
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
      validationInFlight.current = false;
      setValidating(false);
    }
  }, [experimentStatus, loadExperimentStatus, loadState, proposedMaxTokens, validating]);

  useEffect(() => {
    const first = window.setTimeout(() => {
      loadState();
      loadExperimentStatus();
    }, 0);

    const interval = window.setInterval(() => {
      if (!validationInFlight.current && !proposalDirtyRef.current) {
        loadState();
      }
      loadExperimentStatus();
    }, 2500);

    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [loadExperimentStatus, loadState]);

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

  const maxTokensCurrent =
    currentState.max_tokens !== undefined
      ? String(currentState.max_tokens)
      : "—";

  const maxTokensProposed = proposedMaxTokens || "—";

  return (
    <div className="min-h-screen bg-[#07090d] text-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-black">Skip to content</a>
      <div className="flex min-h-screen">
        {/* SIDEBAR */}
        <aside aria-label="Sidebar" className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-white/[0.07] bg-[#090b10] lg:flex">
          <div className="border-b border-white/[0.07] px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                <span className="text-lg font-semibold">P</span>
              </div>

              <div>
                <div className="text-[15px] font-semibold tracking-wide">
                  PRELIGHT
                </div>

                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  AI Infrastructure Safety
                </div>
              </div>
            </div>
          </div>

          <div className="px-3 py-5">
            <div className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Control Plane
            </div>

            <nav aria-label="Primary" className="space-y-1">
              {navigation.map((item) => {
                const active = activePage === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => setActivePage(item.id)}
                    aria-current={active ? "page" : undefined}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                      active
                        ? "bg-white/[0.08] text-white"
                        : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-300"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`w-5 text-center text-sm ${
                        active ? "text-white" : "text-slate-400"
                      }`}
                    >
                      {item.icon}
                    </span>

                    <span>{item.label}</span>

                    {item.id === "decision" && (
                      <span
                        className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${
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

              <p className="text-[11px] leading-5 text-slate-400">
                Nemotron · Nebius · NVIDIA workload validation
              </p>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <div className="min-h-screen min-w-0 flex-1 lg:ml-64">
          <header className="sticky top-0 z-10 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] bg-[#07090d]/95 px-4 py-2 backdrop-blur sm:px-8">
            <div>
              <div className="text-sm font-medium text-slate-300">
                {pageTitle}
              </div>

              <div className="mt-0.5 text-[11px] text-slate-400">
                {data.change.change_id} · Live validation state
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <Link href="/" className="text-[11px] text-slate-400 underline-offset-4 hover:text-white hover:underline">Home</Link>
              {lastUpdated && (
                <span className="text-[11px] text-slate-400">
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
                    validating || experimentStatus?.running
                      ? "animate-pulse bg-amber-400"
                      : "bg-emerald-400"
                  }`}
                />

                {validating
                  ? "VALIDATING"
                  : experimentStatus?.running
                    ? "EXPERIMENT BUSY"
                    : experimentStatus
                      ? "LIVE"
                      : "CHECKING"}
              </div>

              <button
                onClick={handleValidate}
                disabled={validating || Boolean(experimentStatus?.running)}
                className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                  validating || experimentStatus?.running
                    ? "cursor-not-allowed border border-amber-500/20 bg-amber-500/10 text-amber-400"
                    : "border border-white/10 bg-white text-black hover:bg-slate-200"
                }`}
              >
                {validating
                  ? "Validating..."
                  : experimentStatus?.running
                    ? "Experiment in progress..."
                    : "Validate Change"}
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

          <nav aria-label="Primary mobile" className="flex gap-1 overflow-x-auto border-b border-white/[0.07] px-4 py-2 lg:hidden">
            {navigation.map((item) => (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                aria-current={activePage === item.id ? "page" : undefined}
                className={`shrink-0 rounded-lg px-3 py-2 text-sm ${activePage === item.id ? "bg-white/[0.1] text-white" : "text-slate-400"}`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <main id="main" className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
            {error && (
              <div role="alert" className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {validationError && (
              <div role="alert" className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
                {validationError}
              </div>
            )}

            {experimentStatus?.running && !validating && (
              <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3 text-sm text-amber-200">
                {experimentStatus.operation === "boundary_scan"
                  ? "A safe-boundary scan is running. Validation will be available when it finishes."
                  : "A validation is running in another request or browser tab. This page will update when it finishes."}
              </div>
            )}

            {validationMessage && !error && (
              <div role="status" className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] px-4 py-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 text-xs text-emerald-400">
                  ✓
                </span>

                <span className="text-sm text-slate-400">
                  {validationMessage}
                </span>
              </div>
            )}

            {validating && (
              <div role="status" aria-live="polite" className="mb-6 overflow-hidden rounded-xl border border-amber-500/15 bg-amber-500/[0.025]">
                <div className="h-0.5 w-full animate-pulse bg-amber-400/60" />

                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-amber-400" />

                  <div>
                    <div className="text-sm font-medium text-slate-300">
                      Prelight validation running
                    </div>

                    <div className="mt-0.5 text-xs text-slate-400">
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
                liveRunId={liveRunId}
                onNavigate={setActivePage}
              />
            )}

            {activePage === "change" && (
              <ChangePage
                data={data}
                proposedMaxTokens={proposedMaxTokens}
                setProposedMaxTokens={(value) => {
                  setProposedMaxTokens(value);
                  proposalDirtyRef.current = true;
                  setProposalDirty(true);
                }}
                setProposalDirty={setProposalDirty}
              />
            )}

            {activePage === "evidence" && <EvidencePage data={data} />}

            {activePage === "experiments" && (
              <ExperimentsPage
                data={data}
                experimentStatus={experimentStatus}
                onRefresh={loadState}
              />
            )}

            {activePage === "decision" && <DecisionPage data={data} />}

            {activePage === "rollout" && <RolloutPage data={data} />}
          </main>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   OVERVIEW
============================================================ */

function OverviewPage({
  data,
  maxTokensCurrent,
  maxTokensProposed,
  liveRunId,
  onNavigate,
}: {
  data: StateData;
  maxTokensCurrent: string;
  maxTokensProposed: string;
  liveRunId: string | null;
  onNavigate: (page: Page) => void;
}) {
  const comparison = data.decision.comparison ?? {};
  const uncertainty = data.decision.uncertainty ?? {};
  const experiment = data.decision.experiment ?? {};
  const pairedRounds = experiment.paired_rounds ?? [];
  const hasPairedValidation =
    experiment.type === "paired_candidate";
  const isLiveThisSession =
    hasPairedValidation && Boolean(experiment.run_id) && experiment.run_id === liveRunId;
  const confidenceRows = [
    { label: "Mean TTFT", key: "mean_ttft_change_percent" },
    { label: "P95 TTFT", key: "p95_ttft_change_percent" },
    { label: "Mean latency", key: "mean_latency_change_percent" },
    { label: "P95 latency", key: "p95_latency_change_percent" },
  ];

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
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Pre-deployment validation
        </div>

        <h1 className="text-3xl font-semibold tracking-tight">
          Before the change reaches production.
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
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
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                Current
              </div>

              <div className="mt-3 text-2xl font-semibold">
                {maxTokensCurrent}
              </div>

              <div className="mt-1 text-xs text-slate-400">
                max generation tokens
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                Proposed
              </div>

              <div className="mt-3 text-2xl font-semibold">
                {maxTokensProposed}
              </div>

              <div className="mt-1 text-xs text-slate-400">
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

      <DetailPanel title="Validation provenance and uncertainty">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-4">
          <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${isLiveThisSession ? "text-emerald-300" : "text-amber-300"}`}>
            {isLiveThisSession ? "Live this session" : "Historical saved result"}
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            Run {experiment.run_id || "unavailable"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-3 py-4 sm:grid-cols-2 xl:grid-cols-3">
          <InfoItem label="Model" value={experiment.model || "Unavailable"} />
          <InfoItem label="Run started" value={formatTimestamp(experiment.started_at)} />
          <InfoItem label="Run finished" value={formatTimestamp(experiment.finished_at)} />
          <InfoItem
            label="Paired samples"
            value={`${experiment.sample_counts?.complete_rounds ?? experiment.complete_rounds ?? 0} complete / ${experiment.sample_counts?.paired_rounds ?? pairedRounds.length} rounds`}
          />
          <InfoItem
            label="Request samples"
            value={`Baseline ${experiment.sample_counts?.baseline_requests ?? "Unavailable"} · Candidate ${experiment.sample_counts?.candidate_requests ?? "Unavailable"}`}
          />
          <InfoItem label="Artifact created" value={formatTimestamp(experiment.created_at)} />
        </div>

        <div className="grid grid-cols-1 gap-3 border-y border-white/[0.06] py-4 sm:grid-cols-2">
          <InfoItem
            label="Baseline configuration"
            value={formatConfiguration(experiment.baseline_configuration)}
          />
          <InfoItem
            label="Candidate configuration"
            value={formatConfiguration(experiment.candidate_configuration)}
          />
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>
            {hasPairedValidation
              ? `${experiment.complete_rounds ?? 0} of ${experiment.required_rounds ?? 5} paired rounds complete`
              : "No paired validation recorded"}
          </span>
          <span>
            {hasPairedValidation
              ? `Order: ${(experiment.round_order ?? [])
                  .map((order) => order === "baseline_first" ? "Baseline then candidate" : "Candidate then baseline")
                  .join(" · ") || "Not available"}`
              : "Confidence ranges unavailable"}
          </span>
        </div>

        {pairedRounds.length > 0 && (
          <div className="mb-4 divide-y divide-white/[0.06] border-t border-white/[0.06]">
            {pairedRounds.map((round, index) => (
              <div key={round.pair_id} className="grid grid-cols-1 gap-2 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-400">
                  <span className="font-medium text-slate-300">Round {index + 1}</span>
                  <span>{round.order === "baseline_first" ? "Baseline first" : "Candidate first"}</span>
                  <span>{round.status}</span>
                </div>
                <div className="grid grid-cols-1 gap-1 text-slate-400 md:grid-cols-2">
                  <span>Baseline: {formatTimestamp(round.baseline_started_at)} · {round.baseline_request_samples ?? 0} requests</span>
                  <span>Candidate: {formatTimestamp(round.candidate_started_at)} · {round.candidate_request_samples ?? 0} requests</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Paired uncertainty · 95% confidence intervals
        </div>
        <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
          {confidenceRows.map(({ label, key }) => {
            const interval = uncertainty[key];
            const lower = interval?.lower_percent;
            const upper = interval?.upper_percent;

            return (
              <div key={key} className="flex items-center justify-between gap-4 border-t border-white/[0.06] py-3">
                <span className="text-sm text-slate-400">{label}</span>
                <span className="text-sm font-medium tabular-nums">
                  {lower !== null && lower !== undefined && upper !== null && upper !== undefined
                    ? `${lower.toFixed(1)}% to ${upper.toFixed(1)}%`
                    : "Insufficient data"}
                </span>
              </div>
            );
          })}
        </div>
      </DetailPanel>

      <DetailPanel title="Evidence chain">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.decision.evidence_chain.map((step, index) => (
            <button
              key={`${step}-${index}`}
              onClick={() => {
                onNavigate(stepTarget(step));
              }}
              className="flex items-center gap-4 rounded-xl border border-white/[0.05] bg-white/[0.015] p-4 text-left transition hover:bg-white/[0.04]"
              aria-label={`Open ${step.replace(/_/g, " ").toLowerCase()} details`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-xs text-slate-400">
                {index + 1}
              </span>

              <span className="text-sm text-slate-300">{step.replace(/_/g, " ")}</span>
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
  setProposalDirty,
}: {
  data: StateData;
  proposedMaxTokens: string;
  setProposedMaxTokens: (value: string) => void;
  setProposalDirty: (value: boolean) => void;
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
              <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                max_tokens
              </div>

              <label htmlFor="max-tokens" className="sr-only">Proposed max_tokens (1 to 4096)</label>
              <input
                id="max-tokens"
                aria-describedby="max-tokens-help"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={proposedMaxTokens}
                onChange={(event) => {
                  setProposedMaxTokens(event.target.value);
                  setProposalDirty(true);
                }}
                className="w-32 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
              />
              <p id="max-tokens-help" className="mt-2 text-xs text-slate-400">Whole number from 1 to 4096.</p>
            </div>

            <MetricTable
              metrics={{
                ...(data.change.proposed_state as MetricSet),
                max_tokens: proposedMaxTokens || "—",
              }}
            />
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
          <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-amber-400">
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

          <span className="text-sm text-slate-400">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

        <ValueCard
          label="Evidence strength"
          value={assessment.evidence_strength || "UNASSESSED"}
          detail="Nemotron assessment"
        />
      </div>

      <DetailPanel title="Research assessment">
        <div className="space-y-6">
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
              Why Prelight researched this change
            </div>

            <p className="text-sm leading-7 text-slate-400">
              {assessment.summary || "No research summary available."}
            </p>
          </div>

          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
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
            <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
              Research conclusion
            </div>

            <p className="text-sm leading-7 text-slate-400">
              {assessment.research_conclusion ||
                "No research conclusion available."}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 border-t border-white/[0.06] pt-5 md:grid-cols-2">
            <div>
              <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                Metrics to validate
              </div>
              <p className="text-sm leading-7 text-slate-400">
                {assessment.metrics || "No metrics recommendation available."}
              </p>
            </div>
            <div>
              <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                Experiment recommendation
              </div>
              <p className="text-sm leading-7 text-slate-400">
                {assessment.experiment || "No experiment recommendation available."}
              </p>
            </div>
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
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-[11px] text-slate-400">
                    {index + 1}
                  </span>

                  <span className="text-[11px] uppercase tracking-[0.15em] text-slate-400">
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
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-[11px] text-slate-400">
                        {String(index + 1).padStart(2, "0")}
                      </span>

                      <div className="min-w-0">
                        <h3 className="text-sm font-medium leading-6 text-slate-300">
                          {source.title || "Untitled source"}
                        </h3>

                        {safeHref(source.url) && (
                          <a
                            href={safeHref(source.url) ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 block truncate text-xs text-slate-400 transition hover:text-slate-400"
                          >
                            {source.url}
                          </a>
                        )}
                      </div>
                    </div>

                    {scorePercent !== null && (
                      <div className="shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-right">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-slate-400">
                          Relevance
                        </div>

                        <div className="mt-1 text-sm font-semibold text-slate-300">
                          {scorePercent}%
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 rounded-lg border border-white/[0.04] bg-black/10 p-3">
                    <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-slate-400">
                      Retrieved for query
                    </div>

                    <p className="text-xs leading-5 text-slate-400">
                      {source.query}
                    </p>
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">
                      Evidence
                    </div>

                    <p className="text-sm leading-6 text-slate-400">
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

            <p className="mt-2 text-sm leading-6 text-slate-400">
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

function ExperimentsPage({
  data,
  experimentStatus,
  onRefresh,
}: {
  data: StateData;
  experimentStatus: ExperimentStatus | null;
  onRefresh: () => Promise<void> | void;
}) {
  const boundary = data.boundary ?? null;
  const baseline = data.decision.baseline_metrics ?? {};
  const candidate = data.decision.candidate_metrics ?? {};
  const comparison = data.decision.comparison ?? {};

  const [boundaryLoading, setBoundaryLoading] = useState(false);
  const [boundaryMessage, setBoundaryMessage] = useState("");
  const boundaryUnavailable =
    boundaryLoading || Boolean(experimentStatus?.running);

  const runBoundaryScan = useCallback(async () => {
    if (experimentStatus?.running) {
      setBoundaryMessage(
        "Another experiment is running. The scan will be available when it finishes."
      );
      return;
    }

    setBoundaryLoading(true);
    setBoundaryMessage("Running safe-boundary scan...");

    try {
      const response = await fetch(`${API_URL}/api/boundary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: [300, 350, 400, 500],
        }),
      });

      if (response.status === 409) {
        setBoundaryMessage(
          "Another experiment is already running. Wait for it to finish before starting a boundary scan."
        );
        return;
      }

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result?.detail || result?.message || "Boundary scan failed."
        );
      }

      setBoundaryMessage(
        result?.boundary?.summary || "Safe-boundary scan completed."
      );

      await onRefresh();
    } catch (error) {
      setBoundaryMessage(
        error instanceof Error ? error.message : "Boundary scan failed."
      );
    } finally {
      setBoundaryLoading(false);
    }
  }, [experimentStatus, onRefresh]);

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

      <DetailPanel title="Safe Boundary Explorer">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
              Boundary scan
            </div>
            <div className="mt-2 text-sm text-slate-400">
              {boundary?.summary ||
                "Test the candidate range to find the highest safe generation setting."}
            </div>
          </div>

          <button
            onClick={runBoundaryScan}
            disabled={boundaryUnavailable}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
              boundaryUnavailable
                ? "cursor-not-allowed border border-amber-500/20 bg-amber-500/10 text-amber-400"
                : "border border-white/10 bg-white text-black hover:bg-slate-200"
            }`}
          >
            {boundaryLoading
              ? "Scanning..."
              : experimentStatus?.running
                ? "Experiment in progress..."
                : "Find Safe Boundary"}
          </button>
        </div>

        {boundaryMessage && (
          <div className="mt-4 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.025] px-4 py-3 text-sm text-slate-300">
            {boundaryMessage}
          </div>
        )}

        {boundary?.results && boundary.results.length > 0 && (
          <div className="mt-5 overflow-hidden rounded-xl border border-white/[0.06]">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">Boundary scan results by max_tokens</caption>
              <thead className="bg-white/[0.02] text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3">Config</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Latency delta</th>
                </tr>
              </thead>
              <tbody>
                {boundary.results.map((result) => {
                  const delta = getNumericMetric(result.comparison, [
                    "mean_latency_change_percent",
                  ]);

                  return (
                    <tr key={result.max_tokens} className="border-t border-white/[0.05]">
                      <td className="px-4 py-3 text-slate-300">
                        {result.max_tokens} tokens
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                            result.status === "BLOCK"
                              ? "bg-red-500/10 text-red-400"
                              : result.status === "WARN"
                                ? "bg-amber-500/10 text-amber-400"
                                : result.status === "SAFE"
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : "bg-zinc-700/60 text-zinc-300"
                          }`}
                        >
                          {result.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {typeof delta === "number"
                          ? `${delta > 0 ? "+" : ""}${delta.toFixed(2)}%`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DetailPanel>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ValueCard
          label="Baseline"
          value={baselineRequests !== null ? String(baselineRequests) : (data.decision.experiment?.sample_counts?.baseline_requests ?? "—").toString()}
          detail="requests completed"
        />

        <ValueCard
          label="Candidate"
          value={
            candidateRequests !== null ? String(candidateRequests) : (data.decision.experiment?.sample_counts?.candidate_requests ?? "—").toString()
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
            <caption className="sr-only">Baseline versus candidate metrics</caption>
            <thead>
              <tr className="border-b border-white/[0.06] text-left">
                <th scope="col" className="pb-4 text-[11px] font-medium uppercase tracking-[0.15em] text-slate-400">
                  Metric
                </th>

                <th scope="col" className="pb-4 text-right text-[11px] font-medium uppercase tracking-[0.15em] text-slate-400">
                  Baseline
                </th>

                <th scope="col" className="pb-4 text-right text-[11px] font-medium uppercase tracking-[0.15em] text-slate-400">
                  Candidate
                </th>

                <th scope="col" className="pb-4 text-right text-[11px] font-medium uppercase tracking-[0.15em] text-slate-400">
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
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                  Baseline errors
                </div>

                <div className="mt-2 text-lg font-semibold text-slate-300">
                  {baselineErrors === null ? "—" : `${baselineErrors}%`}
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
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
              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                Baseline tokens
              </div>

              <div className="mt-3 text-2xl font-semibold text-slate-300">
                {baselineTokens === null
                  ? "—"
                  : baselineTokens.toLocaleString()}
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                Candidate tokens
              </div>

              <div className="mt-3 text-2xl font-semibold text-slate-300">
                {candidateTokens === null
                  ? "—"
                  : candidateTokens.toLocaleString()}
              </div>
            </div>

            <div className="col-span-2 rounded-xl border border-white/[0.05] bg-white/[0.015] p-5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                Aggregate output throughput
              </div>

              <div className="mt-3 flex items-end gap-3">
                <div className="text-2xl font-semibold text-slate-300">
                  {candidateThroughput === null
                    ? "—"
                    : candidateThroughput.toFixed(2)}
                </div>

                <div className="pb-1 text-xs text-slate-400">tokens/sec</div>
              </div>

              {baselineThroughput !== null &&
                candidateThroughput !== null && (
                  <div className="mt-2 text-xs text-slate-400">
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
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
              Warning threshold
            </div>

            <div className="mt-2 text-xl font-semibold text-amber-400">
              &gt; {data.change.risk_policy.warn_percent}%
            </div>
          </div>

          <div className="rounded-xl border border-red-500/10 bg-red-500/[0.025] p-5">
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
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
            warnThreshold={data.change.risk_policy.warn_percent}
          />

          <ThresholdRow
            label="P95 TTFT"
            value={p95TtftChange}
            blockThreshold={data.change.risk_policy.block_percent}
            warnThreshold={data.change.risk_policy.warn_percent}
          />

          <ThresholdRow
            label="Mean latency"
            value={meanLatencyChange}
            blockThreshold={data.change.risk_policy.block_percent}
            warnThreshold={data.change.risk_policy.warn_percent}
          />

          <ThresholdRow
            label="P95 latency"
            value={p95LatencyChange}
            blockThreshold={data.change.risk_policy.block_percent}
            warnThreshold={data.change.risk_policy.warn_percent}
          />
        </div>
      </DetailPanel>

      <div className={`rounded-2xl border p-6 ${statusPanel(data.decision.status)}`} role="status">
        <div className="text-sm font-semibold">
          Verdict: {data.decision.status}
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
          {data.decision.reason || "No decision has been recorded yet."} {data.decision.recommendation}
        </p>
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

            <div className="mt-1 text-sm text-slate-400">
              {data.decision.recommendation}
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-current/10 pt-5">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
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
            <div className="text-sm text-slate-400">
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
              <span className="text-xs text-slate-400">
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

      <div className={`rounded-2xl border p-6 ${statusPanel(data.rollout.status)}`}>
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
          Action
        </div>

        <div className="mt-2 text-2xl font-semibold">
          {data.rollout.action}
        </div>

        <div className="mt-2 text-sm text-slate-400">
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
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-xs text-slate-400">
                    {getStepNumber(step, index)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-300">
                      {getStepAction(step)}
                    </div>

                    {getStepDescription(step) && (
                      <div className="mt-1 text-xs leading-5 text-slate-400">
                        {getStepDescription(step)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-5 text-sm text-slate-400">
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
            <div className="text-sm text-slate-400">
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
        <span className="text-xs text-slate-400">{label}</span>

        <span className="text-xs font-medium text-slate-300">
          {value === null ? "—" : `${value.toFixed(1)}%`}
        </span>
      </div>

      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(safeValue)} className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
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
  warnThreshold,
}: {
  label: string;
  value: number | null;
  blockThreshold: number;
  warnThreshold: number;
}) {
  const blocked = value !== null && value > blockThreshold;
  const warned = !blocked && value !== null && value > warnThreshold;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-white/[0.05] bg-white/[0.015] p-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-400">{label}</div>

        <div className="mt-1 text-xs text-slate-400">
          Block threshold: &gt; {blockThreshold}%
        </div>
      </div>

      <div
        className={`text-sm font-semibold ${
          blocked ? "text-red-400" : warned ? "text-amber-400" : "text-slate-400"
        }`}
      >
        {value === null ? "—" : formatPercent(value)}
      </div>

      <div
        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
          blocked
            ? "bg-red-500/10 text-red-400"
            : warned
              ? "bg-amber-500/10 text-amber-400"
              : "bg-emerald-500/10 text-emerald-400"
        }`}
      >
        {blocked ? "BLOCK" : warned ? "WARN" : "PASS"}
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
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        {eyebrow}
      </div>

      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
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
      <div className="mb-1 text-[11px] uppercase tracking-[0.15em] text-slate-400">
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
      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
        {label}
      </div>

      <div
        className={`mt-3 text-2xl font-semibold ${
          danger ? "text-red-300" : "text-slate-100"
        }`}
      >
        {value}
      </div>

      <div className="mt-1 text-xs text-slate-400">{detail}</div>
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
      <span className="text-xs text-slate-400">{label}</span>

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
      <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-5 text-sm text-slate-400">
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
          <span className="text-xs text-slate-400">
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