"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { API_URL, ExperimentStatus, Page, StateData, navigation } from "./lib";
import { OverviewPage } from "./OverviewPage";
import { ChangePage } from "./ChangePage";
import { EvidencePage } from "./EvidencePage";
import { ExperimentsPage } from "./ExperimentsPage";
import { DecisionPage } from "./DecisionPage";
import { RolloutPage } from "./RolloutPage";

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

  const experimentRunningRef = useRef(false);

  useEffect(() => {
    experimentRunningRef.current = Boolean(experimentStatus?.running);
  }, [experimentStatus]);

  // Adaptive polling: fast while an experiment runs, slow when idle, and
  // paused entirely while the tab is hidden.
  useEffect(() => {
    let stopped = false;
    let timer = 0;

    const tick = () => {
      if (stopped) return;
      if (!document.hidden) {
        if (!validationInFlight.current && !proposalDirtyRef.current) {
          loadState();
        }
        loadExperimentStatus();
      }
      const busy = validationInFlight.current || experimentRunningRef.current;
      timer = window.setTimeout(tick, busy ? 2500 : 10000);
    };

    const onVisibility = () => {
      if (!document.hidden) {
        window.clearTimeout(timer);
        timer = window.setTimeout(tick, 0);
      }
    };

    timer = window.setTimeout(tick, 0);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
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
