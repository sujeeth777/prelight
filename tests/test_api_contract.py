import unittest

from backend.api import api_state


class ApiStateContractTests(unittest.TestCase):
    def test_api_state_matches_dashboard_contract(self):
        state = api_state()

        self.assertIn("status", state["decision"])
        self.assertEqual(state["decision"]["status"], "BLOCK")
        self.assertIn("warn_percent", state["change"]["risk_policy"])
        self.assertIn("block_percent", state["change"]["risk_policy"])
        self.assertEqual(state["rollout"]["action"], "DO_NOT_ROLLOUT")
        self.assertIsInstance(state["rollout"]["steps"], list)


if __name__ == "__main__":
    unittest.main()
