import json
import hashlib
import os
import statistics
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI


# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent

WORKLOAD_FILE = PROJECT_ROOT / "experiments" / "workload.json"
RESULTS_DIR = PROJECT_ROOT / "experiments" / "results"

CHANGE_FILE = PROJECT_ROOT / "configs" / "change.json"


def _current_state() -> dict:
    try:
        return json.loads(CHANGE_FILE.read_text(encoding="utf-8")).get(
            "current_state", {}
        )
    except (OSError, ValueError):
        return {}


# Baseline configuration comes from configs/change.json (current_state),
# falling back to the original defaults.
_STATE = _current_state()
MODEL = _STATE.get("model", "nvidia/Nemotron-3_5-Lightning")
BASELINE_MAX_TOKENS = _STATE.get("max_tokens", 300)
BASELINE_TEMPERATURE = _STATE.get("temperature", 0.2)
BASELINE_TOP_P = _STATE.get("top_p")

# ---------------------------------------------------------
# Environment
# ---------------------------------------------------------

load_dotenv(PROJECT_ROOT / ".env")

api_key = os.getenv("NEBIUS_API_KEY")

if not api_key:
    raise RuntimeError(
        "NEBIUS_API_KEY was not found. "
        "Check the .env file in the Prelight project."
    )


# ---------------------------------------------------------
# Nebius client
# ---------------------------------------------------------

client = OpenAI(
    api_key=api_key,
    base_url="https://api.tokenfactory.nebius.com/v1/",
)


# ---------------------------------------------------------
# Helpers
# ---------------------------------------------------------

def percentile(values, percentile_value):
    """
    Calculate a linearly interpolated percentile.

    Example:
        percentile(values, 50) -> P50
        percentile(values, 95) -> P95
    """

    if not values:
        return 0.0

    ordered = sorted(values)

    if len(ordered) == 1:
        return float(ordered[0])

    position = (len(ordered) - 1) * (percentile_value / 100)

    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)

    fraction = position - lower

    return (
        ordered[lower]
        + (ordered[upper] - ordered[lower]) * fraction
    )


def load_workload():
    """Load the shared workload."""

    with open(WORKLOAD_FILE, "r", encoding="utf-8") as file:
        return json.load(file)


# ---------------------------------------------------------
# Request execution
# ---------------------------------------------------------

def run_request(request):
    """
    Run one baseline request.

    TTFT here means:
        time to first content chunk

    It is intentionally labeled this way because the API stream
    does not guarantee that the first content chunk is literally
    the first generated token.
    """

    request_id = request["id"]
    category = request["category"]
    prompt = request["prompt"]

    print(f"\n[{request_id}]")
    print(f"Category: {category}")
    print("Sending baseline request...")

    start_time = time.perf_counter()

    first_content_time = None
    output_chunks = []
    usage = None

    try:
        stream = client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are part of Prelight, an AI infrastructure "
                        "change-safety system. Provide accurate, concise "
                        "technical answers."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            max_tokens=BASELINE_MAX_TOKENS,
            temperature=BASELINE_TEMPERATURE,
            **({"top_p": BASELINE_TOP_P} if BASELINE_TOP_P is not None else {}),
            stream=True,
            stream_options={"include_usage": True},
        )

        for chunk in stream:
            now = time.perf_counter()

            if (
                first_content_time is None
                and chunk.choices
                and chunk.choices[0].delta.content
            ):
                first_content_time = now

            if (
                chunk.choices
                and chunk.choices[0].delta.content
            ):
                output_chunks.append(
                    chunk.choices[0].delta.content
                )

            if getattr(chunk, "usage", None) is not None:
                usage = chunk.usage

        end_time = time.perf_counter()

        if first_content_time is None:
            first_content_time = end_time

        ttft_ms = (
            first_content_time - start_time
        ) * 1000

        total_latency_ms = (
            end_time - start_time
        ) * 1000

        output_text = "".join(output_chunks)

        output_tokens = 0

        if usage is not None:
            output_tokens = (
                getattr(
                    usage,
                    "completion_tokens",
                    0,
                )
                or 0
            )

        print(f"Time to first content: {ttft_ms:.2f} ms")
        print(f"Total latency: {total_latency_ms:.2f} ms")
        print(f"Output tokens: {output_tokens}")
        print("Status: SUCCESS")

        return {
            "request_id": request_id,
            "category": category,
            "status": "success",
            "ttft_ms": round(ttft_ms, 2),
            "ttft_definition": "time_to_first_content",
            "total_latency_ms": round(total_latency_ms, 2),
            "output_tokens": output_tokens,
            "output_characters": len(output_text),
            "error": None,
            "timestamp": datetime.now(
                timezone.utc
            ).isoformat(),
        }

    except Exception as error:
        end_time = time.perf_counter()

        total_latency_ms = (
            end_time - start_time
        ) * 1000

        print(f"ERROR: {error}")
        print("Status: FAILED")

        return {
            "request_id": request_id,
            "category": category,
            "status": "error",
            "ttft_ms": None,
            "ttft_definition": "time_to_first_content",
            "total_latency_ms": round(
                total_latency_ms,
                2,
            ),
            "output_tokens": 0,
            "output_characters": 0,
            "error": str(error),
            "timestamp": datetime.now(
                timezone.utc
            ).isoformat(),
        }


