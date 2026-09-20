/**
 * ============================================================
 * 标准化数据适配层 — Data Adapter SDK
 * ============================================================
 * 职责：
 *   - 接收原始后端JSON数据，按字段映射规则转换为内部类型
 *   - 管理实时数据订阅（轮询/WebSocket）
 *   - 时序数据缓存、异常过滤、视图解耦
 *   - 事件总线：驱动所有3D场景内容100%数据驱动
 *
 * 接入方式：
 *   const adapter = createDataAdapter({ baseUrl: '/statistics', ... });
 *   adapter.on('building:select', (e) => { ... });
 *   await adapter.connect();
 */

import {
  BuildingAccount,
  BuildingEnergyData,
  BuildingKind,
  AlertData,
  AlertLevel,
  PipelineNode,
  PipelineSegment,
  EnergyMedium,
  RawApiBuilding,
  RawApiAlert,
  RawApiPipeline,
  FieldMappingRule,
  DataSourceConfig,
  SceneEvent,
  SceneEventType,
  SceneEventBus,
  MEDIUM_VISUAL_CONFIGS,
} from "./types";

/** 内部标准建筑数据 */
export interface StandardBuilding extends BuildingAccount {
  /** 实时能耗（最新） */
  latestEnergy?: BuildingEnergyData;
  /** 当前告警数 */
  alertCount?: number;
}

// ─────────────────────────────────────────────────────────────
//  字段映射规则 — 可配置，默认适配常见API字段
// ─────────────────────────────────────────────────────────────

const DEFAULT_BUILDING_MAPPINGS: FieldMappingRule[] = [
  { sourceField: "id", targetField: "id", transform: "string" },
  { sourceField: "name", targetField: "name", transform: "string", defaultValue: "未知建筑" },
  { sourceField: "buildingType", targetField: "buildingType", transform: "passthrough" },
  { sourceField: "electricity", targetField: "electricity", transform: "number", defaultValue: 0 },
  { sourceField: "hvac", targetField: "hvac", transform: "number", defaultValue: 0 },
  { sourceField: "lighting", targetField: "lighting", transform: "number", defaultValue: 0 },
  { sourceField: "equipment", targetField: "equipment", transform: "number", defaultValue: 0 },
  { sourceField: "position", targetField: "position", transform: "passthrough", defaultValue: [0, 0, 0] },
  { sourceField: "color", targetField: "color", transform: "string", defaultValue: "#38bdf8" },
];

const DEFAULT_ALERT_MAPPINGS: FieldMappingRule[] = [
  { sourceField: "id", targetField: "id", transform: "string" },
  { sourceField: "title", targetField: "title", transform: "string" },
  { sourceField: "level", targetField: "level", transform: "passthrough" },
  { sourceField: "buildingId", targetField: "buildingId", transform: "string" },
  { sourceField: "timestamp", targetField: "timestamp", transform: "number" },
  { sourceField: "value", targetField: "value", transform: "number" },
  { sourceField: "threshold", targetField: "threshold", transform: "number" },
];

const DEFAULT_PIPELINE_MAPPINGS: FieldMappingRule[] = [
  { sourceField: "id", targetField: "id", transform: "string" },
  { sourceField: "sourceId", targetField: "sourceNodeId", transform: "string" },
  { sourceField: "targetId", targetField: "targetNodeId", transform: "string" },
  { sourceField: "medium", targetField: "medium", transform: "passthrough" },
  { sourceField: "flowRate", targetField: "flowRate", transform: "number", defaultValue: 0 },
  { sourceField: "loadRate", targetField: "loadRate", transform: "number", defaultValue: 0 },
  { sourceField: "isAlert", targetField: "isAlert", transform: "boolean", defaultValue: false },
];

// ─────────────────────────────────────────────────────────────
//  字段转换工具
// ─────────────────────────────────────────────────────────────

function applyFieldTransform(value: unknown, rule: FieldMappingRule): unknown {
  if (value === undefined || value === null) {
    return rule.defaultValue;
  }
  switch (rule.transform) {
    case "number":
      return Number(value);
    case "string":
      return String(value);
    case "boolean":
      return Boolean(value);
    case "passthrough":
    default:
      return value;
  }
}

function applyMappingRules<T>(source: Record<string, unknown>, mappings: FieldMappingRule[]): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const rule of mappings) {
    const value = source[rule.sourceField];
    const transformed = applyFieldTransform(value, rule);
    if (transformed !== undefined) {
      result[rule.targetField] = transformed;
    }
  }
  return result as Partial<T>;
}

