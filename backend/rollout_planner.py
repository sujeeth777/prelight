import json
from pathlib import Path


# ============================================================
# PRELIGHT - ROLLOUT PLANNER
# ============================================================

ROOT = Path(__file__).resolve().parent.parent

CHANGE_FILE = ROOT / "configs" / "change.json"
DECISION_FILE = (
    ROOT
    / "experiments"
    / "results"
    / "latest_decision.json"
)

OUTPUT_FILE = (
    ROOT
    / "experiments"
    / "results"
    / "rollout_plan.json"
)


# ============================================================
# HELPERS
# ============================================================

def load_json(path):
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def build_rollout_plan(change, decision):
    status = decision["decision"]["status"]

    comparison = decision["comparison"]

    if status == "BLOCK":

        return {
            "change_id": change["change_id"],
            "status": "BLOCK",
            "action": "DO_NOT_ROLLOUT",

            "summary": (
                "The proposed change failed Prelight's "
                "safety thresholds."
            ),

            "steps": [
                {
                    "step": 1,
                    "action": "STOP",
                    "description": (
                        "Prevent global deployment of "
                        "the proposed configuration."
                    ),
                },
                {
                    "step": 2,
                    "action": "INVESTIGATE",
                    "description": (
                        "Investigate the measured latency "
                        "regression and determine its cause."
                    ),
                },
                {
                    "step": 3,
                    "action": "REPEAT_EXPERIMENT",
                    "description": (
                        "Repeat the experiment with additional "
                        "runs to confirm the regression is reproducible."
                    ),
                },
                {
                    "step": 4,
                    "action": "TEST_INTERMEDIATE_CONFIGURATION",
                    "description": (
                        "Evaluate a smaller configuration change "
                        "between the baseline and rejected candidate."
                    ),
                },
                {
                    "step": 5,
                    "action": "REASSESS",
                    "description": (
                        "Run the new candidate through the complete "
                        "Prelight validation pipeline."
                    ),
                },
            ],

            "measured_regressions": {
                "mean_ttft_percent": comparison[
                    "mean_ttft_change_percent"
                ],
                "p95_ttft_percent": comparison[
                    "p95_ttft_change_percent"
                ],
                "mean_latency_percent": comparison[
                    "mean_latency_change_percent"
                ],
                "p95_latency_percent": comparison[
                    "p95_latency_change_percent"
                ],
            },

            "rollout_policy": (
                "No production rollout until a subsequent "
                "validation run satisfies the configured "
                "Prelight safety thresholds."
            ),
        }

    if status == "WARN":

        return {
            "change_id": change["change_id"],
            "status": "WARN",
            "action": "LIMITED_ROLLOUT",

            "summary": (
                "The proposed change exceeded warning thresholds "
                "but did not exceed blocking thresholds."
            ),

            "steps": [
                {
                    "step": 1,
                    "action": "LIMIT",
                    "description": (
                        "Do not perform an unrestricted rollout."
                    ),
                },
                {
                    "step": 2,
                    "action": "CANARY",
                    "description": (
                        "Deploy the candidate to a small controlled "
                        "percentage of traffic."
                    ),
                },
                {
                    "step": 3,
                    "action": "MONITOR",
                    "description": (
                        "Monitor latency, TTFT, throughput, "
                        "GPU resource usage, and errors."
                    ),
                },
                {
                    "step": 4,
                    "action": "REASSESS",
                    "description": (
                        "Promote only if production measurements "
                        "remain within acceptable limits."
                    ),
                },
            ],

            "rollout_policy": (
                "Controlled canary rollout with active monitoring."
            ),
        }

    return {
        "change_id": change["change_id"],
        "status": "SAFE",
        "action": "CONTROLLED_ROLLOUT",

        "summary": (
            "The proposed change remained within "
            "Prelight's configured safety thresholds."
        ),

        "steps": [
            {
                "step": 1,
                "action": "CANARY",
                "description": (
                    "Deploy the validated configuration "
                    "to a controlled percentage of traffic."
                ),
            },
            {
                "step": 2,
                "action": "MONITOR",
                "description": (
                    "Monitor latency, TTFT, throughput, "
                    "GPU resource usage, and errors."
                ),
            },
            {
                "step": 3,
                "action": "PROMOTE",
                "description": (
                    "Expand deployment if production "
                    "measurements remain healthy."
                ),
            },
        ],

        "rollout_policy": (
            "Controlled rollout followed by monitored promotion."
        ),
    }


# ============================================================
# LOAD
# ============================================================

print("==========================================")
print("        PRELIGHT - ROLLOUT PLANNER")
print("==========================================")

print("\nLoading decision artifact...")

change = load_json(
    CHANGE_FILE
)

decision = load_json(
    DECISION_FILE
)

print(
    f"Change ID: "
    f"{change['change_id']}"
)

print(
    f"Prelight decision: "
    f"{decision['decision']['status']}"
)


# ============================================================
# GENERATE PLAN
# ============================================================

plan = build_rollout_plan(
    change,
    decision,
)


# ============================================================
# SAVE
# ============================================================

with OUTPUT_FILE.open(
    "w",
    encoding="utf-8",
) as file:

    json.dump(
        plan,
        file,
        indent=2,
    )


# ============================================================
# DISPLAY
# ============================================================

print("\n==========================================")
print("        ROLLOUT RECOMMENDATION")
print("==========================================")

print(
    f"Status: "
    f"{plan['status']}"
)

print(
    f"Action: "
    f"{plan['action']}"
)

print()
print(
    plan["summary"]
)

print("\nSteps:")

for step in plan["steps"]:

    print(
        f"  {step['step']}. "
        f"{step['action']}"
    )

    print(
        f"     {step['description']}"
    )

print()
print("Policy:")
print(
    plan["rollout_policy"]
)

print()
print("Rollout plan saved to:")
print(OUTPUT_FILE)

print("==========================================")