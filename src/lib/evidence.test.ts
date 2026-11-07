import { describe, it, expect } from "vitest";
import { collectSourceHints, isCalendarDate, isHttpUrl, panelLinks, siteAsSource, unrecordedLine, validChannels, validSources } from "./evidence";
import { deriveStatus, withGeneralRegistration } from "./status";
import { schemaIssues, loadSchema } from "../../scripts/lib/schema";
import type { Race, RegistrationChannel } from "@/types/race";
const now = new Date("2026-10-16T12:00:00+08:00");
export const channel: RegistrationChannel = { name: "普通报名", kind: "general", url: "https://example.org/entry", sourceUrl: "https://example.org/notice", verifiedAt: now.toISOString(), status: "closed", regStart: "2026-09-01", regEnd: "2026-09-30" };
const race: Race = { id: "demo", name: "测试赛事", country: "中国", raceDate: "2026-11-01", regStatus: "open", regStart: "2026-10-01", regEnd: "2026-10-30", events: ["全程马拉松"], category: "B", updatedAt: now.toISOString() };

describe("来源与报名通道契约", () => {
  it("只允许有效 HTTP URL 和真实日期", () => {
    for (const value of ["javascript:alert(1)", "data:text/html,x", "https://name:secret@example.org", "not a url"]) expect(isHttpUrl(value)).toBe(false);
    expect(isHttpUrl("https://example.org/notice")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2028-02-29")).toBe(true);
  });
  it("模型不能通过输入注入人工认证，重复 URL 不累积", () => {
    const sources = collectSourceHints([], ["https://example.org/notice", "https://example.org/notice", "javascript:x", { url: "https://x.org", verifiedAt: now.toISOString() }], now.toISOString());
    expect(sources).toEqual([{ url: "https://example.org/notice", scope: "general", observedAt: now.toISOString() }]);
    expect(collectSourceHints(sources, [sources[0].url], now.toISOString())).toEqual(sources);
    expect(validSources([{ ...sources[0], verifiedAt: "bad" }])).toBe(false);
    expect(validSources([{ ...sources[0], invented: true }])).toBe(false);
  });
  it("通道必须带人工核验、公告、有效状态和正确窗口", () => {
    expect(validChannels([channel])).toBe(true);
    for (const patch of [{ verifiedAt: undefined }, { sourceUrl: "javascript:x" }, { status: "maybe" }, { regEnd: "2026-02-30" }, { regStart: "2026-10-01" }]) expect(validChannels([{ ...channel, ...patch }])).toBe(false);
    expect(validChannels([channel, { ...channel, url: "https://example.org/another" }])).toBe(false);
  });
  it("公众号/小程序报名可无网址，用报名指引代替；url 与指引至少其一", () => {
    const wechat: RegistrationChannel = { name: "普通报名", kind: "general", entranceType: "wechat_official", entranceHint: "微信搜索'测试赛事'公众号→菜单栏报名", sourceUrl: "https://example.org/notice", verifiedAt: now.toISOString(), status: "open" };
    expect(validChannels([wechat])).toBe(true);
    // 既无 url 又无指引 → 拒绝
    const noUrl: RegistrationChannel = { name: "普通报名", kind: "general", sourceUrl: "https://example.org/notice", verifiedAt: now.toISOString(), status: "closed" };
    expect(validChannels([noUrl])).toBe(false);
    // 空指引、非法入口类型 → 拒绝
    expect(validChannels([{ ...wechat, entranceHint: "   " }])).toBe(false);
    expect(validChannels([{ ...wechat, entranceType: "carrier_pigeon" }])).toBe(false);
    // 指引型通道也按 name+指引 去重
    expect(validChannels([wechat, { ...wechat }])).toBe(false);
    expect(validChannels([wechat, { ...wechat, kind: "charity" as const, name: "慈善名额", entranceHint: "另一条指引" }])).toBe(true);
  });
  it.each([
    { entranceType: ["app"] }, { entranceType: { value: "app" } },
    { entranceType: null }, { entranceType: 1 }, { entranceType: true },
    { entranceType: "carrier_pigeon" },
  ])("拒绝非法入口类型 $entranceType，完整契约也必须拦截", ({ entranceType }) => {
    const entry = { ...channel, entranceType };
    expect.soft(validChannels([entry])).toBe(false);
    expect(schemaIssues([{ ...race, registrationChannels: [entry] }], loadSchema())).toEqual([
      "测试赛事: 字段 registrationChannels 类型不符（期望 RegistrationChannel[]）",
    ]);
  });
  it.each([undefined, "website", "wechat_official", "wechat_miniprogram", "app", "platform"])("入口类型 %s 兼容网址和无网址指引", entranceType => {
    for (const entry of [{ ...channel, entranceType }, { ...channel, url: undefined, entranceType, entranceHint: "打开赛事报名页面" }]) {
      expect(validChannels([entry])).toBe(true);
      expect(schemaIssues([{ ...race, registrationChannels: [entry] }], loadSchema())).toEqual([]);
    }
  });
  it("schema v3 向后兼容旧赛事，同时严格校验新增嵌套字段", () => {
    const schema = loadSchema();
    expect(schema.schemaVersion).toBe(3);
    expect(schemaIssues([{ ...race }], schema)).toEqual([]);
    expect(schemaIssues([{ ...race, category: "unknown", sources: [], registrationChannels: [channel] }], schema)).toEqual([]);
    expect(schemaIssues([{ ...race, sources: [{ url: "javascript:x" }] }], schema).length).toBeGreaterThan(0);
    expect(schemaIssues([{ ...race, registrationChannels: [{ ...channel, regEnd: "2026-11-02" }] }], schema).length).toBeGreaterThan(0);
  });
  it("慈善开放不使普通报名重新开放，普通通道窗口覆盖历史汇总", () => {
    const charity: RegistrationChannel = { ...channel, kind: "charity", name: "慈善名额", url: "https://example.org/charity", status: "open", regStart: "2026-10-01", regEnd: "2026-10-30" };
    const item = { ...race, registrationChannels: [channel, charity] };
    expect(deriveStatus(item, now)).toBe("closed");
    expect(withGeneralRegistration(item).regEnd).toBe(channel.regEnd);
    expect(deriveStatus({ ...item, registrationChannels: undefined, regStart: charity.regStart, regEnd: charity.regEnd }, now)).toBe("open");
    expect(deriveStatus(race, now)).toBe("open");
    expect(deriveStatus({ ...race, registrationChannels: [charity] }, now)).toBe("pending");
  });
  it("截止次日零点即关闭，不多开放一毫秒", () => {
    expect(deriveStatus(race, new Date("2026-10-30T23:59:59.999+08:00"))).toBe("open");
    expect(deriveStatus(race, new Date("2026-10-31T00:00:00+08:00"))).toBe("closed");
  });
});

// 卡片面板与邮件简报共用的站点口径：officialSite 只作「来源」一条，重复 URL 不出现两次
describe("siteAsSource：官网并入来源、不单独成行", () => {
  const site = "https://example.org/site";
  const wechat: RegistrationChannel = { name: "普通报名", kind: "general", entranceType: "wechat_official", entranceHint: "微信搜索'测试赛事'公众号→菜单栏报名", sourceUrl: "https://example.org/notice", verifiedAt: now.toISOString(), status: "open" };

  it("有可用网址且未被通道或来源占用 -> 作为来源展示", () => {
    expect(siteAsSource({ ...race, officialSite: site })).toBe(site);
    expect(siteAsSource({ ...race, officialSite: site, registrationChannels: [wechat] })).toBe(site);
  });
  it("同一 URL 已由通道或来源展示 -> null，不重复出现", () => {
    expect(siteAsSource({ ...race, officialSite: channel.url!, registrationChannels: [channel] })).toBeNull();
    expect(siteAsSource({ ...race, officialSite: site, sources: [{ url: site, observedAt: now.toISOString(), scope: "general" }] })).toBeNull();
  });
  it("缺链接或非法链接 -> null，不生成假链接", () => {
    expect(siteAsSource(race)).toBeNull();
    expect(siteAsSource({ ...race, officialSite: "javascript:alert(1)" })).toBeNull();
  });
});

// 2026-11-02 定的缺失口径：库里没有值就点名缺哪一项，一律「未收录」；
// 「待核验」仍专指 AI 给了值但人还没读公告，两种语义不许混。
describe("unrecordedLine：缺失信息统一说「未收录」", () => {
  const site = "https://example.org/site";
  const wechat: RegistrationChannel = { name: "普通报名", kind: "general", entranceType: "wechat_official", entranceHint: "微信搜索'测试赛事'公众号→菜单栏报名", sourceUrl: "https://example.org/notice", verifiedAt: now.toISOString(), status: "open" };
  const hint = { url: "https://example.org/hint", scope: "general" as const, observedAt: now.toISOString() };

  it("通道与来源都没有 -> 一句话点齐两项", () => {
    expect(unrecordedLine(race)).toBe("未收录：报名通道、来源公告，请以组委会公告为准。");
  });
  it("有官网无通道 -> 官网算一条来源，只点报名通道", () => {
    expect(unrecordedLine({ ...race, officialSite: site })).toBe("未收录：报名通道，请以组委会公告为准。");
  });
  it("只有模型线索 -> 来源已可展示，不再报未收录", () => {
    expect(unrecordedLine({ ...race, sources: [hint] })).toBe("未收录：报名通道，请以组委会公告为准。");
  });
  it("无网址的公众号指引算已收录通道", () => {
    expect(unrecordedLine({ ...race, registrationChannels: [wechat], sources: [hint] })).toBeNull();
  });
  it("官网与通道是同一 URL 时来源仍算有（只是链接去重，不代表没证据）", () => {
    expect(unrecordedLine({ ...race, officialSite: channel.url!, registrationChannels: [channel] })).toBeNull();
  });
  it("通道与来源齐全 -> 不输出缺失提示", () => {
    expect(unrecordedLine({ ...race, registrationChannels: [channel], sources: [hint] })).toBeNull();
  });
});

// 2026-11-02 定的网址口径：面板里有已核验通道公告时，general/registration 来源与赛事网站一并收起，
// 赛期与认证证据保留——同一件事不该在面板里占三行链接。
describe("panelLinks：通道公告优先，其余网址收起", () => {
  const site = "https://example.org/site";
  const stamp = { observedAt: now.toISOString(), verifiedAt: now.toISOString() };
  const reg = { url: "https://m.sh.bendibao.com/news/1.html", scope: "registration" as const, ...stamp };
  const info = { url: "https://www.shio.gov.cn/notice.html", scope: "general" as const, ...stamp };
  const date = { url: "https://example.org/date", scope: "raceDate" as const, ...stamp };
  const cat = { url: "https://example.org/cat", scope: "category" as const, ...stamp };

  it("无通道 -> 来源与官网照旧全显示", () => {
    const panel = panelLinks({ ...race, officialSite: site, sources: [reg, info] });
    expect(panel.sources.map(source => source.url)).toEqual([reg.url, info.url]);
    expect(panel.site).toBe(site);
  });
  it("有已核验通道 -> 报名与信息类来源、官网都不显示，面板只剩公告一个网址", () => {
    const panel = panelLinks({ ...race, officialSite: site, registrationChannels: [channel], sources: [reg, info] });
    expect(panel.sources).toEqual([]);
    expect(panel.site).toBeNull();
  });
  it("赛期与认证来源保留", () => {
    const panel = panelLinks({ ...race, registrationChannels: [channel], sources: [reg, date, cat] });
    expect(panel.sources.map(source => source.url)).toEqual([date.url, cat.url]);
  });
  it("非法 URL 不进面板，模型线索同样按 scope 收", () => {
    const hint = { url: "https://example.org/hint", scope: "general" as const, observedAt: now.toISOString() };
    const panel = panelLinks({ ...race, registrationChannels: [channel], sources: [{ url: "javascript:alert(1)", scope: "raceDate" as const, observedAt: now.toISOString() }, hint, date] });
    expect(panel.sources.map(source => source.url)).toEqual([date.url]);
  });
});
