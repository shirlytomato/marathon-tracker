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

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}

export default function RaceCard({ race, now }: { race: Race; now: Date }) {
  const status = deriveStatus(race, now);
  const st = STATUS_STYLE[status];
  const cat = CATEGORY_STYLE[race.category];

  // 报名中且 7 天内截止 → 红色高亮
  const urgent =
    status === "open" && race.regEnd &&
    (new Date(race.regEnd + "T23:59:59+08:00").getTime() - now.getTime()) <= 7 * 86400000;

  const daysLeft = urgent && race.regEnd
    ? Math.max(0, Math.ceil((new Date(race.regEnd + "T23:59:59+08:00").getTime() - now.getTime()) / 86400000))
    : null;

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
        {urgent && (
          <span className="ml-auto rounded-md bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600">
            ⏰ {daysLeft === 0 ? "今天截止" : `${daysLeft} 天后截止`}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <h3 className="truncate text-xl font-bold tracking-tight text-slate-900">{race.name}</h3>
        {race.officialSite && (
          <a href={race.officialSite} target="_blank" rel="noreferrer"
             className="inline-flex shrink-0 items-center text-sm font-medium text-blue-600 hover:text-blue-800">
            赛事官网 ↗
          </a>
        )}
      </div>

      <div className="mt-1 text-sm text-slate-500">
        {[race.country === "中国" ? race.province : race.country, race.city].filter(Boolean).join(" · ")}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Field label="比赛时间" value={race.raceDate} />
        <Field label="比赛地点" value={race.location} />
        <Field label="报名时间" value={
          race.regStart && race.regEnd
            ? `${race.regStart} 至 ${race.regEnd}`
            : "暂未公布"
        } />
        <Field label="参赛规模" value={race.scale} />
        <Field label="竞赛项目" value={race.events.join(" / ")} />
        <Field label="费用" value={race.fee} />
        <Field label="抽签时间" value={race.lotteryDate} />
      </div>
    </div>
  );
}