// ─────────────────────────────────────────────────────────────
//  简单事件总线
// ─────────────────────────────────────────────────────────────

class SimpleEventBus implements SceneEventBus {
  private handlers = new Map<SceneEventType, Array<(event: SceneEvent) => void>>();

  emit<T>(type: SceneEventType, payload: T): void {
    const handlers = this.handlers.get(type) ?? [];
    const event: SceneEvent<T> = { type, payload, timestamp: Date.now() };
    handlers.forEach((h) => h(event as SceneEvent));
  }

  on<T>(type: SceneEventType, handler: (event: SceneEvent<T>) => void): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as (event: SceneEvent) => void);
    this.handlers.set(type, list);
    return () => this.off(type, handler as (event: SceneEvent) => void);
  }

  off<T>(type: SceneEventType, handler: (event: SceneEvent<T>) => void): void {
    const list = this.handlers.get(type) ?? [];
    this.handlers.set(
      type,
      list.filter((h) => h !== (handler as (event: SceneEvent) => void)),
    );
  }

  once<T>(type: SceneEventType, handler: (event: SceneEvent<T>) => void): () => void {
    const wrapped: (event: SceneEvent<T>) => void = (event) => {
      handler(event);
      this.off(type, wrapped);
    };
    return this.on(type, wrapped);
  }
}

// ─────────────────────────────────────────────────────────────
//  数据缓存
// ─────────────────────────────────────────────────────────────

interface DataCache {
  buildings: Map<string, StandardBuilding>;
  alerts: Map<string, AlertData>;
  pipelines: Map<string, PipelineSegment>;
  /** 实时能耗数据（带时间戳） */
  energyHistory: Map<string, BuildingEnergyData[]>;
}

const MAX_ENERGY_HISTORY = 200; // 每个建筑保留最近200条时序

// ─────────────────────────────────────────────────────────────
//  主适配器类
// ─────────────────────────────────────────────────────────────

export interface DataAdapterOptions {
  /** 数据源配置 */
  source: DataSourceConfig;
  /** 自定义字段映射（覆盖默认） */
  customMappings?: DataSourceConfig["fieldMappings"];
  /** 实时数据更新间隔 ms（默认 3000） */
  pollInterval?: number;
  /** 是否启用历史数据缓存 */
  enableHistory?: boolean;
  /** 异常数据过滤回调 */
  dataFilter?: (data: unknown) => boolean;
}

export class EnergyDataAdapter {
  private bus = new SimpleEventBus();
  private cache: DataCache = {
    buildings: new Map(),
    alerts: new Map(),
    pipelines: new Map(),
    energyHistory: new Map(),
  };
  private options: Required<DataAdapterOptions>;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private disposed = false;

  constructor(options: DataAdapterOptions) {
    this.options = {
      source: options.source,
      customMappings: options.customMappings ?? {},
      pollInterval: options.pollInterval ?? 3000,
      enableHistory: options.enableHistory ?? true,
      dataFilter: options.dataFilter ?? (() => true),
    };
  }

  // ─────────────────────────────────────────────────────────
  //  公开API：事件总线
  // ─────────────────────────────────────────────────────────

  on<T>(type: SceneEventType, handler: (event: SceneEvent<T>) => void): () => void {
    return this.bus.on(type, handler);
  }

  once<T>(type: SceneEventType, handler: (event: SceneEvent<T>) => void): () => void {
    return this.bus.once(type, handler);
  }

  off<T>(type: SceneEventType, handler: (event: SceneEvent<T>) => void): void {
    this.bus.off(type, handler);
  }

  // ─────────────────────────────────────────────────────────
  //  公开API：连接与断开
  // ─────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.connected || this.disposed) return;
    this.connected = true;

    // 初始数据拉取
    await this.poll();

