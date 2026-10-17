"use client";

import { useState } from "react";
import type { Race } from "@/types/race";
import RaceCard from "./RaceCard";

export default function RegistrationList({ races, now }: { races: Race[]; now: Date }) {
  const [expanded, setExpanded] = useState(false);
  if (!races.length) return null;
  return (
    <section aria-label="正在报名赛事" className="mt-4">
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 lg:text-xl">
        🔥 正在报名
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-600">{races.length}</span>
      </h2>
      <p className="mt-1 text-xs text-slate-500">按截止日期排序，截止日期未知的赛事列在最后。</p>
      <div id="registration-results" className="mt-3 grid gap-3 lg:grid-cols-2">
        {races.map((race, index) => (
          <div key={race.id} className={index >= 3 && !expanded ? "hidden sm:block" : ""}>
            <RaceCard race={race} now={now} />
            {!race.officialSite && !race.registrationChannels?.length && <p className="mt-1 px-2 text-xs leading-5 text-slate-600">
              赛事相关网站与报名通道均待补充，请以组委会公告为准。
            </p>}
          </div>
        ))}
      </div>
      {races.length > 3 && <button type="button" aria-expanded={expanded} aria-controls="registration-results"
        className="mt-3 min-h-11 w-full rounded-xl border border-orange-200 bg-white px-4 text-sm font-semibold text-orange-700 sm:hidden"
        onClick={() => setExpanded(value => !value)}>
        {expanded ? "收起，显示前 3 场" : `查看全部 ${races.length} 场报名赛事`}
      </button>}
    </section>
  );
}
