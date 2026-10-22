"""Prelight PR check: validate configs/change.json and print a Markdown verdict.

Usage:
    python -m backend.pr_check            # run a live validation (needs API keys)
    python -m backend.pr_check --replay   # render the last saved verdict, no API calls

Exit code is 1 when the decision is BLOCK so CI can fail the check.
"""
import argparse
import sys

from backend.api import get_change, get_clean_decision, get_rollout

ICONS = {"SAFE": "✅", "WARN": "⚠️", "BLOCK": "⛔"}


def render() -> tuple[str, str]:
    change = get_change()
    decision = get_clean_decision(
        __import__("backend.api", fromlist=["get_decision"]).get_decision()
    )
    status = str(decision.get("status", "UNKNOWN"))
    comparison = decision.get("comparison", {})
    rows = [
        ("Mean TTFT", "mean_ttft_change_percent"),
        ("P95 TTFT", "p95_ttft_change_percent"),
        ("Mean latency", "mean_latency_change_percent"),
        ("P95 latency", "p95_latency_change_percent"),
    ]
    lines = [
        f"## {ICONS.get(status, '❔')} Prelight verdict: **{status}**",
        "",
        f"**Change:** {change.get('title', 'n/a')} (`{change.get('change_id', '?')}`)  ",
        f"**Current → proposed:** `{change.get('current_state')}` → `{change.get('proposed_state')}`",
        "",
        "| Metric | Change vs baseline |",
        "|---|---|",
    ]
    for label, key in rows:
        value = comparison.get(key)
        lines.append(
            f"| {label} | {value:+.2f}% |" if isinstance(value, (int, float)) else f"| {label} | n/a |"
        )
    lines += [
        "",
        f"**Reason:** {decision.get('reason', 'n/a')}",
        f"**Recommendation:** {decision.get('recommendation', 'n/a')}",
        f"**Rollout action:** `{get_rollout().get('action', 'n/a')}`",
        "",
        "_Measured with paired baseline/candidate rounds on Nebius Token Factory._",
    ]
    return status, "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--replay", action="store_true")
    args = parser.parse_args()
    if not args.replay:
        from backend.prelight_pipeline import run_pipeline

        run_pipeline()
    status, markdown = render()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(markdown)
    return 1 if status == "BLOCK" else 0


if __name__ == "__main__":
    sys.exit(main())
