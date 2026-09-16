import { describe, it, expect } from "vitest";
import { checkInterval, isDue, summarizePlan } from "./schedule";
import type { Race } from "@/types/race";

const now = new Date("2026-09-16T07:30:00+08:00");
const base: Race = {
  id: "t", name: "测试马拉松", country: "中国", raceDate: "2026-11-15",
  regStatus: "pending", events: ["全程马拉松"], category: "A",
  updatedAt: "2026-09-15T00:00:00Z",
};
/** 以 now 为基准偏移天数，生成 YYYY-MM-DD（东八区） */
const inDays = (n: number) =>
  new Date(now.getTime() + n * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });

describe("checkInterval：已尘埃落定的赛事永不再查", () => {
  it("赛期已过（含已过月份）-> null，即使 regStatus 仍停在 open/pending", () => {
    // 旧逻辑漏洞：只看 regStatus === "finished"，导致已跑完的赛事天天被重查
    expect(checkInterval({ ...base, raceDate: "2026-03-15", regStatus: "pending" }, now)).toBeNull();
    expect(checkInterval({ ...base, raceDate: inDays(-1), regStatus: "open" }, now)).toBeNull();
  });
  it("已完赛 -> null", () => {
    expect(checkInterval({ ...base, regStatus: "finished" }, now)).toBeNull();
  });
  it("报名已截止且临近开赛 -> null（此时延期已无意义）", () => {
    expect(checkInterval({ ...base, raceDate: inDays(10), regStart: inDays(-20), regEnd: inDays(-5) }, now)).toBeNull();
  });
  it("raceDate 非法 -> null（坏数据不天天重试）", () => {
    expect(checkInterval({ ...base, raceDate: "待定" }, now)).toBeNull();
  });
});

describe("checkInterval：报名截止后保留月检盯延期", () => {
  it("报名已截止但赛期尚远 -> 30 天", () => {
    expect(checkInterval({ ...base, raceDate: inDays(70), regStart: inDays(-30), regEnd: inDays(-10), regStatus: "closed" }, now)).toBe(30);
  });
});

describe("checkInterval：还会变化的赛事按紧迫度分级", () => {
  it("报名中 -> 每天", () => {
    expect(checkInterval({ ...base, regStart: inDays(-3), regEnd: inDays(4), regStatus: "open" }, now)).toBe(1);
  });
  it("30 天内开赛却仍未公布报名时间 -> 每天", () => {
    expect(checkInterval({ ...base, raceDate: inDays(20) }, now)).toBe(1);
  });
  it("赛期 1~3 个月且报名未公布 -> 每周", () => {
    expect(checkInterval({ ...base, raceDate: inDays(60) }, now)).toBe(7);
  });
  it("赛期 3 个月以上的远场 -> 每月", () => {
    expect(checkInterval({ ...base, raceDate: inDays(200) }, now)).toBe(30);
  });
  it("已公布报名日期但尚未开放 -> 每周盯改期", () => {
    expect(checkInterval({ ...base, raceDate: inDays(120), regStart: inDays(20), regEnd: inDays(40) }, now)).toBe(7);
  });
});

describe("isDue：错峰调度", () => {
  it("永不查的赛事任何一天都不 due", () => {
    const done = { ...base, raceDate: "2026-03-15" };
    for (let k = 0; k < 40; k++) expect(isDue(done, new Date(now.getTime() + k * 86400000))).toBe(false);
  });
  it("报名窗口未关闭期间恒 due", () => {
    // 注意 regEnd 必须晚于遍历窗口：报名一旦截止就该停查（见上面月检用例），不能恒 due
    const open = { ...base, regStart: inDays(-3), regEnd: inDays(10), regStatus: "open" as const };
    for (let k = 0; k < 7; k++) expect(isDue(open, new Date(now.getTime() + k * 86400000))).toBe(true);
  });
  it("周检赛事 7 天内恰好命中 1 次，月检 30 天内恰好命中 1 次", () => {
    const weekly = { ...base, id: "w", raceDate: inDays(60) };
    const monthly = { ...base, id: "m", raceDate: inDays(200) };
    const hits = (r: Race, days: number) =>
      Array.from({ length: days }, (_, k) => isDue(r, new Date(now.getTime() + k * 86400000))).filter(Boolean).length;
    expect(hits(weekly, 7)).toBe(1);
    expect(hits(monthly, 30)).toBe(1);
  });
  it("相位按 id 分散：同批周检赛事不会全挤在同一天", () => {
    const races = Array.from({ length: 30 }, (_, i) => ({ ...base, id: `r${i}`, raceDate: inDays(60) }));
    const dueToday = races.filter(r => isDue(r, now)).length;
    expect(dueToday).toBeGreaterThan(0);
    expect(dueToday).toBeLessThan(races.length);
  });
});

describe("summarizePlan", () => {
  it("四个桶之和等于总数，且每天级数量等于 isDue 恒真集合的下界", () => {
    const races: Race[] = [
      { ...base, id: "1", raceDate: "2026-03-15" },                                  // never
      { ...base, id: "2", regStart: inDays(-3), regEnd: inDays(4), regStatus: "open" },// daily
      { ...base, id: "3", raceDate: inDays(60) },                                     // weekly
      { ...base, id: "4", raceDate: inDays(200) },                                    // monthly
    ];
    const plan = summarizePlan(races, now);
    expect(plan).toEqual({ daily: 1, weekly: 1, monthly: 1, never: 1 });
    expect(plan.daily + plan.weekly + plan.monthly + plan.never).toBe(races.length);
  });
});
