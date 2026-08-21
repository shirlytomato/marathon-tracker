import type { Race, RegStatus } from "@/types/race";
import { deriveStatus } from "@/lib/status";

const STATUS_STYLE: Record<RegStatus, { label: string; cls: string }> = {
  open: { label: "报名中", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  drawing: { label: "抽签中", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  pending: { label: "筹备中", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  closed: { label: "报名已截止", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  finished: { label: "已结束", cls: "bg-slate-50 text-slate-400 border-slate-100" },
};

const CATEGORY_STYLE: Record<Race["category"], { label: string; cls: string }> = {
  A: { label: "A类", cls: "bg-amber-50 text-amber-700" },
  B: { label: "B类", cls: "bg-blue-50 text-blue-700" },
  platinum: { label: "白金标", cls: "bg-slate-800 text-white" },
  gold: { label: "金标", cls: "bg-yellow-100 text-yellow-800" },
  major: { label: "大满贯", cls: "bg-indigo-600 text-white" },
};

export default function RaceCard({ race, now }: { race: Race; now: Date }) {
  const status = deriveStatus(race, now);
  const st = STATUS_STYLE[status];
  const cat = CATEGORY_STYLE[race.category];

  // 报名中且 7 天内截止 → 红色高亮
  const urgent =
    status === "open" && race.regEnd &&
    (new Date(race.regEnd + "T23:59:59+08:00").getTime() - now.getTime()) <= 7 * 86400000;

  const daysLeft = race.regEnd
    ? Math.max(0, Math.ceil((new Date(race.regEnd + "T23:59:59+08:00").getTime() - now.getTime()) / 86400000))
    : null;

  // 次要信息：只展示有值的字段，一行带过
  const details = [
    race.events.join(" / "),
    race.scale && `规模 ${race.scale}`,
    race.lotteryDate && `抽签 ${race.lotteryDate.slice(5)}`,
    race.fee,
  ].filter(Boolean);

  const dateLabel = `${race.raceDate.slice(5, 7)}月${race.raceDate.slice(8)}日`;

  return (
    <div className={`rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${
      urgent ? "border-red-300 ring-1 ring-red-200" : "border-slate-200"
    }`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cat.cls}`}>{cat.label}</span>
        {race.needLottery && (
          <span className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">需抽签</span>
        )}
        {urgent && daysLeft !== null && (
          <span className="ml-auto rounded-md bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600">
            ⏰ {daysLeft === 0 ? "今天截止" : `${daysLeft} 天后截止`}
          </span>
        )}
      </div>

      {/* 主信息行：赛事名 + 官网 */}
      <div className="mt-2 flex items-center gap-3">
        <h3 className="truncate text-xl font-bold tracking-tight text-slate-900">{race.name}</h3>
        {race.officialSite && (
          <a href={race.officialSite} target="_blank" rel="noreferrer"
             className="inline-flex shrink-0 items-center text-sm font-medium text-orange-500 hover:text-orange-600">
            赛事官网 ↗
          </a>
        )}
      </div>

      {/* 关键行：比赛日期 · 地点 · 报名截止（跑者最关心的三件事） */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
        <span className="font-semibold text-slate-800">
          {race.raceDate.slice(0, 4)}年{dateLabel}
        </span>
        <span>{[race.country === "中国" ? race.province : race.country, race.city].filter(Boolean).join(" · ")}</span>
        {status === "open" && race.regEnd && daysLeft !== null ? (
          <span className={urgent ? "font-bold text-red-600" : "font-semibold text-emerald-600"}>
            报名 {daysLeft === 0 ? "今天截止" : `还剩 ${daysLeft} 天`}
          </span>
        ) : race.regStart && race.regEnd ? (
          <span>报名 {race.regStart.slice(5)} 至 {race.regEnd.slice(5)}</span>
        ) : status !== "finished" ? (
          <span>报名时间暂未公布</span>
        ) : null}
      </div>

      {/* 次要信息：弱化一行，无需交互 */}
      {details.length > 0 && (
        <p className="mt-1.5 text-xs text-slate-400">{details.join(" · ")}</p>
      )}
    </div>
  );
}
