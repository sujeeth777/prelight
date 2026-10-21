import unittest
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

from backend import prelight_pipeline


def make_run(pair_id, latency_ms):
    return {
        "experiment": {
            "pair_id": pair_id,
            "model": "test-model",
            "workload_fingerprint": "workload-hash",
        },
        "summary": {
            "total_requests": 1,
            "successful_requests": 1,
            "failed_requests": 0,
            "ttft_mean_ms": latency_ms,
            "ttft_p95_ms": latency_ms,
            "latency_mean_ms": latency_ms,
            "latency_p95_ms": latency_ms,
            "error_rate_percent": 0,
        },
        "requests": [{"request_id": "request-1", "status": "success"}],
    }


class PipelineTests(unittest.TestCase):
    def test_round_order_alternates_and_is_balanced(self):
        orders = prelight_pipeline.paired_round_orders(5, "candidate_first")

        self.assertEqual(
            orders,
            [
                "candidate_first",
                "baseline_first",
                "candidate_first",
                "baseline_first",
                "candidate_first",
            ],
        )
        self.assertLessEqual(
            abs(orders.count("baseline_first") - orders.count("candidate_first")),
            1,
        )

    def test_rejects_invalid_round_order(self):
        with self.assertRaises(ValueError):
            prelight_pipeline.paired_round_orders(5, "random")

    def test_pipeline_writes_five_paired_artifacts_and_decision(self):
        orders = [
            "baseline_first",
            "candidate_first",
            "baseline_first",
            "candidate_first",
            "baseline_first",
        ]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            results = root / "experiments" / "results"
            results.mkdir(parents=True)
            (root / "configs").mkdir()
            (root / "configs" / "change.json").write_text(
                json.dumps(
                    {
                        "change_id": "CHG001",
                        "title": "Test change",
                        "description": "Test paired execution",
                        "proposed_state": {"max_tokens": 400},
                        "risk_policy": {
                            "warn_threshold_percent": 10,
                            "block_threshold_percent": 20,
                            "error_warn_threshold_percent": 1,
                            "error_block_threshold_percent": 5,
                        },
                    }
                ),
                encoding="utf-8",
            )
            experiments = root / "experiments"
            (experiments / "change_analysis.json").write_text(
                json.dumps({"risk_level": "MEDIUM"}),
                encoding="utf-8",
            )
            (experiments / "research_assessment.json").write_text(
                json.dumps({"available": True}),
                encoding="utf-8",
            )

            stage_scripts = []

            def fake_run_stage(name, script, environment=None):
                stage_scripts.append(script)
                if script == "runner.py":
                    pair_id = environment["PRELIGHT_PAIR_ID"]
                    output = results / f"baseline_{pair_id}.json"
                    output.write_text(
                        json.dumps(make_run(pair_id, 100)),
                        encoding="utf-8",
                    )
                elif script == "candidate_runner.py":
                    pair_id = environment["PRELIGHT_PAIR_ID"]
                    output = results / f"candidate_CHG001_{pair_id}.json"
                    output.write_text(
                        json.dumps(make_run(pair_id, 101)),
                        encoding="utf-8",
                    )
                elif script == "rollout_planner.py":
                    (results / "rollout_plan.json").write_text(
                        json.dumps({"action": "CONTROLLED_ROLLOUT"}),
                        encoding="utf-8",
                    )

            with (
                patch.object(prelight_pipeline, "ROOT", root),
                patch.object(prelight_pipeline, "CHANGE_FILE", root / "configs" / "change.json"),
                patch.object(prelight_pipeline, "DECISION_FILE", results / "latest_decision.json"),
                patch.object(prelight_pipeline, "ROLLOUT_FILE", results / "rollout_plan.json"),
                patch.object(prelight_pipeline, "PAIRED_VALIDATION_FILE", results / "paired_validation.json"),
                patch.object(prelight_pipeline, "paired_round_orders", return_value=orders),
                patch.object(prelight_pipeline, "run_stage", side_effect=fake_run_stage),
            ):
                result = prelight_pipeline.run_pipeline()

            decision = json.loads(
                (results / "latest_decision.json").read_text(encoding="utf-8")
            )
            self.assertEqual(result["status"], "SAFE")
            self.assertEqual(result["run_id"], decision["experiment"]["run_id"])
            self.assertEqual(result["complete_rounds"], 5)
            self.assertEqual(decision["experiment"]["round_order"], orders)
            self.assertEqual(len(list(results.glob("baseline_*.json"))), 5)
            self.assertEqual(len(list(results.glob("candidate_*.json"))), 5)
            self.assertEqual(stage_scripts.count("runner.py"), 5)
            self.assertEqual(stage_scripts.count("candidate_runner.py"), 5)


if __name__ == "__main__":
    unittest.main()