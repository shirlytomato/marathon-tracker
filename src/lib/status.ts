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

/** 已维护通道时，汇总状态仅代表普通报名；慈善/旅行通道不借用其状态。 */
export function withGeneralRegistration(race: Race): Race {
  const general = race.registrationChannels?.find(channel => channel.kind === "general");
  if (general) return { ...race, regStart: general.regStart, regEnd: general.regEnd, regStatus: general.status };
  return race.registrationChannels?.length ? { ...race, regStart: undefined, regEnd: undefined, regStatus: "pending" } : race;
}

/** 报名截止之后：抽签结果还没出且离截止不远算「抽签中」，否则「已截止」 */
function pastDeadline(race: Race, t: number): DisplayStatus {
  return race.needLottery && race.lotteryDate && toDate(race.lotteryDate) >= t - 3 * day ? "drawing" : "closed";
}

/**
 * 根据日期字段推导展示状态（数据管道的 regStatus 仅在日期推不出结论时兜底）。
 * 比赛日当天不算已结束：按自然日比较，当天是「today」，次日零点起才是「finished」。
 */
export function deriveStatus(race: Race, now: Date): DisplayStatus {
  race = withGeneralRegistration(race);
  const t = now.getTime();
  const dayGap = beijingDayIndex(toDate(race.raceDate)) - beijingDayIndex(t);
  if (dayGap < 0) return "finished";
  if (dayGap === 0) return "today";
  const start = race.regStart ? toDate(race.regStart) : null;
  const end = race.regEnd ? toDate(race.regEnd) : null;
  if (start !== null && end !== null) {
    if (t < start) return "pending";
    if (t < end + day) return "open";
    return pastDeadline(race, t);
  }
  // 窗口只填一半（官方只公布一端，或「额满即止」压根没有截止日）时，
  // 已公布的那一端照样能证伪库里状态，必须先用它；剩下证不出的部分才交给 regStatus。
  // 原先整段兜底会让状态永不自愈：实测 2026-10-17 有 10 场「报名早已开始、页面仍显示筹备中」，
  // 其中清迈马拉松截止日过了一个多月还停在 pending。
  if (start !== null && t < start) return "pending";
  if (end !== null && t >= end + day) return pastDeadline(race, t);
  // 报名已开始、截止未知：库里标了截止/抽签就采信（额满即止只有人工知道），否则就是报名中
  if (start !== null && race.regStatus !== "closed" && race.regStatus !== "drawing") return "open";
  // finished 不参与兜底：赛期未到的 finished 是管道里的陈旧标记，
  // 是否已结束一律由上面的日期比较说了算，否则会把还没跑的赛事显示成已结束。
  return race.regStatus === "finished" ? "pending" : race.regStatus;
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
    a = withGeneralRegistration(a);
    b = withGeneralRegistration(b);
    const sa = deriveStatus(a, now), sb = deriveStatus(b, now);
    if (order[sa] !== order[sb]) return order[sa] - order[sb];
    const keyA = sa === "open" ? (a.regEnd ? toDate(a.regEnd) : Infinity) : toDate(a.raceDate);
    const keyB = sb === "open" ? (b.regEnd ? toDate(b.regEnd) : Infinity) : toDate(b.raceDate);
    return (keyA - keyB) || toDate(a.raceDate) - toDate(b.raceDate);
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
