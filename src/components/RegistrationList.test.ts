import { it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RegistrationList from "./RegistrationList";
import type { Race } from "@/types/race";
const race: Race = { id: "demo", name: "测试报名赛事", country: "中国", raceDate: "2027-01-01", regStatus: "open", regStart: "2026-10-01", events: ["半程马拉松"], category: "B", updatedAt: "2026-10-16T00:00:00Z", needLottery: true, fee: "200元" };
const now = new Date("2026-10-16T12:00:00+08:00");
it("报名赛事包含项目、抽签、完整年份，缺项统一说未收录且不显示报名费", () => {
  const html = renderToStaticMarkup(createElement(RegistrationList, { races: [race], now }));
  for (const text of ["半程马拉松", "需抽签", "2027", "报名日期未收录", "未收录：报名通道、来源公告，请以组委会公告为准。"]) expect(html).toContain(text);
  expect(html).not.toContain("200元");
  expect(html).not.toContain("报名时间暂未公布");
  expect(html).not.toContain("均待补充");
});
it("「未收录」只在来源面板里说一次，卡片外不重复", () => {
  const html = renderToStaticMarkup(createElement(RegistrationList, { races: [race], now }));
  expect(html.split("未收录：报名通道、来源公告").length - 1).toBe(1);
});
it("空列表不创建空栏目，多于三场提供手机展开入口", () => {
  expect(renderToStaticMarkup(createElement(RegistrationList, { races: [], now }))).toBe("");
  const races = Array.from({ length: 4 }, (_, index) => ({ ...race, id: String(index) }));
  expect(renderToStaticMarkup(createElement(RegistrationList, { races, now }))).toContain("查看全部 4 场报名赛事");
});
