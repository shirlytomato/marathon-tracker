// scripts/update-status.ts —— 每日赛事进展更新（GitHub Actions 调用，支持 --dry-run）
// 成本策略：近 90 天赛事/报名中 → 每日查询；远场 → 每周约一天；已完赛 → 不再更新
import { readFileSync, writeFileSync } from "fs";
import type { Race } from "../src/types/race";
import { deriveStatus } from "../src/lib/status";
import { qwenSearch } from "./lib/qwen";

const DRY = process.argv.includes("--dry-run");
const day = 86400000;
const now = Date.now();

function dueToUpdate(r: Race): boolean {
  if (r.regStatus === "finished") return false;
  const raceT = new Date(r.raceDate + "T00:00:00+08:00").getTime();
  if (raceT < now) return false;                       // 已完赛的赛事不再更新（页面状态由日期自动推导为已结束）
  const within90 = raceT - now <= 90 * day;
  const weeklySlot = Math.floor(now / day) % 7 === 0;  // 每 7 天中 1 天跑远场
  return within90 || r.regStatus === "open" || weeklySlot;
}

const PROMPT = (r: Race) =>
  `请联网搜索"${r.name}"（${r.country}${r.province ?? ""}${r.city ?? ""}，比赛时间 ${r.raceDate}）的最新报名信息。` +
  `信源优先级（必须按序采信）：1) 组委会官网/官方公众号的正式公告；2) 中国田径协会赛事目录；` +
  `3) 权威聚合平台（最酷zuicool.com、数字心动、本地宝）转载的官方公告。其他自媒体/营销号内容仅作参考，不得作为日期依据。` +
  `重要要求：日期必须来自上述官方公告，禁止根据往年经验推测或估算；` +
  `如果找不到确切的官方报名日期，对应字段必须返回空字符串。只返回一个 JSON 对象，不要包含其他文字：` +
  `{"regStart":"报名开始日期 YYYY-MM-DD，非官方确切信息则为空字符串","regEnd":"报名截止日期 YYYY-MM-DD，非官方确切信息则为空字符串",` +
  `"regStatus":"pending|open|drawing|closed|finished 之一","lotteryDate":"抽签日期 YYYY-MM-DD，无则为空字符串",` +
  `"raceDate":"核实后的比赛日期 YYYY-MM-DD","officialSite":"赛事官网URL，未知则为空字符串","note":"一句话摘要，注明来源"}`;

// 日期年份防护：AI 可能返回往年数据（如给 2026 赛事填 2025 报名窗口），与赛事年份不符则丢弃
const validYear = (v: string, race: Race) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && v.slice(0, 4) === race.raceDate.slice(0, 4);

const VALID_STATUS = new Set(["pending", "open", "drawing", "closed", "finished"]);

// 官网实测：AI 返回的域名经常是编造的，必须 HTTP 可达才允许写入（重试一次）
async function siteReachable(url: string): Promise<boolean> {
  for (let i = 0; i < 2; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
      });
      clearTimeout(timer);
      if (res.ok || res.status === 302) return true;
    } catch { /* 重试或判为不可达 */ }
  }
  return false;
}

async function main() {
  const path = "data/races.json";
  const races = JSON.parse(readFileSync(path, "utf8")) as Race[];
  const targets = races.filter(dueToUpdate);
  console.log(`待更新 ${targets.length}/${races.length} 场${DRY ? "（dry-run，不写文件）" : ""}`);
  let ok = 0, fail = 0;
  const aiSites = new Set<string>(); // 本次由 AI 新写入/替换的官网，发布前检测对其严格把关
  for (const r of targets) {
    try {
      const parsed = JSON.parse(await qwenSearch(PROMPT(r)));
      for (const k of ["regStart", "regEnd", "lotteryDate", "raceDate"] as const) {
        const v = parsed[k];
        if (typeof v === "string" && v && validYear(v, r)) (r as unknown as Record<string, unknown>)[k] = v;
        // AI 返回空字符串：保留原值，不用空值覆盖已有数据
      }
      const status = parsed.regStatus;
      if (typeof status === "string" && VALID_STATUS.has(status)) r.regStatus = status as Race["regStatus"];
      const site = parsed.officialSite;
      if (typeof site === "string" && site && site !== r.officialSite) {
        if (/^https?:\/\//.test(site) && (await siteReachable(site))) {
          r.officialSite = site;
          aiSites.add(site);
          console.log(`  官网已实测通过: ${site}`);
        } else {
          console.log(`  官网不可达，已丢弃: ${site}`);
        }
      }
      // 状态与本地推导冲突时（如日期未变却报 pending），以本地推导为准，防止好数据被降级
      if (parsed.regStatus === "pending") r.regStatus = deriveStatus(r, new Date(now));
      r.updatedAt = new Date().toISOString();
      ok++;
      console.log(`✓ ${r.name}`);
    } catch (e) {
      fail++;
      console.error(`✗ ${r.name}: ${(e as Error).message}`); // 单场失败保留旧数据
    }
  }
  console.log(`完成：成功 ${ok}，失败 ${fail}`);
  if (!DRY) {
    if (ok > 0) writeFileSync(path, JSON.stringify(races, null, 2));
    // 告知发布前检测：哪些官网是本次 AI 新写入的（需严格把关），其余为历史已核实官网（故障仅警告）
    writeFileSync("data/todaySites.json", JSON.stringify([...aiSites], null, 2));
  }
  if (ok === 0 && fail > 0) process.exit(1); // 全部失败 → Actions 标记失败，不提交坏数据
}

main();
