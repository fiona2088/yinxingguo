import { BuildingKind, BuildingMetric, SankeyData, Visualization3DData } from "./types";

/** 鸟瞰分区：西北 CBD · 东北医院 · 东南住宅/学校 · 西南工厂 · 环心商业 · 中心能源 */
const DEFAULT_BUILDINGS: BuildingMetric[] = [
    {
        id: "BLD_EC",
        name: "能源中心",
        electricity: 118.6,
        hvac: 52_400,
        lighting: 38,
        equipment: 32,
        position: [0, 0, 0],
        color: "#3b82f6",
        buildingType: "energy",
    },
    // 环中心商业
    ...(
        [
            ["BLD_CM01", "环宇广场", 86.2, "#14b8a6"],
            ["BLD_CM02", "邻里MALL", 79.4, "#0d9488"],
            ["BLD_CM03", "科创商街", 82.1, "#2dd4bf"],
            ["BLD_CM04", "滨水商汇", 77.8, "#115e59"],
            ["BLD_CM05", "云廊商业", 84.0, "#0f766e"],
            ["BLD_CM06", "智汇天地", 80.5, "#134e4a"],
        ] as const
    ).map(([id, name, elec, color], i) => {
        const ring = [
            [1.9, 0.45],
            [-0.5, 1.85],
            [-1.85, -0.35],
            [0.45, -1.9],
            [1.55, 1.35],
            [-1.45, 1.15],
        ][i] as [number, number];
        return {
            id,
            name,
            electricity: elec,
            hvac: Math.round(elec * 520),
            lighting: Math.round(elec * 0.32),
            equipment: Math.round(elec * 0.3),
            position: [ring[0], 0, ring[1]] as [number, number, number],
            color,
            buildingType: "commercial" as BuildingKind,
        };
    }),
    // 西北 CBD 高层办公
    ...(
        [
            ["BLD_OF01", "金融塔A", 96.5, [-2.9, 0, -3.3]],
            ["BLD_OF02", "金融塔B", 102.3, [-3.9, 0, -2.7]],
            ["BLD_OF03", "总部大厦", 99.1, [-2.3, 0, -4.1]],
            ["BLD_OF04", "科创中心", 94.8, [-4.3, 0, -3.9]],
            ["BLD_OF05", "云谷办公", 91.2, [-3.1, 0, -2.1]],
            ["BLD_OF06", "天际写字楼", 105.6, [-4.6, 0, -2.3]],
        ] as const
    ).map(([id, name, elec, pos]) => ({
        id,
        name,
        electricity: elec,
        hvac: Math.round(elec * 505),
        lighting: Math.round(elec * 0.31),
        equipment: Math.round(elec * 0.29),
        position: [...pos] as [number, number, number],
        color: "#3b82f6",
        buildingType: "office" as BuildingKind,
    })),
    // 东北 医院与公共建筑
    ...(
        [
            ["BLD_HP01", "市立医院", 88.7, [3.8, 0, -3.4]],
            ["BLD_HP02", "急诊中心", 76.2, [2.6, 0, -3.9]],
            ["BLD_PB01", "市民中心", 72.5, [4.2, 0, -2.6]],
        ] as const
    ).map(([id, name, elec, pos], idx) => ({
        id,
        name,
        electricity: elec,
        hvac: Math.round(elec * 498),
        lighting: Math.round(elec * 0.33),
        equipment: Math.round(elec * 0.28),
        position: [...pos] as [number, number, number],
        color: idx < 2 ? "#ef4444" : "#64748b",
        buildingType: (idx < 2 ? "hospital" : "office") as BuildingKind,
    })),
    // 东南 住宅与学校（组团）
    ...(
        [
            ["BLD_RS01", "梧桐苑", 68.4, [2.7, 0, 2.9]],
            ["BLD_RS02", "银杏里", 65.1, [3.9, 0, 3.2]],
            ["BLD_RS03", "云栖台", 71.3, [2.5, 0, 4.1]],
            ["BLD_RS04", "和光府", 63.8, [4.1, 0, 2.5]],
            ["BLD_RS05", "悦江阁", 69.9, [3.3, 0, 4.3]],
            ["BLD_SC01", "实验学校", 58.2, [4.5, 0, 3.8]],
            ["BLD_SC02", "培训中心", 52.6, [2.2, 0, 2.1]],
        ] as const
    ).map(([id, name, elec, pos]) => {
        const school = id.startsWith("BLD_SC");
        return {
            id,
            name,
            electricity: elec,
            hvac: Math.round(elec * 485),
            lighting: Math.round(elec * 0.34),
            equipment: Math.round(elec * 0.27),
            position: [...pos] as [number, number, number],
            color: school ? "#f59e0b" : "#eab308",
            buildingType: (school ? "school" : "residential") as BuildingKind,
        };
    }),
    // 西南 工厂
    ...(
        [
            ["BLD_FC01", "智造一厂", 112.4, [-2.9, 0, 3.1]],
            ["BLD_FC02", "装配车间", 98.2, [-3.8, 0, 3.7]],
            ["BLD_FC03", "仓储基地", 90.6, [-4.2, 0, 2.7]],
            ["BLD_FC04", "能源站房", 85.3, [-3.2, 0, 4.2]],
        ] as const
    ).map(([id, name, elec, pos]) => ({
        id,
        name,
        electricity: elec,
        hvac: Math.round(elec * 510),
        lighting: Math.round(elec * 0.28),
        equipment: Math.round(elec * 0.32),
        position: [...pos] as [number, number, number],
        color: "#64748b",
        buildingType: "factory" as BuildingKind,
    })),
];

