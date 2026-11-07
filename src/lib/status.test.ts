import { describe, it, expect } from "vitest";
import { deriveStatus, sortRaces, computeStats, daysLeftUntil, toStoredStatus } from "./status";
import type { Race } from "@/types/race";

const now = new Date("2026-08-21T08:00:00+08:00");
const base: Race = {
  id: "t", name: "测试马拉松", country: "中国", raceDate: "2026-11-08",
  regStatus: "pending", events: ["全程马拉松"], category: "A",
  updatedAt: "2026-08-20T00:00:00Z",
};

describe("deriveStatus", () => {
  it("比赛日已过 -> finished", () => {
    expect(deriveStatus({ ...base, raceDate: "2026-08-01" }, now)).toBe("finished");
  });
  it("比赛日当天 -> today，不提前标已结束", () => {
    expect(deriveStatus({ ...base, raceDate: "2026-08-21" }, now)).toBe("today");
  });
  it("比赛日当天深夜 -> 仍是 today", () => {
    expect(deriveStatus({ ...base, raceDate: "2026-08-21" }, new Date("2026-08-21T23:59:00+08:00"))).toBe("today");
  });
  it("比赛日次日凌晨 -> finished", () => {
    expect(deriveStatus({ ...base, raceDate: "2026-08-21" }, new Date("2026-08-22T00:05:00+08:00"))).toBe("finished");
  });
  it("报名窗口内 -> open", () => {
    expect(deriveStatus({ ...base, regStart: "2026-08-12", regEnd: "2026-09-01" }, now)).toBe("open");
  });
  it("报名未开始 -> pending", () => {
    expect(deriveStatus({ ...base, regStart: "2026-09-01", regEnd: "2026-09-30" }, now)).toBe("pending");
  });
  it("报名已截止且未抽签 -> drawing", () => {
    expect(deriveStatus({ ...base, regStart: "2026-06-01", regEnd: "2026-07-01", needLottery: true, lotteryDate: "2026-09-07" }, now)).toBe("drawing");
  });
  it("报名截止且抽签已完成 -> closed", () => {
    expect(deriveStatus({ ...base, regStart: "2026-04-01", regEnd: "2026-05-01", needLottery: true, lotteryDate: "2026-06-30" }, now)).toBe("closed");
  });
  it("报名截止无需抽签 -> closed", () => {
    expect(deriveStatus({ ...base, regStart: "2026-05-01", regEnd: "2026-06-01" }, now)).toBe("closed");
  });
  it("无报名信息且比赛未到 -> pending", () => {
    expect(deriveStatus(base, now)).toBe("pending");
  });
  it("窗口不完整且日期证不出结论 -> 用数据管道的 regStatus 兜底，不强制显示待开放", () => {
    // 泰宁半程马拉松实测形态：只有开始日没有截止日，人工已确认报满截止
    expect(deriveStatus({ ...base, regStart: "2026-07-02", regStatus: "closed" }, now)).toBe("closed");
    // 只有截止日且还没到：无法证明报名已开始，采信库里
    expect(deriveStatus({ ...base, regEnd: "2026-09-22", regStatus: "open" }, now)).toBe("open");
  });
  it("赛期未到却残留 finished 标记 -> 按日期判，不显示已结束", () => {
    expect(deriveStatus({ ...base, regStatus: "finished" }, now)).toBe("pending");
  });
});

