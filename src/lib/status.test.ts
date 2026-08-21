import { describe, it, expect } from "vitest";
import { deriveStatus, sortRaces, computeStats } from "./status";
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
});

describe("sortRaces", () => {
  it("open 优先于 pending，pending 优先于 finished", () => {
    const open: Race = { ...base, id: "open", regStart: "2026-08-01", regEnd: "2026-09-01", regStatus: "open" };
    const pending: Race = { ...base, id: "pending" };
    const finished: Race = { ...base, id: "finished", raceDate: "2026-01-01", regStatus: "finished" };
    const sorted = sortRaces([finished, pending, open], now).map(r => r.id);
    expect(sorted).toEqual(["open", "pending", "finished"]);
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
