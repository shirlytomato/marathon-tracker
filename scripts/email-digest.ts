// scripts/email-digest.ts —— 每日报名简报邮件（Actions 在数据更新后调用）
// 三段式：① 🔥 报名截止倒计时（未来 7 天内截止，含今天）② 🆕 今日新动态（相比昨天：新增开放报名 /
// 新公布或调整报名·抽签日期 / 新入库）③ 📅 即将开放（未来 7 天内开始报名）
// 「相比昨天」靠 data/digestBaseline.json（上一日的报名字段快照）对比，与 knownIds.json 同属必须随
// workflow 提交的基线文件。不能用 updatedAt 判断新动态：update-status.ts 只要单场复查成功就无条件
// 刷 updatedAt（第 78 行），字段没变也会刷新，拿它当依据会把整库刷成"今日新动态"。
// 发送走 Resend HTTP API（零依赖）；--dry-run 只生成预览、不改任何基线
// --html-file=<path>：用已成型的简报 HTML（比如人工按官方公告补测的当日简报）直接作为邮件正文，
//   跳过从 races.json 渲染；此时不覆盖两份基线（数据版简报并未真正送达）
// --subject=<text>：覆盖邮件主题
import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Race, DisplayStatus } from "../src/types/race";
import { deriveStatus, daysLeftUntil } from "../src/lib/status";
import { checkInterval } from "../src/lib/schedule";

const DRY_RUN = process.argv.includes("--dry-run");
function argOf(flag: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(flag + "="));
  if (eq) return eq.slice(flag.length + 1);
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const HTML_FILE = argOf("--html-file");
const SUBJECT_OVERRIDE = argOf("--subject");
const OUT_HTML = argOf("--out-html"); // 只把当日正文落盘，交给本机 Mail 草稿推送（draft-digest-mac.sh），不经任何发信服务
if (HTML_FILE && !existsSync(HTML_FILE)) {
  console.error(`✗ --html-file 指定的文件不存在：${HTML_FILE}`); // 路径写错就硬退出，不要默默退回旧正文
  process.exit(1);
}
const DAY = 86400000;
const WIN = 7; // 倒计时/即将开放的窗口天数
const now = new Date();
const yesterday = new Date(now.getTime() - DAY);
const todayStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;

const races = JSON.parse(readFileSync("data/races.json", "utf8")) as Race[];
const KNOWN_PATH = "data/knownIds.json";
const known: string[] = existsSync(KNOWN_PATH) ? JSON.parse(readFileSync(KNOWN_PATH, "utf8")) : [];
const BASE_PATH = "data/digestBaseline.json";
interface FieldSnap { regStart?: string; regEnd?: string; lotteryDate?: string }
const baseline: Record<string, FieldSnap> = existsSync(BASE_PATH)
  ? JSON.parse(readFileSync(BASE_PATH, "utf8"))
  : {};
const hasBaseline = Object.keys(baseline).length > 0;

// 两份基线只在"简报真正送达的那一次"推进，供次日对比。
// 不动的情形有五种：--dry-run、--html-file（送的是现成成品，数据版没发出去）、--out-html（只落盘，
// 发不发由人在 Mail 里按）、未配置发信密钥、发信失败。提前推进等于把当天的新动态静默吃掉。
function advanceBaselines(): void {
  writeFileSync(KNOWN_PATH, JSON.stringify(races.map((r) => r.id)));
  const next: Record<string, FieldSnap> = {};
  for (const r of races) next[r.id] = { regStart: r.regStart, regEnd: r.regEnd, lotteryDate: r.lotteryDate };
  writeFileSync(BASE_PATH, JSON.stringify(next, null, 2));
}

const byRegEnd = (a: Race, b: Race) => (a.regEnd ?? "9999").localeCompare(b.regEnd ?? "9999");
const isOpen = (r: Race, at: Date) => deriveStatus(r, at) === "open";

/** ① 未来 7 天内截止（含今天）：只认日期，regStatus 不参与判断 */
const closing = races
  .filter((r) => isOpen(r, now) && r.regEnd && daysLeftUntil(r.regEnd, now) <= WIN)
  .sort(byRegEnd);

