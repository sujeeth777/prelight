import json
import os
import random
import subprocess
import sys
import uuid
from pathlib import Path

from backend.paired_validation import MIN_PAIRED_ROUNDS, build_paired_decision


# ============================================================
# PRELIGHT - END-TO-END PIPELINE
# ============================================================

ROOT = Path(__file__).resolve().parent.parent

CHANGE_FILE = ROOT / "configs" / "change.json"

DECISION_FILE = (
    ROOT
    / "experiments"
    / "results"
    / "latest_decision.json"
)

ROLLOUT_FILE = (
    ROOT
    / "experiments"
    / "results"
    / "rollout_plan.json"
)
PAIRED_VALIDATION_FILE = ROOT / "experiments" / "results" / "paired_validation.json"


# ============================================================
# HELPERS
# ============================================================

def run_stage(
    name: str,
    script: str,
    environment: dict[str, str] | None = None,
) -> None:
    print()
    print("=" * 60)
    print(f"PRELIGHT STAGE: {name}")
    print("=" * 60)

    script_path = Path(script)

    candidate_paths = [
        ROOT / script_path,
        ROOT / "backend" / script_path,
        ROOT / "experiments" / script_path,
    ]

    resolved_path = next(
        (
            path
            for path in candidate_paths
            if path.exists()
        ),
        candidate_paths[0],
    )

    process_environment = os.environ.copy()
    if environment:
        process_environment.update(environment)

    result = subprocess.run(
        [
            sys.executable,
            str(resolved_path),
        ],
        cwd=str(ROOT),
        env=process_environment,
    )

    if result.returncode != 0:
        print()
        print("=" * 60)
        print(f"STAGE FAILED: {name}")
        print("=" * 60)

        raise RuntimeError(
            f"Prelight stage failed: {name}"
        )


def load_json(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(
            f"Required Prelight artifact not found: {path}"
        )

    with path.open(
        "r",
        encoding="utf-8",
    ) as file:
        data = json.load(file)

    if not isinstance(data, dict):
        raise ValueError(
            f"Expected JSON object in {path}"
        )

    return data


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2)
        file.write("\n")


def paired_round_orders(
    rounds: int = MIN_PAIRED_ROUNDS,
    first_order: str | None = None,
) -> list[str]:
    if rounds < 1:
        raise ValueError("At least one paired round is required.")

    if first_order is None:
        first_order = random.SystemRandom().choice(
            ("baseline_first", "candidate_first")
        )
    if first_order not in ("baseline_first", "candidate_first"):
        raise ValueError("first_order must be baseline_first or candidate_first.")

    second_order = (
        "candidate_first"
        if first_order == "baseline_first"
        else "baseline_first"
    )
    return [
        first_order if index % 2 == 0 else second_order
        for index in range(rounds)
    ]


# ============================================================
# PIPELINE
# ============================================================

