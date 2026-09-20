/**
 * ============================================================
 * 3D数字孪生核心类型定义 — Babylon.js 扩展层
 * ============================================================
 * 涵盖：建筑BIM数据、能源介质、告警、动画关键帧、
 *       相机状态、管网拓扑、演示脚本等全维度类型
 */

// ─────────────────────────────────────────────────────────────
//  一、建筑与BIM数据
// ─────────────────────────────────────────────────────────────

/** 建筑业态类型 */
export type BuildingKind =
  | "energy"
  | "office"
  | "commercial"
  | "residential"
  | "school"
  | "hospital"
  | "factory";

/** 建筑静态台账 */
export interface BuildingAccount {
  id: string;
  name: string;
  /** 建筑类型 */
  buildingType: BuildingKind;
  /** 建筑面积 m² */
  floorArea: number;
  /** 楼层数 */
  floors: number;
  /** 建筑高度 m */
  height: number;
  /** 建造年份 */
  buildYear: number;
  /** 建筑颜色（十六进制） */
  color: string;
  /** 在3D场景中的世界坐标 [x, y, z] */
  position: [number, number, number];
  /** 朝向弧度 */
  rotationY: number;
  /** 建筑描述 */
  description?: string;
  /** 所属分区 */
  zone?: string;
  /** 附加元数据 */
  metadata?: Record<string, unknown>;
}

/** 建筑实时能耗数据 */
export interface BuildingEnergyData {
  buildingId: string;
  /** 时间戳（毫秒） */
  timestamp: number;
  /** 电力消耗 kW */
  electricity: number;
  /** HVAC能耗 kWh */
  hvac: number;
  /** 照明负载 kW */
  lighting: number;
  /** 设备负载 kW */
  equipment: number;
  /** 总能耗 kWh */
  total: number;
  /** 实时负载率 0-1 */
  loadRate?: number;
}

