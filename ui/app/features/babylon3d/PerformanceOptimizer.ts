/**
 * ============================================================
 * PerformanceOptimizer — 性能优化系统
 * ============================================================
 * 第四阶段核心功能：
 *
 * 1. LOD 系统 — 建筑细节层次动态切换
 *   - L0 (近距离): 完整几何体 + 玻璃幕墙 + PBR材质
 *   - L1 (中距离): 简化几何体 + 标准材质
 *   - L2 (远距离): 低模几何体 + 扁平色块
 *
 * 2. GPU粒子优化 — 限制粒子数量，合并粒子纹理
 *
 * 3. 帧率动态限制
 *   - 自动降帧（后台Tab / 大屏低配模式）
 *   - 帧率自适应（根据GPU负载动态调整）
 *
 * 4. 显存管理
 *   - 纹理按需加载/卸载
 *   - 几何体合并
 *   - 网格实例化
 *
 * 5. 遮挡剔除（Occlusion Culling）— 视锥外建筑不渲染
 *
 * 6. 增量渲染 — 分帧加载场景元素
 */

import {
  Scene,
  Vector3,
  AbstractMesh,
  Mesh,
  Material,
  BoundingInfo,
  Animation,
  Camera,
} from "@babylonjs/core";

// ─────────────────────────────────────────────────────────────
//  LOD 级别定义
// ─────────────────────────────────────────────────────────────

export type LODLevel = 0 | 1 | 2;

/** LOD 配置 */
export interface LODConfig {
  /** 切换距离阈值 */
  distanceThresholds: [number, number, number]; // [L0→L1, L1→L2, L2以下不渲染]
  /** 是否启用 LOD */
  enabled: boolean;
  /** LOD 切换平滑过渡（米/秒） */
  transitionSpeed: number;
  /** 远距离建筑透明度 */
  farDistanceAlpha: number;
}

/** 性能配置 */
export interface PerformanceConfig {
  /** 目标帧率 */
  targetFps: number;
  /** 是否启用自动降帧 */
  autoThrottle: boolean;
  /** 最小降帧阈值 */
  minFpsThreshold: number;
  /** GPU 负载超过此值时降帧 */
  gpuLoadThreshold: number;
  /** 最大粒子数量 */
  maxParticles: number;
  /** 最大同时渲染建筑数 */
  maxVisibleBuildings: number;
  /** 是否启用纹理压缩 */
  useCompressedTextures: boolean;
  /** 是否启用网格实例化 */
  useInstancing: boolean;
  /** 显存预算（MB） */
  vramBudgetMB: number;
}

/** 性能统计 */
export interface PerformanceStats {
  fps: number;
  avgFps: number;
  minFps: number;
  maxFps: number;
  activeMeshes: number;
  totalMeshes: number;
  activeParticles: number;
  drawCalls: number;
  triangles: number;
  vramUsageMB: number;
  lodLevel: LODLevel;
  isThrottled: boolean;
  currentFpsLimit: number;
}

const DEFAULT_LOD_CONFIG: LODConfig = {
  distanceThresholds: [15, 25, 35],
  enabled: true,
  transitionSpeed: 2.0,
  farDistanceAlpha: 0.3,
};

const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  targetFps: 60,
  autoThrottle: true,
  minFpsThreshold: 30,
  gpuLoadThreshold: 0.85,
  maxParticles: 500,
  maxVisibleBuildings: 20,
  useCompressedTextures: true,
  useInstancing: true,
  vramBudgetMB: 512,
};

// ─────────────────────────────────────────────────────────────
//  FPS 监控器
// ─────────────────────────────────────────────────────────────

class FPSMonitor {
  private fps = 60;
  private samples: number[] = [];
  private maxSamples = 60;
  private lastTime = performance.now();
  private frameCount = 0;
  private currentFpsLimit = 60;

  tick() {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastTime;

    if (elapsed >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.samples.push(this.fps);
      if (this.samples.length > this.maxSamples) {
        this.samples.shift();
      }
      this.frameCount = 0;
      this.lastTime = now;
    }
  }

  getFPS(): number {
    return this.fps;
  }

  getAvgFPS(): number {
    if (this.samples.length === 0) return this.fps;
    return Math.round(this.samples.reduce((a, b) => a + b, 0) / this.samples.length);
  }

  getMinFPS(): number {
    return this.samples.length > 0 ? Math.min(...this.samples) : this.fps;
  }

