import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPT = Path(__file__).resolve().with_name("check-freshness.py")


class CheckFreshnessTest(unittest.TestCase):
    def run_check(self, health, stale_hours="36"):
        with tempfile.TemporaryDirectory() as directory:
            data = Path(directory) / "data"
            data.mkdir()
            if health is not None:
                (data / "update-health.json").write_text(health, encoding="utf-8")
            # 手工编辑赛事文件不能影响心跳。
            (data / "races.json").write_text("[]", encoding="utf-8")
            return subprocess.run(
                [sys.executable, str(SCRIPT)],
                cwd=directory,
                env={**os.environ, "STALE_HOURS": stale_hours},
                capture_output=True,
                text=True,
            )

    def test_recent_success(self):
        now = datetime.now(timezone.utc).isoformat()
        result = self.run_check(json.dumps({"lastSuccessfulRun": now}))
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_manual_edit_and_recent_failed_run_do_not_reset_stale_success(self):
        now = datetime.now(timezone.utc)
        result = self.run_check(json.dumps({
            "lastSuccessfulRun": (now - timedelta(hours=37)).isoformat(),
            "lastRun": {"completedAt": now.isoformat(), "succeeded": 0, "failed": 4},
        }))
        self.assertEqual(result.returncode, 1)
        self.assertIn("超过 36 小时", result.stderr)

    def test_configured_threshold(self):
        stamp = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        result = self.run_check(json.dumps({"lastSuccessfulRun": stamp}), stale_hours="1")
        self.assertEqual(result.returncode, 1)
        self.assertIn("超过 1 小时", result.stderr)

    def test_missing_invalid_and_unzoned_data(self):
        for value in (None, "{", "[]", "{}", '{"lastSuccessfulRun":null}',
                      '{"lastSuccessfulRun":"2026-11-01T00:00:00"}'):
            with self.subTest(value=value):
                result = self.run_check(value)
                self.assertEqual(result.returncode, 1)
                self.assertIn("无法读取", result.stderr)

    def test_future_timestamp(self):
        stamp = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        result = self.run_check(json.dumps({"lastSuccessfulRun": stamp}))
        self.assertEqual(result.returncode, 1)
        self.assertIn("在未来", result.stderr)
