import type { Race, RegStatus, DisplayStatus } from "@/types/race";

const day = 86400000;
/** 日期一律按东八区解释，不受访客所在时区影响 */
const toDate = (s: string) => new Date(s + "T00:00:00+08:00").getTime();
/** 东八区的「自然日序号」：同一天里的任何时刻都落在同一个序号上 */
const beijingDayIndex = (t: number) => Math.floor((t + 8 * 3600000) / day);

/**
 * 距目标日期还剩几个自然日：当天 = 0，次日 = 1，已过 = 0。
 * 按自然日而不是按小时差取整：小时差向上取整的话，截止当天无论多晚
 * 都显示「还剩 1 天」，「今天截止」永远出不来。
 */
export function daysLeftUntil(dateStr: string, now: Date): number {
  return Math.max(0, beijingDayIndex(toDate(dateStr)) - beijingDayIndex(now.getTime()));
}

/**
 * 根据日期字段推导展示状态（数据管道的 regStatus 仅作为无日期字段时的兜底）。
 * 比赛日当天不算已结束：按自然日比较，当天是「today」，次日零点起才是「finished」。
 */
export function deriveStatus(race: Race, now: Date): DisplayStatus {
  const t = now.getTime();
  const dayGap = beijingDayIndex(toDate(race.raceDate)) - beijingDayIndex(t);
  if (dayGap < 0) return "finished";
  if (dayGap === 0) return "today";
  if (!race.regStart || !race.regEnd) return "pending";
  const s = toDate(race.regStart), e = toDate(race.regEnd);
  if (t < s) return "pending";
  if (t <= e + day) return "open";
  // 报名已截止
  if (race.needLottery && race.lotteryDate && toDate(race.lotteryDate) >= t - 3 * day) return "drawing";
  return "closed";
}

const order: Record<DisplayStatus, number> = { open: 0, today: 1, pending: 2, drawing: 3, closed: 4, finished: 5 };

/**
 * 写回数据文件时用："today" 只是展示层的状态，数据契约的 regStatus 仍只认 5 个值，
 * 比赛日当天按"报名已截止"入库（页面渲染时会按日期重新推导成今日开跑）。
 */
export const toStoredStatus = (s: DisplayStatus): RegStatus => (s === "today" ? "closed" : s);

/** open 按报名截止紧迫度升序，其余按比赛日期升序 */
export function sortRaces(races: Race[], now: Date): Race[] {
  return [...races].sort((a, b) => {
    const sa = deriveStatus(a, now), sb = deriveStatus(b, now);
    if (order[sa] !== order[sb]) return order[sa] - order[sb];
    const keyA = sa === "open" && a.regEnd ? toDate(a.regEnd) : toDate(a.raceDate);
    const keyB = sb === "open" && b.regEnd ? toDate(b.regEnd) : toDate(b.raceDate);
    return keyA - keyB;
  });
}

export function computeStats(races: Race[], now: Date) {
  const st = races.map(r => deriveStatus(r, now));
  return {
    open: st.filter(s => s === "open").length,
    drawing: st.filter(s => s === "drawing").length,
    countdown: st.filter(s => s === "closed").length,
  };
}
