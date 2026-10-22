import math
import json
import statistics
import uuid
from datetime import datetime, timezone


MIN_PAIRED_ROUNDS = 5
CONFIDENCE_LEVEL = 0.95
METRICS = {
    "mean_ttft_change_percent": (
        "ttft_mean_ms",
        "Mean TTFT",
    ),
    "p95_ttft_change_percent": (
        "ttft_p95_ms",
        "P95 TTFT",
    ),
    "mean_latency_change_percent": (
        "latency_mean_ms",
        "Mean latency",
    ),
    "p95_latency_change_percent": (
        "latency_p95_ms",
        "P95 latency",
    ),
}

T_CRITICAL_975 = {
    1: 12.706,
    2: 4.303,
    3: 3.182,
    4: 2.776,
    5: 2.571,
    6: 2.447,
    7: 2.365,
    8: 2.306,
    9: 2.262,
    10: 2.228,
    11: 2.201,
    12: 2.179,
    13: 2.160,
    14: 2.145,
    15: 2.131,
    16: 2.120,
    17: 2.110,
    18: 2.101,
    19: 2.093,
    20: 2.086,
    21: 2.080,
    22: 2.074,
    23: 2.069,
    24: 2.064,
    25: 2.060,
    26: 2.056,
    27: 2.052,
    28: 2.048,
    29: 2.045,
    30: 2.042,
}


def confidence_interval(values: list[float]) -> dict:
    if not values:
        return {
            "estimate_percent": None,
            "lower_percent": None,
            "upper_percent": None,
            "sample_count": 0,
            "confidence_level": CONFIDENCE_LEVEL,
        }

    estimate = statistics.mean(values)
    if len(values) < 2:
        lower = None
        upper = None
    else:
        degrees_of_freedom = len(values) - 1
        critical_value = T_CRITICAL_975.get(degrees_of_freedom, 2.05)
        margin = critical_value * statistics.stdev(values) / math.sqrt(len(values))
        lower = estimate - margin
        upper = estimate + margin

    return {
        "estimate_percent": round(estimate, 2),
        "lower_percent": round(lower, 2) if lower is not None else None,
        "upper_percent": round(upper, 2) if upper is not None else None,
        "sample_count": len(values),
        "confidence_level": CONFIDENCE_LEVEL,
    }


def _summary(run: dict) -> dict:
    summary = run.get("summary")
    return summary if isinstance(summary, dict) else {}


def _run_failures(run: dict) -> int:
    summary = _summary(run)
    try:
        failed = int(summary.get("failed_requests", 0))
        total = int(summary.get("total_requests", 0))
    except (TypeError, ValueError):
        return 1

    requests = run.get("requests")
    if not total or not isinstance(requests, list):
        return max(failed, 1)

    unsuccessful = sum(
        1
        for request in requests
        if not isinstance(request, dict)
        or request.get("status") != "success"
    )
    return max(failed, unsuccessful)


def _mean(values: list[float]) -> float | None:
    return round(statistics.mean(values), 2) if values else None


def _request_count(run: dict) -> int:
    try:
        return int(_summary(run).get("total_requests", 0))
    except (TypeError, ValueError):
        return 0


def _unique_json_value(values: list[dict]) -> dict | None:
    encoded = {json.dumps(value, sort_keys=True, default=str) for value in values}
    return values[0] if len(encoded) == 1 and values else None


def _percentage_change(baseline: float, candidate: float) -> float | None:
    if baseline <= 0:
        return None
    return ((candidate - baseline) / baseline) * 100


