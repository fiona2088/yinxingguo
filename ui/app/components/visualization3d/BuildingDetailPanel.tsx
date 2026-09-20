import { BuildingMetric } from "../../features/visualization3d/types";

export function BuildingDetailPanel({ building, onClose }: { building?: BuildingMetric; onClose: () => void }) {
    if (!building) {
        return (
            <aside className="rounded-2xl border border-slate-200/10 bg-slate-950/65 p-5 backdrop-blur">
                <h3 className="text-base font-semibold text-white">楼宇详情</h3>
                <p className="mt-2 text-sm text-slate-400">点击左侧任意楼宇可查看电力、空调和负载明细。</p>
            </aside>
        );
    }

    return (
        <aside className="rounded-2xl border border-slate-200/10 bg-slate-950/65 p-5 backdrop-blur">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-lg font-semibold text-white">{building.name}</h3>
                    <p className="text-xs text-slate-400">实时负载快照</p>
                </div>
                <button onClick={onClose} className="rounded-md border border-slate-500/40 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700/40">
                    关闭
                </button>
            </div>

            <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-lg bg-slate-900/70 px-3 py-2">
                    <span className="text-slate-400">电力消耗</span>
                    <span className="font-medium text-amber-300">{building.electricity.toFixed(2)} kW</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-900/70 px-3 py-2">
                    <span className="text-slate-400">HVAC 能耗</span>
                    <span className="font-medium text-cyan-300">{building.hvac.toFixed(0)} kWh</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-900/70 px-3 py-2">
                    <span className="text-slate-400">照明负载</span>
                    <span className="font-medium text-violet-300">{building.lighting.toFixed(2)} kW</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-900/70 px-3 py-2">
                    <span className="text-slate-400">设备负载</span>
                    <span className="font-medium text-rose-300">{building.equipment.toFixed(2)} kW</span>
                </div>
            </div>
        </aside>
    );
}
