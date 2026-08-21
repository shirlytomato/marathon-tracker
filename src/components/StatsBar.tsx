export default function StatsBar({ open, drawing, countdown, updatedAt }: {
  open: number; drawing: number; countdown: number; updatedAt: string;
}) {
  const items = [
    { label: "🔥 报名中赛事", value: open, color: "text-emerald-600" },
    { label: "🎲 抽签中赛事", value: drawing, color: "text-amber-600" },
    { label: "📅 备赛倒计时", value: countdown, color: "text-orange-500" },
  ];
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {items.map(i => (
          <div key={i.label} className="rounded-xl border border-orange-100 bg-white p-3 text-center shadow-sm sm:p-4">
            <div className={`text-2xl font-bold sm:text-3xl ${i.color}`}>{i.value}</div>
            <div className="mt-1 text-xs text-slate-500 sm:text-sm">{i.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-right text-xs text-slate-400">数据更新于 {updatedAt}</div>
    </div>
  );
}
