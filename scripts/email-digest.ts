// scripts/email-digest.ts —— 每日报名简报邮件（Actions 在数据更新后调用）
// 板块：① 正在报名的赛事 ② 昨日之后新入库的赛事（用 data/knownIds.json 快照对比）
// 发送走 Resend HTTP API（零依赖）；--dry-run 只生成预览不发送
import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Race } from "../src/types/race";
import { deriveStatus } from "../src/lib/status";

const DRY_RUN = process.argv.includes("--dry-run");
const now = new Date();
const todayStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;

const races = JSON.parse(readFileSync("data/races.json", "utf8")) as Race[];
const KNOWN_PATH = "data/knownIds.json";
const known: string[] = existsSync(KNOWN_PATH) ? JSON.parse(readFileSync(KNOWN_PATH, "utf8")) : [];
const isNew = (r: Race) => !known.includes(r.id);
// 跑完后覆盖快照，供次日对比"新入库"
if (!DRY_RUN) writeFileSync(KNOWN_PATH, JSON.stringify(races.map((r) => r.id)));

const byRegEnd = (a: Race, b: Race) => (a.regEnd ?? "9999").localeCompare(b.regEnd ?? "9999");
const open = races.filter((r) => deriveStatus(r, now) === "open").sort(byRegEnd);
const fresh = races.filter(isNew);

const orNA = (v?: string) => v || "暂未公布";
const siteCell = (r: Race) =>
  r.officialSite
    ? `<a href="${r.officialSite}" style="color:#2563eb;text-decoration:underline">官方报名 ↗</a>`
    : "暂未公布";

function row(r: Race): string {
  return `<tr>
  <td style="padding:10px 8px;border-bottom:1px solid #eee;vertical-align:top">
    <div style="font-weight:600;color:#111">${r.name}</div>
    <div style="font-size:12px;color:#888;margin-top:2px">${r.country}${r.province ? " · " + r.province : ""} ｜ ${r.events.join(" / ")}</div>
  </td>
  <td style="padding:10px 8px;border-bottom:1px solid #eee;color:#444;white-space:nowrap">${r.raceDate}</td>
  <td style="padding:10px 8px;border-bottom:1px solid #eee;color:#b91c1c;font-weight:600;white-space:nowrap">${orNA(r.regEnd)}</td>
  <td style="padding:10px 8px;border-bottom:1px solid #eee;color:#444;white-space:nowrap">${orNA(r.lotteryDate)}</td>
  <td style="padding:10px 8px;border-bottom:1px solid #eee;color:#444;white-space:nowrap">${orNA(r.fee)}</td>
  <td style="padding:10px 8px;border-bottom:1px solid #eee">${siteCell(r)}</td>
</tr>`;
}

function section(title: string, emoji: string, list: Race[]): string {
  const body = list.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="background:#f8fafc;color:#64748b;font-size:12px">
        <th align="left" style="padding:8px">赛事</th>
        <th align="left" style="padding:8px">比赛时间</th>
        <th align="left" style="padding:8px">报名截止</th>
        <th align="left" style="padding:8px">抽签</th>
        <th align="left" style="padding:8px">报名费</th>
        <th align="left" style="padding:8px">报名地址</th>
      </tr>
      ${list.map(row).join("\n      ")}
    </table>`
    : `<p style="color:#94a3b8">暂无</p>`;
  return `<h2 style="font-size:17px;margin:28px 0 4px;color:#111">${emoji} ${title}（${list.length} 场）</h2>${body}`;
}

const html = `<div style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;max-width:720px;margin:0 auto;padding:20px;color:#1e293b">
  <h1 style="font-size:21px;margin:0 0 4px">🏃 pbrun.run 每日报名简报</h1>
  <p style="color:#64748b;font-size:13px;margin:0 0 8px">${todayStr} ｜ 赛事库共 ${races.length} 场</p>
  ${section("正在报名", "🔥", open)}
  ${section("新入库赛事", "🆕", fresh)}
  <p style="color:#94a3b8;font-size:12px;margin-top:28px;border-top:1px solid #eee;padding-top:12px">
    字段留空表示组委会暂未公布；报名请务必通过官方渠道。<br>
    完整赛事列表：<a href="https://pbrun.run" style="color:#2563eb">pbrun.run</a> ｜ 数据以组委会官方公告为准
  </p>
</div>`;

if (DRY_RUN) {
  writeFileSync("digest-preview.html", html);
  console.log(`[dry-run] 正在报名 ${open.length} 场，新入库 ${fresh.length} 场（首次运行快照为空则全量视为新）`);
  console.log("[dry-run] 预览已写入 digest-preview.html");
  process.exit(0);
}

const key = process.env.RESEND_API_KEY;
const to = process.env.EMAIL_TO;
if (!key || !to) {
  console.log("未配置 RESEND_API_KEY / EMAIL_TO，跳过邮件推送");
  process.exit(0);
}

async function main() {
const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    from: "pbrun.run 简报 <onboarding@resend.dev>",
    to: [to],
    subject: `🏃 ${todayStr} 马拉松报名简报｜${open.length} 场正在报名`,
    html,
  }),
});
if (!res.ok) {
  console.error(`邮件发送失败: ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log(`✅ 简报邮件已发送至 ${to}（正在报名 ${open.length} 场，新入库 ${fresh.length} 场）`);
}

main();
