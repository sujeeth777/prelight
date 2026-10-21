"use client";

import { useEffect, useRef, useState } from "react";

const COLORS = { SAFE: "#34d399", WARN: "#fbbf24", BLOCK: "#f87171", UNKNOWN: "#94a3b8" } as const;
const INK = "#cbd5e1";
const GRID = "rgba(255,255,255,0.10)";

type Row = { label: string; value: number | null; lower?: number | null; upper?: number | null };

function scale(min: number, max: number, a: number, b: number) {
  const span = max - min || 1;
  return (v: number) => a + ((v - min) / span) * (b - a);
}

/* Horizontal chart: % change per metric with 95% CI whiskers, policy lines and the A/A noise band. */
export function ChangeVsNoiseChart({
  rows, warn, block, noise,
}: { rows: Row[]; warn: number; block: number; noise: number | null }) {
  const vals = rows.flatMap((r) => [r.value, r.lower, r.upper].filter((v): v is number => typeof v === "number"));
  const lo = Math.min(-(noise ?? 0) - 4, ...vals, -5);
  const hi = Math.max(block + 6, ...vals);
  const W = 640, rowH = 44, top = 16, H = top + rows.length * rowH + 28;
  const x = scale(lo, hi, 130, W - 16);
  const desc = rows
    .map((r) => `${r.label} ${r.value === null ? "no data" : r.value.toFixed(1) + " percent"}`)
    .join(", ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Change versus baseline with confidence intervals. ${desc}. Warn at ${warn} percent, block at ${block} percent.`} className="w-full">
      {noise !== null && (
        <g>
          <rect x={x(-noise)} y={top - 6} width={x(noise) - x(-noise)} height={rows.length * rowH + 6} fill="rgba(148,163,184,0.14)" />
          <text x={x(0)} y={H - 6} textAnchor="middle" fontSize="11" fill={INK}>A/A noise ±{noise}%</text>
        </g>
      )}
      <line x1={x(0)} x2={x(0)} y1={top - 6} y2={top + rows.length * rowH} stroke={GRID} />
      {[[warn, COLORS.WARN, "warn"], [block, COLORS.BLOCK, "block"]].map(([v, c, t]) => (
        <g key={String(t)}>
          <line x1={x(v as number)} x2={x(v as number)} y1={top - 6} y2={top + rows.length * rowH} stroke={c as string} strokeDasharray="4 4" />
          <text x={x(v as number)} y={H - 6} textAnchor="middle" fontSize="11" fill={c as string}>{t as string} {v as number}%</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const y = top + i * rowH + rowH / 2 - 6;
        const color = r.value === null ? COLORS.UNKNOWN : r.value > block ? COLORS.BLOCK : r.value > warn ? COLORS.WARN : COLORS.SAFE;
        return (
          <g key={r.label}>
            <text x={0} y={y + 4} fontSize="12" fill={INK}>{r.label}</text>
            {typeof r.lower === "number" && typeof r.upper === "number" && (
              <g stroke={color} strokeWidth="2">
                <line x1={x(r.lower)} x2={x(r.upper)} y1={y} y2={y} />
                <line x1={x(r.lower)} x2={x(r.lower)} y1={y - 6} y2={y + 6} />
                <line x1={x(r.upper)} x2={x(r.upper)} y1={y - 6} y2={y + 6} />
              </g>
            )}
            {r.value !== null && <circle cx={x(r.value)} cy={y} r="5" fill={color} />}
            {r.value !== null && (
              <text x={x(r.value)} y={y - 11} textAnchor="middle" fontSize="11" fill={color}>
                {r.value > 0 ? "+" : ""}{r.value.toFixed(1)}%
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

type BPoint = { max_tokens: number; status: string; value: number | null };

/* Boundary curve: mean-latency change vs max_tokens, coloured by decision. */
export function BoundaryCurve({
  points, warn, block, noise, boundary,
}: { points: BPoint[]; warn: number; block: number; noise: number | null; boundary: number | null }) {
  const sorted = [...points].sort((a, b) => a.max_tokens - b.max_tokens);
  const vals = sorted.map((p) => p.value).filter((v): v is number => v !== null);
  const lo = Math.min(-(noise ?? 0) - 4, ...vals, -5);
  const hi = Math.max(block + 6, ...vals);
  const W = 640, H = 260, L = 48, R = 20, T = 18, B = 40;
  const y = scale(lo, hi, H - B, T);
  const step = sorted.length > 1 ? (W - L - R) / (sorted.length - 1) : 0;
  const px = (i: number) => (sorted.length > 1 ? L + i * step : (L + W - R) / 2);
  const path = sorted.map((p, i) => (p.value === null ? null : `${px(i)},${y(p.value)}`)).filter(Boolean).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Latency change by max_tokens. ${sorted.map((p) => `${p.max_tokens} tokens ${p.status}${p.value === null ? "" : " " + p.value.toFixed(1) + " percent"}`).join(", ")}.${boundary ? ` Safe boundary ${boundary} tokens.` : ""}`} className="w-full">
      {noise !== null && <rect x={L} y={y(noise)} width={W - L - R} height={y(-noise) - y(noise)} fill="rgba(148,163,184,0.14)" />}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke={GRID} />
      {[[warn, COLORS.WARN], [block, COLORS.BLOCK]].map(([v, c]) => (
        <g key={String(v)}>
          <line x1={L} x2={W - R} y1={y(v as number)} y2={y(v as number)} stroke={c as string} strokeDasharray="4 4" />
          <text x={W - R} y={y(v as number) - 4} textAnchor="end" fontSize="11" fill={c as string}>{v as number}%</text>
        </g>
      ))}
      <polyline points={path} fill="none" stroke="rgba(203,213,225,0.5)" strokeWidth="2" />
      {sorted.map((p, i) => {
        const c = COLORS[p.status as keyof typeof COLORS] ?? COLORS.UNKNOWN;
        return (
          <g key={p.max_tokens}>
            {p.value !== null && <circle cx={px(i)} cy={y(p.value)} r="6" fill={c} />}
            {p.value !== null && (
              <text x={px(i)} y={y(p.value) - 12} textAnchor="middle" fontSize="11" fill={c}>{p.value > 0 ? "+" : ""}{p.value.toFixed(1)}%</text>
            )}
            <text x={px(i)} y={H - 20} textAnchor="middle" fontSize="12" fill={INK}>{p.max_tokens}</text>
            <text x={px(i)} y={H - 6} textAnchor="middle" fontSize="10" fill={c}>{p.status}</text>
          </g>
        );
      })}
      <text x={L - 8} y={T + 4} textAnchor="end" fontSize="10" fill={INK}>Δ latency</text>
    </svg>
  );
}

/* Animated replay of the saved validation pipeline. */
export function PipelineFlow({ stages, status }: { stages: string[]; status: string }) {
  const [active, setActive] = useState<number>(stages.length);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  const replay = () => {
    if (timer.current) window.clearInterval(timer.current);
    setActive(0);
    let i = 0;
    timer.current = window.setInterval(() => {
      i += 1;
      setActive(i);
      if (i >= stages.length && timer.current) window.clearInterval(timer.current);
    }, 500);
  };

  const finalColor = status === "BLOCK" ? "border-red-500/50 text-red-300" : status === "WARN" ? "border-amber-500/50 text-amber-300" : status === "SAFE" ? "border-emerald-500/50 text-emerald-300" : "border-white/20 text-slate-300";

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0a0d12] p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-slate-300">Validation pipeline</h2>
        <button onClick={replay} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300 hover:bg-white/[0.08] hover:text-white">
          ▶ Replay saved run
        </button>
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stages.map((stage, i) => {
          const done = i < active;
          const last = i === stages.length - 1;
          return (
            <li key={stage} className={`rounded-xl border px-3 py-3 text-xs transition ${done ? (last ? finalColor : "border-emerald-500/30 text-slate-200") : "border-white/[0.06] text-slate-400"}`}>
              <span className="mr-2 text-[11px] opacity-70">{String(i + 1).padStart(2, "0")}</span>
              {stage.replace(/_/g, " ").toLowerCase()}
              <span className="sr-only">{done ? " complete" : " pending"}</span>
            </li>
          );
        })}
      </ol>
      <p role="status" aria-live="polite" className="mt-3 text-xs text-slate-400">
        {active >= stages.length ? `All ${stages.length} stages complete · verdict ${status}` : `Stage ${active + 1} of ${stages.length}…`}
      </p>
    </div>
  );
}
