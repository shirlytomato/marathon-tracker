import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RaceEvidence from "./RaceEvidence";
import RaceCard from "./RaceCard";
import type { Race } from "@/types/race";
vi.mock("../../data/pending-reviews.json", () => ({ default: [{ raceId: "demo", from: "2026-11-01" }] }));
const now = new Date("2026-10-16T04:00:00Z");
const race: Race = { id: "demo", name: "测试赛事", country: "中国", raceDate: "2026-11-01", regStatus: "open", events: ["全程马拉松"], category: "unknown", updatedAt: now.toISOString() };
it("无来源时明确提示，不把官网称作直接报名链接", () => {
  const html = renderToStaticMarkup(createElement(RaceEvidence, { race, now }));
  expect(html).toContain("暂无已核验"); expect(html).toContain("来源公告待补充"); expect(html).toContain("有赛期变更线索待复核");
});
it("人工证据和模型线索分开展示，未知认证不显示为 B 类", () => {
  const item: Race = { ...race, sources: [{ url: "https://example.org/hint", scope: "general", observedAt: now.toISOString() }, { url: "https://example.org/notice", scope: "raceDate", observedAt: now.toISOString(), verifiedAt: now.toISOString() }] };
  const html = renderToStaticMarkup(createElement(RaceCard, { race: item, now }));
  expect(html).toContain("认证待核验"); expect(html).toContain("模型提供的线索"); expect(html).toContain("赛期核验于");
});
it("慈善通道明确说明报名类型和资格条件", () => {
  const item: Race = { ...race, registrationChannels: [{ name: "公益跑者", kind: "charity", status: "open", url: "https://example.org/charity", sourceUrl: "https://example.org/notice", verifiedAt: now.toISOString(), requirements: "需完成最低筹款额度" }] };
  const html = renderToStaticMarkup(createElement(RaceEvidence, { race: item, now }));
  expect(html).toContain("查看慈善名额入口"); expect(html).toContain("需完成最低筹款额度"); expect(html).toContain("核验公告");
});
it("公众号报名无网址时显示报名指引而非入口链接，且不显示暂无通道提示", () => {
  const item: Race = { ...race, registrationChannels: [{ name: "普通报名", kind: "general", status: "open", entranceType: "wechat_official", entranceHint: "微信搜索'测试赛事'公众号→菜单栏报名", sourceUrl: "https://example.org/notice", verifiedAt: now.toISOString() }] };
  const html = renderToStaticMarkup(createElement(RaceEvidence, { race: item, now }));
  expect(html).toContain("报名方式：微信公众号"); expect(html).toContain("菜单栏报名"); expect(html).toContain("核验公告");
  expect(html).not.toContain("暂无已核验");
});

// Issue #11：官网链接与报名通道不再同屏争抢，措辞按是否已有已核验普通通道分开
describe("官网链接的主次与措辞", () => {
  const site = "https://example.org/site";
  const general = { name: "普通报名", kind: "general" as const, status: "open" as const, url: "https://example.org/entry", sourceUrl: "https://example.org/notice", verifiedAt: now.toISOString() };

  it("仅旧网站：主信息行兜底叫「赛事相关网站」，面板提示报名方式待核验", () => {
    const html = renderToStaticMarkup(createElement(RaceCard, { race: { ...race, officialSite: site }, now }));
    expect(html).toContain("赛事相关网站 ↗");
    expect(html).toContain("报名方式待核验，可先查看赛事相关网站");
    expect(html).not.toContain("赛事官网");
    expect(html).not.toContain("官方报名");
  });
  it("有已核验普通通道：官网移到详情里作次级入口，主信息行不再出现", () => {
    const item: Race = { ...race, officialSite: site, registrationChannels: [general] };
    const card = renderToStaticMarkup(createElement(RaceCard, { race: item, now }));
    const panel = renderToStaticMarkup(createElement(RaceEvidence, { race: item, now }));
    expect(panel).toContain("赛事官网 ↗");
    expect(panel).toContain("规程、领物、交通等信息");
    expect(card.split("赛事相关网站").length - 1).toBe(0);
    expect(card.split(site).length - 1).toBe(1); // 只在详情里出现一次
  });
  it("主次链接相同：同一 URL 全卡片只出现一次", () => {
    const item: Race = { ...race, officialSite: general.url, registrationChannels: [general] };
    const html = renderToStaticMarkup(createElement(RaceCard, { race: item, now }));
    expect(html.split(general.url).length - 1).toBe(1);
  });
  it("完全缺链接：不生成假链接，明确提示以组委会公告为准", () => {
    const html = renderToStaticMarkup(createElement(RaceEvidence, { race, now }));
    expect(html).toContain("暂无已核验的直接报名通道，请以组委会公告为准");
    expect(html).not.toContain("赛事相关网站");
  });
  it("通道已截止时不显示暗示现在可报名的文案", () => {
    const closed = { ...general, status: "closed" as const, regStart: "2026-09-01", regEnd: "2026-09-30" };
    const html = renderToStaticMarkup(createElement(RaceEvidence, { race: { ...race, registrationChannels: [closed] }, now }));
    expect(html).toContain("查看通道说明 ↗");
    expect(html).not.toContain("查看普通报名入口");
    expect(html).toContain("已截止");
  });
});
