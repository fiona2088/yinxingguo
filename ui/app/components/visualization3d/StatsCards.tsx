import { DashboardStat } from "../../features/visualization3d/types";

export function StatsCards({ stats }: { stats: DashboardStat[] }) {
    return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {stats.map((stat) => (
                <article
                    key={stat.label}
                    className="rounded-xl border border-slate-200/10 bg-slate-900/65 p-4 shadow-[0_12px_36px_rgba(2,6,23,0.35)] backdrop-blur"
                >
                    <p className="text-xs tracking-wider text-slate-400">{stat.label}</p>
                    <p className="mt-1 text-2xl font-semibold text-white">
                        {stat.value.toLocaleString()} <span className={`text-sm font-normal ${stat.accent}`}>{stat.unit}</span>
                    </p>
                </article>
            ))}
        </div>
    );
}