const SOURCE_CONFIG = [
    { name: "电网", color: "#fbbf24", ratio: 0.56 },
    { name: "燃气", color: "#f97316", ratio: 0.28 },
    { name: "光伏", color: "#22c55e", ratio: 0.16 },
];

const USAGE_CONFIG = [
    { name: "照明", color: "#a78bfa", key: "lighting" as const },
    { name: "空调", color: "#38bdf8", key: "hvac" as const },
    { name: "设备", color: "#f472b6", key: "equipment" as const },
    { name: "其他", color: "#94a3b8", key: "other" as const },
];

function normalizeBuildings(buildings?: BuildingMetric[]): BuildingMetric[] {
    if (!buildings || buildings.length === 0) {
        return DEFAULT_BUILDINGS;
    }
    return buildings.map((item, idx) => ({
        ...item,
        id: item.id || `building-${idx + 1}`,
        lighting: item.lighting ?? Math.max(0, Number((item.electricity * 0.32).toFixed(2))),
        equipment: item.equipment ?? Math.max(0, Number((item.electricity * 0.31).toFixed(2))),
    }));
}

function buildSankeyData(buildings: BuildingMetric[]): SankeyData {
    const nodes = [
        ...SOURCE_CONFIG.map((item) => ({ name: item.name, color: item.color })),
        ...buildings.map((building) => ({ name: building.name, color: building.color })),
        ...USAGE_CONFIG.map((item) => ({ name: item.name, color: item.color })),
    ];

    const links: SankeyData["links"] = [];

    buildings.forEach((building, index) => {
        const buildingNode = SOURCE_CONFIG.length + index;
        const electricityValue = building.electricity;

        SOURCE_CONFIG.forEach((source, sourceIndex) => {
            links.push({
                source: sourceIndex,
                target: buildingNode,
                value: Number((electricityValue * source.ratio).toFixed(2)),
            });
        });

        const usageValues = {
            lighting: building.lighting,
            hvac: Number((building.hvac / 1000).toFixed(2)),
            equipment: building.equipment,
            other: Math.max(0, Number((electricityValue - building.lighting - building.equipment).toFixed(2))),
        };

        USAGE_CONFIG.forEach((usage, usageIndex) => {
            const usageNode = SOURCE_CONFIG.length + buildings.length + usageIndex;
            links.push({
                source: buildingNode,
                target: usageNode,
                value: usageValues[usage.key],
            });
        });
    });

    return { nodes, links };
}

export function createVisualization3DData(partial?: Partial<Visualization3DData>): Visualization3DData {
    const buildings = normalizeBuildings(partial?.buildings);
    const totalPower = buildings.reduce((sum, item) => sum + item.electricity, 0);
    const totalHvac = buildings.reduce((sum, item) => sum + item.hvac, 0);

    const stats = partial?.stats ?? [
        { label: "总装机容量", value: Number(totalPower.toFixed(1)), unit: "kW", accent: "text-cyan-300" },
        { label: "总能耗", value: Number(totalHvac.toFixed(0)), unit: "kWh", accent: "text-amber-300" },
        { label: "碳减排", value: Number((totalPower * 0.041).toFixed(2)), unit: "吨", accent: "text-emerald-300" },
    ];

    return {
        buildings,
        stats,
        sankey: partial?.sankey ?? buildSankeyData(buildings),
    };
}
