"use client";

import { Page, StateData, formatConfiguration, formatTimestamp, getComparisonValue, stepTarget } from "./lib";
import { DetailPanel, InfoItem, MiniStat, ValueCard } from "./ui";
import { PipelineFlow } from "./visuals";

export function OverviewPage({
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

      <PipelineFlow stages={data.decision.evidence_chain} status={data.decision.status} />

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
