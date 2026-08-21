export default function StatsBar({ open, drawing, countdown, updatedAt }: {
  open: number; drawing: number; countdown: number; updatedAt: string;
}) {
  const items = [
    { label: "报名中赛事", value: open, color: "text-emerald-600" },
    { label: "抽签中赛事", value: drawing, color: "text-amber-600" },
    { label: "备赛倒计时", value: countdown, color: "text-blue-600" },
  ];
  return (
    <div>
      <div className="grid grid-cols-3 gap-4">
        {items.map(i => (
          <div key={i.label} className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <div className={`text-3xl font-bold ${i.color}`}>{i.value}</div>
            <div className="mt-1 text-sm text-slate-500">{i.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-right text-xs text-slate-400">数据更新于 {updatedAt}</div>
    </div>
  );
}
