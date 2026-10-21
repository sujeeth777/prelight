"use client";

import { useEffect, useState } from "react";
import { API_URL, ResearchData, StateData, safeHref } from "./lib";
import { DetailPanel, SectionHeader, ValueCard } from "./ui";

export function EvidencePage({ data }: { data: StateData }) {
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
