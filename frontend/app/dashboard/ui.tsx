import type { ReactNode } from "react";
import { MetricSet, comparisonClass, formatMetricName, formatPercent, formatValue, safeMetricEntries } from "./lib";

export function ExperimentRow({
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

export function MetricProgress({
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

export function ThresholdRow({
  label,
  value,
  blockThreshold,
  warnThreshold,
  noise = null,
}: {
  label: string;
  value: number | null;
  blockThreshold: number;
  warnThreshold: number;
  noise?: number | null;
}) {
  const blocked = value !== null && value > blockThreshold;
  const warned = !blocked && value !== null && value > warnThreshold;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-white/[0.05] bg-white/[0.015] p-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-400">{label}</div>

        <div className="mt-1 text-xs text-slate-400">
          Block threshold: &gt; {blockThreshold}%
          {value !== null && noise !== null && Math.abs(value) <= noise && (
            <span className="ml-2 text-slate-300">· within A/A noise (±{noise}%)</span>
          )}
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

export function SectionHeader({
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

export function DetailPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
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

export function InfoItem({
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

export function ValueCard({
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

export function MiniStat({
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

export function MetricTable({ metrics }: { metrics?: MetricSet | null }) {
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
