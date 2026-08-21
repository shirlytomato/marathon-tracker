"use client";

export interface Filters {
  region: string;      // 省份（国内）或国家（国际），""=全部
  status: string;      // open/drawing/pending/closed/finished/""
  event: string;       // 全程马拉松/半程马拉松/""
  keyword: string;
  quick: "unfinished" | "finished" | "all";
}

const selectCls =
  "appearance-none rounded-full border border-orange-200 bg-white py-1.5 pl-3 pr-8 text-sm text-slate-600 focus:border-orange-400 focus:outline-none";

function Chevron() {
  return (
    <svg aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-orange-400" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function FilterBar({ filters, regions, onChange }: {
  filters: Filters;
  regions: string[];
  onChange: (patch: Partial<Filters>) => void;
}) {
  // 状态下拉的当前值：处于"已结束"视图时显示已结束
  const statusValue = filters.quick === "finished" ? "finished" : filters.status;

  // 选择"已结束"时同步切到已结束视图，其余回到默认的未结束视图
  const pickStatus = (v: string) =>
    onChange(v === "finished"
      ? { status: "finished", quick: "finished" }
      : { status: v, quick: "unfinished" });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 地区 */}
      <div className="relative">
        <select className={selectCls} value={filters.region} onChange={e => onChange({ region: e.target.value })}>
          <option value="">全部地区</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <Chevron />
      </div>

      {/* 状态 */}
      <div className="relative">
        <select className={selectCls} value={statusValue} onChange={e => pickStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="open">报名中</option>
          <option value="drawing">抽签中</option>
          <option value="pending">筹备中</option>
          <option value="closed">已截止</option>
          <option value="finished">已结束</option>
        </select>
        <Chevron />
      </div>

      {/* 项目 */}
      <div className="relative">
        <select className={selectCls} value={filters.event} onChange={e => onChange({ event: e.target.value })}>
          <option value="">全部项目</option>
          <option value="全程马拉松">全程马拉松</option>
          <option value="半程马拉松">半程马拉松</option>
        </select>
        <Chevron />
      </div>

      {/* 搜索 */}
      <input
        type="search" placeholder="搜索赛事名称…" value={filters.keyword}
        onChange={e => onChange({ keyword: e.target.value })}
        className="min-w-40 flex-1 rounded-full border border-orange-200 bg-white px-4 py-1.5 text-sm focus:border-orange-400 focus:outline-none"
      />
    </div>
  );
}
