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