def run_pipeline() -> dict:
    """
    Run the complete Prelight validation pipeline.

    Current pipeline stages:

    1. Change analysis
    2. External research
    3. Research assessment
    4. Five paired baseline/candidate experiments in alternating order
    6. Safety decision
    7. Rollout planning
    """

    print()
    print("=" * 60)
    print("                    PRELIGHT")
    print("          AI INFRASTRUCTURE SAFETY")
    print("=" * 60)

    print()
    print("Starting end-to-end validation pipeline...")

    # ========================================================
    # LOAD CHANGE
    # ========================================================

    change = load_json(CHANGE_FILE)

    print()
    print("PROPOSED CHANGE")
    print("----------------")

    print(
        f"Change ID: "
        f"{change.get('change_id', 'UNKNOWN')}"
    )

    print(
        f"Change: "
        f"{change.get('description', 'N/A')}"
    )

    # ========================================================
    # STAGE 1 - CHANGE ANALYSIS
    # ========================================================

    run_stage(
        "CHANGE ANALYSIS",
        "change_analyzer.py",
    )

    # ========================================================
    # STAGE 2 - EXTERNAL RESEARCH
    # ========================================================

    run_stage(
        "EXTERNAL RESEARCH",
        "research_agent.py",
    )

    # ========================================================
    # STAGE 3 - RESEARCH REASONING
    # ========================================================

    run_stage(
        "RESEARCH ASSESSMENT",
        "research_reasoner.py",
    )

    # ========================================================
    # STAGE 4 - PAIRED EXPERIMENTS AND DECISION
    # ========================================================

    results_dir = ROOT / "experiments" / "results"
    change_id = str(change.get("change_id", "UNKNOWN"))
    candidate_prefix = change_id.replace("-", "")
    pairs = []

    for round_number, order in enumerate(
        paired_round_orders(),
        start=1,
    ):
        pair_id = f"{uuid.uuid4().hex[:12]}-round-{round_number:02d}"
        pair = {
            "pair_id": pair_id,
            "order": order,
            "baseline_file": f"baseline_{pair_id}.json",
            "candidate_file": f"candidate_{candidate_prefix}_{pair_id}.json",
        }
        roles = (
            ("baseline", "candidate")
            if order == "baseline_first"
            else ("candidate", "baseline")
        )

        print(f"\nPAIRED ROUND {round_number}/{MIN_PAIRED_ROUNDS}: {order}")
        for role in roles:
            if role == "baseline":
                script = "runner.py"
                stage_name = f"ROUND {round_number} BASELINE"
            else:
                script = "candidate_runner.py"
                stage_name = f"ROUND {round_number} CANDIDATE"

            try:
                run_stage(
                    stage_name,
                    script,
                    {"PRELIGHT_PAIR_ID": pair_id},
                )
                result_path = results_dir / pair[f"{role}_file"]
                pair[f"{role}_run"] = load_json(result_path)
            except Exception as exc:
                pair["stage_error"] = f"{stage_name} failed: {exc}"
                print(pair["stage_error"])
                break

        pairs.append(pair)
        if "stage_error" in pair:
            break

    analysis = load_json(ROOT / "experiments" / "change_analysis.json")
    research = load_json(ROOT / "experiments" / "research_assessment.json")
    decision = build_paired_decision(
        change,
        analysis,
        research,
        pairs,
    )
    decision["experiment"]["round_order"] = [
        pair["order"] for pair in pairs
    ]
    decision["triggered_rules"].extend(
        pair["stage_error"]
        for pair in pairs
        if pair.get("stage_error")
    )
    if any(pair.get("stage_error") for pair in pairs):
        decision["decision"]["status"] = "BLOCK"
        decision["decision"]["reason"] = (
            "A paired experiment stage failed; evidence is incomplete."
        )
        decision["decision"]["recommendation"] = (
            "Do not roll out. Resolve the experiment failure and repeat validation."
        )
        decision["evidence_chain"][-1] = "BLOCK"

    write_json(DECISION_FILE, decision)
    write_json(
        PAIRED_VALIDATION_FILE,
        {
            "run_id": decision["experiment"]["run_id"],
            "created_at": decision["created_at"],
            "experiment": decision["experiment"],
            "baseline": decision["baseline"],
            "candidate": decision["candidate"],
            "comparison": decision["comparison"],
            "uncertainty": decision["uncertainty"],
            "triggered_rules": decision["triggered_rules"],
        },
    )

    # ========================================================
    # STAGE 5 - ROLLOUT PLAN
    # ========================================================

    # ========================================================
    # STAGE 7 - ROLLOUT PLAN
    # ========================================================

    run_stage(
        "ROLLOUT PLANNING",
        "rollout_planner.py",
    )

    # ========================================================
    # FINAL RESULT
    # ========================================================

    decision = load_json(DECISION_FILE)
    rollout = load_json(ROLLOUT_FILE)

    decision_block = decision.get("decision", {})

    if not isinstance(decision_block, dict):
        decision_block = {}

    status = decision_block.get(
        "status",
        "UNKNOWN",
    )

    action = rollout.get(
        "action",
        "UNKNOWN",
    )

    evidence_chain = decision.get(
        "evidence_chain",
        [],
    )

    if not isinstance(evidence_chain, list):
        evidence_chain = []

    print()
    print("=" * 60)
    print("              PRELIGHT COMPLETE")
    print("=" * 60)

    print()
    print(
        f"FINAL DECISION: {status}"
    )

    print(
        f"ROLLOUT ACTION: {action}"
    )

    print()
    print("Evidence chain:")

    for index, stage in enumerate(
        evidence_chain,
        start=1,
    ):
        print(
            f"  {index}. {stage}"
        )

    print()
    print("Artifacts:")

    print(
        f"  Decision: "
        f"{DECISION_FILE}"
    )

    print(
        f"  Rollout: "
        f"{ROLLOUT_FILE}"
    )

    print()
    print("=" * 60)

    return {
        "status": status,
        "action": action,
        "change_id": change.get(
            "change_id",
            "UNKNOWN",
        ),
        "run_id": decision["experiment"]["run_id"],
        "decision_file": str(
            DECISION_FILE
        ),
        "rollout_file": str(
            ROLLOUT_FILE
        ),
        "evidence_chain": evidence_chain,
        "complete_rounds": decision["experiment"]["complete_rounds"],
        "required_rounds": decision["experiment"]["required_rounds"],
        "paired_validation_file": str(PAIRED_VALIDATION_FILE),
    }


# ============================================================
# CLI ENTRY POINT
# ============================================================

if __name__ == "__main__":
    run_pipeline()