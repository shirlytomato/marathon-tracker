import type { Race } from "../../src/types/race";
import { isCalendarDate, isHttpUrl } from "../../src/lib/evidence";
import { dateConflict } from "./validation";
import { deriveStatus, toStoredStatus } from "../../src/lib/status";

export interface DateProposal {
  id: string;
  raceId: string;
  from: string;
  to: string;
  proposedAt: string;
  sourceUrls: string[];
  note: string;
}
export function proposalId(raceId: string, from: string, to: string): string {
  return `${raceId}:${from}:${to}`;
}

// rejectedIds 是人工已驳回过的候选 id。驳回只把条目移出队列、不改库里的 raceDate，
// 所以下一轮模型照样会提同一个日期，同一条候选会反复入队（2026-10-31 伦敦 2027 实测长回来了）。
// 命中即视为已定案；原值或候选日期一变就是新候选，照常排队等复核。
export function proposeDate(race: Race, value: unknown, sourceUrls: unknown, note: string, now: string, rejectedIds: ReadonlySet<string> = new Set()): DateProposal | null {
  if (!isCalendarDate(value) || value === race.raceDate || value.slice(0, 4) !== race.raceDate.slice(0, 4)) return null;
  const id = proposalId(race.id, race.raceDate, value);
  if (rejectedIds.has(id)) return null;
  return { id, raceId: race.id, from: race.raceDate, to: value, proposedAt: now,
    sourceUrls: Array.isArray(sourceUrls) ? [...new Set(sourceUrls.filter(isHttpUrl))].slice(0, 5) : [], note };
}

export function approveDate(races: Race[], proposal: DateProposal, sourceUrl: string, now: string): Race[] {
  if (!isHttpUrl(sourceUrl)) throw new Error("必须提供人工核验的公告 URL");
  const race = races.find(race => race.id === proposal.raceId);
  if (!race || race.raceDate !== proposal.from) throw new Error("记录已变化，需重新复核，不能覆盖新数据");
  if (!isCalendarDate(proposal.to) || proposal.to.slice(0, 4) !== race.raceDate.slice(0, 4)) throw new Error("候选赛期非法或跨届");
  const next: Race = { ...race, raceDate: proposal.to, updatedAt: now,
    sources: [...(race.sources ?? []).filter(source => source.scope !== "raceDate"),
      { url: sourceUrl, scope: "raceDate", observedAt: now, verifiedAt: now }],
  };
  const conflict = dateConflict(next);
  if (conflict) throw new Error(conflict);
  if (next.registrationChannels?.some(channel => channel.regEnd && channel.regEnd >= next.raceDate)) throw new Error("报名通道截止日期不早于新赛期");
  next.regStatus = toStoredStatus(deriveStatus(next, new Date(now)));
  return races.map(item => item.id === race.id ? next : item);
}