# ---------------------------------------------------------
# Summary
# ---------------------------------------------------------

def calculate_summary(results, experiment_duration):
    """Calculate reliable aggregate experiment metrics."""

    successful = [
        result
        for result in results
        if result["status"] == "success"
    ]

    errors = [
        result
        for result in results
        if result["status"] == "error"
    ]

    ttft_values = [
        result["ttft_ms"]
        for result in successful
        if result["ttft_ms"] is not None
    ]

    latency_values = [
        result["total_latency_ms"]
        for result in successful
        if result["total_latency_ms"] is not None
    ]

    output_token_values = [
        result["output_tokens"]
        for result in successful
    ]

    total_output_tokens = sum(output_token_values)

    total_requests = len(results)

    error_rate = (
        len(errors) / total_requests * 100
        if total_requests
        else 0.0
    )

    # This is an experiment-level throughput indicator.
    # It is deliberately NOT calculated from streaming chunk timing.
    aggregate_tokens_per_second = (
        total_output_tokens / experiment_duration
        if experiment_duration > 0
        else 0.0
    )

    return {
        "total_requests": total_requests,
        "successful_requests": len(successful),
        "failed_requests": len(errors),
        "error_rate_percent": round(
            error_rate,
            2,
        ),

        "ttft_mean_ms": round(
            statistics.mean(ttft_values)
            if ttft_values
            else 0.0,
            2,
        ),

        "ttft_median_ms": round(
            statistics.median(ttft_values)
            if ttft_values
            else 0.0,
            2,
        ),

        "ttft_p50_ms": round(
            percentile(
                ttft_values,
                50,
            ),
            2,
        )
        if ttft_values
        else 0.0,

        "ttft_p95_ms": round(
            percentile(
                ttft_values,
                95,
            ),
            2,
        )
        if ttft_values
        else 0.0,

        "latency_mean_ms": round(
            statistics.mean(latency_values)
            if latency_values
            else 0.0,
            2,
        ),

        "latency_median_ms": round(
            statistics.median(latency_values)
            if latency_values
            else 0.0,
            2,
        ),

        "latency_p50_ms": round(
            percentile(
                latency_values,
                50,
            ),
            2,
        )
        if latency_values
        else 0.0,

        "latency_p95_ms": round(
            percentile(
                latency_values,
                95,
            ),
            2,
        )
        if latency_values
        else 0.0,

        "total_output_tokens": total_output_tokens,

        "aggregate_output_tokens_per_second": round(
            aggregate_tokens_per_second,
            2,
        ),
    }


