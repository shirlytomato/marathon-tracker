export default function StatsBar({ open, drawing, updatedAt }: {
  open: number; drawing: number; updatedAt: string;
}) {
  const items = [
    { label: "🔥 报名中赛事", value: open, color: "text-emerald-600" },
    { label: "🎲 抽签中赛事", value: drawing, color: "text-amber-600" },
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
      <div className="mt-2 text-right text-xs text-slate-400">数据更新于 {updatedAt}</div>
    </div>
  );
}
