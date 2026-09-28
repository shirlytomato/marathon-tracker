// scripts/lib/validation.test.ts —— 数据管道本地校验规则的单元测试
// 背景：screenRace / validYear 原先埋在不导出的脚本里，零测试覆盖，修改极易引入回归。
import { describe, expect, it } from "vitest";
import { buildWindow, norm, screenRace, validYear } from "./validation";

// 固定窗口，避免测试随真实日期漂移
const WIN = { today: "2026-09-28", halfYearLater: "2027-03-30" };

describe("screenRace", () => {
  it("合法候选全部通过", () => {
    expect(screenRace("2026-12-06", "2026-09-01", "2026-11-01", WIN)).toBeNull();
    // 大型赛事提前一年开放报名（2027 东京在 2026 年报名）
    expect(screenRace("2027-03-01", "2026-08-15", "2026-09-15", WIN)).toBeNull();
    // 报名日期可缺省
    expect(screenRace("2026-12-06", undefined, undefined, WIN)).toBeNull();
  });

  it("拦截非法日期格式", () => {
    expect(screenRace("2026-12-6", undefined, undefined, WIN)).toContain("格式非法");
    expect(screenRace("20261206", undefined, undefined, WIN)).toContain("格式非法");
  });

  it("拦截已过与超半年窗口的赛期", () => {
    expect(screenRace("2026-09-28", undefined, undefined, WIN)).toContain("已过");
    expect(screenRace("2026-09-27", undefined, undefined, WIN)).toContain("已过");
    expect(screenRace("2027-03-31", undefined, undefined, WIN)).toContain("超出半年窗口");
    // 边界：恰好等于窗口端点，halfYearLater 当天放行、today 当天拦截
    expect(screenRace("2027-03-30", undefined, undefined, WIN)).toBeNull();
  });

  it("报名窗口年份污染拦截与放行边界（与原脚本同口径）", () => {
    // 拦截：报名日期填了前两年（2024）而赛期在 2026，仅允许同年或前一年（2025）
    expect(screenRace("2026-12-06", "2024-09-01", undefined, WIN)).toContain("报名开始年份");
    expect(screenRace("2026-12-06", undefined, "2024-11-01", WIN)).toContain("报名截止年份");
    // 放行：赛期年初 + 前一年下半年报名（如 2027-01 赛事在 2026 年报名），与原实现一致不拦
    expect(screenRace("2027-01-10", "2026-09-01", undefined, WIN)).toBeNull();
  });

  it("拦截报名窗口自相矛盾", () => {
    expect(screenRace("2026-12-06", "2026-11-10", "2026-11-01", WIN)).toContain("晚于截止");
    expect(screenRace("2026-12-06", "2026-11-01", "2026-12-06", WIN)).toContain("不早于比赛日");
  });
});

describe("validYear", () => {
  it("只放行与赛期同年的合法日期", () => {
    expect(validYear("2026-10-01", "2026-12-06")).toBe(true);
    expect(validYear("2025-10-01", "2026-12-06")).toBe(false); // 往年数据污染
    expect(validYear("2027-10-01", "2026-12-06")).toBe(false);
  });

  it("格式非法一律拒绝", () => {
    expect(validYear("2026-1-1", "2026-12-06")).toBe(false);
    expect(validYear("2026", "2026-12-06")).toBe(false);
  });
});

describe("norm", () => {
  it("去年份去空白后比对，避免同赛事重复入库", () => {
    expect(norm("2026郑州马拉松")).toBe(norm("郑州马拉松"));
    expect(norm("2026 郑州 马拉松")).toBe(norm("郑州马拉松"));
    expect(norm("上海马拉松")).not.toBe(norm("上海嘉定半程马拉松"));
  });
});

describe("buildWindow", () => {
  it("today 与 halfYearLater 相差 183 天且为 YYYY-MM-DD", () => {
    const base = Date.UTC(2026, 0, 1);
    const win = buildWindow(base);
    expect(win.today).toBe("2026-01-01");
    expect(win.halfYearLater).toBe("2026-07-03");
  });
});
