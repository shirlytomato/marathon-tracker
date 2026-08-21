"use client";

export interface Filters {
  region: string;      // 省份（国内）或国家（国际），""=全部
  status: string;      // open/drawing/pending/closed/finished/""
  event: string;       // 全程马拉松/半程马拉松/""
  keyword: string;
  quick: "unfinished" | "finished" | "all";
}

const selectCls =
  "appearance-none rounded-full border border-orange-200 bg-white py-1 pl-3 pr-7 text-xs font-semibold text-slate-600 focus:border-orange-400 focus:outline-none lg:py-1.5 lg:pl-4 lg:pr-8 lg:text-sm";

function Chevron() {
  return (
    <svg aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-orange-400" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function FilterBar({ filters, regions, months, monthCounts, onChange }: {
  filters: Filters;
  regions: string[];
  months: string[];                  // 未来赛事的月份分组，用于月份跳转下拉
  monthCounts: (m: string) => number | undefined;
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

      {/* 月份跳转：与筛选同排，选中即平滑滚动到对应月份 */}
      {months.length > 1 && (
        <div className="relative">
          <select
            className={selectCls}
            value=""
            aria-label="按月跳转"
            onChange={e => { if (e.target.value) document.getElementById(`month-${e.target.value}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
          >
            <option value="">按月跳转</option>
            {months.map(m => (
              <option key={m} value={m}>{Number(m.slice(5))}月 · {monthCounts(m)} 场</option>
            ))}
          </select>
          <Chevron />
        </div>
      )}

      {/* 搜索 */}
      <input
        type="search" placeholder="搜索赛事名称…" value={filters.keyword}
        onChange={e => onChange({ keyword: e.target.value })}
        className="min-w-40 flex-1 rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 focus:border-orange-400 focus:outline-none lg:px-4 lg:py-1.5 lg:text-sm"
      />
    </div>
  );
}
