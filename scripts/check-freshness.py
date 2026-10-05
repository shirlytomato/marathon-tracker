#!/usr/bin/env python3
"""数据新鲜度心跳：只看 main 上最近一次数据提交距今多久。

每日更新已搬回本机 Mac 跑（套餐端点境外不可达），Actions 那侧不再产生数据，
所以这里改当哨兵：电脑没开、脚本挂了、忘了跑，都会在这里变红并触发告警 Issue,
免得重演"停更十天无人知晓"。不调 AI、不需要任何密钥。
"""
import os
import subprocess
import sys
import time

# 本机 07:30 一班，留足缓冲；超过这个点就说明今天那班没落地
THRESHOLD_H = float(os.environ.get("STALE_HOURS", "36"))

out = subprocess.run(
    ["git", "log", "-1", "--format=%ct %s", "--", "data/races.json"],
    capture_output=True, text=True, check=True,
).stdout.strip()
if not out:
    print("✗ 历史里找不到任何改动过 data/races.json 的提交")
    sys.exit(1)

stamp, subject = out.split(" ", 1)
age_h = (time.time() - int(stamp)) / 3600
print(f"最近一次数据提交：{age_h:.1f} 小时前 —— {subject}")

if age_h > THRESHOLD_H:
    print(f"✗ 已超过 {THRESHOLD_H:.0f} 小时没有数据更新，本机定时任务大概率没跑")
    print("  补救：在仓库目录执行 bash scripts/daily-update-mac.sh")
    sys.exit(1)

print("✅ 数据新鲜")
