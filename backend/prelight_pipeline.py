import json
import subprocess
import sys
from pathlib import Path


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


# ============================================================
# HELPERS
# ============================================================

def run_stage(name: str, script: str) -> None:
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

    result = subprocess.run(
        [
            sys.executable,
            str(resolved_path),
        ],
        cwd=str(ROOT),
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
    4. Live candidate experiment using the configured proposal
    5. Safety decision
    6. Rollout planning
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
    # STAGE 4 - LIVE CANDIDATE EXPERIMENT
    # ========================================================

    run_stage(
        "LIVE CANDIDATE EXPERIMENT",
        "candidate_runner.py",
    )

    # ========================================================
    # STAGE 5 - DECISION
    # ========================================================

    run_stage(
        "SAFETY DECISION",
        "decision_engine.py",
    )

    # ========================================================
    # STAGE 6 - ROLLOUT PLAN
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
        "decision_file": str(
            DECISION_FILE
        ),
        "rollout_file": str(
            ROLLOUT_FILE
        ),
        "evidence_chain": evidence_chain,
    }


# ============================================================
# CLI ENTRY POINT
# ============================================================

if __name__ == "__main__":
    run_pipeline()