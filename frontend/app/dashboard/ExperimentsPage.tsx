"use client";

import { useCallback, useState } from "react";
import { API_URL, ExperimentStatus, StateData, getComparisonValue, getNumericMetric, statusPanel } from "./lib";
import { DetailPanel, ExperimentRow, MetricProgress, SectionHeader, ThresholdRow, ValueCard } from "./ui";

export function ExperimentsPage({
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
