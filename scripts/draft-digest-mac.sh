#!/usr/bin/env bash
# 本机简报推送：零密钥、零注册、不经任何第三方发信服务。
# 流程：当日简报落盘 → 抽纯文本（保留官方链接）→ 拉起 Mail 草稿 → 弹系统通知。
# 最后一下「发送」由人按：这台 Mac 的 Gmail SMTP 不允许程序代投，硬发只会卡在发信队列。
# 收件人取环境变量 EMAIL_TO，其次取 .env 里的 EMAIL_TO。
set -euo pipefail
cd "$(dirname "$0")/.."

TO="${EMAIL_TO:-}"
if [ -z "$TO" ] && [ -f .env ]; then
  TO="$(grep -E '^EMAIL_TO=' .env | tail -1 | cut -d= -f2- | tr -d ' \r\n"')"
fi
[ -n "$TO" ] || { echo "✗ 收件人未配置：在 .env 里加一行 EMAIL_TO=你的邮箱"; exit 1; }

DATE="$(date +%F)"
HTML="digest-${DATE}.html"
TXT="digest-${DATE}.txt"

# 当日文件已存在就视为成品（人工按官方公告补测的版本优先），绝不用库数据覆盖它
if [ -s "$HTML" ]; then
  echo "↷ 沿用已存在的 ${HTML}，不重新生成"
else
  npx tsx scripts/email-digest.ts --out-html="$HTML"
fi

python3 - "$HTML" "$TXT" <<'PY'
import re, html, sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding="utf-8").read()
s = re.sub(r"<(style|script)[^>]*>.*?</\1>", "", s, flags=re.S)
# 链接必须带真实 URL：邮件正文里没有地址就等于没满足「报名地址」这一条
s = re.sub(r'<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
           lambda m: f'{m.group(2).strip()} {m.group(1)}', s, flags=re.S)
s = re.sub(r"<tr[^>]*>", "\n", s)
s = re.sub(r"</t[dh]>", "\n", s)
s = re.sub(r"<(h1|h2|h3|p|li|div|br)[^>]*>", "\n", s)
s = html.unescape(re.sub(r"<[^>]+>", "", s))
s = re.sub(r"[ \t\u00a0]+", " ", s)
s = "\n".join(line.strip() for line in s.split("\n"))
s = re.sub(r"\n{3,}", "\n\n", s).strip()
open(dst, "w", encoding="utf-8").write(s)
print(f"↷ 纯文本正文 {len(s)} 字，官方链接 {s.count('http')} 个 → {dst}")
PY

SUBJ="🏃 ${DATE} 马拉松报名简报"
osascript scripts/draft-digest.applescript "$TO" "$(pwd)/$TXT" "$SUBJ" >/dev/null
osascript -e "display notification \"${DATE} 简报已生成，Mail 草稿等你按发送（收件人 ${TO}）\" with title \"🏃 pbrun.run 每日简报\" sound name \"Glass\""

echo "✅ 完成：Mail 撰写窗口已打开，收件人 ${TO}；核对无误后按「发送」即完成今日推送"
