"use client";

import { StateData } from "./lib";
import { DetailPanel, SectionHeader } from "./ui";

export function DecisionPage({ data }: { data: StateData }) {
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
