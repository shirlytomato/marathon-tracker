import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RaceEvidence from "./RaceEvidence";
import RaceCard from "./RaceCard";
import type { Race, RegistrationChannel } from "@/types/race";
vi.mock("../../data/pending-reviews.json", () => ({ default: [{ raceId: "demo", from: "2026-11-01" }] }));
const now = new Date("2026-10-16T04:00:00Z");
const race: Race = { id: "demo", name: "测试赛事", country: "中国", raceDate: "2026-11-01", regStatus: "open", events: ["全程马拉松"], category: "unknown", updatedAt: now.toISOString() };
it("无来源时点名缺哪项，不把官网称作直接报名链接", () => {
  const html = renderToStaticMarkup(createElement(RaceEvidence, { race, now }));
  expect(html).toContain("未收录：报名通道、来源公告，请以组委会公告为准。");
  expect(html).toContain("有赛期变更线索待复核");
  expect(html).not.toContain("暂无已核验");
  expect(html).not.toContain("待补充");
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
it("公众号报名无网址时显示报名指引而非入口链接，且不报通道未收录", () => {
  const item: Race = { ...race, registrationChannels: [{ name: "普通报名", kind: "general", status: "open", entranceType: "wechat_official", entranceHint: "微信搜索'测试赛事'公众号→菜单栏报名", sourceUrl: "https://example.org/notice", verifiedAt: now.toISOString() }] };
  const html = renderToStaticMarkup(createElement(RaceEvidence, { race: item, now }));
  expect(html).toContain("报名方式：微信公众号"); expect(html).toContain("菜单栏报名"); expect(html).toContain("核验公告");
  expect(html).not.toContain("未收录：报名通道");
});

// Issue #11 定论：officialSite 不再单独成链接行，并入「来源与报名通道」面板作为一条信息来源。
// 2026-11-02 补充口径：面板里已有通道核验公告时，官网与报名/信息类来源一并收起（见 panelLinks）。
describe("officialSite 并入来源，不单独成行", () => {
  const site = "https://example.org/site";
  const general = { name: "普通报名", kind: "general" as const, status: "open" as const, url: "https://example.org/entry", sourceUrl: "https://example.org/notice", verifiedAt: now.toISOString() };

  it("仅旧网站：卡片主行不单列网站，面板来源里给出赛事相关网站", () => {
    const html = renderToStaticMarkup(createElement(RaceCard, { race: { ...race, officialSite: site }, now }));
    expect(html).toContain("赛事相关网站 ↗");
    expect(html).toContain("组委会站点");
    expect(html.split(site).length - 1).toBe(1); // 只在面板来源出现一次
    expect(html).toContain("未收录：报名通道，请以组委会公告为准。");
    expect(html).not.toContain("未收录：报名通道、来源公告");
    expect(html).not.toContain("赛事官网");
    expect(html).not.toContain("官方报名");
  });
  it("有已核验普通通道：官网让位给公告，面板只剩一个核验网址", () => {
    const html = renderToStaticMarkup(createElement(RaceCard, { race: { ...race, officialSite: site, registrationChannels: [general] }, now }));
    expect(html).not.toContain("赛事相关网站");
    expect(html.split(site).length - 1).toBe(0);
    expect(html).toContain("核验公告");
    expect(html).not.toContain("赛事官网");
    expect(html).not.toContain("未收录：");
  });
  it("无网址普通通道与仅慈善通道：通道正常展示，官网不再列行", () => {
    const wechat = { name: "普通报名", kind: "general" as const, status: "open" as const, entranceType: "wechat_official" as const, entranceHint: "微信搜索'测试赛事'公众号→菜单栏报名", sourceUrl: "https://example.org/notice", verifiedAt: now.toISOString() };
    const charity = { name: "慈善名额", kind: "charity" as const, status: "open" as const, url: "https://example.org/charity", sourceUrl: "https://example.org/notice", verifiedAt: now.toISOString() };
    for (const [channels, entrance] of [[ [wechat], "报名方式：微信公众号" ], [ [charity], "查看慈善名额入口" ]] as [RegistrationChannel[], string][]) {
      const html = renderToStaticMarkup(createElement(RaceCard, { race: { ...race, officialSite: site, registrationChannels: channels }, now }));
      expect(html).toContain(entrance);
      expect(html).toContain("核验公告");
      expect(html).not.toContain("赛事相关网站");
      expect(html.split(site).length - 1).toBe(0);
      expect(html).not.toContain("赛事官网");
    }
  });
  it("同一 URL 已由通道或来源展示 -> 网站不再重复出现", () => {
    const asChannel = renderToStaticMarkup(createElement(RaceCard, { race: { ...race, officialSite: general.url, registrationChannels: [general] }, now }));
    expect(asChannel).not.toContain("赛事相关网站");
    expect(asChannel.split(general.url).length - 1).toBe(1);
    const asSource = renderToStaticMarkup(createElement(RaceCard, { race: { ...race, officialSite: site, sources: [{ url: site, scope: "general" as const, observedAt: now.toISOString() }] }, now }));
    expect(asSource).not.toContain("赛事相关网站");
    expect(asSource.split(site).length - 1).toBe(1);
  });
  it("无通道且无网站：不生成假链接，明确提示以组委会公告为准", () => {
    const html = renderToStaticMarkup(createElement(RaceEvidence, { race, now }));
    expect(html).toContain("未收录：报名通道、来源公告，请以组委会公告为准。");
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

// 2026-11-02 定：面板里有已核验通道公告时，报名/信息类来源与赛事网站一并收起，赛期与认证保留。
describe("通道公告优先：一台卡片只留一个核验网址", () => {
  const stamp = { observedAt: now.toISOString(), verifiedAt: now.toISOString() };
  const wechat = { name: "微信公众号报名", kind: "general" as const, status: "closed" as const, entranceType: "wechat_official" as const, entranceHint: "微信搜索「宝山体育」公众号报名", sourceUrl: "https://example.org/notice", verifiedAt: now.toISOString() };

  it("公众号通道 + 两条来源 + 官网：只剩核验公告一个网址", () => {
    const item: Race = { ...race, officialSite: "https://example.org/site", registrationChannels: [wechat], sources: [
      { url: "https://m.sh.bendibao.com/news/309597.html", scope: "registration", ...stamp },
      { url: "https://www.shio.gov.cn/notice.html", scope: "general", ...stamp }] };
    const html = renderToStaticMarkup(createElement(RaceEvidence, { race: item, now }));
    expect(html).toContain("核验公告");
    expect(html).not.toContain("bendibao");
    expect(html).not.toContain("shio.gov.cn");
    expect(html).not.toContain("赛事相关网站");
    expect(html).not.toContain("未收录：");
  });
  it("有通道时赛期与认证来源仍保留", () => {
    const item: Race = { ...race, registrationChannels: [wechat], sources: [
      { url: "https://example.org/date", scope: "raceDate", ...stamp },
      { url: "https://example.org/cat", scope: "category", ...stamp }] };
    const html = renderToStaticMarkup(createElement(RaceEvidence, { race: item, now }));
    expect(html).toContain("赛期核验于");
    expect(html).toContain("认证核验于");
  });
  it("只有通道公告、没有 sources 也不报「未收录：来源公告」", () => {
    const html = renderToStaticMarkup(createElement(RaceEvidence, { race: { ...race, registrationChannels: [wechat] }, now }));
    expect(html).not.toContain("未收录：");
    expect(html).toContain("核验公告");
  });
});

// 2026-11-02 定：今年版本的卡片不展示规模与报名费（数据字段保留，仅不再上页面），
// 缺值一律用「未收录」，报名窗口两种旧说法合并成一种。
describe("卡片次要信息与报名窗口的统一口径", () => {
  it("有规模有价格也不显示", () => {
    const html = renderToStaticMarkup(createElement(RaceCard, { race: { ...race, scale: "12000人", fee: "马拉松168元/半程139元", location: "福建省宁德市" }, now }));
    expect(html).not.toContain("12000人");
    expect(html).not.toContain("168元");
    expect(html).not.toContain("规模");
    expect(html).toContain("全程马拉松");
    expect(html).toContain("记录更新");
  });
  it("报名中但没截止日期 -> 报名日期未收录", () => {
    const html = renderToStaticMarkup(createElement(RaceCard, { race: { ...race, regStart: "2026-10-01" }, now }));
    expect(html).toContain("报名日期未收录");
    expect(html).not.toContain("待确认");
  });
  it("还没开放且整段窗口都没 -> 同一句报名日期未收录", () => {
    const html = renderToStaticMarkup(createElement(RaceCard, { race: { ...race, regStatus: "pending" }, now }));
    expect(html).toContain("报名日期未收录");
    expect(html).not.toContain("待确认");
  });
  it("通道只写额满即止、没公布截止日 -> 截止日期说未收录", () => {
    const quotaOnly: RegistrationChannel = { name: "最酷赛事报名", kind: "general", status: "open", url: "https://example.org/entry", sourceUrl: "https://example.org/notice", verifiedAt: now.toISOString(), regStart: "2026-09-29", requirements: "先报先得、额满即止" };
    const html = renderToStaticMarkup(createElement(RaceEvidence, { race: { ...race, registrationChannels: [quotaOnly] }, now }));
    expect(html).toContain("截止日期：未收录");
    expect(html).not.toContain("待确认");
  });
});