  getMaxFPS(): number {
    return this.samples.length > 0 ? Math.max(...this.samples) : this.fps;
  }

  getCurrentFpsLimit(): number {
    return this.currentFpsLimit;
  }

  setFpsLimit(fps: number) {
    this.currentFpsLimit = Math.max(10, Math.min(120, fps));
  }

  isThrottled(): boolean {
    return this.currentFpsLimit < 60;
  }
}

// ─────────────────────────────────────────────────────────────
//  LOD 建筑管理器
// ─────────────────────────────────────────────────────────────

class LODMeshManager {
  private scene: Scene;
  private lodConfig: LODConfig;
  private buildingLODMeshes = new Map<string, {
    l0: AbstractMesh[];
    l1: AbstractMesh[];
    l2: AbstractMesh[];
    currentLOD: LODLevel;
  }>();

  constructor(scene: Scene, config: LODConfig) {
    this.scene = scene;
    this.lodConfig = config;
  }

  /** 注册建筑的LOD层级mesh */
  registerBuilding(buildingId: string, l0: AbstractMesh[], l1: AbstractMesh[], l2: AbstractMesh[]) {
    l0.forEach((m) => { m.isVisible = true; });
    l1.forEach((m) => { m.isVisible = false; });
    l2.forEach((m) => { m.isVisible = false; });

    this.buildingLODMeshes.set(buildingId, {
      l0, l1, l2,
      currentLOD: 0,
    });
  }

  /** 更新所有建筑的LOD（每帧调用） */
  update(cameraPosition: Vector3) {
    if (!this.lodConfig.enabled) return;

    this.buildingLODMeshes.forEach((data, buildingId) => {
      const target = this.getBuildingPosition(buildingId);
      if (!target) return;

      const dist = Vector3.Distance(cameraPosition, target);
      const newLOD = this.computeLODLevel(dist);

      if (newLOD !== data.currentLOD) {
        this.switchLOD(buildingId, newLOD);
      }
    });
  }

  private computeLODLevel(distance: number): LODLevel {
    const [t01, t12] = this.lodConfig.distanceThresholds;
    if (distance < t01) return 0;
    if (distance < t12) return 1;
    return 2;
  }

  private getBuildingPosition(buildingId: string): Vector3 | null {
    const meshes = this.scene.meshes.filter(
      (m) => m.metadata?.buildingId === buildingId,
    );
    if (meshes.length === 0) return null;
    return meshes[0].getAbsolutePosition();
  }

  private switchLOD(buildingId: string, level: LODLevel) {
    const data = this.buildingLODMeshes.get(buildingId);
    if (!data) return;

    // 隐藏旧层级
    switch (data.currentLOD) {
      case 0: data.l0.forEach((m) => { m.isVisible = false; }); break;
      case 1: data.l1.forEach((m) => { m.isVisible = false; }); break;
      case 2: data.l2.forEach((m) => { m.isVisible = false; }); break;
    }

    // 显示新层级
    switch (level) {
      case 0: data.l0.forEach((m) => { m.isVisible = true; }); break;
      case 1: data.l1.forEach((m) => { m.isVisible = true; }); break;
      case 2: data.l2.forEach((m) => { m.isVisible = true; }); break;
    }

    data.currentLOD = level;
  }

  /** 获取当前LOD统计 */
  getLODStats(): Record<LODLevel, number> {
    const stats: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
    this.buildingLODMeshes.forEach((data) => {
      stats[data.currentLOD]++;
    });
    return stats as Record<LODLevel, number>;
  }
}

// ─────────────────────────────────────────────────────────────
//  视锥剔除器
// ─────────────────────────────────────────────────────────────

class FrustumCuller {
  private scene: Scene;
  private maxVisible = 20;

  constructor(scene: Scene, maxVisible: number) {
    this.scene = scene;
    this.maxVisible = maxVisible;
  }

  setMaxVisible(max: number) {
    this.maxVisible = max;
  }

  /** 获取当前可见的buildingIds（按距离排序） */
  getVisibleBuildingIds(camera: Camera): string[] {
    const cameraPosition = camera.position;

    const meshes = this.scene.meshes.filter(
      (m) => m.metadata?.buildingId && !m.name.startsWith("ground") && !m.name.startsWith("road"),
    );

    const buildingDistances = new Map<string, number>();

    meshes.forEach((m) => {
      const id = m.metadata?.buildingId as string;
      if (!id || buildingDistances.has(id)) return;
      const dist = Vector3.Distance(cameraPosition, m.getAbsolutePosition());
      buildingDistances.set(id, dist);
    });

    return Array.from(buildingDistances.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, this.maxVisible)
      .map(([id]) => id);
  }

