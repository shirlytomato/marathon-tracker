// scripts/dedupe-races.ts —— 存量数据清洗 + 合并重复赛事（手动执行，不在 workflow 里）
//
// 为什么需要：巡检入库用官方冠名全称（"2026恒丰银行济南(泉城)马拉松"），
// 种子数据用干净短名（"济南马拉松"），两套命名让原先的精确去重失效，
// 同一场赛事在页面上出现两张卡（2026-09-28 实测 9 组）。
// 增量防护已在 discover-races.ts 接上 findDuplicate，本脚本只负责清历史欠账。
//
// 用法：npx tsx scripts/dedupe-races.ts          # 预览
//      npx tsx scripts/dedupe-races.ts --apply  # 写回 data/races.json
import { readFileSync, writeFileSync } from "fs";
import type { Race } from "../src/types/race";
import { cleanEvents, cleanRegion, cleanText, findDuplicate } from "./lib/validation";

const APPLY = process.argv.includes("--apply");
const PATH = "data/races.json";

// 冲突字段取值：等级取更高（种子侧多为人工核实），状态取更靠后（不可逆）
const CAT_RANK: Record<string, number> = { B: 0, A: 1, platinum: 2, gold: 3, major: 4 };
const STATUS_RANK: Record<string, number> = { pending: 0, open: 1, drawing: 2, closed: 3, finished: 4 };
const TEXT_FIELDS = ["province", "city", "location", "regStart", "regEnd", "lotteryDate", "scale", "fee", "officialSite"] as const;

// 去掉冠名年份前缀，保留赞助商与括号部分（官方全称）
const stripYear = (s: string) => s.replace(/^\s*20\d{2}\s*/, "").trim();

function merge(keep: Race, drop: Race): Race {
  const m: Race = { ...keep };
  const [longer, shorter] = [stripYear(keep.name), stripYear(drop.name)].sort(
    (a, b) => b.length - a.length,
  );
  m.name = longer;
  if (shorter !== longer) m.shortName = keep.shortName || drop.shortName || shorter;
  for (const f of TEXT_FIELDS) {
    const v = cleanText(drop[f]);
    if (v && !m[f]) m[f] = f === "province" ? cleanRegion(v) : f === "city" ? cleanRegion(v, "city") : v;
  }
  m.events = cleanEvents([...keep.events, ...drop.events]);
  if (!m.events.length) m.events = ["全程马拉松"];
  if (CAT_RANK[drop.category] > CAT_RANK[keep.category]) m.category = drop.category;
  if (STATUS_RANK[drop.regStatus] > STATUS_RANK[keep.regStatus]) m.regStatus = drop.regStatus;
  return m;
}

const races = JSON.parse(readFileSync(PATH, "utf8")) as Race[];

// 第一步：逐条清洗脏值（AI 把"空字符串"当值返回、行政区划带后缀、项目名简写）
let cleaned = 0;
for (const r of races) {
  const before = JSON.stringify(r);
  r.province = cleanRegion(r.province);
  r.city = cleanRegion(r.city, "city");
  for (const f of ["regStart", "regEnd", "lotteryDate", "scale", "fee", "location", "officialSite"] as const) {
    r[f] = cleanText(r[f]);
  }
  r.events = cleanEvents(r.events);
  if (!r.events.length) r.events = ["全程马拉松"];
  if (JSON.stringify(r) !== before) cleaned++;
}

// 第二步：按同场判定分组，先出现的（种子侧）做保留方
const kept: Race[] = [];
const merged: Array<[Race, Race]> = [];
for (const r of races) {
  const dup = findDuplicate(r, kept);
  if (dup) merged.push([dup, r]);
  else kept.push(r);
}
for (const [keep, drop] of merged) {
  const idx = kept.indexOf(keep);
  kept[idx] = merge(keep, drop);
}

console.log(`清洗 ${cleaned} 条脏值；合并 ${merged.length} 组重复：${races.length} 场 → ${kept.length} 场\n`);
for (const [keep, drop] of merged) {
  const m = kept.find(r => r.id === keep.id)!;
  console.log(`  ${m.name}（${m.raceDate}）`);
  console.log(`    保留 ${keep.id} ← 移除 ${drop.id}`);
  console.log(`    ${m.category}类 | ${m.regStatus} | 报名 ${m.regStart ?? "?"}~${m.regEnd ?? "?"} | ${m.officialSite ?? "无官网"}`);
}

if (!APPLY) {
  console.log("\n（预览模式，未写入；加 --apply 落盘）");
  process.exit(0);
}
writeFileSync(PATH, JSON.stringify(kept, null, 2) + "\n");
console.log(`\n✓ 已写入 ${PATH}`);
