import type { Race, RaceSource, RegistrationChannel } from "@/types/race";

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}
const timestamp = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
export function isCalendarDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

export function validSources(value: unknown): value is RaceSource[] {
  return Array.isArray(value) && value.every(source => object(source)
    && Object.keys(source).every(key => ["url", "observedAt", "scope", "verifiedAt"].includes(key))
    && isHttpUrl(source.url) && timestamp(source.observedAt)
    && ["general", "raceDate", "registration", "category"].includes(String(source.scope))
    && (source.verifiedAt === undefined || timestamp(source.verifiedAt)));
}

const ENTRANCE_TYPES = ["website", "wechat_official", "wechat_miniprogram", "app", "platform"];
/** 报名入口的唯一标识：有网址用网址，公众号/小程序等无网址通道用 name+指引 */
const channelKey = (channel: Record<string, unknown>) =>
  isHttpUrl(channel.url) ? channel.url : `${String(channel.name)}|${String(channel.entranceHint)}`;

export function validChannels(value: unknown): value is RegistrationChannel[] {
  if (!Array.isArray(value)) return false;
  const valid = value.every(channel => object(channel)
    && Object.keys(channel).every(key => ["name", "kind", "url", "entranceType", "entranceHint", "sourceUrl", "verifiedAt", "status", "regStart", "regEnd", "requirements"].includes(key))
    && typeof channel.name === "string" && !!channel.name.trim()
    && ["general", "charity", "tour"].includes(String(channel.kind))
    // 入口可以是 http 网址，或人工填写的报名指引（公众号/小程序/APP 无独立网址）；两者至少其一
    && (channel.url === undefined || isHttpUrl(channel.url))
    && (channel.entranceType === undefined || (typeof channel.entranceType === "string" && ENTRANCE_TYPES.includes(channel.entranceType)))
    && (channel.entranceHint === undefined || (typeof channel.entranceHint === "string" && !!channel.entranceHint.trim()))
    && (isHttpUrl(channel.url) || (typeof channel.entranceHint === "string" && !!channel.entranceHint.trim()))
    && isHttpUrl(channel.sourceUrl) && timestamp(channel.verifiedAt)
    && ["pending", "open", "drawing", "closed", "finished"].includes(String(channel.status))
    && (channel.regStart === undefined || isCalendarDate(channel.regStart))
    && (channel.regEnd === undefined || isCalendarDate(channel.regEnd))
    && (!channel.regStart || !channel.regEnd || String(channel.regStart) <= String(channel.regEnd))
    && (channel.requirements === undefined || typeof channel.requirements === "string"));
  return valid && value.filter(channel => channel.kind === "general").length <= 1
    && new Set(value.map(channel => channelKey(channel as Record<string, unknown>))).size === value.length;
}

/** 模型给出的 URL 不等同于供应商检索证据，也不能提升成人工核验。 */
export function collectSourceHints(previous: RaceSource[] = [], urls: unknown, observedAt: string): RaceSource[] {
  const hints = Array.isArray(urls) ? [...new Set(urls.filter(isHttpUrl))].slice(0, 5) : [];
  return [...previous, ...hints.filter(url => !previous.some(source => source.url === url))
    .map(url => ({ url, observedAt, scope: "general" as const }))];
}

export interface SiteLink {
  url: string;
  /** 页面与邮件共用同一措辞，避免两边各叫各的 */
  label: string;
  /** true = 作为卡片主信息行的兜底入口；false = 降为详情里的次级信息入口 */
  primary: boolean;
}

/**
 * officialSite 的展示口径（Issue #11 的结论）。
 *
 * 有已核验普通通道时，officialSite 确定不是报名入口，可以准确叫「赛事官网」，
 * 并降为次级信息（看规程、领物、交通）。没有普通通道时无法区分存的是官网首页
 * 还是报名页——存量 106 条里两种都有（如烟台马拉松存的是 irunner 报名页），
 * 所以统一叫「赛事相关网站」并留在主信息行作兜底，等通道补齐后自然降级。
 *
 * 返回 null 表示不该再单独展示这个链接：没有可用网址，或同一 URL 已经作为
 * 报名通道展示过了（主次链接相同时只保留通道那一条）。
 */
export function siteLink(race: Race): SiteLink | null {
  const url = race.officialSite;
  if (!isHttpUrl(url)) return null;
  const channels = race.registrationChannels ?? [];
  if (channels.some(channel => channel.url === url)) return null;
  return channels.some(channel => channel.kind === "general")
    ? { url, label: "赛事官网", primary: false }
    : { url, label: "赛事相关网站", primary: true };
}
