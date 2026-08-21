"use client";

import { useMemo, useState } from "react";
import type { Race } from "@/types/race";
import { deriveStatus, sortRaces, computeStats } from "@/lib/status";
import StatsBar from "./StatsBar";
import FilterBar, { type Filters } from "./FilterBar";
import RaceCard from "./RaceCard";

const DEFAULT_FILTERS: Filters = { region: "", status: "", event: "", keyword: "", quick: "unfinished" };

export default function Tracker({ races, nowIso }: { races: Race[]; nowIso: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [tab, setTab] = useState<"domestic" | "international">("domestic");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const domestic = useMemo(() => races.filter(r => r.country === "中国"), [races]);
  const international = useMemo(() => races.filter(r => r.country !== "中国"), [races]);
  const tabRaces = tab === "domestic" ? domestic : international;

  const stats = useMemo(() => computeStats(tabRaces, now), [tabRaces, now]);
  const updatedAt = useMemo(() => {
    const max = races.reduce((m, r) => (r.updatedAt > m ? r.updatedAt : m), "");
    return max ? max.slice(0, 16).replace("T", " ") : "—";
  }, [races]);

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const r of tabRaces) {
      const region = tab === "domestic" ? r.province : r.country;
      if (region) set.add(region);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }, [tabRaces, tab]);

  const filtered = useMemo(() => {
    const list = tabRaces.filter(r => {
      const s = deriveStatus(r, now);
      if (filters.quick === "unfinished" && s === "finished") return false;
      if (filters.quick === "finished" && s !== "finished") return false;
      const region = tab === "domestic" ? r.province : r.country;
      if (filters.region && region !== filters.region) return false;
      if (filters.status && s !== filters.status) return false;
      if (filters.event && !r.events.includes(filters.event)) return false;
      if (filters.keyword && !r.name.includes(filters.keyword) && !(r.shortName ?? "").includes(filters.keyword)) return false;
      return true;
    });
    return sortRaces(list, now);
  }, [tabRaces, filters, now, tab]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">🏃 Marathon Tracker</h1>
          <p className="mt-1 text-lg font-medium text-slate-600">全国+国际马拉松赛事追踪</p>
          <p className="mt-1 text-sm text-slate-400">比赛时间、报名窗口、竞赛项目和官方入口，集中查看</p>
        </header>

        <StatsBar open={stats.open} drawing={stats.drawing} countdown={stats.countdown} updatedAt={updatedAt} />

        <div className="mt-6 flex gap-2">
          {([["domestic", "🇨🇳 全国赛事"], ["international", "🌍 国际赛事"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => { setTab(k); setFilters(DEFAULT_FILTERS); }}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                tab === k ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {label}
              <span className="ml-1.5 text-xs opacity-70">
                {k === "domestic" ? domestic.length : international.length}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4">
          <FilterBar filters={filters} regions={regions} onChange={patch => setFilters(f => ({ ...f, ...patch }))} />
        </div>

        <div className="mt-4 text-sm text-slate-500">共 {filtered.length} 场赛事</div>

        <div className="mt-3 space-y-4">
          {filtered.map(r => <RaceCard key={r.id} race={r} now={now} />)}
          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
              没有符合条件的赛事
            </div>
          )}
        </div>

        <footer className="mt-10 border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
          数据来源于中国田径协会赛事名录及各赛事组委会公开信息，每日自动更新，报名请以官方渠道为准
        </footer>
      </div>
    </div>
  );
}