    // 启动轮询
    this.pollTimer = setInterval(() => {
      if (!this.disposed) {
        this.poll().catch((err) => {
          console.error("[EnergyDataAdapter] poll error:", err);
          this.bus.emit("data:error", { message: String(err) });
        });
      }
    }, this.options.pollInterval);
  }

  disconnect(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.connected = false;
  }

  dispose(): void {
    this.disconnect();
    this.disposed = true;
    this.cache = { buildings: new Map(), alerts: new Map(), pipelines: new Map(), energyHistory: new Map() };
  }

  // ─────────────────────────────────────────────────────────
  //  公开API：数据获取
  // ─────────────────────────────────────────────────────────

  getBuildings(): StandardBuilding[] {
    return Array.from(this.cache.buildings.values());
  }

  getBuilding(id: string): StandardBuilding | undefined {
    return this.cache.buildings.get(id);
  }

  getAlerts(buildingId?: string): AlertData[] {
    const all = Array.from(this.cache.alerts.values());
    if (buildingId) {
      return all.filter((a) => a.buildingId === buildingId);
    }
    return all.sort((a, b) => b.timestamp - a.timestamp);
  }

  getActiveAlerts(): AlertData[] {
    return Array.from(this.cache.alerts.values()).filter((a) => !a.acknowledged);
  }

  getPipelines(): PipelineSegment[] {
    return Array.from(this.cache.pipelines.values());
  }

  getEnergyHistory(buildingId: string, limit?: number): BuildingEnergyData[] {
    const history = this.cache.energyHistory.get(buildingId) ?? [];
    return limit ? history.slice(-limit) : history;
  }

  getBuildingEnergy(id: string): BuildingEnergyData | undefined {
    const history = this.cache.energyHistory.get(id);
    return history?.[history.length - 1];
  }

  // ─────────────────────────────────────────────────────────
  //  核心：轮询数据拉取
  // ─────────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    const { source } = this.options;
    const headers = this.getAuthHeaders();

    await Promise.allSettled([
      this.fetchBuildings(source.buildingEndpoint, headers),
      source.alertEndpoint ? this.fetchAlerts(source.alertEndpoint, headers) : Promise.resolve(),
      source.pipelineEndpoint ? this.fetchPipelines(source.pipelineEndpoint, headers) : Promise.resolve(),
    ]);
  }

  private async fetchBuildings(endpoint: string, headers: Record<string, string>): Promise<void> {
    try {
      const url = `${source.baseUrl}${endpoint}`.replace("{baseUrl}", this.options.source.baseUrl);
      const response = await fetch(`${this.options.source.baseUrl}${endpoint}`, { headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = (await response.json()) as Record<string, unknown>;

      let items: RawApiBuilding[] = [];
      if (Array.isArray(raw.data)) {
        items = raw.data as RawApiBuilding[];
      } else if (Array.isArray(raw)) {
        items = raw as RawApiBuilding[];
      } else if (raw.buildings && Array.isArray(raw.buildings)) {
        items = raw.buildings as RawApiBuilding[];
      }

      if (!this.options.dataFilter(items)) return;

      const mappings = this.options.customMappings.buildings ?? DEFAULT_BUILDING_MAPPINGS;
      const prevBuildings = new Map(this.cache.buildings);

      this.cache.buildings.clear();

      for (const item of items) {
        const mapped = applyMappingRules<StandardBuilding>(item as Record<string, unknown>, mappings);
        if (!mapped.id) continue;

        // 合并实时数据
        const existing = prevBuildings.get(mapped.id);
        const building: StandardBuilding = {
          id: mapped.id,
          name: mapped.name ?? "未知建筑",
          buildingType: (mapped.buildingType as BuildingKind) ?? "office",
          floorArea: mapped.floorArea ?? existing?.floorArea ?? 0,
          floors: mapped.floors ?? existing?.floors ?? 1,
          height: mapped.height ?? existing?.height ?? 3,
          buildYear: mapped.buildYear ?? existing?.buildYear ?? 2020,
          color: mapped.color ?? existing?.color ?? "#38bdf8",
          position: (mapped.position as [number, number, number]) ?? existing?.position ?? [0, 0, 0],
          rotationY: mapped.rotationY ?? existing?.rotationY ?? 0,
          description: mapped.description ?? existing?.description,
          zone: mapped.zone ?? existing?.zone,
          metadata: mapped.metadata ?? existing?.metadata,
          latestEnergy: existing?.latestEnergy,
          alertCount: existing?.alertCount ?? 0,
        };

        // 更新实时能耗
        if (mapped.electricity !== undefined || mapped.hvac !== undefined) {
          const energyData: BuildingEnergyData = {
            buildingId: mapped.id,
            timestamp: Date.now(),
            electricity: mapped.electricity ?? 0,
            hvac: mapped.hvac ?? 0,
            lighting: mapped.lighting ?? 0,
            equipment: mapped.equipment ?? 0,
            total: (mapped.electricity ?? 0) + (mapped.hvac ?? 0) / 1000,
          };
          building.latestEnergy = energyData;

          // 存入历史
          if (this.options.enableHistory) {
            const history = this.cache.energyHistory.get(mapped.id) ?? [];
            history.push(energyData);
            if (history.length > MAX_ENERGY_HISTORY) history.shift();
            this.cache.energyHistory.set(mapped.id, history);
          }
        }

        // 更新告警计数
        building.alertCount = Array.from(this.cache.alerts.values()).filter(
          (a) => a.buildingId === mapped.id && !a.acknowledged,
        ).length;

        this.cache.buildings.set(mapped.id, building);
      }

      this.bus.emit("data:update", { type: "buildings", data: this.getBuildings() });
    } catch (err) {
      console.error("[EnergyDataAdapter] fetchBuildings error:", err);
      throw err;
    }
  }

  private async fetchAlerts(endpoint: string, headers: Record<string, string>): Promise<void> {
    try {
      const response = await fetch(`${this.options.source.baseUrl}${endpoint}`, { headers });
      if (!response.ok) return;
      const raw = (await response.json()) as Record<string, unknown>;

      let items: RawApiAlert[] = [];
      if (Array.isArray(raw.data)) items = raw.data as RawApiAlert[];
      else if (Array.isArray(raw)) items = raw as RawApiAlert[];
      else if (raw.alerts && Array.isArray(raw.alerts)) items = raw.alerts as RawApiAlert[];

      const mappings = this.options.customMappings.alerts ?? DEFAULT_ALERT_MAPPINGS;
      const prevAlerts = new Map(this.cache.alerts);

      this.cache.alerts.clear();
      for (const item of items) {
        const mapped = applyMappingRules<AlertData>(item as Record<string, unknown>, mappings);
        if (!mapped.id) continue;
        const alert: AlertData = {
          id: mapped.id,
          title: mapped.title ?? "未知告警",
          description: mapped.description ?? "",
          level: (mapped.level as AlertLevel) ?? "info",
          buildingId: mapped.buildingId,
          segmentId: mapped.segmentId,
          deviceId: mapped.deviceId,
          timestamp: mapped.timestamp ?? Date.now(),
          acknowledged: mapped.acknowledged ?? false,
          value: mapped.value,
          threshold: mapped.threshold,
          suggestion: mapped.suggestion,
        };
        this.cache.alerts.set(mapped.id, alert);

        // 新增告警通知
        const prev = prevAlerts.get(mapped.id);
        if (!prev || prev.acknowledged !== alert.acknowledged) {
          this.bus.emit("alert:trigger", alert);
        }
      }

      this.bus.emit("data:update", { type: "alerts", data: this.getAlerts() });
    } catch {
      /* silently ignore alert fetch errors */
    }
  }

  private async fetchPipelines(endpoint: string, headers: Record<string, string>): Promise<void> {
    try {
      const response = await fetch(`${this.options.source.baseUrl}${endpoint}`, { headers });
      if (!response.ok) return;
      const raw = (await response.json()) as Record<string, unknown>;

      let items: RawApiPipeline[] = [];
      if (Array.isArray(raw.data)) items = raw.data as RawApiPipeline[];
      else if (Array.isArray(raw)) items = raw as RawApiPipeline[];
      else if (raw.pipelines && Array.isArray(raw.pipelines)) items = raw.pipelines as RawApiPipeline[];

      const mappings = this.options.customMappings.pipelines ?? DEFAULT_PIPELINE_MAPPINGS;

      this.cache.pipelines.clear();
      for (const item of items) {
        const mapped = applyMappingRules<PipelineSegment>(item as Record<string, unknown>, mappings);
        if (!mapped.id) continue;

        const config = MEDIUM_VISUAL_CONFIGS[mapped.medium as EnergyMedium] ?? MEDIUM_VISUAL_CONFIGS.electricity;
        const segment: PipelineSegment = {
          id: mapped.id,
          name: mapped.name ?? mapped.id,
          sourceNodeId: mapped.sourceNodeId ?? "",
          targetNodeId: mapped.targetNodeId ?? "",
          diameter: mapped.diameter ?? 100,
          length: mapped.length ?? 0,
          medium: (mapped.medium as EnergyMedium) ?? "electricity",
          flowRate: mapped.flowRate ?? 0,
          loadRate: Math.min(1, Math.max(0, mapped.loadRate ?? 0)),
          isAlert: mapped.isAlert ?? false,
          controlPoints: mapped.controlPoints,
          metadata: mapped.metadata,
          ...config,
        };
        this.cache.pipelines.set(mapped.id, segment);
      }

      this.bus.emit("data:update", { type: "pipelines", data: this.getPipelines() });
    } catch {
      /* silently ignore pipeline fetch errors */
    }
  }

  private getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}

// ─────────────────────────────────────────────────────────────
//  工厂函数
// ─────────────────────────────────────────────────────────────

let globalAdapter: EnergyDataAdapter | null = null;

export function createDataAdapter(options: DataAdapterOptions): EnergyDataAdapter {
  const adapter = new EnergyDataAdapter(options);
  globalAdapter = adapter;
  return adapter;
}

export function getGlobalDataAdapter(): EnergyDataAdapter | null {
  return globalAdapter;
}

// ─────────────────────────────────────────────────────────────
//  默认模拟数据（用于开发/无后端时）
// ─────────────────────────────────────────────────────────────

export function createMockBuildings(): StandardBuilding[] {
  const BUILDING_DEFS: Array<{
    id: string;
    name: string;
    kind: BuildingKind;
    pos: [number, number, number];
    color: string;
    floors: number;
    elec: number;
  }> = [
    { id: "BLD_EC", name: "能源中心", kind: "energy", pos: [0, 0, 0], color: "#3b82f6", floors: 2, elec: 118.6 },
    { id: "BLD_OF01", name: "金融塔A", kind: "office", pos: [-2.9, 0, -3.3], color: "#3b82f6", floors: 24, elec: 96.5 },
    { id: "BLD_OF02", name: "金融塔B", kind: "office", pos: [-3.9, 0, -2.7], color: "#2563eb", floors: 30, elec: 102.3 },
    { id: "BLD_OF03", name: "总部大厦", kind: "office", pos: [-2.3, 0, -4.1], color: "#1d4ed8", floors: 28, elec: 99.1 },
    { id: "BLD_HP01", name: "市立医院", kind: "hospital", pos: [3.8, 0, -3.4], color: "#ef4444", floors: 18, elec: 88.7 },
    { id: "BLD_HP02", name: "急诊中心", kind: "hospital", pos: [2.6, 0, -3.9], color: "#dc2626", floors: 8, elec: 76.2 },
    { id: "BLD_RS01", name: "梧桐苑", kind: "residential", pos: [2.7, 0, 2.9], color: "#eab308", floors: 16, elec: 68.4 },
    { id: "BLD_RS02", name: "银杏里", kind: "residential", pos: [3.9, 0, 3.2], color: "#ca8a04", floors: 14, elec: 65.1 },
    { id: "BLD_RS03", name: "云栖台", kind: "residential", pos: [2.5, 0, 4.1], color: "#a16207", floors: 18, elec: 71.3 },
    { id: "BLD_SC01", name: "实验学校", kind: "school", pos: [4.5, 0, 3.8], color: "#f59e0b", floors: 6, elec: 58.2 },
    { id: "BLD_FC01", name: "智造一厂", kind: "factory", pos: [-2.9, 0, 3.1], color: "#64748b", floors: 4, elec: 112.4 },
    { id: "BLD_FC02", name: "装配车间", kind: "factory", pos: [-3.8, 0, 3.7], color: "#475569", floors: 2, elec: 98.2 },
    { id: "BLD_CM01", name: "环宇广场", kind: "commercial", pos: [1.9, 0, 0.45], color: "#14b8a6", floors: 6, elec: 86.2 },
    { id: "BLD_CM02", name: "邻里MALL", kind: "commercial", pos: [-0.5, 0, 1.85], color: "#0d9488", floors: 4, elec: 79.4 },
    { id: "BLD_CM03", name: "科创商街", kind: "commercial", pos: [-1.85, 0, -0.35], color: "#2dd4bf", floors: 5, elec: 82.1 },
  ];

  return BUILDING_DEFS.map((def) => ({
    id: def.id,
    name: def.name,
    buildingType: def.kind,
    floorArea: def.floors * 800,
    floors: def.floors,
    height: def.floors * 3.5,
    buildYear: 2020,
    color: def.color,
    position: def.pos,
    rotationY: 0,
    latestEnergy: {
      buildingId: def.id,
      timestamp: Date.now(),
      electricity: def.elec,
      hvac: def.elec * 510,
      lighting: def.elec * 0.32,
      equipment: def.elec * 0.29,
      total: def.elec + (def.elec * 510) / 1000,
      loadRate: def.elec / 150,
    },
  }));
}
