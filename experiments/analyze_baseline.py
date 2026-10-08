import json
import statistics
from pathlib import Path


RESULTS_DIR = Path(__file__).parent / "results"


def load_baseline_files():
    files = sorted(RESULTS_DIR.glob("baseline_*.json"))

    if len(files) < 3:
        raise RuntimeError(
            f"Expected at least 3 baseline files, found {len(files)}."
        )

    return files[-3:]


def main():
    files = load_baseline_files()

    print("=" * 64)
    print("              PRELIGHT")
    print("       BASELINE STABILITY ANALYSIS")
    print("=" * 64)
    print()

    runs = []

    for file in files:
        with open(file, "r", encoding="utf-8") as f:
            data = json.load(f)

        summary = data["summary"]

        runs.append(
            {
                "file": file.name,
                "ttft_mean": summary["ttft_mean_ms"],
                "ttft_median": summary["ttft_median_ms"],
                "ttft_p95": summary["ttft_p95_ms"],
                "latency_mean": summary["latency_mean_ms"],
                "latency_median": summary["latency_median_ms"],
                "latency_p95": summary["latency_p95_ms"],
                "error_rate": summary["error_rate_percent"],
            }
        )

    print("BASELINE RUNS")
    print("-" * 64)

    for index, run in enumerate(runs, start=1):
        print(f"Run {index}: {run['file']}")
        print(f"  Mean TTFT:      {run['ttft_mean']:.2f} ms")
        print(f"  P95 TTFT:       {run['ttft_p95']:.2f} ms")
        print(f"  Mean latency:   {run['latency_mean']:.2f} ms")
        print(f"  P95 latency:    {run['latency_p95']:.2f} ms")
        print(f"  Error rate:     {run['error_rate']:.2f}%")
        print()

    ttft_means = [run["ttft_mean"] for run in runs]
    latency_means = [run["latency_mean"] for run in runs]
    ttft_p95s = [run["ttft_p95"] for run in runs]
    latency_p95s = [run["latency_p95"] for run in runs]

    avg_ttft = statistics.mean(ttft_means)
    avg_latency = statistics.mean(latency_means)

    avg_ttft_p95 = statistics.mean(ttft_p95s)
    avg_latency_p95 = statistics.mean(latency_p95s)

    ttft_std = statistics.stdev(ttft_means)
    latency_std = statistics.stdev(latency_means)

    ttft_cv = (ttft_std / avg_ttft) * 100
    latency_cv = (latency_std / avg_latency) * 100

    ttft_min = min(ttft_means)
    ttft_max = max(ttft_means)

    latency_min = min(latency_means)
    latency_max = max(latency_means)

    ttft_range_percent = ((ttft_max - ttft_min) / avg_ttft) * 100
    latency_range_percent = (
        (latency_max - latency_min) / avg_latency
    ) * 100

    print("=" * 64)
    print("             STABILITY RESULTS")
    print("=" * 64)
    print()

    print(f"Average mean TTFT:       {avg_ttft:.2f} ms")
    print(f"Average P95 TTFT:        {avg_ttft_p95:.2f} ms")
    print(f"TTFT standard deviation: {ttft_std:.2f} ms")
    print(f"TTFT coefficient var.:   {ttft_cv:.2f}%")
    print(f"TTFT run range:          {ttft_range_percent:.2f}%")
    print()

    print(f"Average mean latency:       {avg_latency:.2f} ms")
    print(f"Average P95 latency:        {avg_latency_p95:.2f} ms")
    print(f"Latency standard deviation: {latency_std:.2f} ms")
    print(f"Latency coefficient var.:   {latency_cv:.2f}%")
    print(f"Latency run range:          {latency_range_percent:.2f}%")
    print()

    print("=" * 64)
    print("                 BASELINE")
    print("=" * 64)

    if ttft_cv < 5 and latency_cv < 5:
        stability = "STABLE"
        explanation = (
            "Baseline variation is low enough for meaningful "
            "candidate-vs-baseline comparison."
        )
    elif ttft_cv < 10 and latency_cv < 10:
        stability = "ACCEPTABLE"
        explanation = (
            "Baseline has moderate variation. Candidate experiments "
            "should use repeated measurements."
        )
    else:
        stability = "NOISY"
        explanation = (
            "Baseline variation is high. More repetitions are required "
            "before making regression decisions."
        )

    print(f"Status: {stability}")
    print(explanation)
    print()

    print("=" * 64)
    print("             PRELIGHT BASELINE")
    print("=" * 64)
    print(f"Reference mean TTFT:    {avg_ttft:.2f} ms")
    print(f"Reference P95 TTFT:     {avg_ttft_p95:.2f} ms")
    print(f"Reference mean latency: {avg_latency:.2f} ms")
    print(f"Reference P95 latency:  {avg_latency_p95:.2f} ms")
    print(f"Baseline stability:     {stability}")
    print("=" * 64)


if __name__ == "__main__":
    main()