// scripts/verify-data.ts —— 发布前检测关卡（本地 + GitHub Actions 提交前调用）
// 硬错误（拦截发布）：
//  1. 日期格式与逻辑：YYYY-MM-DD、报名窗口在赛事日期之前、字段年份与赛事一致
//  2. 状态合法性：regStatus 必须属于枚举值
//  3. 本次 AI 新写入的官网必须 HTTP 可达（防编造域名入库，重试 2 次）
// 软警告（不拦截）：历史已核实的官网临时不可达——站点维护/反爬抖动不应阻断全量数据更新，仅打印警告待人工跟进
import { readFileSync } from "fs";
import type { Race, RegStatus } from "../src/types/race";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUS: RegStatus[] = ["pending", "open", "drawing", "closed", "finished"];
// 大满贯等头部赛事官网带反爬/排队系统（302 到 waiting room），实测易误判，豁免 HTTP 检测
// szns-marathon.com：深圳南山半马官网对脚本返回 403，本地宝确认其为官方报名地址
const SITE_EXEMPT = ["nyrr.org", "szns-marathon.com"];

async function siteReachable(url: string): Promise<boolean> {
  for (let i = 0; i < 3; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
      });
      clearTimeout(timer);
      // 3xx 由 fetch 自动跟随，未跟随的重定向视为可达；429/503 说明站点在线（限流/维护），不算死链
      if (res.ok || (res.status >= 300 && res.status < 400) || res.status === 429 || res.status === 503) return true;
    } catch { /* 重试 */ }
  }
  return false;
}

function checkDates(r: Race): string[] {
  const errs: string[] = [];
  const year = Number(r.raceDate.slice(0, 4));
  // 大型赛事常提前一年开放报名（如 2027 东京 2026 年报名），允许同年或赛事年前一年；再往前视为往年数据污染
  const yearOk = (v: string) => [year, year - 1].includes(Number(v.slice(0, 4)));
  if (!DATE_RE.test(r.raceDate)) errs.push(`raceDate 格式非法: ${r.raceDate}`);
  for (const k of ["regStart", "regEnd", "lotteryDate"] as const) {
    const v = r[k];
    if (!v) continue;
    if (!DATE_RE.test(v)) errs.push(`${k} 格式非法: ${v}`);
    else if (!yearOk(v)) errs.push(`${k} 年份(${v})与赛事年份(${year})不符`);
  }
  if (r.regStart && r.regEnd) {
    if (DATE_RE.test(r.regStart) && DATE_RE.test(r.regEnd) && r.regStart > r.regEnd)
      errs.push(`报名开始晚于截止: ${r.regStart} > ${r.regEnd}`);
    if (DATE_RE.test(r.regEnd) && DATE_RE.test(r.raceDate) && r.regEnd >= r.raceDate)
      errs.push(`报名截止不早于比赛日期: ${r.regEnd} >= ${r.raceDate}`);
  }
  if (!VALID_STATUS.includes(r.regStatus)) errs.push(`regStatus 非法: ${r.regStatus}`);
  return errs;
}

async function main() {
  const races = JSON.parse(readFileSync("data/races.json", "utf8")) as Race[];
  const errors: string[] = [];

  // 1) 字段一致性（离线检查，必过）
  for (const r of races) {
    for (const e of checkDates(r)) errors.push(`[字段] ${r.name}: ${e}`);
    if (r.officialSite && !/^https?:\/\//.test(r.officialSite))
      errors.push(`[字段] ${r.name}: officialSite 不是合法 URL: ${r.officialSite}`);
  }

  // 2) 官网 HTTP 实测（并发 5，避免被目标站限流；反爬豁免名单除外）
  // 本次 AI 新写入的官网 → 不可达即拦截；历史已核实官网 → 仅警告不阻断（防临时故障卡死整条流水线）
  const aiSites = (() => {
    try { return new Set(JSON.parse(readFileSync("data/todaySites.json", "utf8")) as string[]); }
    catch { return new Set<string>(); }
  })();
  const withSite = races.filter(r => r.officialSite && !SITE_EXEMPT.some(d => r.officialSite!.includes(d)));
  console.log(`官网实测：${withSite.length} 个（其中本次 AI 新写入 ${aiSites.size} 个，严格把关）`);
  const queue = [...withSite];
  const warnings: string[] = [];
  const workers = Array.from({ length: 5 }, async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      const ok = await siteReachable(r.officialSite!);
      console.log(`${ok ? "✓" : "✗"} ${r.name} ${r.officialSite}`);
      if (ok) continue;
      if (aiSites.has(r.officialSite!)) errors.push(`[官网] ${r.name}: AI 新写入官网不可达 ${r.officialSite}`);
      else warnings.push(`[官网] ${r.name}: 历史官网暂不可达（不阻断发布） ${r.officialSite}`);
    }
  });
  await Promise.all(workers);

  if (errors.length) {
    console.error(`\n❌ 检测未通过，禁止发布（${errors.length} 项）：`);
    for (const e of errors) console.error(`  - ${e}`);
    if (warnings.length) for (const w of warnings) console.error(`  ⚠ ${w}`);
    process.exit(1);
  }
  for (const w of warnings) console.warn(`⚠ ${w}`);
  console.log(`\n✅ 全部通过：${races.length} 场赛事，${withSite.length} 个官网实测${warnings.length ? `，${warnings.length} 个历史官网暂不可达（见警告）` : ""}`);
}

main();
