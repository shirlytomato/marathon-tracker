// scripts/discover-races.ts —— 新赛事巡检（GitHub Actions 每周一/三/六调用，支持 --dry-run）
//
// 两段式设计，目标是「少烧 token + 只收真赛事」：
//   第一段 粗筛：只问最近 SCAN_DAYS 天内新官宣／新定档／刚发竞赛规程的赛事，
//     输出仅名称+日期+来源（不要全字段）。同时把库内已收录的赛事名喂给模型做排除——
//     不喂的话模型每轮都会把北马上马这类知名赛事重报一遍，既浪费输出，
//     又会挤占返回条数上限、让真正的新赛事永远轮不到。
//   第二段 核实：只对通过本地去重与日期校验的候选逐场查一次，要求给出组委会官方公告；
//     核实不通过（找不到官方公告／日期对不上）→ 直接丢弃不入库，宁可漏收也不收错。
//
// 防污染策略：单次最多核实并入库 MAX_ADD 场（历史巡检实测每轮新增 0~5 场，8 场已留足余量）；
// 官网必须 HTTP 实测可达；category 一律 "B"（标牌等级不轻信 AI，需人工升级）
import { readFileSync, writeFileSync } from "fs";
import type { Race } from "../src/types/race";
import { deriveStatus } from "../src/lib/status";
import { qwenSearch } from "./lib/qwen";

const DRY = process.argv.includes("--dry-run");
const MAX_ADD = 8;     // 单次核实/入库上限：超限说明粗筛异常，其余留待下一轮
const SCAN_DAYS = 10;  // 粗筛窗口：巡检每 2~3 天跑一次，留足重叠余量避免漏掉
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 动态日期窗口：提示词不能写死日期，否则过期后巡检会全部失效
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const today = iso(Date.now());
const scanFrom = iso(Date.now() - SCAN_DAYS * 86400000);
const tomorrow = iso(Date.now() + 86400000);
const halfYearLater = iso(Date.now() + 183 * 86400000);

// 名称归一化：去掉年份与空白后比较，避免"2026郑州马拉松"与"郑州马拉松"重复入库
const norm = (s: string) => s.replace(/20\d{2}/g, "").replace(/\s+/g, "");

// 第一段：只要名称与日期，输出越小越好（token 主要花在输出和搜索上下文上）
const SCAN_PROMPT = (scope: string, known: string) =>
  `请联网搜索${scope}在 ${scanFrom} 至 ${today} 期间新公布的马拉松赛事：` +
  `新定档比赛日期、首次发布竞赛规程、或刚开启报名的赛事。` +
  `搜索关键词示例：“马拉松 定档”“马拉松 竞赛规程 发布”“马拉松 报名开启”。` +
  `要求：比赛日期必须在 ${tomorrow} 至 ${halfYearLater} 之间；只列这段时间内新公布的，` +
  `下面这些库内已收录的赛事一律不要返回：${known}。` +
  `最多返回 15 场，禁止推测或编造。只返回一个 JSON 对象，不要包含其他文字：` +
  `{"races":[{"name":"赛事全称","country":"国家","province":"国内赛事填省份，海外填空字符串",` +
  `"city":"城市","raceDate":"比赛日期 YYYY-MM-DD","source":"信息来源一句话"}]}`;

// 第二段：逐场核实，必须落到官方公告；找不到就明确返回 confirmed=false
const VERIFY_PROMPT = (c: Candidate) =>
  `请联网核实"${c.name}"（${c.country ?? ""}${c.province ?? ""}${c.city ?? ""}，` +
  `传闻比赛日期 ${c.raceDate}）是否真实举办，并给出确切信息。` +
  `信源优先级（必须按序采信）：1) 组委会官网/官方公众号的正式公告；2) 中国田径协会赛事目录；` +
  `3) 权威聚合平台（最酷zuicool.com、数字心动、本地宝）转载的官方公告。` +
  `自媒体/营销号内容仅作参考，不得作为日期依据。` +
  `不要沿用传闻日期，以官方公告为准；禁止根据往年经验推测或估算。` +
  `若找不到任何官方公告，confirmed 必须为 false、其余字段留空。只返回一个 JSON 对象：` +
  `{"confirmed":true或false,"raceDate":"官方公告的比赛日期 YYYY-MM-DD","regStart":"报名开始日期，非官方确切信息则为空字符串",` +
  `"regEnd":"报名截止日期，非官方确切信息则为空字符串","lotteryDate":"抽签日期，无则为空字符串",` +
  `"events":["全程马拉松","半程马拉松" 等项目],"scale":"规模如 20000人，不确定则空字符串",` +
  `"officialSite":"赛事官网URL，未知则为空字符串","source":"官方公告来源一句话"}`;