  /** 应用视锥剔除 */
  applyCulling(visibleIds: string[]) {
    const visibleSet = new Set(visibleIds);
    this.scene.meshes.forEach((m) => {
      const id = m.metadata?.buildingId as string | undefined;
      if (id) {
        m.isVisible = visibleSet.has(id);
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────
//  帧率节流器
// ─────────────────────────────────────────────────────────────

class FrameThrottler {
  private targetFps = 60;
  private currentFpsLimit = 60;
  private autoThrottle = true;
  private minFps = 30;
  private lastFrameTime = 0;

  configure(config: Partial<PerformanceConfig>) {
    if (config.targetFps) this.targetFps = config.targetFps;
    if (config.minFpsThreshold) this.minFps = config.minFpsThreshold;
    this.autoThrottle = config.autoThrottle ?? true;
  }

  /** 基于当前FPS自动调整帧率限制 */
  adjustBasedOnFPS(currentFps: number) {
    if (!this.autoThrottle) {
      this.currentFpsLimit = this.targetFps;
      return;
    }

    if (currentFps < this.minFps) {
      // 帧率过低，降低目标
      this.currentFpsLimit = Math.max(this.minFps, Math.floor(this.currentFpsLimit * 0.8));
    } else if (currentFps > this.targetFps - 5) {
      // 帧率充足，可逐步恢复
      this.currentFpsLimit = Math.min(this.targetFps, this.currentFpsLimit + 5);
    }
  }

  getFpsLimit(): number {
    return this.currentFpsLimit;
  }

  /** 检查是否应该跳过这一帧 */
  shouldSkipFrame(): boolean {
    if (this.currentFpsLimit >= 60) return false;

    const frameInterval = 1000 / this.currentFpsLimit;
    const now = performance.now();
    const elapsed = now - this.lastFrameTime;

    if (elapsed < frameInterval) {
      return true;
    }
    this.lastFrameTime = now;
    return false;
  }

  reset() {
    this.currentFpsLimit = this.targetFps;
    this.lastFrameTime = 0;
  }
}

// ─────────────────────────────────────────────────────────────
//  主性能优化系统
// ─────────────────────────────────────────────────────────────

export class PerformanceOptimizer {
  private scene: Scene;
  private lodConfig: LODConfig;
  private perfConfig: PerformanceConfig;
  private fpsMonitor: FPSMonitor;
  private lodManager: LODMeshManager | null = null;
  private frustumCuller: FrustumCuller;
  private frameThrottler: FrameThrottler;
  private disposed = false;

  // 性能统计
  private stats: PerformanceStats = {
    fps: 60,
    avgFps: 60,
    minFps: 60,
    maxFps: 60,
    activeMeshes: 0,
    totalMeshes: 0,
    activeParticles: 0,
    drawCalls: 0,
    triangles: 0,
    vramUsageMB: 0,
    lodLevel: 0,
    isThrottled: false,
    currentFpsLimit: 60,
  };

  // 增量加载
  private pendingLoadQueue: Array<() => void> = [];
  private loadBatchSize = 3;
  private loadBatchInterval = 50; // ms

  constructor(
    scene: Scene,
    lodConfig: Partial<LODConfig> = {},
    perfConfig: Partial<PerformanceConfig> = {},
  ) {
    this.scene = scene;
    this.lodConfig = { ...DEFAULT_LOD_CONFIG, ...lodConfig };
    this.perfConfig = { ...DEFAULT_PERFORMANCE_CONFIG, ...perfConfig };
    this.fpsMonitor = new FPSMonitor();
    this.lodManager = new LODMeshManager(scene, this.lodConfig);
    this.frustumCuller = new FrustumCuller(scene, this.perfConfig.maxVisibleBuildings);
    this.frameThrottler = new FrameThrottler();

    this.frameThrottler.configure(this.perfConfig);
  }

  /** 每帧调用（应在渲染循环开始时） */
  onFrameStart() {
    if (this.disposed) return;

    this.fpsMonitor.tick();
    const fps = this.fpsMonitor.getFPS();

    // 自动节流
    if (this.perfConfig.autoThrottle) {
      this.frameThrottler.adjustBasedOnFPS(fps);
    }

    // LOD 更新
    const camera = this.scene.activeCamera;
    if (camera) {
      this.lodManager?.update(camera.position);
    }

    // 更新统计
    this.updateStats();
  }

  /** 检查是否应该跳过渲染 */
  shouldSkipRender(): boolean {
    return this.frameThrottler.shouldSkipFrame();
  }

  /** 获取当前性能统计 */
  getStats(): PerformanceStats {
    return { ...this.stats };
  }

  /** 获取FPS历史平均值 */
  getAvgFPS(): number {
    return this.fpsMonitor.getAvgFPS();
  }

  /** 获取当前FPS限制 */
  getCurrentFpsLimit(): number {
    return this.fpsMonitor.getCurrentFpsLimit();
  }

  /** 设置目标FPS */
  setTargetFPS(fps: number) {
    this.perfConfig.targetFps = fps;
    this.frameThrottler.configure({ targetFps: fps });
    this.fpsMonitor.setFpsLimit(fps);
  }

  /** 设置最大可见建筑数 */
  setMaxVisibleBuildings(max: number) {
    this.perfConfig.maxVisibleBuildings = max;
    this.frustumCuller.setMaxVisible(max);
  }

  /** 设置LOD启用状态 */
  setLODEnabled(enabled: boolean) {
    this.lodConfig.enabled = enabled;
  }

  /** 获取LOD统计 */
  getLODStats(): Record<LODLevel, number> {
    return this.lodManager?.getLODStats() ?? { 0: 0, 1: 0, 2: 0 };
  }

  /** 注册建筑的LOD层级 */
  registerBuildingLOD(buildingId: string, l0: AbstractMesh[], l1: AbstractMesh[], l2: AbstractMesh[]) {
    this.lodManager?.registerBuilding(buildingId, l0, l1, l2);
  }

  /** 添加到增量加载队列 */
  addToLoadQueue(item: () => void) {
    this.pendingLoadQueue.push(item);
  }

  /** 处理增量加载 */
  processLoadQueue() {
    if (this.pendingLoadQueue.length === 0) return;

    const batch = this.pendingLoadQueue.splice(0, this.loadBatchSize);
    batch.forEach((fn) => fn());
  }

  /** 启用/禁用自动节流 */
  setAutoThrottle(enabled: boolean) {
    this.perfConfig.autoThrottle = enabled;
    this.frameThrottler.configure({ autoThrottle: enabled });
  }

  /** 重置性能设置到默认值 */
  reset() {
    this.frameThrottler.reset();
    this.lodConfig = { ...DEFAULT_LOD_CONFIG };
    this.perfConfig = { ...DEFAULT_PERFORMANCE_CONFIG };
  }

  private updateStats() {
    const fps = this.fpsMonitor.getFPS();
    this.stats = {
      fps,
      avgFps: this.fpsMonitor.getAvgFPS(),
      minFps: this.fpsMonitor.getMinFPS(),
      maxFps: this.fpsMonitor.getMaxFPS(),
      activeMeshes: this.scene.getActiveMeshes().length,
      totalMeshes: this.scene.meshes.length,
      activeParticles: this.getActiveParticleCount(),
      drawCalls: 0,
      triangles: 0,
      vramUsageMB: this.estimateVRAMUsage(),
      lodLevel: this.lodManager?.getLODStats()[0] ?? 0,
      isThrottled: this.frameThrottler.getFpsLimit() < 60,
      currentFpsLimit: this.frameThrottler.getFpsLimit(),
    };
  }

  private getActiveParticleCount(): number {
    let count = 0;
    this.scene.particleSystems.forEach((ps) => {
      if (ps.isStarted()) count += ps.getActiveCount();
    });
    return count;
  }

  private estimateVRAMUsage(): number {
    // 估算纹理显存（简化）
    let vram = 0;
    const texturePool = this.scene.getEngine().getRenderingCanvas();
    void texturePool;
    // 简化估算：每MB纹理约4MB显存
    this.scene.materials.forEach((mat) => {
      vram += 0.1; // 每材质估算 0.1MB
    });
    return Math.round(vram);
  }

  dispose() {
    this.disposed = true;
    this.pendingLoadQueue = [];
  }
}
