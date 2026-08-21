// scripts/verify-data.ts —— 发布前检测关卡（本地 + GitHub Actions 提交前调用）
// 任何一条不通过即退出码 1，坏数据不允许上线：
//  1. 日期格式与逻辑：YYYY-MM-DD、报名窗口在赛事日期之前、字段年份与赛事一致
//  2. 状态合法性：regStatus 必须属于枚举值
//  3. 官网实测：officialSite 必须 HTTP 可达（重试 2 次，容忍瞬时抖动）
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
      if (res.ok || res.status === 302) return true;
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
  const withSite = races.filter(r => r.officialSite && !SITE_EXEMPT.some(d => r.officialSite!.includes(d)));
  console.log(`官网实测：${withSite.length} 个`);
  const queue = [...withSite];
  const workers = Array.from({ length: 5 }, async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      const ok = await siteReachable(r.officialSite!);
      console.log(`${ok ? "✓" : "✗"} ${r.name} ${r.officialSite}`);
      if (!ok) errors.push(`[官网] ${r.name}: 不可达 ${r.officialSite}`);
    }
  });
  await Promise.all(workers);

  if (errors.length) {
    console.error(`\n❌ 检测未通过，禁止发布（${errors.length} 项）：`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`\n✅ 全部通过：${races.length} 场赛事，${withSite.length} 个官网实测可达`);
}

main();
