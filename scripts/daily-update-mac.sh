#!/usr/bin/env bash
# 本机每日更新：百炼 Token Plan 专属端点只有境内网络可达，所以这条链路由这台 Mac 跑，
# 不再交给 GitHub Actions 的境外 runner（实测 35 场全部 TCP 超时）。
# 顺序与 workflow 保持一致：拉最新数据 →（可选巡检）→ 联网复查 → 发布前检测 → 提交推送。
# 任一步失败 → 弹系统通知（本机没有 Actions 的告警 Issue 可用）。
# 简报与新赛事巡检默认都不跑：前者邮件已停用，后者每次多约 10 次千问调用（6~10 万 token）。
# 要加就带 --with-digest / --with-discover。
#
# --scheduled 供 LaunchAgent 使用（scripts/run.pbrun.update-3day.plist）：
# 每天 10:00 触发 + 每次登录补跑；距上次成功不满 68 小时就秒退，不花 token。
# 手动触发不带这个参数，永远立刻跑。
set -euo pipefail
cd "$(dirname "$0")/.."

DISCOVER=0
DIGEST=0
SCHEDULED=0
for arg in "$@"; do
  case "$arg" in
    --with-discover) DISCOVER=1 ;;
    --with-digest) DIGEST=1 ;;
    --scheduled) SCHEDULED=1 ;;
    *) echo "✗ 未知参数：$arg（可用 --with-discover / --with-digest / --scheduled）" >&2; exit 1 ;;
  esac
done

LOG_DIR="$HOME/Library/Logs"
LOG="$LOG_DIR/pbrun-daily-update.log"
mkdir -p "$LOG_DIR"

# launchd 只给 /usr/bin:/bin:/usr/sbin:/sbin，nvm 装的 node 不在里面，npx 会直接找不到
if ! command -v npx >/dev/null 2>&1; then
  NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "$NODE_BIN" ] || { echo "✗ 找不到 node，LaunchAgent 的 PATH 里没有 nvm"; exit 1; }
  export PATH="$NODE_BIN:/usr/local/bin:$PATH"
fi

notify() {
  osascript -e "display notification \"$2\" with title \"$1\" sound name \"Glass\"" 2>/dev/null || true
}

fail() {
  notify "🏃 pbrun.run 更新失败" "$1"
  echo "✗ $1" | tee -a "$LOG"
  exit 1
}

# ── 定时模式（--scheduled）的几个保护 ───────────────────────────
# 3 天节奏：以 update-status.ts 写入的 lastSuccessfulRun 为准，不满 68 小时就跳过；
# 这样每天触发一次只是"检查"，真正花钱的那轮平均每 3 天才跑一次。
# 不卡 72：一轮要跑约 40 分钟，lastSuccessfulRun 记的是"跑完"的时刻，
# 三天后同一时刻只过了 71 小时多，按 72 卡会一路漂到第 4 天。
MIN_INTERVAL_H=68

# 手动与定时共用一把目录锁：两轮同时写 races.json 会互相覆盖（2026-10 踩过）。
acquire_lock() {
  local lock="$LOG_DIR/pbrun-update.lock" pid
  if mkdir "$lock" 2>/dev/null; then echo $$ >"$lock/pid"; return 0; fi
  pid=$(cat "$lock/pid" 2>/dev/null || true)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then return 1; fi
  # 陈旧锁（上次被强杀或断电）：pid 已不存在，直接接管
  rm -rf "$lock"
  mkdir "$lock" 2>/dev/null || return 1
  echo $$ >"$lock/pid"
}

release_lock() { rm -rf "$LOG_DIR/pbrun-update.lock"; }