/** BIM构件数据 */
export interface BimComponent {
  id: string;
  buildingId: string;
  /** 楼层号（1=1F，-1=B1） */
  floor: number;
  /** 构件类型：wall | slab | column | beam | door | window | mep */
  category: "wall" | "slab" | "column" | "beam" | "door" | "window" | "mep" | "other";
  /** 世界坐标 [x, y, z] */
  position: [number, number, number];
  /** 构件尺寸 [width, height, depth] */
  size: [number, number, number];
  /** 旋转 [x, y, z] 弧度 */
  rotation?: [number, number, number];
  /** 构件名称 */
  name?: string;
  /** 自定义属性 */
  properties?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
//  二、能源介质与管网
// ─────────────────────────────────────────────────────────────

/** 能源介质类型 */
export type EnergyMedium =
  | "electricity"
  | "water"
  | "heating"
  | "gas"
  | "photovoltaic"
  | "storage";

/** 介质视觉映射配置 */
export interface MediumVisualConfig {
  medium: EnergyMedium;
  /** 流动粒子颜色 */
  particleColor: string;
  /** 流动线条颜色 */
  lineColor: string;
  /** 流动速度系数 */
  speedFactor: number;
  /** 粒子密度 */
  particleDensity: number;
  /** 发光强度 */
  emissiveIntensity: number;
  /** 告警色 */
  alertColor: string;
}

/** 默认介质视觉配置 */
export const MEDIUM_VISUAL_CONFIGS: Record<EnergyMedium, MediumVisualConfig> = {
  electricity: {
    medium: "electricity",
    particleColor: "#fbbf24",
    lineColor: "#38bdf8",
    speedFactor: 1.0,
    particleDensity: 1.0,
    emissiveIntensity: 1.2,
    alertColor: "#ef4444",
  },
  water: {
    medium: "water",
    particleColor: "#38bdf8",
    lineColor: "#0ea5e9",
    speedFactor: 0.6,
    particleDensity: 0.8,
    emissiveIntensity: 0.9,
    alertColor: "#3b82f6",
  },
  heating: {
    medium: "heating",
    particleColor: "#f97316",
    lineColor: "#ea580c",
    speedFactor: 0.5,
    particleDensity: 0.7,
    emissiveIntensity: 1.0,
    alertColor: "#dc2626",
  },
  gas: {
    medium: "gas",
    particleColor: "#a78bfa",
    lineColor: "#8b5cf6",
    speedFactor: 0.7,
    particleDensity: 0.6,
    emissiveIntensity: 0.8,
    alertColor: "#9333ea",
  },
  photovoltaic: {
    medium: "photovoltaic",
    particleColor: "#22c55e",
    lineColor: "#16a34a",
    speedFactor: 1.2,
    particleDensity: 1.2,
    emissiveIntensity: 1.4,
    alertColor: "#16a34a",
  },
  storage: {
    medium: "storage",
    particleColor: "#f472b6",
    lineColor: "#ec4899",
    speedFactor: 0.4,
    particleDensity: 0.5,
    emissiveIntensity: 0.7,
    alertColor: "#db2777",
  },
};

/** 管网节点 */
export interface PipelineNode {
  id: string;
  name: string;
  /** 世界坐标 */
  position: [number, number, number];
  /** 节点类型 */
  type: "source" | "consumer" | "junction" | "valve" | "meter";
  /** 关联建筑ID */
  buildingId?: string;
  /** 当前流量 m³/h 或 kW */
  flowRate: number;
  /** 压力 MPa */
  pressure?: number;
  /** 介质类型 */
  medium: EnergyMedium;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/** 管网管段 */
export interface PipelineSegment {
  id: string;
  name: string;
  /** 起点节点ID */
  sourceNodeId: string;
  /** 终点节点ID */
  targetNodeId: string;
  /** 管径 mm */
  diameter: number;
  /** 长度 m */
  length: number;
  /** 介质类型 */
  medium: EnergyMedium;
  /** 实时流量 */
  flowRate: number;
  /** 负载率 0-1 */
  loadRate: number;
  /** 是否告警 */
  isAlert: boolean;
  /** 3D曲线控制点（用于弯管） */
  controlPoints?: [number, number, number][];
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
//  三、告警系统
// ─────────────────────────────────────────────────────────────

/** 告警级别 */
export type AlertLevel = "info" | "warning" | "critical";

/** 告警数据 */
export interface AlertData {
  id: string;
  /** 告警标题 */
  title: string;
  /** 告警描述 */
  description: string;
  /** 告警级别 */
  level: AlertLevel;
  /** 关联建筑ID */
  buildingId?: string;
  /** 关联管段ID */
  segmentId?: string;
  /** 关联设备ID */
  deviceId?: string;
  /** 发生时间戳 */
  timestamp: number;
  /** 是否已确认 */
  acknowledged: boolean;
  /** 告警数值 */
  value?: number;
  /** 阈值 */
  threshold?: number;
  /** 建议操作 */
  suggestion?: string;
}

// ─────────────────────────────────────────────────────────────
//  四、相机与动画
// ─────────────────────────────────────────────────────────────

/** 相机视角状态 */
export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  radius?: number;
}

/** 相机飞行动画关键帧 */
export interface CameraKeyframe {
  /** 目标相机状态 */
  state: CameraState;
  /** 到达此帧的时间（秒） */
  time: number;
  /** 缓动函数：ease-in | ease-out | ease-in-out | linear */
  easing?: "ease-in" | "ease-out" | "ease-in-out" | "linear";
  /** 插值模式 */
  interpolation?: "position" | "look-at" | "fly-to";
}

/** 演示脚本模式 */
export type DemoMode = "normal" | "inspection" | "report" | "emergency";

/** 演示脚本 */
export interface DemoScript {
  mode: DemoMode;
  label: string;
  description: string;
  /** 关键帧序列 */
  keyframes: CameraKeyframe[];
  /** 停留时长（秒） */
  dwellTime: number;
  /** 关联展示的建筑/管线ID */
  highlightIds?: string[];
  /** 关联告警ID */
  alertIds?: string[];
  /** 自动播放时是否循环 */
  loop?: boolean;
}

// ─────────────────────────────────────────────────────────────
//  五、视图与交互
// ─────────────────────────────────────────────────────────────

/** 视图模式 */
export type ViewMode = "overview" | "building" | "floor" | "pipeline" | "equipment";

/** 选中上下文 */
export interface SelectionContext {
  type: "building" | "floor" | "pipeline" | "equipment" | "bim-component" | null;
  id: string | null;
  metadata?: Record<string, unknown>;
}

/** HMI面板配置 */
export interface HmiPanelConfig {
  /** 是否显示 */
  visible: boolean;
  /** 面板宽度 px */
  width: number;
  /** 位置：left | right */
  position: "left" | "right";
  /** 当前Tab */
  activeTab: "account" | "energy" | "device" | "alert" | "pipeline";
  /** 透明度 */
  opacity: number;
  /** 是否可拖拽 */
  draggable: boolean;
}

/** 大屏渲染配置 */
export interface ScreenConfig {
  /** 物理分辨率宽度 */
  physicalWidth: number;
  /** 物理分辨率高度 */
  physicalHeight: number;
  /** 拼接列数 */
  columns: number;
  /** 拼接行数 */
  rows: number;
  /** 目标刷新率 */
  targetFps: number;
  /** 是否启用WebGPU */
  useWebGPU: boolean;
  /** 超宽屏比例（如 32:9） */
  aspectRatio?: string;
  /** 抗锯齿级别：none | msaa | taa | both */
  antialiasLevel: "none" | "msaa" | "taa" | "both";
}

// ─────────────────────────────────────────────────────────────
//  六、数据适配层
// ─────────────────────────────────────────────────────────────

/** 原始API数据（后端返回格式） */
export interface RawApiBuilding {
  id?: string;
  name?: string;
  buildingType?: string;
  electricity?: number;
  hvac?: number;
  lighting?: number;
  equipment?: number;
  position?: number[];
  color?: string;
  [key: string]: unknown;
}

export interface RawApiAlert {
  id?: string;
  title?: string;
  level?: string;
  buildingId?: string;
  timestamp?: number;
  value?: number;
  threshold?: number;
  [key: string]: unknown;
}

export interface RawApiPipeline {
  id?: string;
  sourceId?: string;
  targetId?: string;
  medium?: string;
  flowRate?: number;
  loadRate?: number;
  isAlert?: boolean;
  [key: string]: unknown;
}

/** 字段映射规则 */
export interface FieldMappingRule {
  /** 源字段名（后端返回） */
  sourceField: string;
  /** 目标字段名（内部类型） */
  targetField: string;
  /** 数据类型转换 */
  transform?: "number" | "string" | "boolean" | "passthrough";
  /** 默认值（当源字段为空时） */
  defaultValue?: unknown;
}

/** 数据源配置 */
export interface DataSourceConfig {
  /** 基础URL */
  baseUrl: string;
  /** 建筑数据端点 */
  buildingEndpoint: string;
  /** 实时数据端点（WebSocket或轮询） */
  realtimeEndpoint?: string;
  /** 告警端点 */
  alertEndpoint?: string;
  /** 管网数据端点 */
  pipelineEndpoint?: string;
  /** 轮询间隔 ms */
  pollInterval?: number;
  /** 字段映射规则 */
  fieldMappings?: {
    buildings?: FieldMappingRule[];
    alerts?: FieldMappingRule[];
    pipelines?: FieldMappingRule[];
  };
}

// ─────────────────────────────────────────────────────────────
//  七、场景配置
// ─────────────────────────────────────────────────────────────

/** 天气系统 */
export type WeatherType = "clear" | "cloudy" | "rain" | "snow" | "fog";

/** 时间系统 */
export type TimeOfDay = "dawn" | "day" | "dusk" | "night";

/** 渲染特效开关 */
export interface EffectSwitches {
  bloom: boolean;
  hdr: boolean;
  depthOfField: boolean;
  motionBlur: boolean;
  antiAliasing: boolean;
  ambientOcclusion: boolean;
  screenSpaceReflection: boolean;
  lensFlare: boolean;
  grain: boolean;
  chromaticAberration: boolean;
}

/** 场景全局配置 */
export interface SceneConfig {
  screen: ScreenConfig;
  effects: EffectSwitches;
  weather: WeatherType;
  timeOfDay: TimeOfDay;
  /** 能源流动是否启用 */
  energyFlowEnabled: boolean;
  /** 是否显示BIM构件 */
  showBimComponents: boolean;
  /** 是否显示标签 */
  showLabels: boolean;
  /** 选中高亮色 */
  selectionColor: string;
  /** 告警高亮色 */
  alertColor: string;
  /** LOD最大距离 */
  lodMaxDistance: number;
}

// ─────────────────────────────────────────────────────────────
//  八、事件总线
// ─────────────────────────────────────────────────────────────

/** 场景事件类型 */
export type SceneEventType =
  | "building:click"
  | "building:select"
  | "building:hover"
  | "pipeline:click"
  | "alert:trigger"
  | "alert:acknowledge"
  | "camera:state-change"
  | "camera:animation-start"
  | "camera:animation-end"
  | "mode:change"
  | "panel:tab-change"
  | "data:update"
  | "data:error";

/** 场景事件载荷 */
export interface SceneEvent<T = unknown> {
  type: SceneEventType;
  payload: T;
  timestamp: number;
}

/** 事件总线接口 */
export interface SceneEventBus {
  emit<T>(type: SceneEventType, payload: T): void;
  on<T>(type: SceneEventType, handler: (event: SceneEvent<T>) => void): () => void;
  off<T>(type: SceneEventType, handler: (event: SceneEvent<T>) => void): void;
  once<T>(type: SceneEventType, handler: (event: SceneEvent<T>) => void): () => void;
}
