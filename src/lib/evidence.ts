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

/**
 * officialSite 作为「来源」列表里的一条，页面面板与邮件简报共用（Issue #11 结论）。
 *
 * 存量里官网首页与报名页混杂，未逐场核验前不能叫「官方报名」，也不再单独成链接行。
 * 同一 URL 已由报名通道或来源公告展示过时返回 null，避免出现两条相同链接。
 */
export function siteAsSource(race: Race): string | null {
  const url = race.officialSite;
  if (!isHttpUrl(url)) return null;
  const shown = [...(race.registrationChannels ?? []).map(channel => channel.url),
    ...(race.sources ?? []).map(source => source.url)];
  return shown.includes(url) ? null : url;
}

/**
 * 缺失口径的唯一实现：库里没有可展示的值就点名缺哪一项，一律说「未收录」，不说「官方未公布」（那是我们无权断言的事实）。
 * 「待核验」另有含义（AI 给了值、人未读公告），两种语义不混用；面板与「正在报名」列表共用这一句。
 */
export function unrecordedLine(race: Race): string | null {
  const hasChannel = (race.registrationChannels ?? []).some(channel =>
    isHttpUrl(channel.url) || (typeof channel.entranceHint === "string" && !!channel.entranceHint.trim()));
  const hasEvidenceLink = isHttpUrl(race.officialSite) || (race.sources ?? []).some(source => isHttpUrl(source.url))
    || (race.registrationChannels ?? []).some(channel => isHttpUrl(channel.sourceUrl));
  const missing: string[] = [];
  if (!hasChannel) missing.push("报名通道");
  if (!hasEvidenceLink) missing.push("来源公告");
  return missing.length ? `未收录：${missing.join("、")}，请以组委会公告为准。` : null;
}

/**
 * 来源面板的网址取舍：有已核验报名通道时，通道的核验公告就是这条报名信息的出处，
 * 官网与 general/registration 类来源不再重复占行；赛期与认证证据另有指向，一律保留。
 */
export function panelLinks(race: Race): { sources: RaceSource[]; site: string | null } {
  const all = (race.sources ?? []).filter(source => isHttpUrl(source.url));
  const hasChannelNotice = (race.registrationChannels ?? []).some(channel => isHttpUrl(channel.sourceUrl));
  if (!hasChannelNotice) return { sources: all, site: siteAsSource(race) };
  return {
    sources: all.filter(source => source.scope === "raceDate" || source.scope === "category"),
    site: null,
  };
}
