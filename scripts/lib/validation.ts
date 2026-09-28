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

// 名称归一化：去掉年份与空白后比较，避免"2026郑州马拉松"与"郑州马拉松"重复入库
export const norm = (s: string) => s.replace(/20\d{2}/g, "").replace(/\s+/g, "");

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
