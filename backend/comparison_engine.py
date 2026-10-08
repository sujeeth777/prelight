import json
import statistics
from pathlib import Path


RESULTS_DIR = Path(__file__).parent.parent / "experiments" / "results"


# Maximum acceptable degradation before Prelight raises a warning.
WARN_THRESHOLD_PERCENT = 10.0

# Maximum acceptable degradation before Prelight blocks a change.
BLOCK_THRESHOLD_PERCENT = 20.0

# Error-rate thresholds.
WARN_ERROR_RATE_PERCENT = 1.0
BLOCK_ERROR_RATE_PERCENT = 5.0


def load_result(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


def calculate_percentage_change(baseline, candidate):
    if baseline == 0:
        return 0.0

    return ((candidate - baseline) / baseline) * 100


def calculate_category_metrics(data):
    categories = {}

    for request in data.get("requests", []):
        if request.get("status") != "success":
            continue

        category = request.get("category", "unknown")

        if category not in categories:
            categories[category] = {
                "ttft": [],
                "latency": [],
            }

        categories[category]["ttft"].append(
            request["ttft_ms"]
        )

        categories[category]["latency"].append(
            request["total_latency_ms"]
        )

    result = {}

    for category, values in categories.items():
        result[category] = {
            "request_count": len(values["ttft"]),
            "mean_ttft_ms": round(
                statistics.mean(values["ttft"]), 2
            ),
            "mean_latency_ms": round(
                statistics.mean(values["latency"]), 2
            ),
        }

    return result


def compare(baseline_data, candidate_data):
    baseline = baseline_data["summary"]
    candidate = candidate_data["summary"]

    ttft_change = calculate_percentage_change(
        baseline["ttft_mean_ms"],
        candidate["ttft_mean_ms"],
    )

    p95_ttft_change = calculate_percentage_change(
        baseline["ttft_p95_ms"],
        candidate["ttft_p95_ms"],
    )

    latency_change = calculate_percentage_change(
        baseline["latency_mean_ms"],
        candidate["latency_mean_ms"],
    )

    p95_latency_change = calculate_percentage_change(
        baseline["latency_p95_ms"],
        candidate["latency_p95_ms"],
    )

    error_rate_change = (
        candidate["error_rate_percent"]
        - baseline["error_rate_percent"]
    )

    reasons = []

    # TTFT evaluation
    if ttft_change >= BLOCK_THRESHOLD_PERCENT:
        reasons.append(
            f"Mean TTFT increased by {ttft_change:.2f}%"
        )
    elif ttft_change >= WARN_THRESHOLD_PERCENT:
        reasons.append(
            f"Mean TTFT increased by {ttft_change:.2f}%"
        )

    # P95 TTFT evaluation
    if p95_ttft_change >= BLOCK_THRESHOLD_PERCENT:
        reasons.append(
            f"P95 TTFT increased by {p95_ttft_change:.2f}%"
        )
    elif p95_ttft_change >= WARN_THRESHOLD_PERCENT:
        reasons.append(
            f"P95 TTFT increased by {p95_ttft_change:.2f}%"
        )

    # Mean latency evaluation
    if latency_change >= BLOCK_THRESHOLD_PERCENT:
        reasons.append(
            f"Mean latency increased by {latency_change:.2f}%"
        )
    elif latency_change >= WARN_THRESHOLD_PERCENT:
        reasons.append(
            f"Mean latency increased by {latency_change:.2f}%"
        )

    # P95 latency evaluation
    if p95_latency_change >= BLOCK_THRESHOLD_PERCENT:
        reasons.append(
            f"P95 latency increased by {p95_latency_change:.2f}%"
        )
    elif p95_latency_change >= WARN_THRESHOLD_PERCENT:
        reasons.append(
            f"P95 latency increased by {p95_latency_change:.2f}%"
        )

    # Error rate evaluation
    if candidate["error_rate_percent"] >= BLOCK_ERROR_RATE_PERCENT:
        reasons.append(
            f"Error rate reached {candidate['error_rate_percent']:.2f}%"
        )
    elif candidate["error_rate_percent"] >= WARN_ERROR_RATE_PERCENT:
        reasons.append(
            f"Error rate reached {candidate['error_rate_percent']:.2f}%"
        )

    # Determine decision.
    block_conditions = [
        ttft_change >= BLOCK_THRESHOLD_PERCENT,
        p95_ttft_change >= BLOCK_THRESHOLD_PERCENT,
        latency_change >= BLOCK_THRESHOLD_PERCENT,
        p95_latency_change >= BLOCK_THRESHOLD_PERCENT,
        candidate["error_rate_percent"] >= BLOCK_ERROR_RATE_PERCENT,
    ]

    warn_conditions = [
        ttft_change >= WARN_THRESHOLD_PERCENT,
        p95_ttft_change >= WARN_THRESHOLD_PERCENT,
        latency_change >= WARN_THRESHOLD_PERCENT,
        p95_latency_change >= WARN_THRESHOLD_PERCENT,
        candidate["error_rate_percent"] >= WARN_ERROR_RATE_PERCENT,
    ]

    if any(block_conditions):
        decision = "BLOCK"
        risk = "HIGH"
        confidence = 0.90
    elif any(warn_conditions):
        decision = "WARN"
        risk = "MEDIUM"
        confidence = 0.75
    else:
        decision = "SAFE"
        risk = "LOW"
        confidence = 0.85

    if not reasons:
        reasons.append(
            "Candidate performance remained within configured "
            "regression thresholds."
        )

    return {
        "decision": decision,
        "risk": risk,
        "confidence": confidence,
        "metrics": {
            "mean_ttft_change_percent": round(ttft_change, 2),
            "p95_ttft_change_percent": round(p95_ttft_change, 2),
            "mean_latency_change_percent": round(latency_change, 2),
            "p95_latency_change_percent": round(
                p95_latency_change, 2
            ),
            "error_rate_change_percentage_points": round(
                error_rate_change, 2
            ),
        },
        "reasons": reasons,
        "baseline_categories": calculate_category_metrics(
            baseline_data
        ),
        "candidate_categories": calculate_category_metrics(
            candidate_data
        ),
    }


def print_report(result):
    print()
    print("=" * 64)
    print("                 PRELIGHT")
    print("             CHANGE DECISION")
    print("=" * 64)
    print()

    print(f"Decision:   {result['decision']}")
    print(f"Risk:       {result['risk']}")
    print(f"Confidence: {result['confidence']:.0%}")
    print()

    print("METRIC CHANGES")
    print("-" * 64)

    metrics = result["metrics"]

    print(
        f"Mean TTFT:      "
        f"{metrics['mean_ttft_change_percent']:+.2f}%"
    )

    print(
        f"P95 TTFT:       "
        f"{metrics['p95_ttft_change_percent']:+.2f}%"
    )

    print(
        f"Mean latency:   "
        f"{metrics['mean_latency_change_percent']:+.2f}%"
    )

    print(
        f"P95 latency:    "
        f"{metrics['p95_latency_change_percent']:+.2f}%"
    )

    print(
        f"Error rate:     "
        f"{metrics['error_rate_change_percentage_points']:+.2f} "
        f"percentage points"
    )

    print()
    print("REASONS")
    print("-" * 64)

    for reason in result["reasons"]:
        print(f"- {reason}")

    print()
    print("WORKLOAD CATEGORIES")
    print("-" * 64)

    categories = set(
        result["baseline_categories"].keys()
    ) | set(
        result["candidate_categories"].keys()
    )

    for category in sorted(categories):
        baseline_category = result["baseline_categories"].get(
            category
        )

        candidate_category = result["candidate_categories"].get(
            category
        )

        print(f"\n{category.upper()}")

        if baseline_category:
            print(
                f"  Baseline TTFT: "
                f"{baseline_category['mean_ttft_ms']:.2f} ms"
            )

        if candidate_category:
            print(
                f"  Candidate TTFT: "
                f"{candidate_category['mean_ttft_ms']:.2f} ms"
            )

    print()
    print("=" * 64)


def main():
    files = sorted(
        RESULTS_DIR.glob("baseline_*.json")
    )

    if len(files) < 3:
        raise RuntimeError(
            "At least three baseline files are required."
        )

    baseline_file = files[-3]

    # Candidate file can be supplied later.
    # For now, this verifies that the comparison engine
    # correctly processes a real experiment result.
    candidate_file = files[-1]

    baseline_data = load_result(baseline_file)
    candidate_data = load_result(candidate_file)

    result = compare(
        baseline_data,
        candidate_data,
    )

    print_report(result)

    output_file = (
        RESULTS_DIR / "latest_decision.json"
    )

    with open(
        output_file,
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            {
                "baseline_file": baseline_file.name,
                "candidate_file": candidate_file.name,
                "decision": result,
            },
            file,
            indent=2,
        )

    print()
    print(f"Decision saved to: {output_file}")


if __name__ == "__main__":
    main()