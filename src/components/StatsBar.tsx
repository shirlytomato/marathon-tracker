import type { Race } from "@/types/race";
import { formatCheckedAt, summarizeFreshness, type UpdateHealth } from "@/lib/freshness";
import healthJson from "../../data/update-health.json";

export default function StatsBar({ open, drawing, races, now, deployedAt }: {
  open: number; drawing: number; races: Race[]; now: Date; deployedAt: string;
}) {
  const health: UpdateHealth = healthJson;
  const freshness = summarizeFreshness(races, now);
  const items = [
    { label: "🔥 本分区报名中", value: open, color: "text-emerald-600" },
    { label: "🎲 本分区抽签中", value: drawing, color: "text-amber-600" },
  ];
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {items.map(i => (
          <div key={i.label} className="rounded-xl border border-orange-100 bg-white p-3 text-center shadow-sm sm:p-4 lg:p-5">
            <div className={`text-2xl font-bold sm:text-3xl lg:text-4xl ${i.color}`}>{i.value}</div>
            <div className="mt-1 text-xs text-slate-500 sm:text-sm lg:text-base">{i.label}</div>
          </div>
        ))}
      </div>
      <details className="mt-3 text-xs leading-6 text-slate-600">
        <summary className="min-h-11 cursor-pointer py-2">本分区记录最近更新：{formatCheckedAt(freshness.latestRecordAt)}（北京时间）</summary>
        <p>最近正常完成任务：{formatCheckedAt(health.lastSuccessfulRun)}</p>
        {health.lastRun && <p>最近发布批次：{formatCheckedAt(health.lastRun.completedAt)} · 成功 {health.lastRun.succeeded} 场 / 失败 {health.lastRun.failed} 场</p>}
        <p>页面构建：{formatCheckedAt(deployedAt)}，不代表赛事信息已重新核验。</p>
      </details>
      {freshness.staleDaily > 0 && (
        <p role="note" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          {freshness.staleDaily} 场需每日检查的赛事已超过 36 小时未更新或更新时间异常，报名信息待复核，请以官方公告为准。
        </p>
      )}
      {/* failedNames 是本次新增字段，已发布的历史 update-health.json 里没有，缺省时只报数量 */}
      {!!health.lastRun?.failed && <p className="mt-2 text-sm text-amber-900">
        最近发布批次有 {health.lastRun.failed} 场复查未成功，仍显示上次数据
        {health.lastRun.failedNames?.length ? `：${health.lastRun.failedNames.join("、")}` : "。"}
      </p>}
    </div>
  );
}