def build_paired_decision(
    change: dict,
    analysis: dict,
    research: dict,
    pairs: list[dict],
    min_rounds: int = MIN_PAIRED_ROUNDS,
) -> dict:
    evidence_errors: list[str] = []
    complete_pairs: list[dict] = []
    paired_changes = {key: [] for key in METRICS}
    baseline_metrics = {field: [] for field, _label in METRICS.values()}
    candidate_metrics = {field: [] for field, _label in METRICS.values()}
    baseline_errors = 0
    candidate_errors = 0
    total_requests = 0
    baseline_request_samples = 0
    candidate_request_samples = 0
    model_names = set()
    baseline_configurations = []
    candidate_configurations = []
    started_at_values = []
    finished_at_values = []
    pair_records = []

    for pair in pairs:
        baseline = pair.get("baseline_run")
        candidate = pair.get("candidate_run")
        pair_id = str(pair.get("pair_id", "unknown"))
        pair_order = str(pair.get("order", "unknown"))

        pair_record = {
            "pair_id": pair_id,
            "order": pair_order,
            "baseline_file": pair.get("baseline_file"),
            "candidate_file": pair.get("candidate_file"),
        }

        if not isinstance(baseline, dict) or not isinstance(candidate, dict):
            evidence_errors.append(
                f"Pair {pair_id} is incomplete; both runs are required."
            )
            pair_record["status"] = "incomplete"
            pair_records.append(pair_record)
            continue

        baseline_experiment = baseline.get("experiment", {})
        candidate_experiment = candidate.get("experiment", {})
        if not isinstance(baseline_experiment, dict):
            baseline_experiment = {}
        if not isinstance(candidate_experiment, dict):
            candidate_experiment = {}

        if (
            baseline_experiment.get("pair_id") != pair_id
            or candidate_experiment.get("pair_id") != pair_id
        ):
            evidence_errors.append(
                f"Pair {pair_id} has mismatched run identifiers."
            )

        baseline_model = baseline_experiment.get("model")
        candidate_model = candidate_experiment.get("model")
        if baseline_model:
            model_names.add(baseline_model)
        if candidate_model:
            model_names.add(candidate_model)
        declared_baseline = (change.get("current_state") or {}).get(
            "model", baseline_model
        )
        declared_candidate = (change.get("proposed_state") or {}).get(
            "model", declared_baseline
        )
        if (
            not baseline_model
            or not candidate_model
            or baseline_model != declared_baseline
            or candidate_model != declared_candidate
        ):
            evidence_errors.append(
                f"Pair {pair_id} used missing or unexpected models."
            )

        baseline_configuration = baseline_experiment.get("configuration", {})
        candidate_configuration = candidate_experiment.get("configuration", {})
        if not isinstance(baseline_configuration, dict):
            baseline_configuration = {}
        if not isinstance(candidate_configuration, dict):
            candidate_configuration = {}
        baseline_configurations.append(baseline_configuration)
        candidate_configurations.append(candidate_configuration)
        pair_record["model"] = baseline_model
        pair_record["baseline_configuration"] = baseline_configuration
        pair_record["candidate_configuration"] = candidate_configuration
        pair_record["baseline_started_at"] = baseline_experiment.get("started_at")
        pair_record["baseline_finished_at"] = baseline_experiment.get("finished_at")
        pair_record["candidate_started_at"] = candidate_experiment.get("started_at")
        pair_record["candidate_finished_at"] = candidate_experiment.get("finished_at")
        pair_record["baseline_request_samples"] = _request_count(baseline)
        pair_record["candidate_request_samples"] = _request_count(candidate)
        baseline_request_samples += pair_record["baseline_request_samples"]
        candidate_request_samples += pair_record["candidate_request_samples"]
        total_requests += pair_record["candidate_request_samples"]

        for timestamp in (
            pair_record["baseline_started_at"],
            pair_record["candidate_started_at"],
        ):
            if isinstance(timestamp, str):
                started_at_values.append(timestamp)
        for timestamp in (
            pair_record["baseline_finished_at"],
            pair_record["candidate_finished_at"],
        ):
            if isinstance(timestamp, str):
                finished_at_values.append(timestamp)

        baseline_fingerprint = baseline_experiment.get("workload_fingerprint")
        candidate_fingerprint = candidate_experiment.get("workload_fingerprint")
        if (
            not baseline_fingerprint
            or baseline_fingerprint != candidate_fingerprint
        ):
            evidence_errors.append(
                f"Pair {pair_id} used missing or mismatched workloads."
            )

        baseline_requests = baseline.get("requests")
        candidate_requests = candidate.get("requests")
        if not isinstance(baseline_requests, list) or not isinstance(
            candidate_requests, list
        ):
            evidence_errors.append(
                f"Pair {pair_id} is missing per-request results."
            )
        else:
            baseline_ids = [
                request.get("request_id")
                for request in baseline_requests
                if isinstance(request, dict)
            ]
            candidate_ids = [
                request.get("request_id")
                for request in candidate_requests
                if isinstance(request, dict)
            ]
            if not baseline_ids or baseline_ids != candidate_ids:
                evidence_errors.append(
                    f"Pair {pair_id} has mismatched workload requests."
                )

        baseline_failed = _run_failures(baseline)
        candidate_failed = _run_failures(candidate)
        baseline_errors += baseline_failed
        candidate_errors += candidate_failed
        if baseline_failed or candidate_failed:
            evidence_errors.append(
                f"Pair {pair_id} contains failed requests; evidence is incomplete."
            )

        baseline_summary = _summary(baseline)
        candidate_summary = _summary(candidate)
        pair_valid = True
        for key, (field, _label) in METRICS.items():
            try:
                baseline_value = float(baseline_summary[field])
                candidate_value = float(candidate_summary[field])
            except (KeyError, TypeError, ValueError):
                pair_valid = False
                continue

            change_percent = _percentage_change(
                baseline_value,
                candidate_value,
            )
            if change_percent is None or not math.isfinite(change_percent):
                pair_valid = False
                continue

            paired_changes[key].append(change_percent)
            baseline_metrics[field].append(baseline_value)
            candidate_metrics[field].append(candidate_value)

        if not pair_valid:
            evidence_errors.append(
                f"Pair {pair_id} is missing valid latency measurements."
            )
            pair_record["status"] = "invalid"
        else:
            complete_pairs.append(pair)
            pair_record["status"] = "complete"

        pair_records.append(pair_record)

    if len(model_names) > 1:
        evidence_errors.append("Paired rounds used inconsistent models.")
    if len({json.dumps(value, sort_keys=True, default=str) for value in baseline_configurations}) > 1:
        evidence_errors.append("Baseline configuration changed between paired rounds.")
    if len({json.dumps(value, sort_keys=True, default=str) for value in candidate_configurations}) > 1:
        evidence_errors.append("Candidate configuration changed between paired rounds.")

    if len(complete_pairs) < min_rounds:
        evidence_errors.append(
            f"Only {len(complete_pairs)} complete paired rounds; "
            f"at least {min_rounds} are required."
        )

    uncertainty = {
        key: confidence_interval(values)
        for key, values in paired_changes.items()
    }
    comparison = {
        key: value["estimate_percent"]
        for key, value in uncertainty.items()
    }

    baseline_error_rate = (
        baseline_errors / total_requests * 100 if total_requests else 0.0
    )
    candidate_error_rate = (
        candidate_errors / total_requests * 100 if total_requests else 0.0
    )
    baseline_output = {
        field: _mean(values) for field, values in baseline_metrics.items()
    }
    candidate_output = {
        field: _mean(values) for field, values in candidate_metrics.items()
    }
    baseline_output.update(
        {"error_rate_percent": round(baseline_error_rate, 2)}
    )
    candidate_output.update(
        {"error_rate_percent": round(candidate_error_rate, 2)}
    )

    policy = change.get("risk_policy", {})
    if not isinstance(policy, dict):
        policy = {}
    warn_threshold = float(policy.get("warn_threshold_percent", 10))
    block_threshold = float(policy.get("block_threshold_percent", 20))
    error_warn_threshold = float(
        policy.get("error_warn_threshold_percent", 1)
    )
    error_block_threshold = float(
        policy.get("error_block_threshold_percent", 5)
    )

    block_reasons = list(dict.fromkeys(evidence_errors))
    warn_reasons = []
    for key, (_field, label) in METRICS.items():
        interval = uncertainty[key]
        lower = interval["lower_percent"]
        upper = interval["upper_percent"]
        if lower is None or upper is None:
            if key not in block_reasons:
                block_reasons.append(f"{label} uncertainty could not be computed.")
        elif lower > block_threshold:
            block_reasons.append(
                f"BLOCK: {label} regression is above {block_threshold:.0f}% "
                "at the 95% confidence bound."
            )
        elif upper > warn_threshold:
            warn_reasons.append(
                f"WARN: {label} regression is uncertain or may exceed "
                f"the {warn_threshold:.0f}% warning threshold."
            )

    if candidate_error_rate >= error_block_threshold:
        block_reasons.append(
            "BLOCK: Candidate error rate reaches or exceeds "
            f"{error_block_threshold:.0f}%."
        )
    elif candidate_error_rate >= error_warn_threshold:
        warn_reasons.append(
            "WARN: Candidate error rate reaches or exceeds "
            f"{error_warn_threshold:.0f}%."
        )

    if block_reasons:
        status = "BLOCK"
        reason = "Validation evidence is insufficient or violates a blocking safety rule."
        recommendation = "Do not roll out. Resolve the evidence or safety failures and repeat validation."
    elif warn_reasons:
        status = "WARN"
        reason = "The paired measurements do not establish that every regression is within the warning threshold."
        recommendation = "Do not perform an unrestricted rollout; investigate or use a limited canary."
    else:
        status = "SAFE"
        reason = "The upper 95% confidence bounds remained within configured warning thresholds."
        recommendation = "Eligible for controlled rollout with continued monitoring."

    return {
        "prelight_version": "0.2",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "change": {
            "change_id": change.get("change_id", "UNKNOWN"),
            "title": change.get("title", ""),
            "component": change.get("component", ""),
            "risk_level": analysis.get("risk_level", "UNKNOWN"),
        },
        "decision": {
            "status": status,
            "reason": reason,
            "recommendation": recommendation,
        },
        "policy": {
            "warn_threshold_percent": warn_threshold,
            "block_threshold_percent": block_threshold,
            "error_warn_threshold_percent": error_warn_threshold,
            "error_block_threshold_percent": error_block_threshold,
        },
        "experiment": {
            "type": "paired_candidate",
            "run_id": uuid.uuid4().hex,
            "origin": "live_provider_experiment",
            "model": next(iter(model_names))
            if len(model_names) == 1
            else (" → ".join(sorted(model_names)) if model_names else None),
            "started_at": min(started_at_values) if started_at_values else None,
            "finished_at": max(finished_at_values) if finished_at_values else None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "change_id": change.get("change_id", "UNKNOWN"),
            "configuration": change.get("proposed_state", {}),
            "baseline_configuration": _unique_json_value(baseline_configurations),
            "candidate_configuration": _unique_json_value(candidate_configurations),
            "paired_rounds": pair_records,
            "complete_rounds": len(complete_pairs),
            "required_rounds": min_rounds,
            "round_order": [record["order"] for record in pair_records],
            "sample_counts": {
                "baseline_requests": baseline_request_samples,
                "candidate_requests": candidate_request_samples,
                "paired_rounds": len(pair_records),
                "complete_rounds": len(complete_pairs),
            },
        },
        "baseline": baseline_output,
        "candidate": candidate_output,
        "comparison": comparison,
        "uncertainty": uncertainty,
        "triggered_rules": block_reasons + warn_reasons,
        "external_research": {
            key: research.get(key)
            for key in (
                "available",
                "research_queries_used",
                "research_sources_used",
                "assessment",
            )
        },
        "evidence_chain": [
            "PROPOSED_CHANGE",
            "CHANGE_ANALYSIS",
            "EXTERNAL_RESEARCH",
            "PAIRED_BASELINE_CANDIDATE_ROUNDS",
            "95_PERCENT_CONFIDENCE_INTERVALS",
            "FAIL_CLOSED_EVIDENCE_CHECKS",
            "DETERMINISTIC_SAFETY_POLICY",
            status,
        ],
    }