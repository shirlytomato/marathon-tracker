import type { Race } from "@/types/race";
import { checkInterval } from "./schedule";

export interface UpdateHealth {
  lastSuccessfulRun: string | null;
  lastRun: { completedAt: string; succeeded: number; failed: number; failedNames?: string[] } | null;
}

/**
 * 单场联网调用超时是常态，不等于任务失败：日志里 5 次正常运行有 4 次带失败（6.7%~17.2%），
 * 而端点不可达的真故障是 79%~92%。阈值卡在两者之间，7 次历史运行全部分类正确。
 * 原判据 failed === 0 让 lastSuccessfulRun 只有约两成概率推进，实测自引入起一直是 null。
 */
const MAX_FAILURE_RATIO = 0.2;

export function recordRun(previous: UpdateHealth, succeeded: number, failed: number, completedAt: string, failedNames: string[] = []): UpdateHealth {
  const total = succeeded + failed;
  // 零待查时 ratio 为 0，沿用原语义：没有场次要查但任务正常完成，仍算一次完整运行
  const ratio = total > 0 ? failed / total : 0;
  return {
    lastSuccessfulRun: ratio <= MAX_FAILURE_RATIO ? completedAt : previous.lastSuccessfulRun,
    lastRun: { completedAt, succeeded, failed, failedNames },
  };
}

export function formatCheckedAt(value: string | null | undefined): string {
  const stamp = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(stamp)) return "暂无记录";
  return new Date(stamp + 8 * 3600000).toISOString().slice(0, 16).replace("T", " ");
}

export function summarizeFreshness(races: Race[], now: Date) {
  const timestamps = races.map(race => Date.parse(race.updatedAt))
    .filter(stamp => Number.isFinite(stamp) && stamp <= now.getTime());
  const daily = races.filter(race => checkInterval(race, now) === 1);
  const staleDaily = daily.filter(race => {
    const stamp = Date.parse(race.updatedAt);
    return !Number.isFinite(stamp) || stamp > now.getTime() || now.getTime() - stamp > 36 * 3600000;
  }).length;
  return {
    latestRecordAt: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,
    staleDaily,
    dailyCount: daily.length,
  };
}
