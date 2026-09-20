import { motion } from "framer-motion";
import { Leaf, TrendingDown, Factory, Gauge } from "lucide-react";
import { CursorFollower } from "../components/CursorFollower";
import { TextReveal } from "../components/TextReveal";

const carbonStats = [
    { label: "本月碳排放", value: "252", unit: "吨", change: "-18.5%" },
    { label: "单位面积碳强度", value: "8.3", unit: "kg/m²", change: "-9.1%" },
    { label: "减排达成率", value: "91%", unit: "", change: "+6.4%" },
];

export function CarbonPage() {
    return (
        <motion.div
            className="min-h-screen bg-white text-gray-900 pt-32 pb-24 px-6 md:px-12 lg:px-24"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
        >
            <div className="max-w-[1400px] mx-auto">
                <div className="mb-16">
                    <p className="text-gray-400 text-xs tracking-[0.3em] uppercase mb-4">数据分析</p>
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900">
                        <TextReveal text="碳排放分析" delay={0.2} />
                    </h1>
                    <p className="text-gray-600 mt-4 text-lg">聚焦碳排放、碳强度与减排进度，辅助能碳协同优化决策。</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    {carbonStats.map((item, index) => (
                        <div key={item.label} className={`p-8 border ${index === 0 ? "bg-gray-900 text-white border-gray-900" : "bg-gray-50 border-gray-200"}`}>
                            <p className={`text-xs tracking-wider uppercase mb-4 ${index === 0 ? "text-gray-400" : "text-gray-500"}`}>{item.label}</p>
                            <div className="flex items-baseline gap-2 mb-3">
                                <span className="text-3xl font-bold">{item.value}</span>
                                <span className={`text-sm ${index === 0 ? "text-gray-400" : "text-gray-400"}`}>{item.unit}</span>
                            </div>
                            <p className={`text-sm ${index === 0 ? "text-gray-300" : "text-gray-600"}`}>{item.change}</p>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 border border-gray-200 bg-white">
                        <Leaf className="text-green-600 mb-3" size={20} />
                        <h3 className="font-semibold text-gray-900 mb-2">碳核算口径统一</h3>
                        <p className="text-sm text-gray-600">按建筑与系统分层核算，支持范围化追踪与历史同比。</p>
                    </div>
                    <div className="p-6 border border-gray-200 bg-white">
                        <TrendingDown className="text-emerald-600 mb-3" size={20} />
                        <h3 className="font-semibold text-gray-900 mb-2">减排路径监测</h3>
                        <p className="text-sm text-gray-600">结合设备效率和运行策略，识别减排收益最高的优化点。</p>
                    </div>
                    <div className="p-6 border border-gray-200 bg-white">
                        <Factory className="text-gray-700 mb-3" size={20} />
                        <h3 className="font-semibold text-gray-900 mb-2">排放源构成</h3>
                        <p className="text-sm text-gray-600">展示电力、空调与配套系统的排放占比，定位高影响环节。</p>
                    </div>
                </div>

                <div className="mt-8 p-6 border border-gray-200 bg-gray-50 flex items-start gap-3">
                    <Gauge size={18} className="text-gray-700 mt-0.5" />
                    <p className="text-sm text-gray-600">详细碳排放图表可在后续迭代中接入实时接口并联动报表导出。</p>
                </div>
            </div>
            <CursorFollower />
        </motion.div>
    );
}
