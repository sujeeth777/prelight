import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import api
from backend.api import summarize_boundary


def make_run(pair_id, run_type, latency_ms):
    return {
        "experiment": {
            "pair_id": pair_id,
            "type": run_type,
            "model": "test-model",
            "workload_fingerprint": "workload-hash",
            "configuration": {
                "max_tokens": 300 if run_type == "baseline" else 400,
                "temperature": 0.2,
            },
        },
        "summary": {
            "total_requests": 1,
            "successful_requests": 1,
            "failed_requests": 0,
            "ttft_mean_ms": latency_ms,
            "ttft_p95_ms": latency_ms,
            "latency_mean_ms": latency_ms,
            "latency_p95_ms": latency_ms,
        },
        "requests": [{"request_id": "request-1", "status": "success"}],
    }


class BoundaryExplorerTest(unittest.TestCase):
    def test_returns_highest_safe_candidate_value(self):
        decisions = [
            {
                "max_tokens": 300,
                "status": "SAFE",
                "comparison": {"mean_latency_change_percent": -2.0},
            },
            {
                "max_tokens": 350,
                "status": "SAFE",
                "comparison": {"mean_latency_change_percent": 4.0},
            },
            {
                "max_tokens": 400,
                "status": "SAFE",
                "comparison": {"mean_latency_change_percent": 9.0},
            },
            {
                "max_tokens": 500,
                "status": "BLOCK",
                "comparison": {"mean_latency_change_percent": 27.0},
            },
        ]

        boundary = summarize_boundary(decisions)

        self.assertEqual(boundary["safe_operating_boundary"], 400)
        self.assertIn("400", boundary["summary"])
        self.assertIn("highest tested configuration", boundary["summary"].lower())
        self.assertEqual(boundary["status"], "SAFE")

    def test_warn_candidate_is_not_reported_as_safe_boundary(self):
        decisions = [
            {"max_tokens": 300, "status": "SAFE"},
            {"max_tokens": 400, "status": "WARN"},
            {"max_tokens": 500, "status": "BLOCK"},
        ]

        boundary = summarize_boundary(decisions)

        self.assertEqual(boundary["safe_operating_boundary"], 300)
        self.assertEqual(boundary["status"], "SAFE")
        self.assertIn("Higher tested values were not certified safe", boundary["summary"])

    def test_returns_no_safe_boundary_when_only_warn_results_exist(self):
        boundary = summarize_boundary(
            [{"max_tokens": 400, "status": "WARN"}]
        )

        self.assertIsNone(boundary["safe_operating_boundary"])
        self.assertEqual(boundary["status"], "WARN")

    def test_boundary_scan_runs_paired_rounds_and_restores_proposal(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            experiments = root / "experiments"
            results = experiments / "results"
            configs = root / "configs"
            results.mkdir(parents=True)
            configs.mkdir()
            change = {
                "change_id": "CHG-TEST",
                "proposed_state": {"max_tokens": 350, "temperature": 0.2},
                "risk_policy": {
                    "warn_threshold_percent": 10,
                    "block_threshold_percent": 20,
                    "error_warn_threshold_percent": 1,
                    "error_block_threshold_percent": 5,
                },
            }
            change_path = configs / "change.json"
            change_path.write_text(json.dumps(change), encoding="utf-8")
            (experiments / "change_analysis.json").write_text(
                json.dumps({"risk_level": "MEDIUM"}), encoding="utf-8"
            )
            (experiments / "research_assessment.json").write_text(
                json.dumps({"available": True}), encoding="utf-8"
            )

            calls = []

            def fake_run_script(script_path, environment=None):
                pair_id = environment["PRELIGHT_PAIR_ID"]
                run_type = "baseline" if script_path.name == "runner.py" else "candidate"
                output_name = (
                    f"baseline_{pair_id}.json"
                    if run_type == "baseline"
                    else f"candidate_CHGTEST_{pair_id}.json"
                )
                latency = 100 if run_type == "baseline" else 101
                (results / output_name).write_text(
                    json.dumps(make_run(pair_id, run_type, latency)),
                    encoding="utf-8",
                )
                calls.append((run_type, pair_id))

            with (
                patch.object(api, "BASE_DIR", root),
                patch.object(api, "EXPERIMENTS_DIR", experiments),
                patch.object(api, "RESULTS_DIR", results),
                patch.object(api, "_run_python_script", side_effect=fake_run_script),
            ):
                report = api.run_boundary_explorer([400])

            restored = json.loads(change_path.read_text(encoding="utf-8"))
            self.assertEqual(len(calls), 10)
            self.assertEqual(len({pair_id for _, pair_id in calls}), 5)
            self.assertEqual(report["results"][0]["experiment"]["complete_rounds"], 5)
            self.assertEqual(report["results"][0]["status"], "SAFE")
            self.assertEqual(restored["proposed_state"]["max_tokens"], 350)


if __name__ == "__main__":
    unittest.main()
