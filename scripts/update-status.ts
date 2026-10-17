// scripts/update-status.ts —— 每日赛事进展更新（GitHub Actions 调用，支持 --dry-run）
// 查哪几场由 src/lib/schedule.ts 的分级调度决定（带单元测试），原则只有一条：
// 不可能再发生变化的赛事永不再查 —— 赛期已过／报名已截止且临近开赛的，一次 token 也不花。
// 新赛事的发现交给每周三次的新赛事巡检任务，不由本脚本承担。
import { existsSync, readFileSync, writeFileSync } from "fs";
import type { Race } from "../src/types/race";
import { deriveStatus, toStoredStatus } from "../src/lib/status";
import { recordRun, type UpdateHealth } from "../src/lib/freshness";
import { isDue, summarizePlan } from "../src/lib/schedule";
import { qwenSearch, logUsage } from "./lib/qwen";
import { siteReachable } from "./lib/site-reach";
import { collectSourceHints } from "../src/lib/evidence";
import { proposeDate, type DateProposal } from "./lib/date-review";
import { dateConflict, validYear } from "./lib/validation";

const DRY = process.argv.includes("--dry-run");
// --limit=N：只查前 N 场，用于花小钱验证链路与测 token 单价（生产不传此参数）
const LIMIT = Number(process.argv.find(a => a.startsWith("--limit="))?.slice(8) ?? 0);
const now = new Date();

const PROMPT = (r: Race) =>
  `请联网搜索"${r.name}"（${r.country}${r.province ?? ""}${r.city ?? ""}）${r.raceDate.slice(0, 4)} 年这一届的最新报名信息。` +
  // 不能把库内 raceDate 当事实喂给模型：实测会被锚定，模型明知有冲突也会顺着错值答，
  // 导致既有错误永远改不动（温州马拉松库内 12-06，实为官方公布的 11-22）
  `请独立核实该届比赛的确切日期，不要沿用任何既有记录；若与你查到的官方公告不一致，以官方公告为准。` +
  `信源优先级（必须按序采信）：1) 组委会官网/官方公众号的正式公告；2) 中国田径协会赛事目录；` +
  `3) 权威聚合平台（最酷zuicool.com、数字心动、本地宝）转载的官方公告。其他自媒体/营销号内容仅作参考，不得作为日期依据。` +
  `重要要求：日期必须来自上述官方公告，禁止根据往年经验推测或估算；` +
  `如果找不到确切的官方报名日期，对应字段必须返回空字符串。只返回一个 JSON 对象，不要包含其他文字：` +
  `{"regStart":"报名开始日期 YYYY-MM-DD，非官方确切信息则为空字符串","regEnd":"报名截止日期 YYYY-MM-DD，非官方确切信息则为空字符串",` +
  `"regStatus":"pending|open|drawing|closed|finished 之一","lotteryDate":"抽签日期 YYYY-MM-DD，无则为空字符串",` +
  `"raceDate":"核实后的比赛日期 YYYY-MM-DD","officialSite":"赛事官网URL，未知则为空字符串","note":"一句话摘要，注明来源","sourceUrls":["对应官方公告的完整URL；没有可用链接则返回空数组"]}`;

const VALID_STATUS = new Set(["pending", "open", "drawing", "closed", "finished"]);