interface Candidate {
  name: string; country?: string; province?: string; city?: string;
  raceDate?: string; source?: string;
}

interface Verified {
  confirmed?: boolean; raceDate?: string; regStart?: string; regEnd?: string;
  lotteryDate?: string; events?: string[]; scale?: string; officialSite?: string; source?: string;
}

// API 调用失败计数：全部失败时必须让任务变红。
// 否则密钥失效会被 catch 吞掉、脚本照常 exit 0，形成"假绿灯"——
// 2026-09-10~09-15 事故中巡检任务连续显示 success，掩盖了每日更新已在报错的事实。
let scanFailures = 0;
let verifyFailures = 0;

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

async function scan(scope: string, known: string): Promise<Candidate[]> {
  try {
    const parsed = JSON.parse(await qwenSearch(SCAN_PROMPT(scope, known)));
    const list = Array.isArray(parsed.races) ? (parsed.races as Candidate[]) : [];
    console.log(`【粗筛】${scope}：返回 ${list.length} 场`);
    return list;
  } catch (e) {
    scanFailures++;
    console.error(`✗ 【粗筛】${scope}查询失败: ${(e as Error).message}`);
    return [];
  }
}

// 本地校验：日期格式、赛期在未来且不超半年、报名窗口年份与先后关系
// 返回不通过的原因，通过则返回 null —— 不合格的候选不进第二段，省下一次核实调用
function screenRace(raceDate: string, regStart?: string, regEnd?: string): string | null {
  if (!DATE_RE.test(raceDate)) return `比赛日期格式非法(${raceDate})`;
  if (raceDate <= today) return `比赛日期已过(${raceDate})`;
  if (raceDate > halfYearLater) return `比赛日期超出半年窗口(${raceDate})`;
  const year = Number(raceDate.slice(0, 4));
  // 大型赛事常提前一年开放报名（如 2027 东京在 2026 年报名），允许同年或前一年
  const yearOk = (v?: string) => !v || (DATE_RE.test(v) && [year, year - 1].includes(Number(v.slice(0, 4))));
  if (!yearOk(regStart)) return `报名开始年份与赛期不符(${regStart})`;
  if (!yearOk(regEnd)) return `报名截止年份与赛期不符(${regEnd})`;
  if (regStart && regEnd && regStart > regEnd) return `报名开始晚于截止(${regStart}>${regEnd})`;
  if (regEnd && regEnd >= raceDate) return `报名截止不早于比赛日(${regEnd}>=${raceDate})`;
  return null;
}

