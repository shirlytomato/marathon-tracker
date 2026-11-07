#!/usr/bin/env python3
"""检查 main 上最近一次正常完成的全量赛事复查。"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

THRESHOLD_H = float(os.environ.get("STALE_HOURS", "36"))
HEALTH_PATH = Path("data/update-health.json")

try:
    health = json.loads(HEALTH_PATH.read_text(encoding="utf-8"))
    raw = health.get("lastSuccessfulRun") if isinstance(health, dict) else None
    if not isinstance(raw, str) or "T" not in raw:
        raise ValueError("缺少有效的 lastSuccessfulRun")
    last_success = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if last_success.tzinfo is None:
        raise ValueError("lastSuccessfulRun 缺少时区")
except (OSError, ValueError) as error:
    sys.exit(f"✗ 无法读取最近正常完成任务的时间（{HEALTH_PATH}）：{error}")

age_h = (datetime.now(timezone.utc) - last_success).total_seconds() / 3600
print(f"最近正常完成任务：{raw}（{age_h:.1f} 小时前）")

if age_h < 0:
    sys.exit("✗ 最近正常完成任务的时间在未来，请检查时间戳")

if age_h > THRESHOLD_H:
    sys.exit(f"✗ 已超过 {THRESHOLD_H:.0f} 小时没有正常完成的复查，请检查更新日志")

print("✅ 数据复查正常")