// 模型说明和链接只作为候选线索；赛期变更一律经人工读取公告后复核。
async function main() {
  const path = "data/races.json";
  const races = JSON.parse(readFileSync(path, "utf8")) as Race[];
  const pending: DateProposal[] = existsSync("data/pending-reviews.json") ? JSON.parse(readFileSync("data/pending-reviews.json", "utf8")) : [];
  const due = races.filter(r => isDue(r, now));
  const targets = LIMIT > 0 ? due.slice(0, LIMIT) : due;
  const buckets = summarizePlan(races, now);
  console.log(`待更新 ${due.length}/${races.length} 场${LIMIT > 0 ? `（本次限制只查前 ${targets.length} 场）` : ""}${DRY ? "（dry-run，不写文件）" : ""}`);
  console.log(`  分级：每天盯 ${buckets.daily} 场｜周检 ${buckets.weekly} 场｜月检 ${buckets.monthly} 场｜已尘埃落定不再查 ${buckets.never} 场`);
  let ok = 0, fail = 0;
  const failedNames: string[] = [];
  const aiSites = new Set<string>(); // 本次由 AI 新写入/替换的官网，发布前检测对其严格把关
  for (const r of targets) {
    try {
      const parsed = JSON.parse(await qwenSearch(PROMPT(r)));
      const oldDate = r.raceDate;
      const note = typeof parsed.note === "string" ? parsed.note : "";
      const sources = collectSourceHints(r.sources, parsed.sourceUrls, now.toISOString());
      if (sources.length) r.sources = sources;
      const proposal = proposeDate(r, parsed.raceDate, parsed.sourceUrls, note, now.toISOString());
      if (proposal && !pending.some(item => item.id === proposal.id)) pending.push(proposal);
      const datePending = typeof parsed.raceDate === "string" && !!parsed.raceDate && parsed.raceDate !== oldDate;
      if (datePending) console.log(`  ⚠ 赛期候选待复核：${r.name} ${oldDate} → ${parsed.raceDate}（未应用）`);
      let discarded = datePending; // 本场是否丢弃过 AI 的日期字段
      // 改期待复核时不接收基于新赛期的报名日期/状态；其余仍逐字段校验：
      // 实测 2026-10-06 AI 把泰宁半程马拉松的报名截止填成比赛日，一条口误就让整批
      // 332 场卡在售前检测外、当天完全停更（门禁该挡的是脏数据入库，不是拖垮全量）。
      for (const k of ["regStart", "regEnd", "lotteryDate"] as const) {
        if (datePending) break;
        const v = parsed[k];
        // AI 返回空字符串：保留原值，不用空值覆盖已有数据
        if (typeof v !== "string" || !v || !validYear(v, r.raceDate)) continue;
        const before = r[k];
        (r as unknown as Record<string, unknown>)[k] = v;
        const bad = dateConflict(r);
        if (bad) {
          (r as unknown as Record<string, unknown>)[k] = before;
          discarded = true;
          console.log(`  ⚠ 丢弃 AI ${k}=${v}：${bad}（该场其余字段照常采用）`);
        }
      }
      const status = parsed.regStatus;
      // 日期都填不对的一场，它报的状态同样不可信（泰宁：截止=比赛日，却又说报名中）
      if (!discarded && typeof status === "string" && VALID_STATUS.has(status))
        r.regStatus = status as Race["regStatus"];
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
      // regStatus 以日期推导为准：AI 报的状态可能与它自己刚给出的日期矛盾
      // （实测 qwen3.7-plus：福州马拉松 regEnd 2026-09-19 未到，AI 却报 closed）
      // 且赛期未到的赛事禁止被标为 finished——否则会被分级调度永久排除、再也不会复查。
      // 窗口只填一半时同样要写回：deriveStatus 内部已保证「日期证不出的部分才采信库里值」，
      // 原先加了 r.regStart && r.regEnd 的前置条件，等于让「有开始日、无截止日」的赛事
      // （官方写「额满即止」的常见形态）永远拿不到纠正，AI 天天复查也修不动一行。
      r.regStatus = toStoredStatus(deriveStatus(r, now));
      r.updatedAt = new Date().toISOString();
      ok++;
      console.log(`✓ ${r.name}`);
    } catch (e) {
      fail++;
      failedNames.push(r.name);
      console.error(`✗ ${r.name}: ${(e as Error).message}`); // 单场失败保留旧数据
    }
  }
  console.log(`完成：成功 ${ok}，失败 ${fail}，待复核赛期候选 ${pending.length} 条`);
  logUsage(`每日复查${LIMIT > 0 ? `（样本 ${targets.length} 场）` : ""}`);
  if (!DRY) {
    // 抽样不推进全量任务状态；只有随发布前检测通过并推送的批次才会出现在网站。
    if (!LIMIT) {
      const healthPath = "data/update-health.json";
      const previous = JSON.parse(readFileSync(healthPath, "utf8")) as UpdateHealth;
      writeFileSync(healthPath, JSON.stringify(recordRun(previous, ok, fail, new Date().toISOString(), failedNames), null, 2) + "\n");
    }
    if (ok > 0) writeFileSync(path, JSON.stringify(races, null, 2));
    // 告知发布前检测：哪些官网是本次 AI 新写入的（需严格把关），其余为历史已核实官网（故障仅警告）
    writeFileSync("data/todaySites.json", JSON.stringify([...aiSites], null, 2));
    writeFileSync("data/pending-reviews.json", JSON.stringify(pending, null, 2) + "\n");
    // 兼容旧简报：本脚本不再自动应用赛期变更，审批历史见 review-history.json。
    writeFileSync("data/dateChanges.json", "[]");
  }
  if (ok === 0 && fail > 0) process.exit(1); // 全部失败 → Actions 标记失败，不提交坏数据
}

main();
