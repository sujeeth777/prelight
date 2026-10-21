"use client";

import { StateData, getStepAction, getStepDescription, getStepNumber, statusPanel } from "./lib";
import { DetailPanel, SectionHeader } from "./ui";

export function RolloutPage({ data }: { data: StateData }) {
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
