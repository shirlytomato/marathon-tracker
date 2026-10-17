import { it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RegistrationList from "./RegistrationList";
import type { Race } from "@/types/race";
const race: Race = { id: "demo", name: "测试报名赛事", country: "中国", raceDate: "2027-01-01", regStatus: "open", regStart: "2026-10-01", events: ["半程马拉松"], category: "B", updatedAt: "2026-10-16T00:00:00Z", needLottery: true, fee: "200元" };
const now = new Date("2026-10-16T12:00:00+08:00");
it("报名赛事包含项目、费用、抽签、完整年份与缺失信息说明", () => {
  const html = renderToStaticMarkup(createElement(RegistrationList, { races: [race], now }));
  for (const text of ["半程马拉松", "200元", "需抽签", "2027", "报名截止日期待确认", "赛事相关网站与报名通道均待补充"]) expect(html).toContain(text);
  expect(html).not.toContain("报名时间暂未公布");
});
it("空列表不创建空栏目，多于三场提供手机展开入口", () => {
  expect(renderToStaticMarkup(createElement(RegistrationList, { races: [], now }))).toBe("");
  const races = Array.from({ length: 4 }, (_, index) => ({ ...race, id: String(index) }));
  expect(renderToStaticMarkup(createElement(RegistrationList, { races, now }))).toContain("查看全部 4 场报名赛事");
});
