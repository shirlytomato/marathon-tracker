"use client";

import { useState } from "react";
import type { Filters } from "@/lib/filters";

const controlCls = "min-h-11 w-full rounded-xl border border-orange-100 bg-white px-3 text-sm text-slate-700 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200";
const statusLabels: Record<string, string> = { open: "报名中", today: "今日开跑", drawing: "抽签中", pending: "待开放", closed: "已截止", finished: "已结束" };

export default function FilterBar({ filters, regions, events, months, onChange, onReset }: {
  filters: Filters; regions: string[]; events: string[]; months: string[];
  onChange: (patch: Partial<Filters>) => void; onReset: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusValue = filters.quick === "finished" ? "finished" : filters.status;
  const chips: { name: string; value: string; clear: Partial<Filters> }[] = [
    { name: "地区", value: filters.region, clear: { region: "" } },
    { name: "状态", value: statusLabels[statusValue] || (filters.quick === "all" ? "全部赛期" : ""), clear: { status: "", quick: "unfinished" as const } },
    { name: "项目", value: filters.event, clear: { event: "" } },
    { name: "月份", value: filters.month, clear: { month: "" } },
    { name: "关键词", value: filters.keyword, clear: { keyword: "" } },
  ].filter(chip => chip.value);
  const pickStatus = (value: string) => onChange(value === "finished"
    ? { status: "finished", quick: "finished" } : { status: value, quick: "unfinished" });

  return (
    <div className="rounded-2xl border border-orange-100 bg-white/90 p-3 shadow-sm sm:p-4">
      <div className="flex items-center gap-2">
        <label className="min-w-0 flex-1"><span className="sr-only">搜索赛事、城市或国家</span>
          <input type="search" placeholder="搜索赛事、城市、国家…" value={filters.keyword}
            onChange={e => onChange({ keyword: e.target.value })} className={`${controlCls} bg-orange-50/40`} />
        </label>
        <button type="button" aria-expanded={expanded} aria-controls="race-filter-options"
          onClick={() => setExpanded(value => !value)} className="min-h-11 shrink-0 rounded-xl px-2 text-sm font-semibold text-orange-700 sm:hidden">
          {expanded ? "收起筛选" : `筛选${chips.length ? ` (${chips.length})` : ""}`}
        </button>
        {!!chips.length && <button type="button" onClick={onReset} className="min-h-11 shrink-0 rounded-xl px-2 text-sm font-semibold text-orange-700 hover:bg-orange-50">重置筛选</button>}
      </div>
      <div id="race-filter-options" className={`mt-3 grid-cols-2 gap-2 sm:grid sm:grid-cols-4 ${expanded ? "grid" : "hidden"}`}>
        <label className="min-w-0"><span className="sr-only">赛事地区</span>
          <select className={controlCls} value={filters.region} onChange={e => onChange({ region: e.target.value })}>
            <option value="">全部地区</option>
            {[...new Set([...regions, filters.region].filter(Boolean))].map(region => <option key={region} value={region}>{region}</option>)}
          </select>
        </label>
        <label className="min-w-0"><span className="sr-only">报名状态</span>
          <select className={controlCls} value={statusValue} onChange={e => pickStatus(e.target.value)}>
            <option value="">全部状态</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="min-w-0"><span className="sr-only">参赛项目</span>
          <select className={controlCls} value={filters.event} onChange={e => onChange({ event: e.target.value })}>
            <option value="">全部项目</option>
            {[...new Set([...events, filters.event].filter(Boolean))].map(event => <option key={event} value={event}>{event}</option>)}
          </select>
        </label>
        <label className="min-w-0"><span className="sr-only">比赛月份</span>
          <select className={controlCls} value={filters.month} onChange={e => onChange({ month: e.target.value })}>
            <option value="">全部月份</option>
            {[...new Set([...months, filters.month].filter(Boolean))].sort().map(month => <option key={month} value={month}>{month.slice(0, 4)}年{Number(month.slice(5))}月</option>)}
          </select>
        </label>
      </div>
      {!!chips.length && <div aria-label="已选筛选条件" className="mt-2 flex flex-wrap gap-1">
        {chips.map(chip => <button key={chip.name} type="button" aria-label={`移除${chip.name}筛选`} onClick={() => onChange(chip.clear)}
          className="min-h-11 max-w-full break-words rounded-xl bg-orange-50 px-3 text-left text-xs text-orange-800">
          {chip.name}：{chip.value} <span aria-hidden="true">×</span>
        </button>)}
      </div>}
    </div>
  );
}