/** ③ 未来 7 天内开始报名（不含今天开的——那属于"新增开放报名"，归入②） */
const opening = races
  .filter((r) => deriveStatus(r, now) === "pending" && r.regStart
    && daysLeftUntil(r.regStart, now) >= 1 && daysLeftUntil(r.regStart, now) <= WIN)
  .sort((a, b) => (a.regStart ?? "").localeCompare(b.regStart ?? ""));

/** ② 昨日 → 今日的变化 */
const news = new Map<string, { race: Race; reasons: string[] }>();
const addNews = (r: Race, reason: string) => {
  const cur = news.get(r.id) ?? { race: r, reasons: [] };
  if (!cur.reasons.includes(reason)) cur.reasons.push(reason);
  news.set(r.id, cur);
};
for (const r of races) {
  const prev = baseline[r.id];
  if (!prev) continue; // 基线里没有这场比赛 → 无从判断"相比昨天"
  if (prev.regStart !== r.regStart) {
    addNews(r, prev.regStart ? `报名开始日调整：${prev.regStart} → ${r.regStart}` : `新公布报名开始日：${r.regStart}`);
  }
  if (prev.regEnd !== r.regEnd) {
    addNews(r, prev.regEnd ? `报名截止日调整：${prev.regEnd} → ${r.regEnd}` : `新公布报名截止日：${r.regEnd}`);
  }
  if (prev.lotteryDate !== r.lotteryDate) {
    addNews(r, prev.lotteryDate ? `抽签日调整：${prev.lotteryDate} → ${r.lotteryDate}` : `新公布抽签日：${r.lotteryDate}`);
  }
  const wasOpen = isOpen({ ...r, regStart: prev.regStart, regEnd: prev.regEnd, lotteryDate: prev.lotteryDate }, yesterday);
  if (isOpen(r, now) && !wasOpen) addNews(r, "新增开放报名");
}
// 首次运行 knownIds 为空，全库都会被当成"新入库"刷屏（旧版每日简报的同一条事故隐患）
if (known.length > 0) {
  for (const r of races) if (!known.includes(r.id)) addNews(r, "新入库");
}
const newsList = [...news.values()].sort((a, b) => byRegEnd(a.race, b.race));

const LABEL: Record<DisplayStatus, string> = {
  open: "报名中", pending: "未开始", drawing: "抽签中", closed: "已截止", finished: "已结束", today: "今日开跑",
};
const endLabel = (d: string) => {
  const n = daysLeftUntil(d, now);
  return n === 0 ? "今天截止" : `剩 ${n} 天`;
};
const startLabel = (d: string) => {
  const n = daysLeftUntil(d, now);
  return n === 0 ? "今天开报" : `${n} 天后开报`;
};

/** 「报名截止或状态」一栏：开报日 + 截止日与倒计时 + 抽签日 + 本条入选理由 */
function statusCell(r: Race, reason?: string): string {
  const bits: string[] = [];
  const st = deriveStatus(r, now);
  if (st === "pending" && r.regStart) bits.push(`报名 ${r.regStart} 开始（${startLabel(r.regStart)}）`);
  if (r.regEnd) bits.push(`报名截止 ${r.regEnd}（${endLabel(r.regEnd)}）`);
  else bits.push(`${LABEL[st]}｜报名截止时间暂未公布`);
  if (r.lotteryDate) bits.push(`抽签 ${r.lotteryDate}`);
  if (reason) bits.push(reason);
  return bits.join(" ｜ ");
}

const siteCell = (r: Race) =>
  r.officialSite
    ? `<a href="${r.officialSite}" style="color:#2563eb;text-decoration:underline">官方报名 ↗</a>`
    : "暂未公布（见组委会公告）";

function row(r: Race, reason?: string): string {
  return `<tr>
  <td style="padding:10px 8px;border-bottom:1px solid #eee;vertical-align:top">
    <div style="font-weight:600;color:#111">${r.name}</div>
    <div style="font-size:12px;color:#888;margin-top:2px">${r.country}${r.province ? " · " + r.province : ""}${r.city ? " · " + r.city : ""} ｜ ${r.events.join(" / ")}</div>
  </td>
  <td style="padding:10px 8px;border-bottom:1px solid #eee;color:#444;white-space:nowrap">${r.raceDate}</td>
  <td style="padding:10px 8px;border-bottom:1px solid #eee;color:#444;font-size:13px">${statusCell(r, reason)}</td>
  <td style="padding:10px 8px;border-bottom:1px solid #eee;white-space:nowrap">${siteCell(r)}</td>
</tr>`;
}

