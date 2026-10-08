import json
from pathlib import Path


# ============================================================
# PRELIGHT - EVIDENCE-BACKED DECISION ENGINE
# ============================================================

ROOT = Path(__file__).resolve().parent.parent

RESULTS_DIR = ROOT / "experiments" / "results"

CHANGE_FILE = ROOT / "configs" / "change.json"
ANALYSIS_FILE = ROOT / "experiments" / "change_analysis.json"
RESEARCH_FILE = ROOT / "experiments" / "research_assessment.json"

DECISION_FILE = RESULTS_DIR / "latest_decision.json"


# ============================================================
# HELPERS
# ============================================================

def load_json(path):
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def normalize_change_id(value):
    if not value:
        return ""

    return (
        str(value)
        .strip()
        .upper()
        .replace("-", "")
        .replace("_", "")
        .replace(" ", "")
    )


def list_result_files(prefix):
    return sorted(
        RESULTS_DIR.glob(f"{prefix}*.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )


def get_summary(data):
    """
    Supports the current experiment result schema.
    """

    summary = data.get("summary")

    if not isinstance(summary, dict):
        raise RuntimeError(
            "Experiment result does not contain a valid summary."
        )

    return summary


def percentage_change(baseline, candidate):
    if baseline == 0:
        return 0.0

    return (
        (candidate - baseline)
        / baseline
    ) * 100.0


def extract_research_summary():
    if not RESEARCH_FILE.exists():
        return {
            "available": False,
            "queries_used": 0,
            "sources_used": 0,
            "assessment": "",
        }

    research = load_json(RESEARCH_FILE)

    return {
        "available": True,
        "queries_used": research.get(
            "research_queries_used",
            0,
        ),
        "sources_used": research.get(
            "research_sources_used",
            0,
        ),
        "assessment": research.get(
            "assessment",
            "",
        ),
    }


# ============================================================
# LOAD PROJECT DATA
# ============================================================

print("==========================================")
print("        PRELIGHT - DECISION ENGINE")
print("==========================================")

print("\nLoading project evidence...")

change = load_json(CHANGE_FILE)
analysis = load_json(ANALYSIS_FILE)

change_id = change.get(
    "change_id",
    "UNKNOWN",
)

print(f"Change ID: {change_id}")

# ============================================================
# FIND BASELINE
# ============================================================

baseline_files = list_result_files(
    "baseline_"
)

if not baseline_files:
    raise RuntimeError(
        "No baseline experiment results were found."
    )


baseline_path = baseline_files[0]

baseline = load_json(
    baseline_path
)

baseline_summary = get_summary(
    baseline
)


# ============================================================
# FIND CANDIDATE
# ============================================================

candidate_files = list_result_files(
    "candidate_"
)

candidate_path = None
candidate = None

target_change = normalize_change_id(
    change_id
)

for path in candidate_files:

    try:
        data = load_json(path)
    except Exception:
        continue

    experiment_change_id = (
        data.get("change_id")
        or data.get("experiment", {}).get(
            "change_id"
        )
    )

    filename_change_id = (
        path.stem
        .replace("candidate_", "")
    )

    if (
        normalize_change_id(
            experiment_change_id
        )
        == target_change
        or normalize_change_id(
            filename_change_id
        )
        == target_change
    ):
        candidate_path = path
        candidate = data
        break


if candidate is None:
    raise RuntimeError(
        f"No candidate experiment found for "
        f"change {change_id}."
    )


candidate_summary = get_summary(
    candidate
)


# ============================================================
# EXTRACT METRICS
# ============================================================

baseline_ttft_mean = float(
    baseline_summary["ttft_mean_ms"]
)

baseline_ttft_p95 = float(
    baseline_summary["ttft_p95_ms"]
)

baseline_latency_mean = float(
    baseline_summary["latency_mean_ms"]
)

baseline_latency_p95 = float(
    baseline_summary["latency_p95_ms"]
)

baseline_error_rate = float(
    baseline_summary["error_rate_percent"]
)


candidate_ttft_mean = float(
    candidate_summary["ttft_mean_ms"]
)

candidate_ttft_p95 = float(
    candidate_summary["ttft_p95_ms"]
)

candidate_latency_mean = float(
    candidate_summary["latency_mean_ms"]
)

candidate_latency_p95 = float(
    candidate_summary["latency_p95_ms"]
)

candidate_error_rate = float(
    candidate_summary["error_rate_percent"]
)


# ============================================================
# CALCULATE REGRESSIONS
# ============================================================

ttft_mean_change = percentage_change(
    baseline_ttft_mean,
    candidate_ttft_mean,
)

ttft_p95_change = percentage_change(
    baseline_ttft_p95,
    candidate_ttft_p95,
)

latency_mean_change = percentage_change(
    baseline_latency_mean,
    candidate_latency_mean,
)

latency_p95_change = percentage_change(
    baseline_latency_p95,
    candidate_latency_p95,
)

error_rate_change = (
    candidate_error_rate
    - baseline_error_rate
)


# ============================================================
# SAFETY POLICY
# ============================================================

WARN_THRESHOLD = float(
    change.get(
        "risk_policy",
        {}
    ).get(
        "warn_threshold_percent",
        10,
    )
)

BLOCK_THRESHOLD = float(
    change.get(
        "risk_policy",
        {}
    ).get(
        "block_threshold_percent",
        20,
    )
)

ERROR_WARN_THRESHOLD = float(
    change.get(
        "risk_policy",
        {}
    ).get(
        "error_warn_threshold_percent",
        1.0,
    )
)

ERROR_BLOCK_THRESHOLD = float(
    change.get(
        "risk_policy",
        {}
    ).get(
        "error_block_threshold_percent",
        5.0,
    )
)


block_reasons = []
warn_reasons = []


def evaluate_metric(
    label,
    change_percent,
):
    if change_percent > BLOCK_THRESHOLD:

        block_reasons.append(
            f"BLOCK: {label} regression "
            f"exceeds {BLOCK_THRESHOLD:.0f}%."
        )

    elif change_percent > WARN_THRESHOLD:

        warn_reasons.append(
            f"WARN: {label} regression "
            f"exceeds {WARN_THRESHOLD:.0f}%."
        )


evaluate_metric(
    "Mean TTFT",
    ttft_mean_change,
)

evaluate_metric(
    "P95 TTFT",
    ttft_p95_change,
)

evaluate_metric(
    "Mean latency",
    latency_mean_change,
)

evaluate_metric(
    "P95 latency",
    latency_p95_change,
)


if candidate_error_rate >= ERROR_BLOCK_THRESHOLD:

    block_reasons.append(
        "BLOCK: Candidate error rate reaches or exceeds "
        f"{ERROR_BLOCK_THRESHOLD:.0f}%."
    )

elif candidate_error_rate >= ERROR_WARN_THRESHOLD:

    warn_reasons.append(
        "WARN: Candidate error rate reaches or exceeds "
        f"{ERROR_WARN_THRESHOLD:.0f}%."
    )


# ============================================================
# FINAL SAFETY DECISION
# ============================================================

if block_reasons:

    decision = "BLOCK"

    reason = (
        "The candidate experiment produced one or more "
        "regressions above the configured blocking threshold."
    )

    recommendation = (
        "Do not deploy globally. Investigate the regression "
        "and repeat validation before rollout."
    )

elif warn_reasons:

    decision = "WARN"

    reason = (
        "The candidate experiment produced regressions "
        "above the warning threshold but below the "
        "blocking threshold."
    )

    recommendation = (
        "Do not perform unrestricted rollout. "
        "Use a limited rollout and continue monitoring."
    )

else:

    decision = "SAFE"

    reason = (
        "The candidate experiment remained within the "
        "configured safety thresholds."
    )

    recommendation = (
        "The change is eligible for controlled rollout "
        "with continued monitoring."
    )


# ============================================================
# RESEARCH EVIDENCE
# ============================================================

research_summary = extract_research_summary()


# ============================================================
# BUILD DECISION ARTIFACT
# ============================================================

decision_artifact = {
    "prelight_version": "0.1",
    "change": {
        "change_id": change_id,
        "title": change.get(
            "title",
            "",
        ),
        "component": change.get(
            "component",
            "",
        ),
        "risk_level": analysis.get(
            "risk_level",
            "UNKNOWN",
        ),
    },

    "decision": {
        "status": decision,
        "reason": reason,
        "recommendation": recommendation,
    },

    "policy": {
        "warn_threshold_percent": WARN_THRESHOLD,
        "block_threshold_percent": BLOCK_THRESHOLD,
        "error_warn_threshold_percent": ERROR_WARN_THRESHOLD,
        "error_block_threshold_percent": ERROR_BLOCK_THRESHOLD,
    },

    "experiment": {
        "type": "candidate",
        "run_id": candidate.get("experiment", {}).get("id") or candidate.get("run_id") or candidate_path.stem,
        "file": candidate_path.name,
        "change_id": change_id,
        "configuration": candidate.get("experiment", {}).get("configuration", {}),
    },

    "baseline": {
        "file": baseline_path.name,
        "mean_ttft_ms": baseline_ttft_mean,
        "p95_ttft_ms": baseline_ttft_p95,
        "mean_latency_ms": baseline_latency_mean,
        "p95_latency_ms": baseline_latency_p95,
        "error_rate_percent": baseline_error_rate,
    },

    "candidate": {
        "file": candidate_path.name,
        "mean_ttft_ms": candidate_ttft_mean,
        "p95_ttft_ms": candidate_ttft_p95,
        "mean_latency_ms": candidate_latency_mean,
        "p95_latency_ms": candidate_latency_p95,
        "error_rate_percent": candidate_error_rate,
    },

    "comparison": {
        "mean_ttft_change_percent": round(
            ttft_mean_change,
            2,
        ),
        "p95_ttft_change_percent": round(
            ttft_p95_change,
            2,
        ),
        "mean_latency_change_percent": round(
            latency_mean_change,
            2,
        ),
        "p95_latency_change_percent": round(
            latency_p95_change,
            2,
        ),
        "error_rate_change_percent": round(
            error_rate_change,
            2,
        ),
    },

    "triggered_rules": (
        block_reasons
        + warn_reasons
    ),

    "external_research": research_summary,

    "evidence_chain": [
        "PROPOSED_CHANGE",
        "CHANGE_ANALYSIS",
        "EXTERNAL_RESEARCH",
        "CONTROLLED_BASELINE",
        "CONTROLLED_CANDIDATE",
        "MEASURED_COMPARISON",
        "DETERMINISTIC_SAFETY_POLICY",
        decision,
    ],
}


# ============================================================
# SAVE
# ============================================================

RESULTS_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

with DECISION_FILE.open(
    "w",
    encoding="utf-8",
) as file:

    json.dump(
        decision_artifact,
        file,
        indent=2,
    )


# ============================================================
# DISPLAY
# ============================================================

print("\nBASELINE")
print(
    f"  Mean TTFT:     {baseline_ttft_mean:.2f} ms"
)
print(
    f"  P95 TTFT:      {baseline_ttft_p95:.2f} ms"
)
print(
    f"  Mean latency:  {baseline_latency_mean:.2f} ms"
)
print(
    f"  P95 latency:   {baseline_latency_p95:.2f} ms"
)
print(
    f"  Error rate:    {baseline_error_rate:.2f}%"
)

print("\nCANDIDATE")
print(
    f"  Mean TTFT:     {candidate_ttft_mean:.2f} ms"
)
print(
    f"  P95 TTFT:      {candidate_ttft_p95:.2f} ms"
)
print(
    f"  Mean latency:  {candidate_latency_mean:.2f} ms"
)
print(
    f"  P95 latency:   {candidate_latency_p95:.2f} ms"
)
print(
    f"  Error rate:    {candidate_error_rate:.2f}%"
)

print("\nCOMPARISON")
print(
    f"  Mean TTFT:     {ttft_mean_change:+.2f}%"
)
print(
    f"  P95 TTFT:      {ttft_p95_change:+.2f}%"
)
print(
    f"  Mean latency:  {latency_mean_change:+.2f}%"
)
print(
    f"  P95 latency:   {latency_p95_change:+.2f}%"
)
print(
    f"  Error rate Δ:  {error_rate_change:+.2f}%"
)

print("\nEXTERNAL RESEARCH")

if research_summary["available"]:

    print(
        f"  Queries:       "
        f"{research_summary['queries_used']}"
    )

    print(
        f"  Sources:       "
        f"{research_summary['sources_used']}"
    )

    print(
        "  Assessment:    AVAILABLE"
    )

else:

    print(
        "  Assessment:    NOT AVAILABLE"
    )


print("\nTRIGGERED SAFETY RULES")

if not block_reasons and not warn_reasons:

    print("  • None")

else:

    for item in block_reasons:
        print(f"  • {item}")

    for item in warn_reasons:
        print(f"  • {item}")


print("\n==========================================")
print("        PRELIGHT DECISION")
print("==========================================")
print(f"                    {decision}")
print()
print("Reason:")
print(reason)
print()
print("Recommendation:")
print(recommendation)
print()
print("Evidence chain:")

for index, stage in enumerate(
    decision_artifact["evidence_chain"],
    start=1,
):

    print(
        f"  {index}. {stage}"
    )

print()
print("Decision artifact saved to:")
print(DECISION_FILE)
print("==========================================")