async function main() {
  const path = "data/races.json";
  const races = JSON.parse(readFileSync(path, "utf8")) as Race[];
  const now = new Date();
  const existing = new Set(
    races.flatMap(r => [norm(r.name), ...(r.shortName ? [norm(r.shortName)] : [])]),
  );
  const aiSites = new Set<string>();
  const added: Race[] = [];

  // 把库内尚未开赛的赛事名喂给粗筛做排除（已开赛的不会再被官宣，无需占提示词长度）
  const knownFuture = races.filter(r => r.raceDate > today);
  const known = [...new Set(knownFuture.map(r => norm(r.name)))].sort().join("、");
  console.log(`赛事库 ${races.length} 场（未开赛 ${knownFuture.length} 场已作为排除名单注入提示词）`);

  // 第一段：国内 + 海外两轮增量粗筛
  const candidates = [
    ...await scan("中国各地（含省市县）", known),
    ...await scan("海外（日本、韩国、东南亚及欧美主要城市）", known),
  ];
  console.log(`【粗筛】共 ${candidates.length} 场候选`);
  if (scanFailures > 0 && candidates.length === 0) {
    console.error(`✗ 全部 ${scanFailures} 轮粗筛查询均失败（疑似千问 API 密钥失效或额度耗尽），标记任务失败以免形成假绿灯`);
    process.exit(1);
  }

  // 本地去重与格式校验：不花一分钱先把明显不合格的挡掉
  const shortlist: Candidate[] = [];
  for (const c of candidates) {
    if (!c.name || !c.raceDate) { console.log(`  丢弃（缺名称或日期）: ${c.name ?? "?"}`); continue; }
    if (existing.has(norm(c.name))) { console.log(`  跳过已收录: ${c.name}`); continue; }
    const why = screenRace(c.raceDate);
    if (why) { console.log(`  丢弃（${why}）: ${c.name}`); continue; }
    if (shortlist.length >= MAX_ADD) { console.log(`  已达单次上限 ${MAX_ADD} 场，其余留待下次: ${c.name}`); continue; }
    shortlist.push(c);
  }
  console.log(`【核实】待逐场核实 ${shortlist.length} 场`);

  // 第二段：逐场核实，只有拿到官方公告的才入库
  for (const c of shortlist) {
    let v: Verified;
    try {
      v = JSON.parse(await qwenSearch(VERIFY_PROMPT(c))) as Verified;
    } catch (e) {
      verifyFailures++;
      console.error(`✗ 【核实】${c.name} 查询失败: ${(e as Error).message}`);
      continue; // 核实不了就不入库，下一轮巡检还会再遇到它
    }
    if (v.confirmed !== true || !v.raceDate) {
      console.log(`  丢弃（未找到官方公告，核实不通过）: ${c.name}｜来源: ${v.source ?? c.source ?? "无"}`);
      continue;
    }
    const why = screenRace(v.raceDate, v.regStart, v.regEnd);
    if (why) { console.log(`  丢弃（核实结果自相矛盾：${why}）: ${c.name}`); continue; }
    if (existing.has(norm(c.name))) { console.log(`  跳过（本轮已收录同名赛事）: ${c.name}`); continue; }

    const race: Race = {
      id: `${c.name}-${v.raceDate.slice(0, 4)}`,
      name: c.name,
      country: c.country && c.country !== "中国" ? c.country : "中国",
      province: c.country === "中国" || !c.country ? c.province || undefined : undefined,
      city: c.city || undefined,
      raceDate: v.raceDate,
      regStart: v.regStart || undefined,
      regEnd: v.regEnd || undefined,
      lotteryDate: v.lotteryDate || undefined,
      regStatus: "pending",
      scale: v.scale || undefined,
      events: Array.isArray(v.events) && v.events.length ? v.events : ["全程马拉松"],
      category: "B", // 标牌等级不轻信 AI，一律 B 类，人工核实后升级
      updatedAt: now.toISOString(),
    };
    race.regStatus = deriveStatus(race, now);
    // 官网实测：可达才写入，不可达直接丢弃官网字段（赛事本身保留，来源已注明）
    if (v.officialSite && /^https?:\/\//.test(v.officialSite)) {
      if (await siteReachable(v.officialSite)) {
        race.officialSite = v.officialSite;
        aiSites.add(v.officialSite);
        console.log(`  官网实测通过: ${v.officialSite}`);
      } else {
        console.log(`  官网不可达，已丢弃: ${v.officialSite}（${c.name}）`);
      }
    }
    if (v.raceDate !== c.raceDate) console.log(`  ⚠ 赛期以官方公告为准: ${c.raceDate} → ${v.raceDate}`);
    console.log(`  来源: ${v.source ?? c.source ?? "未注明"}`);
    races.push(race);
    existing.add(norm(c.name));
    added.push(race);
    console.log(`✓ 新入库: ${race.name} ${race.raceDate} [${race.regStatus}]`);
  }

  console.log(`完成：粗筛 ${candidates.length} 场 → 核实 ${shortlist.length} 场 → 新入库 ${added.length} 场，总计 ${races.length} 场${DRY ? "（dry-run，不写文件）" : ""}`);
  // 待核实的候选全部因 API 异常失败 → 与"没有新赛事"是两回事，必须让任务变红
  if (shortlist.length > 0 && verifyFailures === shortlist.length) {
    console.error(`✗ 全部 ${verifyFailures} 场核实查询均失败（疑似千问 API 密钥失效或额度耗尽），标记任务失败以免形成假绿灯`);
    process.exit(1);
  }
  if (!DRY) {
    if (added.length > 0) writeFileSync(path, JSON.stringify(races, null, 2));
    // 仅在有新写入时更新，避免无新赛事时产生无谓的数据文件变动提交；
    // 新官网交给 verify-data 严格把关，每日更新任务会重写此文件不受影响
    if (aiSites.size > 0) writeFileSync("data/todaySites.json", JSON.stringify([...aiSites], null, 2));
  }
}

main();
