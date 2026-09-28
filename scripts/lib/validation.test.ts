// scripts/lib/validation.test.ts —— 数据管道本地校验规则的单元测试
// 背景：screenRace / validYear 原先埋在不导出的脚本里，零测试覆盖，修改极易引入回归。
import { describe, expect, it } from "vitest";
import { buildWindow, cleanEvents, cleanRegion, cleanText, findDuplicate, norm, screenRace, validYear } from "./validation";

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

describe("cleanText / cleanRegion / cleanEvents", () => {
  it("把 AI 返回的占位文本视为缺字段", () => {
    expect(cleanText("空字符串")).toBeUndefined();
    expect(cleanText(" 无 ")).toBeUndefined();
    expect(cleanText("25000人")).toBe("25000人");
  });

  it("行政区划去后缀，与种子数据口径对齐", () => {
    expect(cleanRegion("湖北省")).toBe("湖北");
    expect(cleanRegion("新疆维吾尔自治区")).toBe("新疆");
    expect(cleanRegion("广西壮族自治区")).toBe("广西");
    expect(cleanRegion("内蒙古自治区")).toBe("内蒙古");
    expect(cleanRegion("北京市")).toBe("北京");
    expect(cleanRegion("武汉市", "city")).toBe("武汉");
    expect(cleanRegion("石家庄", "city")).toBe("石家庄");
  });

  it("项目名归一：「马拉松」并到「全程马拉松」，占位值与合法专项均不误伤", () => {
    expect(cleanEvents(["马拉松", "半程马拉松"])).toEqual(["全程马拉松", "半程马拉松"]);
    expect(cleanEvents(["空字符串", "迷你马拉松"])).toEqual(["迷你马拉松"]);
    expect(cleanEvents(undefined)).toEqual([]);
  });
});

describe("findDuplicate", () => {
  const 库 = [
    { id: "济南马拉松", name: "济南马拉松", raceDate: "2026-10-25", city: "济南" },
    { id: "连云港连岛半程马拉松", name: "连云港连岛半程马拉松", raceDate: "2026-11-08" },
    { id: "昌平马拉松", name: "昌平马拉松", raceDate: "2026-10-25" },
    { id: "北京城市副中心马拉松", name: "北京城市副中心马拉松", raceDate: "2026-04-19", city: "北京" },
    { id: "上海马拉松", name: "上海马拉松", shortName: "上马", raceDate: "2026-11-29" },
  ];

  it("规则一：标点与年份变体算同一场", () => {
    expect(findDuplicate({ name: "连云港·连岛半程马拉松", raceDate: "2026-11-08" }, 库)?.id)
      .toBe("连云港连岛半程马拉松");
    expect(findDuplicate({ name: "上马", raceDate: "2026-11-29" }, 库)?.id).toBe("上海马拉松");
  });

  it("同名但跨年的每年一届赛事不算同一场（伦敦马拉松 2026/2027）", () => {
    const 伦敦 = [
      { id: "伦敦马拉松", name: "伦敦马拉松", raceDate: "2026-04-26" },
    ];
    expect(findDuplicate({ name: "伦敦马拉松（2027）", raceDate: "2027-04-25" }, 伦敦)).toBeUndefined();
  });

  it("规则二：同赛期且名称互为包含算同一场", () => {
    expect(findDuplicate({ name: "2026北京昌平马拉松", raceDate: "2026-10-25" }, 库)?.id)
      .toBe("昌平马拉松");
  });

  it("规则三：同赛期同城且一方是城市主赛事算同一场（济南冠名全称案例）", () => {
    expect(findDuplicate({ name: "恒丰银行济南(泉城)马拉松", raceDate: "2026-10-25", city: "济南市" }, 库)?.id)
      .toBe("济南马拉松");
  });

  it("两条各有专名时放行，同城同日不误拦", () => {
    expect(findDuplicate({ name: "北京亦庄半程马拉松", raceDate: "2026-04-19", city: "北京" }, 库)).toBeUndefined();
    expect(findDuplicate({ name: "武汉马拉松", raceDate: "2026-11-01", city: "武汉" }, 库)).toBeUndefined();
  });

  it("赛期不同则不走包含与同城规则", () => {
    expect(findDuplicate({ name: "2026北京昌平马拉松", raceDate: "2026-11-29" }, 库)).toBeUndefined();
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
