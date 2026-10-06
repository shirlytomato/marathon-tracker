// scripts/lib/validation.ts —— 数据管道的本地校验规则（纯函数，带单元测试）
// 背景：screenRace / validYear 原先埋在不导出的脚本里且模块加载即执行 main()，
// 无法被测试覆盖；抽到这里后 scripts 与测试共用同一份事实源。
// 注意：以下逻辑是从 discover-races.ts / update-status.ts 原样迁移，行为保持不变。

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 动态日期窗口：提示词与粗筛都不能写死日期，否则过期后巡检会全部失效
export interface DateWindow {
  today: string;
  halfYearLater: string;
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function buildWindow(nowMs: number = Date.now()): DateWindow {
  return {
    today: iso(nowMs),
    halfYearLater: iso(nowMs + 183 * 86400000),
  };
}

// 名称归一化：去掉年份、空白与全部标点后比较，避免"2026郑州马拉松"与"郑州马拉松"、
// "连云港·连岛半程马拉松"与"连云港连岛半程马拉松"重复入库（间隔号曾实测漏判）
export const norm = (s: string) =>
  s
    .replace(/20\d{2}/g, "")
    .replace(/[\s·･．.、，,;；:：!！?？\-—_/\\()（）[\]【】{}«»"'‘’“”]/g, "");

// 粗筛/核实共用的日期校验：返回不通过的原因，通过则返回 null
// —— 不合格的候选不进第二段核实，省下一次 API 调用
export function screenRace(
  raceDate: string,
  regStart?: string,
  regEnd?: string,
  win: DateWindow = buildWindow(),
): string | null {
  if (!DATE_RE.test(raceDate)) return `比赛日期格式非法(${raceDate})`;
  if (raceDate <= win.today) return `比赛日期已过(${raceDate})`;
  if (raceDate > win.halfYearLater) return `比赛日期超出半年窗口(${raceDate})`;
  const year = Number(raceDate.slice(0, 4));
  // 大型赛事常提前一年开放报名（如 2027 东京在 2026 年报名），允许同年或前一年
  const yearOk = (v?: string) => !v || (DATE_RE.test(v) && [year, year - 1].includes(Number(v.slice(0, 4))));
  if (!yearOk(regStart)) return `报名开始年份与赛期不符(${regStart})`;
  if (!yearOk(regEnd)) return `报名截止年份与赛期不符(${regEnd})`;
  if (regStart && regEnd && regStart > regEnd) return `报名开始晚于截止(${regStart}>${regEnd})`;
  if (regEnd && regEnd >= raceDate) return `报名截止不早于比赛日(${regEnd}>=${raceDate})`;
  return null;
}

// 日期年份防护：AI 可能返回往年数据（如给 2026 赛事填 2025 报名窗口），与赛事年份不符则丢弃
// （每日更新口径：报名/抽签日期必须与库内赛期同年；比 screenRace 更严，保持原行为不合并）
export function validYear(v: string, raceDate: string): boolean {
  return DATE_RE.test(v) && v.slice(0, 4) === raceDate.slice(0, 4);
}

// 三个日期凑在一起的自相矛盾检查（唯一口径，update-status 与 verify-data 共用）：
// 实测 2026-10-06 泰宁半程马拉松被 AI 填成"报名截止 = 比赛日"，单这一条就让整批 332 场
// 全部过不了发布前检测、当天数据停更 —— 复查环节必须先按此丢弃坏字段，不能留给门禁去挡整批。
export function dateConflict(r: { raceDate: string; regStart?: string; regEnd?: string }): string | null {
  if (r.regStart && r.regEnd && DATE_RE.test(r.regStart) && DATE_RE.test(r.regEnd) && r.regStart > r.regEnd)
    return `报名开始晚于截止(${r.regStart}>${r.regEnd})`;
  if (r.regEnd && DATE_RE.test(r.regEnd) && DATE_RE.test(r.raceDate) && r.regEnd >= r.raceDate)
    return `报名截止不早于比赛日(${r.regEnd}>=${r.raceDate})`;
  return null;
}

// ── AI 返回值清洗 ─────────────────────────────────────────────
// 背景：巡检入库的赛事里实测出现过 scale="空字符串"、events 含"马拉松"与"空字符串"、
// province="湖北省"、city="武汉市"。核实提示词要求"不确定则空字符串"，
// 模型有时把这句中文说明当成字段值原样返回；行政区划全称则会让前端按省份/城市
// 分组时把"湖北"与"湖北省"裂成两个筛选项。入库前一律归一。

// AI 表达"这一项没有值"的各种说法，一律视为缺字段
const PLACEHOLDER = /^(空字符串|无|null|none|未知|未公布|未确定|待定|暂无|n\/?a|[-—–])+$/i;

export function cleanText(v?: string | null): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return !s || PLACEHOLDER.test(s) ? undefined : s;
}

// 行政区划去后缀，与种子数据口径对齐："湖北省"→"湖北"、"济南市"→"济南"
export function cleanRegion(
  v?: string | null,
  kind: "province" | "city" = "province",
): string | undefined {
  const s = cleanText(v);
  if (!s) return undefined;
  if (kind === "city") return s.replace(/市$/, "") || s;
  // 五个自治区里只有新疆的官方全称不带「族」字，故民族名逐个列举
  return s.replace(/(维吾尔|壮族|回族|藏族|蒙古族)?自治区$|特别行政区$|省$|市$/, "") || s;
}

// 项目名归一：精确等于"马拉松"是巡检侧对"全程马拉松"的简写，与种子侧并集后
// 会出现同义重复值；"迷你马拉松"等合法项目名不匹配精确键，不受影响
const EVENT_ALIAS: Record<string, string> = { 马拉松: "全程马拉松" };

export function cleanEvents(list?: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  for (const raw of list) {
    const e = cleanText(typeof raw === "string" ? raw : undefined);
    if (e) seen.add(EVENT_ALIAS[e] ?? e);
  }
  return [...seen];
}

// ── 同场判定（防重复入库）─────────────────────────────────────
// 事故背景：种子数据用干净短名（"济南马拉松"），巡检入库用官方冠名全称
// （"2026恒丰银行济南(泉城)马拉松"），两套命名让精确去重失效，同一场赛事
// 在页面上出现两张卡。以下三条规则按误伤概率从低到高排列，后两条要求赛期相同。
export interface RaceLike {
  id: string;
  name: string;
  shortName?: string;
  raceDate: string;
  city?: string;
}

// 名称去掉城市名与项目后缀后的专名：用于分辨"城市主赛事"与"同城的另一场专项赛"
function properName(name: string, city: string): string {
  return norm(name)
    .replace(norm(city), "")
    .replace(/(半程|全程|女子|男子|接力|迷你)?马拉松(暨.*)?$/, "")
    .replace(/(半程|全程|女子|男子|接力|迷你)$/, "");
}

export function findDuplicate<T extends RaceLike>(
  cand: { name: string; raceDate?: string; city?: string },
  known: T[],
): T | undefined {
  const cn = norm(cand.name);
  if (!cn) return undefined;
  for (const r of known) {
    const rn = norm(r.name);
    const rs = r.shortName ? norm(r.shortName) : "";
    // 规则一：同年且归一化后同名（含命中简称）。
    //   必须限同年：伦敦马拉松、纽约马拉松等每年一届同名，
    //   不限年份会把 2027 届当成 2026 届跳过，真赛事永久漏收。
    if ((cn === rn || (rs && cn === rs)) && r.raceDate.slice(0, 4) === cand.raceDate?.slice(0, 4)) return r;
    if (!cand.raceDate || r.raceDate !== cand.raceDate) continue;
    // 规则二：同赛期且名称互为包含——"北京昌平马拉松"与"昌平马拉松"
    if (rn.length >= 4 && (cn.includes(rn) || rn.includes(cn))) return r;
    if (rs.length >= 4 && (cn.includes(rs) || rs.includes(cn))) return r;
    // 规则三：同赛期同城，且其中一条就是"城市名+马拉松"的城市主赛事，
    //   即冠名全称与城市短名的组合（济南案例）。两条各有专名时不拦——
    //   北京 04-19 同时有"城市副中心"与"亦庄"两场，误拦就会漏收。
    const city = cleanRegion(cand.city ?? r.city, "city");
    if (city && cn.includes(norm(city)) && rn.includes(norm(city))) {
      if (!properName(cand.name, city) || !properName(r.name, city)) return r;
    }
  }
  return undefined;
}
