import type { Race } from "@/types/race";

const DAY = 86400000;
// 与 deriveStatus 同一时区口径：赛事日期一律按东八区解释，避免跨时区 runner 上判定漂移
const cst = (date: string, endOfDay = false) =>
  new Date(date + (endOfDay ? "T23:59:59+08:00" : "T00:00:00+08:00")).getTime();

/** 报名截止后仍保留月检的最短剩余天数：临近开赛再延期已无意义，直接停止复查 */
const CLOSED_GRACE_DAYS = 21;

/**
 * 复查间隔（天）。返回 null 表示该赛事已尘埃落定，永不再查、永不消耗 token。
 *
 * 判据只有一个：这条记录还可能出现变化吗？
 *   null —— 赛期已过（含已过月份，页面状态由日期自动推导）／已完赛／报名截止且临近开赛
 *   1    —— 报名中（盯截止与延期）；30 天内开赛却仍未公布报名时间（窗口随时可能开）
 *   7    —— 报名时间未公布且赛期 1~3 个月（等竞赛规程）；已公布但未开放（盯改期）
 *   30   —— 赛期 3 个月以上的远场；报名已截止但赛期尚远（盯延期与补报）
 *
 * 报名截止后保留月检是刻意的：国内赛事「报名延期／二次补报」常见，
 * 一旦彻底停查，站点会在赛期前一直显示「已截止」而实际还能报名。
 */
export function checkInterval(race: Race, now: Date): number | null {
  if (race.regStatus === "finished") return null;
  const raceT = cst(race.raceDate);
  if (Number.isNaN(raceT) || raceT < now.getTime()) return null; // 坏日期不重试，避免天天白烧
  const daysToRace = (raceT - now.getTime()) / DAY;
  const regEndT = race.regEnd ? cst(race.regEnd, true) : null;
  if (regEndT !== null && regEndT < now.getTime())
    return daysToRace > CLOSED_GRACE_DAYS ? 30 : null;
  if (race.regStatus === "open") return 1;
  if (!race.regStart && !race.regEnd) {
    if (daysToRace <= 30) return 1;
    if (daysToRace <= 90) return 7;
    return 30;
  }
  return 7;
}

/** 按 id 取稳定哈希做相位偏移：周检/月检赛事分散到不同日期，避免同一天扎堆 */
function hashPhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** 今天是否需要查这一场（无需持久化 lastCheckedAt，首次运行即已错峰） */
export function isDue(race: Race, now: Date): boolean {
  const iv = checkInterval(race, now);
  if (iv === null) return false;
  if (iv === 1) return true;
  return (Math.floor(now.getTime() / DAY) + hashPhase(race.id)) % iv === 0;
}

/** 分级统计：让每晚的查询量可观测，异常暴涨时能一眼看出是哪一级出了问题 */
export function summarizePlan(races: Race[], now: Date) {
  const plan = { daily: 0, weekly: 0, monthly: 0, never: 0 };
  for (const r of races) {
    const iv = checkInterval(r, now);
    if (iv === null) plan.never++;
    else if (iv === 1) plan.daily++;
    else if (iv <= 7) plan.weekly++;
    else plan.monthly++;
  }
  return plan;
}