# 刚开机/夜里唤醒时 Wi-Fi 和 DNS 可能还没挂上（2026-10 连挂 4 天的病根）：
# 先探测百炼端点和 GitHub，最多等 5 分钟，等不到就放弃，交给下一次触发再试。
wait_for_network() {
  local tries=20
  while [ "$tries" -gt 0 ]; do
    if curl -s -o /dev/null --max-time 8 https://token-plan.cn-beijing.maas.aliyuncs.com/ 2>/dev/null \
      && curl -s -o /dev/null --max-time 8 https://github.com/ 2>/dev/null; then
      return 0
    fi
    tries=$((tries - 1))
    if [ "$tries" -gt 0 ]; then sleep 15; fi
  done
  return 1
}

{
  echo "===== $(date '+%F %T %Z') 开始 ====="

  if ! acquire_lock; then
    if [ "$SCHEDULED" = "1" ]; then
      echo "↷ 已有更新在跑，本次定时触发跳过"
      exit 0
    fi
    fail "已有更新在跑，请等它结束再手动触发"
  fi
  trap release_lock EXIT

  if [ "$SCHEDULED" = "1" ]; then
    AGE_H=$(node -e '
      const fs = require("fs");
      try {
        const h = JSON.parse(fs.readFileSync("data/update-health.json", "utf8"));
        const t = Date.parse(h.lastSuccessfulRun);
        if (!Number.isFinite(t)) process.exit(2);
        process.stdout.write(((Date.now() - t) / 3600000).toFixed(1));
      } catch { process.exit(2); }
    ' 2>/dev/null || true)
    AGE_INT="${AGE_H%.*}"
    if [ -n "$AGE_INT" ] && [ "$AGE_INT" -lt "$MIN_INTERVAL_H" ]; then
      echo "↷ 定时检查：距上次成功 ${AGE_H} 小时（不足 ${MIN_INTERVAL_H} 小时），本次跳过"
      exit 0
    fi
    echo "⏰ 定时检查：距上次成功 ${AGE_H:-未知} 小时，开始更新"
    wait_for_network || fail "网络未就绪（已等 5 分钟），本次不跑，等下次触发"
  fi

  [ -f .env ] || fail "缺少 .env，无法取 DASHSCOPE_API_KEY"
  set -a && source .env && set +a
  [ -n "${DASHSCOPE_API_KEY:-}" ] || fail ".env 里没有 DASHSCOPE_API_KEY"

  # 先同步远端：本机改数据前必须拿到最新 main，否则 push 一定被拒。
  # --autostash：运行时产物之外本机常有未提交的零碎改动，直接 rebase 会硬失败
  git pull --rebase --autostash origin main || fail "同步远端 main 失败"

  # 巡检放在复查之前：新入库的场次当天就能被 update-status 过一遍（与 Actions 原先后顺序一致）
  if [ "$DISCOVER" = "1" ]; then
    npx tsx scripts/discover-races.ts || fail "新赛事巡检失败（看上方千问 API 报错）"
  fi

  npx tsx scripts/update-status.ts || fail "联网复查赛事进展失败（看上方千问 API 报错）"
  npx tsx scripts/verify-data.ts || fail "发布前检测未通过，本次不提交"
  git add data/pending-reviews.json

  git add data/races.json data/todaySites.json data/update-health.json
  if ! git diff --cached --quiet; then
    if [ "$DISCOVER" = "1" ]; then
      MSG="chore: 本机巡检并更新赛事数据 $(date -u +%F)"
    else
      MSG="chore: 本机更新赛事数据 $(date -u +%F)"
    fi
    git commit -q -m "$MSG" || fail "提交失败"
    git push origin main || fail "推送失败，数据只落在本机"
    echo "✅ 已推送数据更新"
  else
    echo "↷ 本次没有数据变化，无需提交"
  fi

  if [ "$DIGEST" = "1" ]; then
    bash scripts/draft-digest-mac.sh || fail "简报草稿生成失败"
  fi

  notify "🏃 pbrun.run 每日更新" "赛事数据已更新并推送"
  echo "===== $(date '+%F %T %Z') 完成 ====="
} >>"$LOG" 2>&1
