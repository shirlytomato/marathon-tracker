#!/usr/bin/env bash
# 本机每日更新：百炼 Token Plan 专属端点只有境内网络可达，所以这条链路由这台 Mac 跑，
# 不再交给 GitHub Actions 的境外 runner（实测 35 场全部 TCP 超时）。
# 顺序与 workflow 保持一致：拉最新数据 → 联网复查 → 发布前检测 → 提交推送。
# 任一步失败 → 弹系统通知（本机没有 Actions 的告警 Issue 可用）。
# 简报默认不跑（每日邮件已停用），要加就带 --with-digest。
set -euo pipefail
cd "$(dirname "$0")/.."

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

{
  echo "===== $(date '+%F %T %Z') 开始 ====="

  [ -f .env ] || fail "缺少 .env，无法取 DASHSCOPE_API_KEY"
  set -a && source .env && set +a
  [ -n "${DASHSCOPE_API_KEY:-}" ] || fail ".env 里没有 DASHSCOPE_API_KEY"

  # 先同步远端：本机改数据前必须拿到最新 main，否则 push 一定被拒。
  # --autostash：运行时产物之外本机常有未提交的零碎改动，直接 rebase 会硬失败
  git pull --rebase --autostash origin main || fail "同步远端 main 失败"

  npx tsx scripts/update-status.ts || fail "联网复查赛事进展失败（看上方千问 API 报错）"
  npx tsx scripts/verify-data.ts || fail "发布前检测未通过，本次不提交"

  git add data/races.json data/todaySites.json
  if ! git diff --cached --quiet; then
    git commit -q -m "chore: 本机更新赛事数据 $(date -u +%F)" || fail "提交失败"
    git push origin main || fail "推送失败，数据只落在本机"
    echo "✅ 已推送数据更新"
  else
    echo "↷ 本次没有数据变化，无需提交"
  fi

  if [ "${1:-}" = "--with-digest" ]; then
    bash scripts/draft-digest-mac.sh || fail "简报草稿生成失败"
  fi

  notify "🏃 pbrun.run 每日更新" "赛事数据已更新并推送"
  echo "===== $(date '+%F %T %Z') 完成 ====="
} >>"$LOG" 2>&1
