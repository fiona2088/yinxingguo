/**
 * 桑基图能量流向组件
 */
import { useMemo } from "react";
import { motion } from "framer-motion";

// 简化的桑基图实现（不依赖 recharts-sankey）
interface SankeyNode {
  name: string;
  color: string;
}

interface SankeyLink {
  source: number;
  target: number;
  value: number;
}

interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

// 建筑类型中文标签
const TYPE_LABEL: Record<string, string> = {
  Office_Small: "小型办公",
  Office_Medium: "中型办公",
  Residential: "住宅",
  School: "学校",
  Hospital: "医院",
  Hotel: "酒店",
  Shopping_Mall: "商业综合体",
};

// 区域节点颜色（按温度/能耗隐喻）
const ZONE_COLOR: Record<string, string> = {
  total: "#6366f1",   // 总能耗 浅紫蓝
  core: "#dc2626",     // 核心区域 红（热量高）
  peri: "#2563eb",     // 外围区域 蓝（降温边缘）
  roof: "#16a34a",     // 屋顶区域 绿（能源屋顶）
};

// 建筑类型颜色（按功能语义）
const TYPE_COLOR: Record<string, string> = {
  Office_Small: "#3b82f6",     // 小型办公 蓝
  Office_Medium: "#60a5fa",    // 中型办公 浅蓝
  Residential: "#f59e0b",       // 住宅 琥珀
  School: "#d97706",            // 学校 深橙
  Hospital: "#ef4444",         // 医院 红
  Hotel: "#7c3aed",            // 酒店 深紫
  Shopping_Mall: "#0d9488",    // 商业综合体 深青
};

// 默认数据：总能耗 -> 区域能耗 -> 建筑类型
const defaultSankeyData: SankeyData = {
  nodes: [
    { name: "总能耗", color: ZONE_COLOR.total },
    { name: "核心区域", color: ZONE_COLOR.core },
    { name: "外围区域", color: ZONE_COLOR.peri },
    { name: "屋顶区域", color: ZONE_COLOR.roof },
    { name: "小型办公", color: TYPE_COLOR.Office_Small },
    { name: "中型办公", color: TYPE_COLOR.Office_Medium },
    { name: "住宅", color: TYPE_COLOR.Residential },
    { name: "学校", color: TYPE_COLOR.School },
    { name: "医院", color: TYPE_COLOR.Hospital },
    { name: "酒店", color: TYPE_COLOR.Hotel },
    { name: "商业综合体", color: TYPE_COLOR.Shopping_Mall },
  ],
  links: [
    // 总能耗 -> 三个区域
    { source: 0, target: 1, value: 350 },
    { source: 0, target: 2, value: 280 },
    { source: 0, target: 3, value: 120 },
    // 核心区域 -> 各建筑类型
    { source: 1, target: 4, value: 80 },
    { source: 1, target: 5, value: 70 },
    { source: 1, target: 6, value: 60 },
    { source: 1, target: 7, value: 50 },
    { source: 1, target: 8, value: 45 },
    { source: 1, target: 9, value: 25 },
    { source: 1, target: 10, value: 20 },
    // 外围区域 -> 各建筑类型
    { source: 2, target: 4, value: 65 },
    { source: 2, target: 5, value: 55 },
    { source: 2, target: 6, value: 50 },
    { source: 2, target: 7, value: 40 },
    { source: 2, target: 8, value: 35 },
    { source: 2, target: 9, value: 20 },
    { source: 2, target: 10, value: 15 },
    // 屋顶区域 -> 各建筑类型
    { source: 3, target: 4, value: 30 },
    { source: 3, target: 5, value: 25 },
    { source: 3, target: 6, value: 22 },
    { source: 3, target: 7, value: 18 },
    { source: 3, target: 8, value: 12 },
    { source: 3, target: 9, value: 8 },
    { source: 3, target: 10, value: 5 },
  ],
};

// 桑基图节点位置计算
function calculateNodePositions(data: SankeyData, width: number, height: number) {
  const padding = 60;
  const nodeWidth = 22;
  const nodePadding = 32;
  const totalIndex = 0;
  const zoneStart = 1;
  const typeStart = 4;

  // 三层布局：总能耗(1) -> 区域(3) -> 建筑类型(n)
  const levels: number[][] = [
    [totalIndex],
    [zoneStart, zoneStart + 1, zoneStart + 2],
    data.nodes.slice(typeStart).map((_, i) => typeStart + i),
  ];

  const span = (width - padding * 2 - nodeWidth * 3) / 3;
  const positions: { x: number; y: number; height: number }[] = [];

  levels.forEach((level, levelIndex) => {
    const x = padding + levelIndex * (span + nodeWidth);

    const totalValue = level.reduce((sum, idx) => {
      const outgoing = data.links
        .filter((l) => l.source === idx)
        .reduce((s, l) => s + l.value, 0);
      const incoming = data.links
        .filter((l) => l.target === idx)
        .reduce((s, l) => s + l.value, 0);
      return sum + Math.max(outgoing, incoming);
    }, 0);

    let yOffset = padding;
    level.forEach((nodeIndex) => {
      const outgoing = data.links
        .filter((l) => l.source === nodeIndex)
        .reduce((s, l) => s + l.value, 0);
      const incoming = data.links
        .filter((l) => l.target === nodeIndex)
        .reduce((s, l) => s + l.value, 0);
      const value = Math.max(outgoing, incoming);
      const nodeHeight = (value / totalValue) * (height - padding * 2 - nodePadding * (level.length - 1));

      positions[nodeIndex] = { x, y: yOffset, height: Math.max(nodeHeight, 22) };
      yOffset += Math.max(nodeHeight, 22) + nodePadding;
    });
  });

  return positions;
}

