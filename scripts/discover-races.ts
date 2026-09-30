// scripts/discover-races.ts —— 新赛事巡检（GitHub Actions 每周一/三/六调用，支持 --dry-run）
//
// 两段式设计，目标是「少烧 token + 只收真赛事」：
//   第一段 粗筛：联网搜未来半年内即将举办的赛事，只要名称+地区+日期（不要全字段）。
//     去重全部在本地做（名称归一化比对的 existing 集合），不依赖提示词。
//   第二段 核实：只对通过本地去重与日期校验的候选逐场查一次，要求给出组委会官方公告；
//     核实不通过（找不到官方公告／日期对不上）→ 直接丢弃不入库，宁可漏收也不收错。
//
// 防污染策略：单次最多核实并入库 MAX_ADD 场（历史巡检实测每轮新增 0~5 场，8 场已留足余量）；
// 官网必须 HTTP 实测可达；category 一律 "B"（标牌等级不轻信 AI，需人工升级）
import { readFileSync, writeFileSync } from "fs";
import type { Race } from "../src/types/race";
import { deriveStatus, toStoredStatus } from "../src/lib/status";
import { qwenSearch, logUsage } from "./lib/qwen";
import { siteReachable } from "./lib/site-reach";
import { buildWindow, cleanEvents, cleanRegion, cleanText, findDuplicate, screenRace } from "./lib/validation";

const DRY = process.argv.includes("--dry-run");
const MAX_ADD = 8;     // 单次核实/入库上限：超限说明粗筛异常，其余留待下一轮

// 动态日期窗口：提示词不能写死日期，否则过期后巡检会全部失效
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const { today, halfYearLater } = buildWindow();
const tomorrow = iso(Date.now() + 86400000);

// 第一段粗筛提示词。三条实测结论（2026-09-16，每组跑 2 次）——不要“优化”掉它们：
//   ✗ 写成“最近 N 天新公布的赛事”：模型无法从搜索结果判定公告发布日期，
//     实测稳定返回 0 场，而输入 token 照烧（4940）——等于把发现新赛事的功能悄悄废掉
//   ✗ 把库内赛事名当排除名单塞进提示词：1459 字的否定清单让模型过度保守，
//     实测返回 12 场 → 1 场，连搜索都变浅（输入 5527 → 4426）；去重本来就在本地做，免费
//   ✓ 只要名称/地区/日期（不要全字段）：比一次要全字段省 20% token，命中新赛事数量相同
const SCAN_PROMPT = (scope: string) =>
  `请联网搜索${scope}即将举办的马拉松赛事。搜索方法：在搜索结果中查找赛事报名公告、竞赛规程发布等新闻，` +
  `例如搜索“马拉松 报名开启”“马拉松 定档”“马拉松 竞赛规程”等关键词。` +
  `只收录比赛日期在 ${tomorrow} 至 ${halfYearLater} 之间、且能找到公开报道的赛事，最多返回 15 场，禁止推测或编造。` +
  `本轮只需要名称、地区和比赛日期，报名时间/项目/规模/官网等信息不用返回（后续会另行核实）。` +
  `只返回一个 JSON 对象，不要包含其他文字：` +
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

async function scan(scope: string): Promise<Candidate[]> {
  try {
    const parsed = JSON.parse(await qwenSearch(SCAN_PROMPT(scope)));
    const list = Array.isArray(parsed.races) ? (parsed.races as Candidate[]) : [];
    console.log(`【粗筛】${scope}：返回 ${list.length} 场`);
    return list;
  } catch (e) {
    scanFailures++;
    console.error(`✗ 【粗筛】${scope}查询失败: ${(e as Error).message}`);
    return [];
  }
}

async function main() {
  const path = "data/races.json";
  const races = JSON.parse(readFileSync(path, "utf8")) as Race[];
  const now = new Date();
  // 去重口径从「norm(name) 精确比对」换成「同场判定」：种子数据用干净短名、
  // 巡检用官方冠名全称，精确比对拦不住改名变体，已在页面上造成 9 组重复卡片。
  const known = () => [...races, ...added];
  const aiSites = new Set<string>();
  const added: Race[] = [];

  console.log(`赛事库 ${races.length} 场（已收录名称全部进本地去重集）`);

  // 第一段：国内 + 海外两轮粗筛
  const candidates = [
    ...await scan("中国各地（含省市县）"),
    ...await scan("海外（日本、韩国、东南亚及欧美主要城市）"),
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
    const dupEarly = findDuplicate(c, known());
    if (dupEarly) { console.log(`  跳过（与库内「${dupEarly.name}」为同一场）: ${c.name}`); continue; }
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
    // 核实后按官方赛期再判一次：赛期被修正后可能与库内另一场撞成同一天
    const dup = findDuplicate({ name: c.name, raceDate: v.raceDate, city: c.city }, known());
    if (dup) { console.log(`  跳过（与库内「${dup.name}」为同一场）: ${c.name}`); continue; }

    const events = cleanEvents(v.events);
    const race: Race = {
      id: `${c.name}-${v.raceDate.slice(0, 4)}`,
      name: c.name,
      country: c.country && c.country !== "中国" ? c.country : "中国",
      province: cleanRegion(c.country === "中国" || !c.country ? c.province : undefined),
      city: cleanRegion(c.city, "city"),
      raceDate: v.raceDate,
      regStart: cleanText(v.regStart),
      regEnd: cleanText(v.regEnd),
      lotteryDate: cleanText(v.lotteryDate),
      regStatus: "pending",
      scale: cleanText(v.scale),
      events: events.length ? events : ["全程马拉松"],
      category: "B", // 标牌等级不轻信 AI，一律 B 类，人工核实后升级
      updatedAt: now.toISOString(),
    };
    race.regStatus = toStoredStatus(deriveStatus(race, now));
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
    added.push(race);
    console.log(`✓ 新入库: ${race.name} ${race.raceDate} [${race.regStatus}]`);
  }

  console.log(`完成：粗筛 ${candidates.length} 场 → 核实 ${shortlist.length} 场 → 新入库 ${added.length} 场，总计 ${races.length} 场${DRY ? "（dry-run，不写文件）" : ""}`);
  logUsage("新赛事巡检");
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
