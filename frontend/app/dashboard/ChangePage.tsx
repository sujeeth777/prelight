"use client";

import { MetricSet, StateData } from "./lib";
import { DetailPanel, InfoItem, MetricTable, SectionHeader } from "./ui";

export function ChangePage({
  data,
  proposedMaxTokens,
  setProposedMaxTokens,
  proposedTemperature,
  setProposedTemperature,
  proposedTopP,
  setProposedTopP,
  proposedModel,
  setProposedModel,
  setProposalDirty,
}: {
  data: StateData;
  proposedMaxTokens: string;
  setProposedMaxTokens: (value: string) => void;
  proposedTemperature: string;
  setProposedTemperature: (value: string) => void;
  proposedTopP: string;
  setProposedTopP: (value: string) => void;
  proposedModel: string;
  setProposedModel: (value: string) => void;
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

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
              <label htmlFor="temperature" className="mb-3 block text-[11px] uppercase tracking-[0.16em] text-slate-400">temperature</label>
              <input
                id="temperature"
                aria-describedby="temperature-help"
                type="text"
                inputMode="decimal"
                value={proposedTemperature}
                onChange={(event) => setProposedTemperature(event.target.value)}
                className="w-32 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
              />
              <p id="temperature-help" className="mt-2 text-xs text-slate-400">Number from 0 to 2.</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
              <label htmlFor="top-p" className="mb-3 block text-[11px] uppercase tracking-[0.16em] text-slate-400">top_p</label>
              <input
                id="top-p"
                aria-describedby="top-p-help"
                type="text" inputMode="decimal"
                value={proposedTopP}
                onChange={(event) => setProposedTopP(event.target.value)}
                className="w-32 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
              />
              <p id="top-p-help" className="mt-2 text-xs text-slate-400">Above 0, up to 1. Leave blank to keep the provider default.</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
              <label htmlFor="model" className="mb-3 block text-[11px] uppercase tracking-[0.16em] text-slate-400">model</label>
              <input
                id="model"
                aria-describedby="model-help"
                type="text"
                value={proposedModel}
                onChange={(event) => setProposedModel(event.target.value)}
                className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
              />
              <p id="model-help" className="mt-2 text-xs text-slate-400">NVIDIA model id. Leave blank to keep the current model; a different id tests a model swap.</p>
            </div>

            <MetricTable
              metrics={{
                ...(data.change.proposed_state as MetricSet),
                max_tokens: proposedMaxTokens || "—",
                temperature: proposedTemperature || "—",
                top_p: proposedTopP || "default",
                model: proposedModel || "unchanged",
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