describe("deriveStatus：窗口只填一半时用已知的那一端证伪库里状态", () => {
  // 官方公告常见只给一端（"即日起开放报名，额满即止"），原先整段兜底让这类赛事
  // 的状态永远停在库里旧值，AI 天天复查也修不动。
  it("只公布开始日且已开始 -> 库里停在筹备中也要改成报名中", () => {
    // 实测形态：临沂马拉松 2026-06-01 起、日照马拉松 2026-07-01 起，页面长期显示筹备中
    expect(deriveStatus({ ...base, regStart: "2026-06-01", regStatus: "pending" }, now)).toBe("open");
  });
  it("只公布截止日且已过 -> 库里停在筹备中也要改成已截止", () => {
    // 实测形态：清迈马拉松截止 2026-08-31，截止后仍标 pending
    expect(deriveStatus({ ...base, regEnd: "2026-08-01", regStatus: "pending" }, now)).toBe("closed");
  });
  it("只公布开始日且还没到 -> 库里停在报名中要收回筹备中", () => {
    expect(deriveStatus({ ...base, regStart: "2026-09-01", regStatus: "open" }, now)).toBe("pending");
  });
  it("截止未过却按人工标记显示已截止（额满即止）", () => {
    expect(deriveStatus({ ...base, regEnd: "2026-09-22", regStatus: "closed" }, now)).toBe("closed");
  });
  it("半窗口也能进抽签中", () => {
    const raced = { ...base, regEnd: "2026-08-01", regStatus: "open" as const, needLottery: true, lotteryDate: "2026-08-25" };
    expect(deriveStatus(raced, now)).toBe("drawing");
  });
  it("已开始且截止未知时写回库里的也是报名中（自愈的前提）", () => {
    expect(toStoredStatus(deriveStatus({ ...base, regStart: "2026-06-01", regStatus: "pending" }, now))).toBe("open");
  });
});

describe("daysLeftUntil", () => {
  it("截止当天上午 -> 0（今天截止）", () => {
    expect(daysLeftUntil("2026-09-30", new Date("2026-09-30T09:37:00+08:00"))).toBe(0);
  });
  it("截止当天深夜 -> 仍为 0，不会退回 1", () => {
    expect(daysLeftUntil("2026-09-30", new Date("2026-09-30T23:58:00+08:00"))).toBe(0);
  });
  it("明天截止 -> 1（不按小时向上取整成 2）", () => {
    expect(daysLeftUntil("2026-09-30", new Date("2026-09-29T10:55:00+08:00"))).toBe(1);
  });
  it("截止日已过 -> 0", () => {
    expect(daysLeftUntil("2026-09-30", new Date("2026-10-05T08:00:00+08:00"))).toBe(0);
  });
  it("海外访客按北京时间算：utc 凌晨已是北京当天 -> 0", () => {
    expect(daysLeftUntil("2026-09-30", new Date("2026-09-30T01:00:00Z"))).toBe(0);
  });
});

describe("sortRaces", () => {
  it("open 优先于 pending，pending 优先于 finished", () => {
    const open: Race = { ...base, id: "open", regStart: "2026-08-01", regEnd: "2026-09-01", regStatus: "open" };
    const pending: Race = { ...base, id: "pending" };
    const finished: Race = { ...base, id: "finished", raceDate: "2026-01-01", regStatus: "finished" };
    const sorted = sortRaces([finished, pending, open], now).map(r => r.id);
    expect(sorted).toEqual(["open", "pending", "finished"]);
  });
  it("today 排在 open 之后、pending 之前", () => {
    const open: Race = { ...base, id: "open", regStart: "2026-08-01", regEnd: "2026-09-01", regStatus: "open" };
    const today: Race = { ...base, id: "today", raceDate: "2026-08-21" };
    const pending: Race = { ...base, id: "pending" };
    expect(sortRaces([pending, today, open], now).map(r => r.id)).toEqual(["open", "today", "pending"]);
  });
});

describe("computeStats", () => {
  it("统计报名中/抽签中/备赛倒计时", () => {
    const races: Race[] = [
      { ...base, id: "1", regStatus: "open", regStart: "2026-08-01", regEnd: "2026-09-01" },
      { ...base, id: "2", regStatus: "drawing", regStart: "2026-06-01", regEnd: "2026-07-01", needLottery: true, lotteryDate: "2026-09-07" },
      { ...base, id: "3", regStatus: "closed", regStart: "2026-04-01", regEnd: "2026-05-01" },
    ];
    const s = computeStats(races, now);
    expect(s.open).toBe(1); expect(s.drawing).toBe(1); expect(s.countdown).toBe(1);
  });
});