# ---------------------------------------------------------
# Main experiment
# ---------------------------------------------------------

def main():

    print("=" * 64)
    print("                    PRELIGHT")
    print("              BASELINE EXPERIMENT")
    print("=" * 64)

    workload = load_workload()

    workload_name = workload["workload_name"]
    requests = workload["requests"]
    pair_id = os.getenv("PRELIGHT_PAIR_ID")
    workload_fingerprint = hashlib.sha256(
        json.dumps(
            requests,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()

    experiment_id = (
        f"baseline-{datetime.now().strftime('%Y%m%d-%H%M%S')}-"
        f"{uuid.uuid4().hex[:6]}"
    )

    started_at = datetime.now(timezone.utc)

    print()
    print(f"Experiment ID: {experiment_id}")
    print(f"Workload: {workload_name}")
    print(f"Model: {MODEL}")
    print(f"Requests: {len(requests)}")
    print(f"max_tokens: {BASELINE_MAX_TOKENS}")
    print(f"temperature: {BASELINE_TEMPERATURE}")

    print()
    print("Metric definition:")
    print("  TTFT = time to first content chunk")
    print("  Throughput = total output tokens / experiment duration")

    print()
    print("Starting baseline experiment...")

    experiment_start = time.perf_counter()

    results = []

    for request in requests:
        result = run_request(request)
        results.append(result)

    experiment_end = time.perf_counter()

    finished_at = datetime.now(timezone.utc)

    experiment_duration = (
        experiment_end - experiment_start
    )

    summary = calculate_summary(
        results,
        experiment_duration,
    )

    experiment = {
        "experiment": {
            "id": experiment_id,
            "type": "baseline",
            "name": workload_name,
            "model": MODEL,
            "pair_id": pair_id,
            "workload_fingerprint": workload_fingerprint,

            "configuration": {
                "max_tokens": BASELINE_MAX_TOKENS,
                "temperature": BASELINE_TEMPERATURE,
                **({"top_p": BASELINE_TOP_P} if BASELINE_TOP_P is not None else {}),
            },

            "measurement": {
                "ttft_definition": (
                    "time_to_first_content"
                ),
                "throughput_definition": (
                    "total_output_tokens_divided_by_"
                    "experiment_duration"
                ),
            },

            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_seconds": round(
                experiment_duration,
                3,
            ),
        },

        "summary": summary,

        "requests": results,
    }

    RESULTS_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_file = (
        RESULTS_DIR
        / (
            "baseline_"
            f"{pair_id or datetime.now().strftime('%Y%m%d_%H%M%S')}"
            ".json"
        )
    )

    with open(
        output_file,
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            experiment,
            file,
            indent=2,
        )

    print()
    print("=" * 64)
    print("              BASELINE COMPLETE")
    print("=" * 64)

    print(f"Total requests: {summary['total_requests']}")
    print(f"Successful: {summary['successful_requests']}")
    print(f"Failed: {summary['failed_requests']}")
    print(f"Error rate: {summary['error_rate_percent']}%")

    print()
    print(f"Mean TTFT: {summary['ttft_mean_ms']} ms")
    print(f"P50 TTFT: {summary['ttft_p50_ms']} ms")
    print(f"P95 TTFT: {summary['ttft_p95_ms']} ms")

    print()
    print(
        f"Mean latency: "
        f"{summary['latency_mean_ms']} ms"
    )

    print(
        f"P50 latency: "
        f"{summary['latency_p50_ms']} ms"
    )

    print(
        f"P95 latency: "
        f"{summary['latency_p95_ms']} ms"
    )

    print()
    print(
        f"Total output tokens: "
        f"{summary['total_output_tokens']}"
    )

    print(
        f"Aggregate output throughput: "
        f"{summary['aggregate_output_tokens_per_second']} "
        f"tokens/sec"
    )

    print()
    print("Results saved to:")
    print(output_file)

    print("=" * 64)


if __name__ == "__main__":
    main()