import { useMemo } from "react";
import { motion } from "framer-motion";
import { SankeyData } from "../../features/visualization3d/types";

function calculateNodePositions(data: SankeyData, width: number, height: number) {
    const padding = 60;
    const nodeWidth = 20;
    const rowGap = 28;
    const totalIndex = 0;
    const zoneStart = 1;
    const zoneEnd = 3;
    const typeStart = 4;

    // 分层：总能耗(1) -> 区域(3) -> 建筑类型(n)
    const levels: number[][] = [
        [totalIndex],                              // Level 0: 总能耗
        [zoneStart, zoneStart + 1, zoneStart + 2], // Level 1: 三个区域
        data.nodes.slice(typeStart).map((_, i) => typeStart + i), // Level 2: 建筑类型
    ];

    const span = (width - padding * 2 - nodeWidth * 3) / 3;
    const positions: { x: number; y: number; height: number }[] = [];

    levels.forEach((level, levelIndex) => {
        const x = padding + levelIndex * (span + nodeWidth);

        const levelTotal = level.reduce((sum, nodeIndex) => {
            const outgoing = data.links.filter((item) => item.source === nodeIndex).reduce((acc, item) => acc + item.value, 0);
            const incoming = data.links.filter((item) => item.target === nodeIndex).reduce((acc, item) => acc + item.value, 0);
            return sum + Math.max(outgoing, incoming);
        }, 1);

        let currentY = padding;
        level.forEach((nodeIndex) => {
            const outgoing = data.links.filter((item) => item.source === nodeIndex).reduce((acc, item) => acc + item.value, 0);
            const incoming = data.links.filter((item) => item.target === nodeIndex).reduce((acc, item) => acc + item.value, 0);
            const value = Math.max(outgoing, incoming, 0.1);
            const nodeHeight = (value / levelTotal) * (height - padding * 2 - rowGap * Math.max(0, level.length - 1));

            positions[nodeIndex] = { x, y: currentY, height: Math.max(nodeHeight, 20) };
            currentY += Math.max(nodeHeight, 20) + rowGap;
        });
    });

    return positions;
}

function toBezier(x1: number, y1: number, y2: number, width: number) {
    const control = Math.max(width * 0.4, 30);
    return `M ${x1} ${y1} C ${x1 + control} ${y1}, ${x1 + width - control} ${y2}, ${x1 + width} ${y2}`;
}

export function SankeyChart({ data }: { data: SankeyData }) {
    const width = 960;
    const height = 480;

    const nodePositions = useMemo(() => calculateNodePositions(data, width, height), [data]);

    const totalInput = useMemo(
        () => data.links.filter((item) => item.source === 0).reduce((sum, item) => sum + item.value, 0),
        [data],
    );

    return (
        <motion.section
            className="rounded-2xl border border-cyan-300/20 bg-white/90 p-5 backdrop-blur"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
        >
            <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold text-slate-900">多区域能耗桑基图</h3>
                    <p className="mt-1 text-xs text-slate-500">总能耗 → 核心/外围/屋顶区域 → 建筑类型分布</p>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-bold text-cyan-600">{totalInput.toFixed(1)}</div>
                    <div className="text-xs text-slate-500">总能耗 E_total (kW)</div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
                    <defs>
                        <linearGradient id="energy-link-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#1e40af" stopOpacity={0.6} />
                            <stop offset="50%" stopColor="#fbbf24" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.55} />
                        </linearGradient>
                    </defs>

                    {data.links.map((link, index) => {
                        const source = nodePositions[link.source];
                        const target = nodePositions[link.target];
                        if (!source || !target) {
                            return null;
                        }

                        const sourceY = source.y + source.height / 2;
                        const targetY = target.y + target.height / 2;
                        const path = toBezier(source.x + 20, sourceY, targetY, target.x - source.x - 20);

                        return (
                            <g key={`sankey-link-${index}`}>
                                <path d={path} fill="none" stroke="url(#energy-link-gradient)" strokeWidth={Math.max(2, link.value / 8)} opacity={0.5} />
                                <path d={path} fill="none" stroke={data.nodes[link.source].color} strokeWidth={1} opacity={0.4} />
                            </g>
                        );
                    })}

                    {nodePositions.map((pos, index) => (
                        <g key={`sankey-node-${index}`}>
                            <rect x={pos.x} y={pos.y} width={20} height={pos.height} fill={data.nodes[index].color} rx={4} opacity={0.9} />
                            <text
                                x={pos.x < width / 2 ? pos.x - 10 : pos.x + 28}
                                y={pos.y + pos.height / 2}
                                textAnchor={pos.x < width / 2 ? "end" : "start"}
                                dominantBaseline="middle"
                                fill="#334155"
                                fontSize={12}
                                fontWeight={index === 0 ? "600" : "normal"}
                            >
                                {data.nodes[index].name}
                            </text>
                        </g>
                    ))}
                </svg>
            </div>
        </motion.section>
    );
}
