"use client";

import { useMemo, useState } from "react";
import type { Race } from "@/types/race";
import { deriveStatus, sortRaces, computeStats } from "@/lib/status";
import StatsBar from "./StatsBar";
import FilterBar, { type Filters } from "./FilterBar";
import RaceCard from "./RaceCard";

const DEFAULT_FILTERS: Filters = { region: "", status: "", event: "", keyword: "", quick: "unfinished" };

/** 备案号预留位：完成 ICP 备案后填入备案号（如 "京ICP备XXXXXXXX号"），页脚会自动展示 */
const ICP_NUMBER = "";

/** 置顶横滑卡片：报名中的赛事，附截止倒计时 */
function OpenCard({ race, now }: { race: Race; now: Date }) {
  const daysLeft = race.regEnd
    ? Math.max(0, Math.ceil((new Date(race.regEnd + "T23:59:59+08:00").getTime() - now.getTime()) / 86400000))
    : null;
  const urgent = daysLeft !== null && daysLeft <= 7;
  return (
    <div className={`w-60 shrink-0 snap-start rounded-2xl border bg-white p-4 shadow-sm ${
      urgent ? "border-red-200 ring-1 ring-red-100" : "border-orange-100"
    }`}>
      <div className="flex items-center gap-1.5">
        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">报名中</span>
        {daysLeft !== null && (
          <span className={`ml-auto rounded-md px-2 py-0.5 text-xs font-bold ${
            urgent ? "bg-red-500 text-white" : "bg-orange-100 text-orange-600"
          }`}>
            {daysLeft === 0 ? "今天截止" : `剩 ${daysLeft} 天`}
          </span>
        )}
      </div>
      <h3 className="mt-2 truncate text-base font-bold text-slate-900">{race.name}</h3>
      <p className="mt-0.5 text-sm text-slate-500">
        {race.raceDate.slice(5, 7)}月{race.raceDate.slice(8)}日 · {[race.country === "中国" ? race.province : race.country, race.city].filter(Boolean).join(" ")}
      </p>
      {race.officialSite && (
        <a href={race.officialSite} target="_blank" rel="noreferrer"
           className="mt-2 inline-block text-sm font-semibold text-orange-500 hover:text-orange-600">
          前往报名 ↗
        </a>
      )}
    </div>
  );
}

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

  // 报名雷达：报名中的赛事置顶横滑，按截止紧迫度排序
  const openRaces = useMemo(
    () => filtered.filter(r => deriveStatus(r, now) === "open")
      .sort((a, b) => (a.regEnd ?? "").localeCompare(b.regEnd ?? "")),
    [filtered, now],
  );
  // 月份分组：筹备/抽签/已截止的未开赛赛事
  const upcoming = useMemo(
    () => filtered.filter(r => ["pending", "drawing", "closed"].includes(deriveStatus(r, now)))
      .sort((a, b) => a.raceDate.localeCompare(b.raceDate)),
    [filtered, now],
  );
  const finished = useMemo(
    () => filtered.filter(r => deriveStatus(r, now) === "finished")
      .sort((a, b) => b.raceDate.localeCompare(a.raceDate)),
    [filtered, now],
  );
  const months = useMemo(() => [...new Set(upcoming.map(r => r.raceDate.slice(0, 7)))], [upcoming]);
  const byMonth = useMemo(() => {
    const map = new Map<string, Race[]>();
    for (const r of upcoming) {
      const m = r.raceDate.slice(0, 7);
      map.set(m, [...(map.get(m) ?? []), r]);
    }
    return map;
  }, [upcoming]);

  return (
    <div className="min-h-screen bg-orange-50">
      {/* 品牌头图：21:9 宽幅 banner，暖橙×金，底部渐隐到页面底色 */}
      <header className="relative">
        <h1 className="sr-only">pbrun.run — 马拉松赛事追踪，愿你每一次奔跑，都是 Personal Best</h1>
        {/* 主视觉横幅：字标与标语已内置于图中 */}
        <img
          src="/hero.jpg"
          alt="pbrun.run — Run Your Personal Best，愿你每一次奔跑都是自己的 PB"
          className="block w-full"
        />
        {/* 底部渐隐：与页面底色自然衔接 */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-b from-transparent to-orange-50" />
        <p className="mt-3 text-center text-xs font-medium text-orange-400 sm:text-sm">为爱发电 · AI 每日更新报名动态</p>
      </header>

      <main className="mx-auto mt-6 max-w-5xl px-4 pb-10">
        <StatsBar open={stats.open} drawing={stats.drawing} countdown={stats.countdown} updatedAt={updatedAt} />

        {/* 国内 / 国际切换 */}
        <div className="mt-6 flex gap-2">
          {([["domestic", "🇨🇳 全国赛事"], ["international", "🌍 国际赛事"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => { setTab(k); setFilters(DEFAULT_FILTERS); }}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                tab === k ? "bg-orange-500 text-white shadow-sm" : "border border-orange-200 bg-white text-slate-600 hover:bg-orange-50"
              }`}
            >
              {label}
              <span className="ml-1.5 text-xs opacity-70">{k === "domestic" ? domestic.length : international.length}</span>
            </button>
          ))}
        </div>

        {/* 报名雷达：正在报名的赛事置顶 */}
        {openRaces.length > 0 && (
          <section className="mt-8">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              🔥 正在报名
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-600">{openRaces.length}</span>
            </h2>
            <div className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
              {openRaces.map(r => <OpenCard key={r.id} race={r} now={now} />)}
            </div>
          </section>
        )}

        <div className="mt-6">
          <FilterBar filters={filters} regions={regions} onChange={patch => setFilters(f => ({ ...f, ...patch }))} />
        </div>

        {/* 月份快速导航 */}
        {months.length > 1 && (
          <nav className="sticky top-0 z-10 -mx-4 mt-6 bg-orange-50/90 px-4 py-2 backdrop-blur">
            <div className="flex gap-2 overflow-x-auto">
              {months.map(m => (
                <button
                  key={m}
                  onClick={() => document.getElementById(`month-${m}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="shrink-0 rounded-full border border-orange-200 bg-white px-3 py-1 text-sm font-medium text-slate-600 transition-colors hover:bg-orange-100"
                >
                  {Number(m.slice(5))}月 · {byMonth.get(m)?.length}
                </button>
              ))}
            </div>
          </nav>
        )}

        {/* 月份分组列表 */}
        {months.map(m => (
          <section key={m} id={`month-${m}`} className="mt-8 scroll-mt-14">
            <h2 className="text-xl font-bold text-slate-900">
              🗓️ {Number(m.slice(5))}月
              <span className="ml-2 text-sm font-normal text-slate-400">{byMonth.get(m)?.length} 场赛事</span>
            </h2>
            <div className="mt-3 space-y-3">
              {byMonth.get(m)?.map(r => <RaceCard key={r.id} race={r} now={now} />)}
            </div>
          </section>
        ))}

        {/* 已结束赛事：沉底弱展示 */}
        {finished.length > 0 && (
          <section className="mt-10">
            <h2 className="text-base font-semibold text-slate-400">🏁 已结束 · {finished.length} 场</h2>
            <div className="mt-3 space-y-2">
              {finished.map(r => <RaceCard key={r.id} race={r} now={now} />)}
            </div>
          </section>
        )}

        {filtered.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-orange-200 bg-white p-12 text-center text-slate-400">
            🔍 没有符合条件的赛事
          </div>
        )}

        <footer className="mt-12 border-t border-orange-100 pt-6 text-center">
          <p className="text-base font-semibold text-orange-500">愿您下一次冲线，都是自己的 Personal Best 🏅</p>
          <p className="mt-2 text-xs text-slate-400">
            为爱发电 · 数据每日更新 · 数据以组委会官方公告为准 ·{" "}
            <a href="https://github.com/shirlytomato/marathon-tracker" target="_blank" rel="noreferrer"
               className="text-slate-500 underline decoration-dotted hover:text-orange-500">GitHub 开源</a>
          </p>
          {ICP_NUMBER && <p className="mt-1 text-xs text-slate-400">{ICP_NUMBER}</p>}
        </footer>
      </main>
    </div>
  );
}
