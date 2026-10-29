import unittest

from backend.paired_validation import build_paired_decision


def make_run(pair_id, run_type, latency_ms, failed_requests=0):
    return {
        "experiment": {
            "pair_id": pair_id,
            "type": run_type,
            "model": "test-model",
            "workload_fingerprint": "workload-hash",
            "started_at": "2026-10-13T10:00:00+00:00",
            "finished_at": "2026-10-13T10:00:02+00:00",
            "configuration": {
                "max_tokens": 300 if run_type == "baseline" else 400,
                "temperature": 0.2,
            },
        },
        "summary": {
            "total_requests": 2,
            "successful_requests": 2 - failed_requests,
            "failed_requests": failed_requests,
            "ttft_mean_ms": latency_ms,
            "ttft_p95_ms": latency_ms * 1.1,
            "latency_mean_ms": latency_ms * 1.2,
            "latency_p95_ms": latency_ms * 1.3,
            "error_rate_percent": failed_requests * 50,
        },
        "requests": [
            {"request_id": "request-1", "status": "error" if failed_requests else "success"},
            {"request_id": "request-2", "status": "success"},
        ],
    }


def make_pairs(rounds=5, candidate_latency=101, failed_requests=0):
    pairs = []
    for index in range(rounds):
        pair_id = f"pair-{index}"
        pairs.append(
            {
                "pair_id": pair_id,
                "order": "baseline_first" if index % 2 == 0 else "candidate_first",
                "baseline_file": f"baseline_{pair_id}.json",
                "candidate_file": f"candidate_{pair_id}.json",
                "baseline_run": make_run(pair_id, "baseline", 100),
                "candidate_run": make_run(
                    pair_id,
                    "candidate",
                    candidate_latency,
                    failed_requests,
                ),
            }
        )
    return pairs


class PairedValidationTests(unittest.TestCase):
    def setUp(self):
        self.change = {
            "change_id": "TEST",
            "proposed_state": {"max_tokens": 400},
            "risk_policy": {
                "warn_threshold_percent": 10,
                "block_threshold_percent": 20,
                "error_warn_threshold_percent": 1,
                "error_block_threshold_percent": 5,
            },
        }

    def evaluate(self, pairs):
        return build_paired_decision(
            self.change,
            {"risk_level": "MEDIUM"},
            {"available": True},
            pairs,
        )

    def test_safe_requires_upper_confidence_bound_within_warning_limit(self):
        result = self.evaluate(make_pairs())

        self.assertEqual(result["decision"]["status"], "SAFE")
        self.assertEqual(result["experiment"]["complete_rounds"], 5)
        self.assertEqual(result["experiment"]["model"], "test-model")
        self.assertEqual(
            result["experiment"]["sample_counts"]["baseline_requests"],
            10,
        )
        self.assertEqual(
            result["experiment"]["sample_counts"]["candidate_requests"],
            10,
        )
        self.assertIsNotNone(result["experiment"]["started_at"])
        self.assertIsNotNone(result["experiment"]["finished_at"])
        self.assertEqual(
            result["experiment"]["baseline_configuration"]["max_tokens"],
            300,
        )
        self.assertEqual(
            result["experiment"]["candidate_configuration"]["max_tokens"],
            400,
        )
        self.assertLessEqual(
            result["uncertainty"]["mean_latency_change_percent"]["upper_percent"],
            10,
        )

    def test_too_few_pairs_fail_closed(self):
        result = self.evaluate(make_pairs(rounds=4, candidate_latency=100))

        self.assertEqual(result["decision"]["status"], "BLOCK")
        self.assertTrue(
            any("at least 5" in rule for rule in result["triggered_rules"])
        )

    def test_any_failed_request_fails_closed(self):
        result = self.evaluate(
            make_pairs(candidate_latency=100, failed_requests=1)
        )

        self.assertEqual(result["decision"]["status"], "BLOCK")
        self.assertTrue(
            any("failed requests" in rule for rule in result["triggered_rules"])
        )

    def test_uncertainty_crossing_warning_threshold_is_not_safe(self):
        pairs = make_pairs(candidate_latency=100)
        for index, pair in enumerate(pairs):
            candidate_latency = 100 if index < 4 else 130
            pair["candidate_run"] = make_run(
                pair["pair_id"],
                "candidate",
                candidate_latency,
            )

        result = self.evaluate(pairs)

        self.assertEqual(result["decision"]["status"], "WARN")
        self.assertGreater(
            result["uncertainty"]["mean_latency_change_percent"]["upper_percent"],
            10,
        )


class ModelSwapTests(unittest.TestCase):
    def setUp(self):
        self.change = {
            "change_id": "SWAP",
            "current_state": {"model": "nvidia/model-a", "max_tokens": 300},
            "proposed_state": {"model": "nvidia/model-b", "max_tokens": 300},
            "risk_policy": {
                "warn_threshold_percent": 10,
                "block_threshold_percent": 20,
                "error_warn_threshold_percent": 1,
                "error_block_threshold_percent": 5,
            },
        }

    def decide(self, pairs):
        return build_paired_decision(
            self.change, {"risk_level": "MEDIUM"}, {"available": True}, pairs
        )

    def pairs(self, baseline_model, candidate_model):
        pairs = make_pairs()
        for pair in pairs:
            pair["baseline_run"]["experiment"]["model"] = baseline_model
            pair["candidate_run"]["experiment"]["model"] = candidate_model
        return pairs

    def test_declared_model_swap_is_accepted(self):
        decision = self.decide(self.pairs("nvidia/model-a", "nvidia/model-b"))
        self.assertNotIn("unexpected models", str(decision))

    def test_candidate_using_wrong_model_fails_closed(self):
        decision = self.decide(self.pairs("nvidia/model-a", "nvidia/model-a"))
        self.assertEqual(decision["decision"]["status"], "BLOCK")

    def test_undeclared_swap_fails_closed(self):
        self.change["proposed_state"]["model"] = "nvidia/model-a"
        decision = self.decide(self.pairs("nvidia/model-a", "nvidia/model-b"))
        self.assertEqual(decision["decision"]["status"], "BLOCK")

if __name__ == "__main__":
    unittest.main()