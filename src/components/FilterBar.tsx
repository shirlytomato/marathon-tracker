"use client";

export interface Filters {
  region: string;      // 省份（国内）或国家（国际），""=全部
  status: string;      // open/drawing/pending/closed/finished/""
  event: string;       // 全程马拉松/半程马拉松/""
  keyword: string;
  quick: "unfinished" | "finished" | "all";
}

const selectCls = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none";

export default function FilterBar({ filters, regions, onChange }: {
  filters: Filters;
  regions: string[];
  onChange: (patch: Partial<Filters>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className={selectCls} value={filters.region} onChange={e => onChange({ region: e.target.value })}>
          <option value="">全部地区</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className={selectCls} value={filters.status} onChange={e => onChange({ status: e.target.value })}>
          <option value="">全部状态</option>
          <option value="open">报名中</option>
          <option value="drawing">抽签中</option>
          <option value="pending">筹备中</option>
          <option value="closed">报名已截止</option>
          <option value="finished">已结束</option>
        </select>
        <select className={selectCls} value={filters.event} onChange={e => onChange({ event: e.target.value })}>
          <option value="">全部项目</option>
          <option value="全程马拉松">全程马拉松</option>
          <option value="半程马拉松">半程马拉松</option>
        </select>
        <input
          type="search" placeholder="搜索赛事名称…" value={filters.keyword}
          onChange={e => onChange({ keyword: e.target.value })}
          className="min-w-40 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div className="flex gap-2">
        {([["unfinished", "未结束赛事"], ["finished", "已结束赛事"], ["all", "全部"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => onChange({ quick: k })}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              filters.quick === k
                ? "bg-blue-600 text-white"
                : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
