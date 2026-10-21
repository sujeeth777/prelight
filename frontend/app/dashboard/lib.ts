export const API_URL = (
  process.env.NEXT_PUBLIC_PRELIGHT_API_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

export type Page =
  | "overview"
  | "change"
  | "evidence"
  | "experiments"
  | "decision"
  | "rollout";

export type MetricSet = Record<string, number | string | null | undefined>;

export type ExperimentStatus = {
  running: boolean;
  operation: "validation" | "boundary_scan" | null;
  started_at: string | null;
};

export type RolloutStep =
  | string
  | {
      step?: number | string;
      action?: string;
      description?: string;
    };

export type ResearchSource = {
  query: string;
  title: string;
  url: string;
  content: string;
  score: number | null;
};

export type ResearchData = {
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

export type BoundaryResult = {
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

export type BoundaryReport = {
  tested_values: number[];
  safe_operating_boundary: number | null;
  status: string;
  summary: string;
  results: BoundaryResult[];
  stale?: boolean;
  noise_floor_percent?: number | null;
  aa_control?: { available: boolean; noise_floor_percent: number | null; source?: string | null };
};

export type StateData = {
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

export const navigation: { id: Page; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "◈" },
  { id: "change", label: "Change", icon: "⇄" },
  { id: "evidence", label: "Evidence", icon: "◎" },
  { id: "experiments", label: "Experiments", icon: "◌" },
  { id: "decision", label: "Decision", icon: "◆" },
  { id: "rollout", label: "Rollout", icon: "→" },
];

export function statusPanel(status?: string): string {
  switch (status) {
    case "BLOCK": return "border-red-500/30 bg-red-500/[0.05] text-red-300";
    case "WARN": return "border-amber-500/30 bg-amber-500/[0.05] text-amber-300";
    case "SAFE": return "border-emerald-500/30 bg-emerald-500/[0.05] text-emerald-300";
    default: return "border-zinc-700 bg-zinc-900 text-zinc-300";
  }
}

export function formatValue(value: unknown): string {
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

export function formatMetricName(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function safeMetricEntries(metrics?: MetricSet | null) {
  if (!metrics || typeof metrics !== "object") {
    return [];
  }

  return Object.entries(metrics).filter(
    ([, value]) => value !== undefined && value !== null
  );
}

export function getNumericMetric(
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

export function getComparisonValue(
  comparison: MetricSet | undefined,
  possibleKeys: string[]
): number | null {
  return getNumericMetric(comparison, possibleKeys);
}

export function comparisonClass(value: number | null): string {
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

export function formatPercent(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatTimestamp(value?: string | null): string {
  if (!value) {
    return "Unavailable";
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? value
    : timestamp.toLocaleString();
}

export function formatConfiguration(
  configuration?: Record<string, unknown> | null
): string {
  if (!configuration || Object.keys(configuration).length === 0) {
    return "Unavailable";
  }

  return Object.entries(configuration)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join(" · ");
}

export function getStepAction(step: RolloutStep): string {
  if (typeof step === "string") {
    return step;
  }

  return step.action || "Rollout action";
}

export function getStepDescription(step: RolloutStep): string {
  if (typeof step === "string") {
    return "";
  }

  return step.description || "";
}

export function getStepNumber(step: RolloutStep, index: number): string {
  if (typeof step === "object" && step.step !== undefined) {
    return String(step.step);
  }

  return String(index + 1);
}

export function stepTarget(step: string): Page {
  if (/CHANGE/.test(step)) return "change";
  if (/RESEARCH/.test(step)) return "evidence";
  if (/BASELINE|ROUND|INTERVAL|EXPERIMENT|EVIDENCE_CHECK/.test(step)) return "experiments";
  if (/ROLLOUT/.test(step)) return "rollout";
  return "decision";
}

export function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}
