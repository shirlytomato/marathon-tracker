import { describe, it, expect } from "vitest";
import { collectSourceHints, isCalendarDate, isHttpUrl, validChannels, validSources } from "./evidence";
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