function section(title: string, emoji: string, rows: string[], emptyNote?: string): string {
  const body = rows.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="background:#f8fafc;color:#64748b;font-size:12px">
        <th align="left" style="padding:8px">赛事</th>
        <th align="left" style="padding:8px">比赛日期</th>
        <th align="left" style="padding:8px">报名截止或状态</th>
        <th align="left" style="padding:8px">报名地址</th>
      </tr>
      ${rows.join("\n      ")}
    </table>`
    : `<p style="color:#94a3b8">${emptyNote ?? "暂无"}</p>`;
  return `<h2 style="font-size:17px;margin:28px 0 4px;color:#111">${emoji} ${title}（${rows.length} 场）</h2>${body}`;
}

function changesSection(): string {
  const CHANGES_PATH = "data/dateChanges.json";
  interface DateChange { name: string; from: string; to: string; note: string }
  const dateChanges: DateChange[] = existsSync(CHANGES_PATH)
    ? JSON.parse(readFileSync(CHANGES_PATH, "utf8"))
    : [];
  if (!dateChanges.length) return "";
  const rows = dateChanges.map((c) => `<tr>
  <td style="padding:10px 8px;border-bottom:1px solid #eee;font-weight:600;color:#111">${c.name}</td>
  <td style="padding:10px 8px;border-bottom:1px solid #eee;color:#94a3b8;text-decoration:line-through;white-space:nowrap">${c.from}</td>
  <td style="padding:10px 8px;border-bottom:1px solid #eee;color:#b91c1c;font-weight:600;white-space:nowrap">${c.to}</td>
  <td style="padding:10px 8px;border-bottom:1px solid #eee;color:#64748b;font-size:12px">${c.note || "—"}</td>
</tr>`).join("\n      ");
  return `<h2 style="font-size:17px;margin:28px 0 4px;color:#111">⚠️ 赛期变更（${dateChanges.length} 场，请扫一眼）</h2>
    <p style="color:#64748b;font-size:13px;margin:0 0 6px">以下比赛日期已由 AI 根据官方公告自动改正。若发现改错，直接改 data/races.json 即可。</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="background:#f8fafc;color:#64748b;font-size:12px">
        <th align="left" style="padding:8px">赛事</th>
        <th align="left" style="padding:8px">原赛期</th>
        <th align="left" style="padding:8px">改为</th>
        <th align="left" style="padding:8px">依据</th>
      </tr>
      ${rows}
    </table>`;
}

/**
 * 新鲜度校验：只盯分级调度里「每天必查」（间隔 = 1 天）那一级。
 * 存在的意义是拆掉「假绿灯」的另一面：管道停摆时，简报里的「暂无」看起来像
 * “今天确实没有赛事截止”，收件人无从分辨是数据旧了还是真的没有。
 * 为什么不用 isDue（含周检/月检）：那两级按 id 相位每 7/30 天才轮一次，
 * updatedAt 天然可能几十天没动，把它们计进去会天天误报；而每天必查的场次
 * 只要超 36 小时没刷，就能确定当日任务没跑成。也不能用全库 max(updatedAt)，同理。
 */
const STALE_MS = 36 * 3600000;
const staleRaces = races.filter(
  (r) => checkInterval(r, now) === 1 && (!r.updatedAt || now.getTime() - Date.parse(r.updatedAt) > STALE_MS),
);
const oldestTouch = staleRaces
  .map((r) => Date.parse(r.updatedAt ?? ""))
  .filter((t) => !Number.isNaN(t))
  .sort((a, b) => a - b)[0];
const staleDays = oldestTouch ? Math.floor((now.getTime() - oldestTouch) / DAY) : 0;
const staleBanner = staleRaces.length
  ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:10px 12px;border-radius:6px;font-size:13px;margin:0 0 14px">
      ⚠ 数据可能已停更：本应每天复查的 ${staleRaces.length} 场已最长 ${staleDays} 天没复查过。以下「暂无」只代表库内状态，不等于今天真的没有赛事截止 —— 请先确认每日更新任务是否变红，报名决定以组委会公告为准。
    </div>`
  : "";
const staleLog = staleRaces.length ? `⚠ 每天必查的 ${staleRaces.length} 场未复查（最久 ${staleDays} 天前）` : "数据新鲜度正常";

const newsNote = hasBaseline ? undefined : "暂无（首次运行，还没有昨日字段快照可比）";
const dataHtml = `<div style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;max-width:720px;margin:0 auto;padding:20px;color:#1e293b">
  <h1 style="font-size:21px;margin:0 0 4px">🏃 pbrun.run 每日报名简报</h1>
  <p style="color:#64748b;font-size:13px;margin:0 0 8px">${todayStr} ｜ 赛事库共 ${races.length} 场 ｜ 7 天内截止 ${closing.length} 场 ｜ 今日新动态 ${newsList.length} 条</p>
  ${staleBanner}
  ${section("报名截止倒计时（7 天内）", "🔥", closing.map((r) => row(r)))}
  ${section("今日新动态", "🆕", newsList.map((n) => row(n.race, n.reasons.join("；"))), newsNote)}
  ${section("即将开放（7 天内开始报名）", "📅", opening.map((r) => row(r)))}
  ${changesSection()}
  <p style="color:#94a3b8;font-size:12px;margin-top:28px;border-top:1px solid #eee;padding-top:12px">
    字段留空表示组委会暂未公布；报名请务必通过官方渠道。<br>
    数据以组委会官方公告为准，完整赛事列表见 <a href="https://pbrun.run" style="color:#2563eb">pbrun.run</a>。
  </p>
</div>`;

// 正文与主题：--html-file 优先（人工按官方公告补测的当日成品），否则用当场数据渲染
const body = HTML_FILE ? readFileSync(HTML_FILE, "utf8") : dataHtml;
const subject = SUBJECT_OVERRIDE
  ?? (HTML_FILE
    ? `🏃 ${todayStr} 马拉松报名简报（官方公告补测版）`
    : `🏃 ${todayStr} 马拉松报名简报｜${closing.length} 场 7 天内截止｜${newsList.length} 条新动态`);

if (DRY_RUN) {
  if (HTML_FILE) {
    console.log(`[dry-run] 正文取用 ${HTML_FILE}（${body.length} 字节），主题：${subject}`);
    console.log("[dry-run] 未发信，两份基线未改动");
  } else {
    writeFileSync("digest-preview.html", dataHtml);
    console.log(`[dry-run] 7 天内截止 ${closing.length} 场｜新动态 ${newsList.length} 条（字段基线${hasBaseline ? "已就绪" : "缺失"}）｜7 天内开放 ${opening.length} 场`);
    console.log(`[dry-run] ${staleLog}`);
    console.log("[dry-run] 预览已写入 digest-preview.html，基线文件未改动");
  }
  process.exit(0);
}

// 三段全空通常意味着数据没刷新或被误清空，在 Actions 日志里留一行醒目提示
if (!HTML_FILE && !closing.length && !newsList.length && !opening.length) {
  console.warn("⚠ 三段简报全空：请确认 data/races.json 是否已更新（对比 data/digestBaseline.json 的上一次快照）");
}
if (!HTML_FILE && staleRaces.length) {
  console.warn(`⚠ 简报已带停更提醒：每天必查的 ${staleRaces.length} 场未复查（最久 ${staleDays} 天前）`);
}

// 本机推送通道：正文落盘即结束，不发信、不动两份基线（真正送达由人按发送决定）
if (OUT_HTML) {
  writeFileSync(OUT_HTML, body);
  console.log(`[out-html] 正文已写入 ${OUT_HTML}（${body.length} 字节）｜7 天内截止 ${closing.length} 场｜新动态 ${newsList.length} 条｜7 天内开放 ${opening.length} 场`);
  console.log(`[out-html] ${staleLog}；未发信，两份基线未改动`);
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
    subject,
    html: body,
  }),
});
if (!res.ok) {
  console.error(`邮件发送失败: ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log(`✅ 简报邮件已发送至 ${to}（${HTML_FILE ? `现成成品 ${HTML_FILE}` : `7 天内截止 ${closing.length} 场，新动态 ${newsList.length} 条，即将开放 ${opening.length} 场`}）`);
// 送达之后才推进基线；发的是现成成品时数据版并未送达，基线留给下一次真正发数据版的那轮
if (!HTML_FILE) advanceBaselines();
}

main();
