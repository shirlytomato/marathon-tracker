import pendingJson from "../../data/pending-reviews.json";
import type { Race } from "@/types/race";
import { deriveStatus } from "@/lib/status";
import { isHttpUrl } from "@/lib/evidence";

const kinds = { general: "普通报名", charity: "慈善名额", tour: "旅行套餐" };
const entrances = { website: "官网", wechat_official: "微信公众号", wechat_miniprogram: "微信小程序", app: "APP", platform: "第三方平台" };
const statuses = { pending: "待开放", open: "报名中", drawing: "抽签中", closed: "已截止", finished: "已结束", today: "今日开跑" };
export default function RaceEvidence({ race, now }: { race: Race; now: Date }) {
  const pending: { raceId: string; from: string }[] = pendingJson;
  const awaitingDateReview = pending.some(item => item.raceId === race.id && item.from === race.raceDate);
  const sources = (race.sources ?? []).filter(source => isHttpUrl(source.url));
  const channels = (race.registrationChannels ?? []).filter(channel => isHttpUrl(channel.url) || (typeof channel.entranceHint === "string" && !!channel.entranceHint.trim()));
  // officialSite 仅作信息来源，不再单独成链接行：同一 URL 已作为通道展示过就不再重复
  const site = isHttpUrl(race.officialSite) && !channels.some(channel => channel.url === race.officialSite) ? race.officialSite : null;
  return (
    <details className="mt-3 border-t border-orange-100 pt-1 text-sm text-slate-600">
      <summary className="min-h-11 cursor-pointer py-3 font-medium text-orange-800">来源与报名通道</summary>
      {awaitingDateReview && <p className="mb-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">有赛期变更线索待复核，当前仍显示原赛期。</p>}
      {!channels.length && <p className="mb-2 text-xs leading-5">
        {site ? <>报名方式待核验，可先查看<a href={site} target="_blank" rel="noreferrer" className="underline">赛事相关网站 ↗</a>。</> : "暂无已核验的直接报名通道，请以组委会公告为准。"}
      </p>}
      {channels.map(channel => {
        const status = deriveStatus({ ...race, registrationChannels: undefined, needLottery: channel.kind === "general" && race.needLottery, regStatus: channel.status, regStart: channel.regStart, regEnd: channel.regEnd }, now);
        return <div key={channel.url ?? `${channel.name}:${channel.entranceHint}`} className="mb-3 rounded-xl bg-orange-50/70 p-3">
          <p className="font-medium text-slate-800">{kinds[channel.kind]} · {channel.name} · {statuses[status]}</p>
          {channel.requirements && <p className="mt-1 text-xs leading-5">{channel.requirements}</p>}
          <p className="mt-1 text-xs">截止日期：{channel.regEnd || "待确认"} · 核验于 {channel.verifiedAt.slice(0, 10)}</p>
          {isHttpUrl(channel.url) ? (
            <div className="flex flex-wrap gap-x-4">
              <a href={channel.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-semibold text-orange-700">{status === "open" ? `查看${kinds[channel.kind]}入口 ↗` : "查看通道说明 ↗"}</a>
              <a href={channel.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center underline">核验公告 ↗</a>
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-4">
              <p className="inline-flex min-h-11 items-center text-xs leading-5">
                <span className="font-semibold text-orange-700">报名方式：{channel.entranceType ? `${entrances[channel.entranceType]} · ` : ""}{channel.entranceHint}</span>
              </p>
              <a href={channel.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center underline">核验公告 ↗</a>
            </div>
          )}
        </div>;
      })}
      {!sources.length && <p className="text-xs leading-5">来源公告待补充，现有记录尚无可展示的核验证据。</p>}
      {sources.map(source => <p key={`${source.scope}:${source.url}`} className="break-words text-xs leading-6">
        <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center underline">{new URL(source.url).hostname} ↗</a>
        {source.verifiedAt ? ` · ${source.scope === "raceDate" ? "赛期" : source.scope === "category" ? "认证" : source.scope === "registration" ? "报名" : "信息"}核验于 ${source.verifiedAt.slice(0, 10)}` : " · 模型提供的线索，待人工核验"}
      </p>)}
    </details>
  );
}
