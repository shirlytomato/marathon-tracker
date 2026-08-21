// scripts/update-status.ts —— 每日赛事进展更新（GitHub Actions 调用，支持 --dry-run）
// 成本策略：近 90 天赛事/报名中 → 每日查询；远场 → 每周约一天；已结束 → 跳过
import { readFileSync, writeFileSync } from "fs";
import type { Race } from "../src/types/race";
import { qwenSearch } from "./lib/qwen";

const DRY = process.argv.includes("--dry-run");
const day = 86400000;
const now = Date.now();

function dueToUpdate(r: Race): boolean {
  if (r.regStatus === "finished") return false;
  const raceT = new Date(r.raceDate + "T00:00:00+08:00").getTime();
  if (raceT < now) return true;                        // 刚结束，收尾更新一次
  const within90 = raceT - now <= 90 * day;
  const weeklySlot = Math.floor(now / day) % 7 === 0;  // 每 7 天中 1 天跑远场
  return within90 || r.regStatus === "open" || weeklySlot;
}

const PROMPT = (r: Race) =>
  `请联网搜索"${r.name}"（${r.country}${r.province ?? ""}${r.city ?? ""}，比赛时间 ${r.raceDate}）的最新报名信息。` +
  `只返回一个 JSON 对象，不要包含其他文字：` +
  `{"regStart":"报名开始日期 YYYY-MM-DD，未知则为空字符串","regEnd":"报名截止日期 YYYY-MM-DD，未知则为空字符串",` +
  `"regStatus":"pending|open|drawing|closed|finished 之一","lotteryDate":"抽签日期 YYYY-MM-DD，无则为空字符串",` +
  `"raceDate":"核实后的比赛日期 YYYY-MM-DD","officialSite":"赛事官网URL，未知则为空字符串","note":"一句话摘要"}`;

async function main() {
  const path = "data/races.json";
  const races = JSON.parse(readFileSync(path, "utf8")) as Race[];
  const targets = races.filter(dueToUpdate);
  console.log(`待更新 ${targets.length}/${races.length} 场${DRY ? "（dry-run，不写文件）" : ""}`);
  let ok = 0, fail = 0;
  for (const r of targets) {
    try {
      const parsed = JSON.parse(await qwenSearch(PROMPT(r)));
      for (const k of ["regStart", "regEnd", "regStatus", "lotteryDate", "raceDate", "officialSite"] as const) {
        const v = parsed[k];
        if (typeof v === "string" && v) (r as unknown as Record<string, unknown>)[k] = v;
      }
      r.updatedAt = new Date().toISOString();
      ok++;
      console.log(`✓ ${r.name}`);
    } catch (e) {
      fail++;
      console.error(`✗ ${r.name}: ${(e as Error).message}`); // 单场失败保留旧数据
    }
  }
  console.log(`完成：成功 ${ok}，失败 ${fail}`);
  if (!DRY && ok > 0) writeFileSync(path, JSON.stringify(races, null, 2));
  if (ok === 0 && fail > 0) process.exit(1); // 全部失败 → Actions 标记失败，不提交坏数据
}

main();
