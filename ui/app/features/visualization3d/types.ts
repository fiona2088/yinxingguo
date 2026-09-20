/** 3D 场景业态：用于低模造型与配色 */
export type BuildingKind = "energy" | "office" | "commercial" | "residential" | "school" | "hospital" | "factory";

export interface BuildingMetric {
    id: string;
    name: string;
    electricity: number;
    hvac: number;
    lighting: number;
    equipment: number;
    position: [number, number, number];
    color: string;
    /** 未传时按 office 渲染，兼容旧 API */
    buildingType?: BuildingKind;
}

export interface DashboardStat {
    label: string;
    value: number;
    unit: string;
    accent: string;
}

export interface SankeyNode {
    name: string;
    color: string;
}

export interface SankeyLink {
    source: number;
    target: number;
    value: number;
}

export interface SankeyData {
    nodes: SankeyNode[];
    links: SankeyLink[];
}

export interface Visualization3DData {
    buildings: BuildingMetric[];
    stats: DashboardStat[];
    sankey: SankeyData;
}

export type Visualization3DLoader = () => Promise<Partial<Visualization3DData> | Visualization3DData>;
