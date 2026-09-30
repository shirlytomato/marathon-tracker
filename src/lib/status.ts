import type { Race, RegStatus } from "@/types/race";

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

/** 根据日期字段推导展示状态（数据管道的 regStatus 仅作为无日期字段时的兜底） */
export function deriveStatus(race: Race, now: Date): RegStatus {
  const t = now.getTime();
  if (toDate(race.raceDate) < t) return "finished";
  if (!race.regStart || !race.regEnd) return "pending";
  const s = toDate(race.regStart), e = toDate(race.regEnd);
  if (t < s) return "pending";
  if (t <= e + day) return "open";
  // 报名已截止
  if (race.needLottery && race.lotteryDate && toDate(race.lotteryDate) >= t - 3 * day) return "drawing";
  return "closed";
}

const order: Record<RegStatus, number> = { open: 0, pending: 1, drawing: 2, closed: 3, finished: 4 };

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
