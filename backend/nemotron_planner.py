import json
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI


BASE_DIR = Path(__file__).parent.parent

CHANGE_FILE = BASE_DIR / "configs" / "change.json"
ANALYSIS_FILE = BASE_DIR / "experiments" / "change_analysis.json"
OUTPUT_FILE = BASE_DIR / "experiments" / "nemotron_experiment_plan.json"


def load_json(path):
    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as file:
        json.dump(data, file, indent=2)


def main():
    print("=" * 64)
    print("                 PRELIGHT")
    print("          NEMOTRON PLANNER")
    print("=" * 64)
    print()

    load_dotenv(BASE_DIR / ".env")

    api_key = os.getenv("NEBIUS_API_KEY")

    if not api_key:
        raise RuntimeError(
            "NEBIUS_API_KEY was not found in .env"
        )

    change = load_json(CHANGE_FILE)
    analysis = load_json(ANALYSIS_FILE)

    client = OpenAI(
        api_key=api_key,
        base_url="https://api.tokenfactory.nebius.com/v1/",
    )

    change_json = json.dumps(change, indent=2)
    analysis_json = json.dumps(analysis, indent=2)

    system_prompt = """
You are Prelight's autonomous AI infrastructure validation planner.

Prelight evaluates proposed changes to NVIDIA-powered AI systems
before production rollout.

Analyze the proposed change and determine:

1. Why the change could be risky.
2. What experiment should be performed.
3. What baseline and candidate configurations should be compared.
4. Which metrics matter.
5. What conditions should trigger WARN or BLOCK.

Do not make a final SAFE/WARN/BLOCK decision.

The experiment has not happened yet.

Do not invent experimental measurements.

Return a concise plain-text engineering plan.

Use exactly these headings:

RISK:
OBJECTIVE:
BASELINE:
CANDIDATE:
WORKLOAD:
METRICS:
COMPARISON:
WARN:
BLOCK:
"""

    user_prompt = f"""
Proposed change:

{change_json}

Existing change analysis:

{analysis_json}

Create the engineering experiment plan.
Keep the entire response below 700 words.
"""

    print("Sending proposed change to Nemotron...")
    print()
    print("Nemotron is reasoning about:")
    print("  • change risk")
    print("  • experiment design")
    print("  • required measurements")
    print("  • safety conditions")
    print()

    response = client.chat.completions.create(
        model="nvidia/Nemotron-3_5-Lightning",
        messages=[
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": user_prompt,
            },
        ],
        temperature=0,
        max_tokens=900,
    )

    content = response.choices[0].message.content

    if not content:
        raise RuntimeError(
            "Nemotron returned an empty response."
        )

    print("=" * 64)
    print("          NEMOTRON REASONING")
    print("=" * 64)
    print()
    print(content)
    print()

    # Build a deterministic machine-readable plan.
    # Nemotron supplies the reasoning; Prelight owns the schema.
    plan = {
        "change_id": change["change_id"],
        "decision_stage": "EXPERIMENT_PLANNING",
        "source": "NVIDIA Nemotron 3.5 Lightning",
        "risk_assessment": {
            "risk_level": analysis["risk_level"],
            "reason": (
                analysis["risk_factors"][0]
                if analysis.get("risk_factors")
                else "The proposed change requires experimental validation."
            ),
        },
        "nemotron_reasoning": content,
        "experiment": {
            "objective": (
                "Measure the effect of the proposed inference "
                "configuration change against the existing "
                "configuration using the same workload."
            ),
            "baseline_configuration": {
                "description": (
                    f"Model: {change['current_state']['model']}; "
                    f"max_tokens: {change['current_state']['max_tokens']}; "
                    f"temperature: {change['current_state']['temperature']}."
                )
            },
            "candidate_configuration": {
                "description": (
                    f"Model: {change['proposed_state']['model']}; "
                    f"max_tokens: {change['proposed_state']['max_tokens']}; "
                    f"temperature: {change['proposed_state']['temperature']}."
                )
            },
            "workload_requirements": [
                "Use the same workload for baseline and candidate.",
                "Execute the complete Prelight workload.",
                "Keep model and temperature constant unless the change explicitly modifies them.",
                "Record successful and failed requests.",
                "Do not use unreliable streaming-derived generation speed for safety decisions."
            ],
            "metrics": [
                "TTFT",
                "total_latency",
                "error_rate"
            ],
            "comparison_method": (
                "Compare baseline and candidate distributions using "
                "mean and P95 TTFT, mean and P95 total latency, "
                "and error rate. Evaluate degradation relative to "
                "the established baseline."
            ),
            "minimum_successful_requests": 9
        },
        "safety_rules": [
            {
                "metric": "TTFT",
                "condition": "relative increase greater than 10%",
                "severity": "WARN",
                "reason": (
                    "A meaningful increase in time to first response "
                    "can reduce inference responsiveness."
                )
            },
            {
                "metric": "TTFT",
                "condition": "relative increase greater than 20%",
                "severity": "BLOCK",
                "reason": (
                    "A large and repeatable TTFT regression indicates "
                    "the proposed change may negatively affect production."
                )
            },
            {
                "metric": "total_latency",
                "condition": "relative increase greater than 10%",
                "severity": "WARN",
                "reason": (
                    "Increased end-to-end latency can degrade workload performance."
                )
            },
            {
                "metric": "total_latency",
                "condition": "relative increase greater than 20%",
                "severity": "BLOCK",
                "reason": (
                    "A large latency regression is considered unsafe "
                    "for broad rollout."
                )
            },
            {
                "metric": "error_rate",
                "condition": "candidate error rate exceeds 5%",
                "severity": "BLOCK",
                "reason": (
                    "A high request failure rate indicates an unsafe candidate."
                )
            }
        ],
        "recommendation": "PENDING_EXPERIMENT_RESULTS"
    }

    save_json(
        OUTPUT_FILE,
        plan,
    )

    print("=" * 64)
    print("       NEMOTRON EXPERIMENT PLAN")
    print("=" * 64)
    print()

    print(
        f"Change ID: {plan['change_id']}"
    )

    print(
        f"Risk level: "
        f"{plan['risk_assessment']['risk_level']}"
    )

    print()

    print(
        "Experiment objective:"
    )

    print(
        plan["experiment"]["objective"]
    )

    print()

    print("Metrics:")

    for metric in plan["experiment"]["metrics"]:
        print(f"  • {metric}")

    print()

    print("Safety rules:")

    for rule in plan["safety_rules"]:
        print(
            f"  [{rule['severity']}] "
            f"{rule['metric']} — "
            f"{rule['condition']}"
        )

    print()

    print(
        "Recommendation: "
        f"{plan['recommendation']}"
    )

    print()

    print(
        f"Saved to: {OUTPUT_FILE}"
    )

    print()


if __name__ == "__main__":
    main()