// 绘制贝塞尔曲线
function getBezierPath(
  x1: number,
  y1: number,
  y2: number,
  width: number
): string {
  const cp = width * 0.4;
  return `M ${x1} ${y1} C ${x1 + cp} ${y1}, ${x1 + width - cp} ${y2}, ${x1 + width} ${y2}`;
}

export function SankeyChart({ data = defaultSankeyData }: { data?: SankeyData }) {
  const width = 960;
  const height = 520;

  const nodePositions = useMemo(
    () => calculateNodePositions(data, width, height),
    [data]
  );

  const totalEnergy = useMemo(
    () => data.links.filter((l) => l.source === 0).reduce((s, l) => s + l.value, 0),
    [data]
  );

  const byZone = useMemo(() => {
    const result: Record<string, number> = {
      "核心区域": 0,
      "外围区域": 0,
      "屋顶区域": 0,
    };
    data.links.forEach((link) => {
      if (link.source >= 1 && link.source <= 3) {
        const name = data.nodes[link.source].name;
        result[name] = (result[name] || 0) + link.value;
      }
    });
    return result;
  }, [data]);

  return (
    <motion.div
      className="w-full bg-white/80 backdrop-blur-sm rounded-xl p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-slate-900">多区域能耗桑基图</h3>
          <p className="text-slate-500 text-sm mt-1">总能耗 → 核心/外围/屋顶区域 → 建筑类型分布</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-cyan-600">{totalEnergy}</p>
          <p className="text-slate-500 text-xs">总能耗 E_total (kW)</p>
        </div>
      </div>

      {/* 统计卡片 - 三个区域能耗 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "核心区域", subLabel: "E_core", value: byZone["核心区域"], color: "bg-orange-500" },
          { label: "外围区域", subLabel: "E_peri", value: byZone["外围区域"], color: "bg-blue-500" },
          { label: "屋顶区域", subLabel: "E_roof", value: byZone["屋顶区域"], color: "bg-green-500" },
        ].map((item) => (
          <div key={item.label} className="bg-slate-100/80 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 rounded-full ${item.color}`} />
              <span className="text-slate-500 text-xs">{item.label} ({item.subLabel})</span>
            </div>
            <p className="text-slate-900 font-bold">{item.value} <span className="text-xs font-normal text-slate-500">kW</span></p>
          </div>
        ))}
      </div>

      {/* SVG桑基图 */}
      <div className="overflow-x-auto">
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
          {/* 连接线 - 跟随源节点颜色，粗细范围 2-12px */}
          {data.links.map((link, index) => {
            const source = nodePositions[link.source];
            const target = nodePositions[link.target];
            if (!source || !target) return null;

            const sourceY = source.y + source.height / 2;
            const targetY = target.y + target.height / 2;
            const cp = (target.x - source.x - 22) * 0.4;
            const path = `M ${source.x + 22} ${sourceY} C ${source.x + 22 + cp} ${sourceY}, ${target.x - cp} ${targetY}, ${target.x} ${targetY}`;

            // 粗细范围：最小2px，最大12px，对数值进行归一化缩放
            const maxLinkValue = 400;
            const normalizedValue = Math.min(link.value, maxLinkValue) / maxLinkValue;
            const strokeWidth = 2 + normalizedValue * 10;

            return (
              <path
                key={`link-${index}`}
                d={path}
                fill="none"
                stroke={data.nodes[link.source].color}
                strokeWidth={strokeWidth}
                opacity={0.45}
              />
            );
          })}

          {/* 节点 */}
          {nodePositions.map((pos, index) => {
            const node = data.nodes[index];
            const isTotal = index === 0;
            return (
              <g key={`node-${index}`}>
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={22}
                  height={pos.height}
                  fill={node.color}
                  rx={4}
                  opacity={0.9}
                />
                <text
                  x={pos.x < width / 2 ? pos.x - 8 : pos.x + 30}
                  y={pos.y + pos.height / 2}
                  textAnchor={pos.x < width / 2 ? "end" : "start"}
                  dominantBaseline="middle"
                  fill="#334155"
                  fontSize={12}
                  fontWeight={isTotal ? "600" : "normal"}
                >
                  {node.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* 图例 */}
      <div className="mt-4 flex flex-wrap gap-4 justify-center">
        {data.nodes.map((node, index) => (
          <div key={`legend-${index}`} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: node.color }}
            />
            <span className="text-slate-500 text-xs">{node.name}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
