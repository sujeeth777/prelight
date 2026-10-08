import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
CHANGE_FILE = ROOT / "configs" / "change.json"


class ChangePolicyTest(unittest.TestCase):
    def test_error_thresholds_are_defined(self):
        data = json.loads(CHANGE_FILE.read_text(encoding="utf-8"))
        policy = data["risk_policy"]

        self.assertEqual(policy["warn_threshold_percent"], 10)
        self.assertEqual(policy["block_threshold_percent"], 20)
        self.assertEqual(policy["error_warn_threshold_percent"], 1)
        self.assertEqual(policy["error_block_threshold_percent"], 5)


if __name__ == "__main__":
    unittest.main()
