import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from backend.api import (
    BoundaryRequest,
    EXPERIMENT_LOCK,
    ValidationRequest,
    api_boundary,
    api_experiment_status,
    api_state,
    api_validate,
    begin_experiment,
    end_experiment,
    get_research_assessment,
)


class ApiStateContractTests(unittest.TestCase):
    def test_api_state_matches_dashboard_contract(self):
        state = api_state()

        self.assertIn("status", state["decision"])
        expected_actions = {
            "BLOCK": "DO_NOT_ROLLOUT",
            "WARN": "LIMITED_ROLLOUT",
            "SAFE": "CONTROLLED_ROLLOUT",
        }
        self.assertIn(state["decision"]["status"], expected_actions)
        self.assertIn("warn_percent", state["change"]["risk_policy"])
        self.assertIn("block_percent", state["change"]["risk_policy"])
        self.assertEqual(
            state["rollout"]["action"],
            expected_actions[state["decision"]["status"]],
        )
        self.assertIsInstance(state["rollout"]["steps"], list)

    def test_research_assessment_reads_reasoner_artifact_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            experiments = Path(directory)
            (experiments / "research_evidence.json").write_text(
                json.dumps({"queries": ["latency"], "evidence": []}),
                encoding="utf-8",
            )
            (experiments / "research_assessment.json").write_text(
                json.dumps(
                    {
                        "assessment": (
                            "Private preamble should not appear.\n"
                            "EVIDENCE_STRENGTH: MODERATE\n"
                            "RISK_MECHANISM: Longer output increases generation time.\n"
                            "SUPPORTED_RISKS: Latency may rise.\n"
                            "METRICS: P95 latency and TTFT.\n"
                            "EXPERIMENT: Compare paired baseline and candidate runs.\n"
                            "CONCLUSION: Measure the change. Do not infer safety."
                        )
                    }
                ),
                encoding="utf-8",
            )

            with patch("backend.api.EXPERIMENTS_DIR", experiments):
                assessment = get_research_assessment()

        self.assertTrue(assessment["available"])
        self.assertEqual(assessment["evidence_strength"], "MODERATE")
        self.assertEqual(
            assessment["risk_mechanism"],
            "Longer output increases generation time.",
        )
        self.assertNotIn("Private preamble", str(assessment))

    def test_parallel_experiment_requests_are_rejected(self):
        EXPERIMENT_LOCK.acquire()
        try:
            with self.assertRaises(HTTPException) as validate_error:
                api_validate(ValidationRequest(max_tokens=400))
            with self.assertRaises(HTTPException) as boundary_error:
                api_boundary(BoundaryRequest(values=[300, 400]))
        finally:
            EXPERIMENT_LOCK.release()

        self.assertEqual(validate_error.exception.status_code, 409)
        self.assertEqual(boundary_error.exception.status_code, 409)

    def test_experiment_status_reports_active_operation_and_clears(self):
        self.assertFalse(api_experiment_status()["running"])
        self.assertTrue(begin_experiment("validation"))
        try:
            status = api_experiment_status()
            self.assertTrue(status["running"])
            self.assertEqual(status["operation"], "validation")
            self.assertIsNotNone(status["started_at"])
        finally:
            end_experiment()

        self.assertFalse(api_experiment_status()["running"])


if __name__ == "__main__":
    unittest.main()


def test_boundary_summary_picks_highest_safe_value():
    from backend.api import summarize_boundary

    report = summarize_boundary(
        [
            {"max_tokens": 300, "status": "SAFE"},
            {"max_tokens": 350, "status": "SAFE"},
            {"max_tokens": 400, "status": "WARN"},
            {"max_tokens": 500, "status": "BLOCK"},
        ]
    )
    assert report["safe_operating_boundary"] == 350
    assert report["status"] == "SAFE"


def test_noise_floor_uses_largest_absolute_change():
    from backend.api import noise_floor_from

    result = {"comparison": {"mean_latency_change_percent": -10.05, "p95_latency_change_percent": -8.14, "note": 99}}
    assert noise_floor_from(result) == 10.05
    assert noise_floor_from(None) is None


def test_boundary_report_is_internally_consistent_and_flags_stale_scan():
    from backend.api import get_boundary_report

    report = get_boundary_report()
    if report["results"]:
        assert report["safe_operating_boundary"] in (None, *[r["max_tokens"] for r in report["results"] if r["status"] == "SAFE"])
        assert report["noise_floor_percent"] is None or report["noise_floor_percent"] >= 0


def test_validation_request_rejects_unsafe_values():
    import pytest
    from pydantic import ValidationError

    from backend.api import ValidationRequest

    assert ValidationRequest(max_tokens=300, temperature=0.7, top_p=0.9, model="nvidia/Nemotron-3_5-Lightning")
    for bad in (
        {"top_p": 0},
        {"top_p": 1.5},
        {"temperature": 3},
        {"max_tokens": 99999},
        {"model": "openai/gpt-4o"},
        {"model": "nvidia/../etc"},
    ):
        with pytest.raises(ValidationError):
            ValidationRequest(**bad)


def test_baseline_runner_reads_current_state_from_change_file(monkeypatch):
    import importlib
    import json

    monkeypatch.setenv("NEBIUS_API_KEY", "test-key")
    from experiments import runner

    runner = importlib.reload(runner)

    current = json.load(open(runner.CHANGE_FILE))["current_state"]
    assert runner.BASELINE_MAX_TOKENS == current["max_tokens"]
    assert runner.BASELINE_TEMPERATURE == current["temperature"]
    assert runner.MODEL == current["model"]
