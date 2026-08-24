// scripts/discover-races.ts —— 新赛事巡检（GitHub Actions 每周一/三/六调用，支持 --dry-run）
// 千问联网搜索近期官宣的新马拉松赛事 → 与现有数据去重 → 字段/日期校验 → 官网实测 → 入库
// 防污染策略：单次最多入库 12 场；官网不可达则丢弃官网字段；category 一律 "B"（标牌需人工升级）
import { readFileSync, writeFileSync } from "fs";
import type { Race } from "../src/types/race";
import { deriveStatus } from "../src/lib/status";
import { qwenSearch } from "./lib/qwen";

const DRY = process.argv.includes("--dry-run");
const MAX_ADD = 12; // 单次入库上限，防 AI 失控批量污染
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SEARCH_PROMPT = (scope: string) =>
  `请联网搜索最近一个月内官方正式宣布（组委会公告/官方公众号/权威跑步媒体报道）的${scope}新增马拉松赛事，` +
  `比赛日期在今天之后 6 个月内。只收录有明确官方公告的赛事，禁止推测或编造。` +
  `只返回一个 JSON 对象，不要包含其他文字：` +
  `{"races":[{"name":"赛事全称","country":"国家","province":"国内赛事填省份，海外填空字符串","city":"城市",` +
  `"raceDate":"比赛日期 YYYY-MM-DD","regStart":"报名开始日期，不确定则空字符串","regEnd":"报名截止日期，不确定则空字符串",` +
  `"events":["全程马拉松","半程马拉松" 等项目],"scale":"规模如 20000人，不确定则空字符串",` +
  `"officialSite":"赛事官网URL，不确定则空字符串","source":"信息来源一句话"}],"count":数量}`;

// 官网实测：与 update-status 同一策略，AI 返回的域名必须真实可达才允许入库
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
      if (res.ok || res.status === 302 || res.status === 429 || res.status === 503) return true;
    } catch { /* 重试或判为不可达 */ }
  }
  return false;
}

// 名称归一化：去掉年份与空白后比较，避免"2026郑州马拉松"与"郑州马拉松"重复入库
const norm = (s: string) => s.replace(/20\d{2}/g, "").replace(/\s+/g, "");

interface Candidate {
  name: string; country?: string; province?: string; city?: string;
  raceDate?: string; regStart?: string; regEnd?: string;
  events?: string[]; scale?: string; officialSite?: string; source?: string;
}

async function fetchCandidates(scope: string): Promise<Candidate[]> {
  try {
    const parsed = JSON.parse(await qwenSearch(SEARCH_PROMPT(scope)));
    return Array.isArray(parsed.races) ? parsed.races : [];
  } catch (e) {
    console.error(`✗ ${scope}查询失败: ${(e as Error).message}`);
    return [];
  }
}

async function main() {
  const path = "data/races.json";
  const races = JSON.parse(readFileSync(path, "utf8")) as Race[];
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const existing = new Set(races.map(r => norm(r.name)));
  const aiSites = new Set<string>();
  const added: Race[] = [];

  // 国内 + 海外两轮搜索
  const candidates = [
    ...await fetchCandidates("中国各地（含省市县）"),
    ...await fetchCandidates("海外（日本、韩国、东南亚及欧美主要城市）"),
  ];
  console.log(`搜索到候选 ${candidates.length} 场`);

  for (const c of candidates) {
    if (added.length >= MAX_ADD) { console.log("已达单次入库上限，其余留待下次"); break; }
    // 去重：名称归一化后已存在则跳过
    if (!c.name || existing.has(norm(c.name))) { if (c.name) console.log(`  跳过已收录: ${c.name}`); continue; }
    // 字段校验：日期格式、比赛日在未来、报名窗口在赛事年份且早于比赛日
    if (!c.raceDate || !DATE_RE.test(c.raceDate) || c.raceDate <= today) { console.log(`  丢弃（日期无效/已过期）: ${c.name} ${c.raceDate ?? ""}`); continue; }
    const year = c.raceDate.slice(0, 4);
    const yearOk = (v?: string) => !v || (DATE_RE.test(v) && (v.slice(0, 4) === year || v.slice(0, 4) === String(Number(year) - 1)));
    if (!yearOk(c.regStart) || !yearOk(c.regEnd)) { console.log(`  丢弃（报名窗口年份不符）: ${c.name}`); continue; }
    if (c.regStart && c.regEnd && c.regStart > c.regEnd) { console.log(`  丢弃（报名开始晚于截止）: ${c.name}`); continue; }
    if (c.regEnd && c.regEnd >= c.raceDate) { console.log(`  丢弃（报名截止晚于比赛日）: ${c.name}`); continue; }

    const race: Race = {
      id: `${c.name}-${year}`,
      name: c.name,
      country: c.country && c.country !== "中国" ? c.country : "中国",
      province: c.country === "中国" || !c.country ? c.province || undefined : undefined,
      city: c.city || undefined,
      raceDate: c.raceDate,
      regStart: c.regStart || undefined,
      regEnd: c.regEnd || undefined,
      regStatus: "pending",
      scale: c.scale || undefined,
      events: Array.isArray(c.events) && c.events.length ? c.events : ["全程马拉松"],
      category: "B", // 标牌等级不轻信 AI，一律 B 类，人工核实后升级
      updatedAt: now.toISOString(),
    };
    race.regStatus = deriveStatus(race, now);
    // 官网实测：可达才写入，不可达直接丢弃官网字段（赛事本身保留，来源已注明）
    if (c.officialSite && /^https?:\/\//.test(c.officialSite)) {
      if (await siteReachable(c.officialSite)) {
        race.officialSite = c.officialSite;
        aiSites.add(c.officialSite);
        console.log(`  官网实测通过: ${c.officialSite}`);
      } else {
        console.log(`  官网不可达，已丢弃: ${c.officialSite}（${c.name}）`);
      }
    }
    if (c.source) console.log(`  来源: ${c.source}`);
    races.push(race);
    existing.add(norm(c.name));
    added.push(race);
    console.log(`✓ 新入库: ${race.name} ${race.raceDate} [${race.regStatus}]`);
  }

  console.log(`完成：新入库 ${added.length} 场，总计 ${races.length} 场${DRY ? "（dry-run，不写文件）" : ""}`);
  if (!DRY) {
    if (added.length > 0) writeFileSync(path, JSON.stringify(races, null, 2));
    // 本次新写入的官网交给 verify-data 严格把关
    writeFileSync("data/todaySites.json", JSON.stringify([...aiSites], null, 2));
  }
}

main();
