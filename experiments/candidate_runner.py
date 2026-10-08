import json
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
CHANGE_FILE = PROJECT_ROOT / "configs" / "change.json"
RESULTS_DIR = PROJECT_ROOT / "experiments" / "results"

MODEL = "nvidia/Nemotron-3_5-Lightning"


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

def load_json(path):
    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


def percentile(values, percentile_value):
    """
    Calculate a linearly interpolated percentile.
    """

    if not values:
        return 0.0

    ordered = sorted(values)

    if len(ordered) == 1:
        return float(ordered[0])

    position = (
        len(ordered) - 1
    ) * (percentile_value / 100)

    lower = int(position)

    upper = min(
        lower + 1,
        len(ordered) - 1,
    )

    fraction = position - lower

    return (
        ordered[lower]
        + (
            ordered[upper]
            - ordered[lower]
        ) * fraction
    )


# ---------------------------------------------------------
# Request execution
# ---------------------------------------------------------

def run_request(
    request,
    max_tokens,
    temperature,
):
    """
    Run one candidate request.

    TTFT means time to first content chunk,
    not guaranteed first generated token.
    """

    request_id = request["id"]
    category = request["category"]
    prompt = request["prompt"]

    print(f"\n[{request_id}]")
    print(f"Category: {category}")
    print("Sending candidate request...")

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
            max_tokens=max_tokens,
            temperature=temperature,
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

        print(
            f"Time to first content: "
            f"{ttft_ms:.2f} ms"
        )

        print(
            f"Total latency: "
            f"{total_latency_ms:.2f} ms"
        )

        print(
            f"Output tokens: "
            f"{output_tokens}"
        )

        print("Status: SUCCESS")

        return {
            "request_id": request_id,
            "category": category,
            "status": "success",

            "ttft_ms": round(
                ttft_ms,
                2,
            ),

            "ttft_definition": (
                "time_to_first_content"
            ),

            "total_latency_ms": round(
                total_latency_ms,
                2,
            ),

            "output_tokens": output_tokens,

            "output_characters": len(
                output_text
            ),

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

            "ttft_definition": (
                "time_to_first_content"
            ),

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

def calculate_summary(
    results,
    experiment_duration,
):
    successful = [
        result
        for result in results
        if result["status"] == "success"
    ]

    failed = [
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

    total_output_tokens = sum(
        result["output_tokens"]
        for result in successful
    )

    total_requests = len(results)

    error_rate = (
        len(failed)
        / total_requests
        * 100
        if total_requests
        else 0.0
    )

    aggregate_tokens_per_second = (
        total_output_tokens
        / experiment_duration
        if experiment_duration > 0
        else 0.0
    )

    return {
        "total_requests": total_requests,

        "successful_requests": len(
            successful
        ),

        "failed_requests": len(
            failed
        ),

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
# Main
# ---------------------------------------------------------

def main():

    workload = load_json(
        WORKLOAD_FILE
    )

    change = load_json(
        CHANGE_FILE
    )

    proposed_state = change[
        "proposed_state"
    ]

    max_tokens = proposed_state[
        "max_tokens"
    ]

    temperature = proposed_state[
        "temperature"
    ]

    requests = workload["requests"]

    RESULTS_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    experiment_id = (
        f"candidate-{datetime.now().strftime('%Y%m%d-%H%M%S')}-"
        f"{uuid.uuid4().hex[:6]}"
    )

    started_at = datetime.now(
        timezone.utc
    )

    print("=" * 64)
    print("                    PRELIGHT")
    print("              CANDIDATE EXPERIMENT")
    print("=" * 64)

    print()

    print(
        f"Experiment ID: "
        f"{experiment_id}"
    )

    print(
        f"Change ID: "
        f"{change['change_id']}"
    )

    print(
        f"Change: "
        f"{change['title']}"
    )

    print(
        f"Model: "
        f"{MODEL}"
    )

    print(
        f"max_tokens: "
        f"{max_tokens}"
    )

    print(
        f"temperature: "
        f"{temperature}"
    )

    print(
        f"Requests: "
        f"{len(requests)}"
    )

    print()
    print("Metric definition:")
    print("  TTFT = time to first content chunk")
    print("  Throughput = total output tokens / experiment duration")

    print()
    print("Starting candidate experiment...")
    print()

    experiment_start = time.perf_counter()

    results = []

    for request in requests:
        result = run_request(
            request,
            max_tokens,
            temperature,
        )

        results.append(result)

    experiment_end = time.perf_counter()

    finished_at = datetime.now(
        timezone.utc
    )

    experiment_duration = (
        experiment_end
        - experiment_start
    )

    summary = calculate_summary(
        results,
        experiment_duration,
    )

    output = {
        "run_id": experiment_id,
        "experiment": {
            "id": experiment_id,
            "run_id": experiment_id,
            "type": "candidate",

            "name": (
                "prelight_candidate_"
                + change["change_id"]
            ),

            "change_id": change[
                "change_id"
            ],

            "change_title": change[
                "title"
            ],

            "model": MODEL,

            "configuration": {
                "max_tokens": max_tokens,
                "temperature": temperature,
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

    timestamp = datetime.now().strftime(
        "%Y%m%d_%H%M%S"
    )

    output_file = (
        RESULTS_DIR
        / (
            "candidate_"
            f"{change['change_id'].replace('-', '')}_"
            f"{timestamp}.json"
        )
    )

    with open(
        output_file,
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            output,
            file,
            indent=2,
        )

    print()
    print("=" * 64)
    print("           CANDIDATE EXPERIMENT COMPLETE")
    print("=" * 64)

    print(
        f"Total requests: "
        f"{summary['total_requests']}"
    )

    print(
        f"Successful: "
        f"{summary['successful_requests']}"
    )

    print(
        f"Failed: "
        f"{summary['failed_requests']}"
    )

    print(
        f"Error rate: "
        f"{summary['error_rate_percent']}%"
    )

    print()

    print(
        f"Mean TTFT: "
        f"{summary['ttft_mean_ms']} ms"
    )

    print(
        f"P50 TTFT: "
        f"{summary['ttft_p50_ms']} ms"
    )

    print(
        f"P95 TTFT: "
        f"{summary['ttft_p95_ms']} ms"
    )

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