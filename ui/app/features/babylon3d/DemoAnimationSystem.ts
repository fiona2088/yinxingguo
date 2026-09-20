/**
 * ============================================================
 * DemoAnimationSystem — 演示动画系统（第四阶段增强版）
 * ============================================================
 * 第四阶段增强功能：
 *   - 修复相机飞向动画（使用正确 API）
 *   - 电影黑边（Cinema Bar）效果
 *   - 演示进度指示器
 *   - 脚本编辑器 UI（可视化编辑关键帧）
 *   - 相机路径预览（3D 轨迹可视化）
 *   - 关键帧缓动曲线编辑器
 */

import {
  Scene,
  Vector3,
  Color3,
  Animation,
  EasingFunction,
  QuadraticEase,
  SineEase,
  CircleEase,
  BackEase,
  ExponentialEase,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  ParticleSystem,
  DynamicTexture,
} from "@babylonjs/core";
import {
  DemoMode,
  DemoScript,
  CameraKeyframe,
  CameraState,
  AlertData,
} from "./types";

// re-export DemoMode so consumers can import it from here
export type { DemoMode } from "./types";

// ─────────────────────────────────────────────────────────────
//  缓动函数映射（第四阶段增强）
// ─────────────────────────────────────────────────────────────

export type EasingType =
  | "ease-out"
  | "ease-in"
  | "ease-in-out"
  | "linear"
  | "bounce"
  | "elastic"
  | "back"
  | "expo";

export const EASING_FUNCTIONS: Record<string, (ease: EasingFunction) => void> = {
  "ease-out": (e) => e.setEasingMode(EasingFunction.EASINGMODE_EASEOUT),
  "ease-in": (e) => e.setEasingMode(EasingFunction.EASINGMODE_EASEIN),
  "ease-in-out": (e) => e.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT),
  linear: (e) => e.setEasingMode(EasingFunction.EASINGMODE_EASEOUT),
};

/** 获取缓动函数实例 */
export function createEasingFunction(type: EasingType): EasingFunction {
  switch (type) {
    case "ease-out":
    case "linear": {
      const e = new QuadraticEase();
      e.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
      return e;
    }
    case "ease-in": {
      const e = new QuadraticEase();
      e.setEasingMode(EasingFunction.EASINGMODE_EASEIN);
      return e;
    }
    case "ease-in-out": {
      const e = new SineEase();
      e.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
      return e;
    }
    case "bounce": {
      const e = new SineEase();
      e.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
      return e;
    }
    case "elastic": {
      const e = new SineEase();
      e.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
      return e;
    }
    case "back": {
      const e = new BackEase(1);
      e.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
      return e;
    }
    case "expo": {
      const e = new ExponentialEase();
      e.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
      return e;
    }
    default: {
      const e = new QuadraticEase();
      e.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
      return e;
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  关键帧定义（第四阶段增强）
// ─────────────────────────────────────────────────────────────

export interface DemoKeyframe {
  id: string;
  time: number;
  /** 事件类型 */
  type:
    | "camera:fly"
    | "building:highlight"
    | "building:select"
    | "pipeline:alert"
    | "panel:tab"
    | "effect:intensity"
    | "label:show"
    | "label:hide"
    | "cinemabar"
    | "sound:play";
  payload: Record<string, unknown>;
  /** 可选缓动函数 */
  easing?: EasingType;
  /** 是否启用 */
  enabled: boolean;
}

export interface DemoEvent {
  time: number;
  type: DemoKeyframe["type"];
  payload: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
//  电影黑边效果
// ─────────────────────────────────────────────────────────────

class CinemaBarEffect {
  private topBar: Mesh | null = null;
  private bottomBar: Mesh | null = null;
  private active = false;
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  show(aspectRatio = 2.39) {
    if (this.active) return;
    this.active = true;

    const engine = this.scene.getEngine();
    const canvas = engine.getRenderingCanvas();
    if (!canvas) return;

    const canvasW = canvas.clientWidth;
    const canvasH = canvas.clientHeight;
    const currentRatio = canvasW / canvasH;

    let barHeight = 0;
    if (currentRatio > aspectRatio) {
      // 需要添加上下黑边
      barHeight = Math.round((canvasH - canvasW / aspectRatio) / 2);
    }

    if (barHeight <= 0) return;

    // 上黑边
    this.topBar = MeshBuilder.CreateBox("cinemaBarTop", {
      width: canvasW * 2,
      height: barHeight * 2,
      depth: 0.01,
    }, this.scene);
    this.topBar.position = new Vector3(0, canvasH / 2 + barHeight / 2, 5);
    const matTop = new StandardMaterial("cinemaTopMat", this.scene);
    matTop.diffuseColor = new Color3(0.01, 0.01, 0.02);
    matTop.emissiveColor = new Color3(0.01, 0.01, 0.02);
    matTop.disableLighting = true;
    this.topBar.material = matTop;

    // 下黑边
    this.bottomBar = MeshBuilder.CreateBox("cinemaBarBottom", {
      width: canvasW * 2,
      height: barHeight * 2,
      depth: 0.01,
    }, this.scene);
    this.bottomBar.position = new Vector3(0, -(canvasH / 2 + barHeight / 2), 5);
    const matBot = new StandardMaterial("cinemaBotMat", this.scene);
    matBot.diffuseColor = new Color3(0.01, 0.01, 0.02);
    matBot.emissiveColor = new Color3(0.01, 0.01, 0.02);
    matBot.disableLighting = true;
    this.bottomBar.material = matBot;
  }

  hide() {
    if (!this.active) return;
    this.active = false;
    this.topBar?.dispose();
    this.bottomBar?.dispose();
    this.topBar = null;
    this.bottomBar = null;
  }

  dispose() {
    this.hide();
  }
}

// ─────────────────────────────────────────────────────────────
//  相机路径可视化
// ─────────────────────────────────────────────────────────────

class CameraPathVisualizer {
  private scene: Scene;
  private pathMesh: Mesh | null = null;
  private waypointMeshes: Mesh[] = [];
  private currentPositionMesh: Mesh | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /** 可视化相机路径 */
  visualizePath(keyframes: CameraKeyframe[]) {
    this.clear();

    if (keyframes.length < 2) return;

    // 路径线
    const points = keyframes.map((kf) => new Vector3(...kf.state.position));
    this.pathMesh = MeshBuilder.CreateLines("camPath", {
      points,
      updatable: false,
    }, this.scene);
    this.pathMesh.color = new Color3(1, 0.76, 0.03);

    // 路径点
    keyframes.forEach((kf, idx) => {
      const sphere = MeshBuilder.CreateSphere(`waypoint-${idx}`, {
        diameter: 0.3,
        segments: 8,
      }, this.scene);
      sphere.position = new Vector3(...kf.state.position);
      const mat = new StandardMaterial(`wpMat-${idx}`, this.scene);
      mat.diffuseColor = new Color3(0.23, 0.74, 0.98);
      mat.emissiveColor = new Color3(0.23, 0.74, 0.98);
      sphere.material = mat;
      this.waypointMeshes.push(sphere);
    });
  }

  /** 显示当前位置 */
  showCurrentPosition(position: Vector3) {
    if (!this.currentPositionMesh) {
      this.currentPositionMesh = MeshBuilder.CreateSphere("camCurrent", {
        diameter: 0.4,
        segments: 8,
      }, this.scene);
      const mat = new StandardMaterial("camCurrentMat", this.scene);
      mat.diffuseColor = new Color3(1, 0.4, 0.1);
      mat.emissiveColor = new Color3(1, 0.4, 0.1);
      this.currentPositionMesh.material = mat;
    }
    this.currentPositionMesh.position = position.clone();
  }

  /** 清除可视化 */
  clear() {
    this.pathMesh?.dispose();
    this.waypointMeshes.forEach((m) => m.dispose());
    this.currentPositionMesh?.dispose();
    this.pathMesh = null;
    this.waypointMeshes = [];
    this.currentPositionMesh = null;
  }

  dispose() {
    this.clear();
  }
}

// ─────────────────────────────────────────────────────────────
//  演示动画管理器（第四阶段增强）
// ─────────────────────────────────────────────────────────────

export class DemoAnimationSystem {
  private scene: Scene;
  private currentMode: DemoMode | null = null;
  private isPlaying = false;
  private isPaused = false;
  private startTime = 0;
  private elapsed = 0;
  private animationLoop: (() => void) | null = null;
  private activeEventIndex = 0;
  private onEventCallbacks = new Map<string, (payload: Record<string, unknown>) => void>();
  private cinemaBar: CinemaBarEffect;
  private pathVisualizer: CameraPathVisualizer;
  private onProgressCallback: ((progress: number, elapsed: number, total: number) => void) | null = null;
  private onCompleteCallback: (() => void) | null = null;
  private disposed = false;

  // 当前活跃的相机动画
  private activeCameraAnim: { position: Animation; target: Animation; fov: Animation } | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.cinemaBar = new CinemaBarEffect(scene);
    this.pathVisualizer = new CameraPathVisualizer(scene);
  }

  // ═══════════════════════════════════════════════════════════════
  //  公开 API
  // ═══════════════════════════════════════════════════════════════

  /** 播放指定模式 */
  play(mode: DemoMode, onEvent?: (event: DemoEvent) => void) {
    this.stop();
    this.currentMode = mode;
    this.isPlaying = true;
    this.isPaused = false;
    this.startTime = performance.now();
    this.elapsed = 0;
    this.activeEventIndex = 0;

    const config = DEMO_MODE_CONFIGS[mode];

    // 显示电影黑边
    this.cinemaBar.show(config.cinemaBarAspect ?? 2.39);

    const loop = () => {
      if (!this.isPlaying || this.isPaused || this.disposed) return;

      const now = performance.now();
      this.elapsed = (now - this.startTime) / 1000;

      // 循环
      if (this.elapsed >= config.totalDuration) {
        if (config.loop) {
          this.startTime = now;
          this.elapsed = 0;
          this.activeEventIndex = 0;
        } else {
          this.stop();
          this.onCompleteCallback?.();
          return;
        }
      }

      // 进度回调
      const progress = this.elapsed / config.totalDuration;
      this.onProgressCallback?.(Math.min(1, progress), this.elapsed, config.totalDuration);

      // 处理事件
      const events = config.events;
      while (
        this.activeEventIndex < events.length &&
        this.elapsed >= events[this.activeEventIndex].time
      ) {
        const event = events[this.activeEventIndex];
        this.processEvent(event, onEvent);
        this.activeEventIndex++;
      }

      this.animationLoop = requestAnimationFrame(loop);
    };

    this.animationLoop = requestAnimationFrame(loop);
  }

  /** 停止演示 */
  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    if (this.animationLoop !== null) {
      cancelAnimationFrame(this.animationLoop);
      this.animationLoop = null;
    }
    this.currentMode = null;
    this.activeEventIndex = 0;
    this.cinemaBar.hide();
    this.pathVisualizer.clear();
  }

  /** 暂停 */
  pause() {
    if (this.isPlaying) {
      this.isPaused = true;
    }
  }

  /** 恢复 */
  resume() {
    if (this.isPlaying && this.isPaused) {
      this.isPaused = false;
      // 调整 startTime 以维持正确的 elapsed
      this.startTime = performance.now() - this.elapsed * 1000;
    }
  }

  /** 跳转到指定进度 */
  seekTo(progress: number) {
    if (!this.currentMode) return;
    const config = DEMO_MODE_CONFIGS[this.currentMode];
    this.elapsed = progress * config.totalDuration;
    this.startTime = performance.now() - this.elapsed * 1000;
    // 重新计算事件索引
    this.activeEventIndex = 0;
    const events = config.events;
    for (let i = 0; i < events.length; i++) {
      if (events[i].time <= this.elapsed) {
        this.activeEventIndex = i + 1;
      }
    }
  }

  /** 注册进度回调 */
  onProgress(callback: (progress: number, elapsed: number, total: number) => void) {
    this.onProgressCallback = callback;
  }

  /** 注册完成回调 */
  onComplete(callback: () => void) {
    this.onCompleteCallback = callback;
  }

  /** 获取当前进度（0-1） */
  getProgress(): number {
    if (!this.currentMode) return 0;
    const config = DEMO_MODE_CONFIGS[this.currentMode];
    return Math.min(1, this.elapsed / config.totalDuration);
  }

  /** 获取剩余时间（秒） */
  getRemainingTime(): number {
    if (!this.currentMode) return 0;
    const config = DEMO_MODE_CONFIGS[this.currentMode];
    return Math.max(0, config.totalDuration - this.elapsed);
  }

  /** 获取总时长 */
  getTotalDuration(): number {
    if (!this.currentMode) return 0;
    return DEMO_MODE_CONFIGS[this.currentMode].totalDuration;
  }

  /** 是否正在播放 */
  getIsPlaying(): boolean {
    return this.isPlaying && !this.isPaused;
  }

  /** 可视化相机路径 */
  visualizeCameraPath() {
    if (!this.currentMode) return;
    const config = DEMO_MODE_CONFIGS[this.currentMode];
    const keyframes = config.events
      .filter((e) => e.type === "camera:fly")
      .map((e) => ({
        state: {
          position: e.payload.position as [number, number, number],
          target: e.payload.target as [number, number, number],
          fov: e.payload.fov as number,
        },
        time: e.time,
      }));
    this.pathVisualizer.visualizePath(keyframes);
  }

  /** 注册事件回调 */
  onEvent(eventType: string, callback: (payload: Record<string, unknown>) => void) {
    this.onEventCallbacks.set(eventType, callback);
  }

  /** 销毁 */
  dispose() {
    this.disposed = true;
    this.stop();
    this.cinemaBar.dispose();
    this.pathVisualizer.dispose();
    this.onEventCallbacks.clear();
  }

  // ═══════════════════════════════════════════════════════════════
  //  内部方法
  // ═══════════════════════════════════════════════════════════════

  private processEvent(event: DemoEvent, onEvent?: (event: DemoEvent) => void) {
    const callback = this.onEventCallbacks.get(event.type);
    if (callback) {
      callback(event.payload);
    }
    if (onEvent) {
      onEvent(event);
    }
  }

  /**
   * 执行相机飞向动画（第四阶段修复版）
   * 使用正确的 Babylon.js ArcRotateCamera API
   */
  flyTo(state: CameraState, duration = 2.0, easingType: EasingType = "ease-out") {
    const camera = this.scene.activeCamera;
    if (!camera) return;

    const ease = createEasingFunction(easingType);
    const target = new Vector3(...state.target);
    const position = new Vector3(...state.position);

    // 获取当前相机状态
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cam = camera as any;

    // 位置动画
    const animPos = new Animation(
      "demoCamPos",
      "position",
      60,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    );
    animPos.setEasingFunction(ease);
    animPos.setKeys([
      { frame: 0, value: cam.position.clone() },
      { frame: duration * 60, value: position },
    ]);

    // 目标动画（ArcRotateCamera.target）
    const animTarget = new Animation(
      "demoCamTarget",
      "target",
      60,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    );
    animTarget.setEasingFunction(ease);
    const currentTarget = cam.target ? cam.target.clone() : Vector3.Zero();
    animTarget.setKeys([
      { frame: 0, value: currentTarget },
      { frame: duration * 60, value: target },
    ]);

    // FOV 动画
    const animFov = new Animation(
      "demoCamFov",
      "fov",
      60,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    );
    animFov.setEasingFunction(ease);
    animFov.setKeys([
      { frame: 0, value: camera.fov },
      { frame: duration * 60, value: state.fov },
    ]);

    // 清理之前的动画
    cam.animations = [];

    // 启动三个独立动画
    this.scene.beginDirectAnimation(camera, [animPos], 0, duration * 60, false);
    this.scene.beginDirectAnimation(camera, [animTarget], 0, duration * 60, false);
    this.scene.beginDirectAnimation(camera, [animFov], 0, duration * 60, false);

    // 显示当前位置
    this.pathVisualizer.showCurrentPosition(position);
  }
}

// ─────────────────────────────────────────────────────────────
//  演示模式配置（第四阶段增强：增加 cinemaBarAspect）
// ─────────────────────────────────────────────────────────────

interface DemoModeConfig {
  label: string;
  description: string;
  totalDuration: number;
  dwellTime: number;
  loop: boolean;
  cinemaBarAspect?: number;
  events: DemoEvent[];
}

const DEMO_MODE_CONFIGS: Record<DemoMode, DemoModeConfig> = {
  normal: {
    label: "日常巡检",
    description: "全局鸟瞰 → 园区巡览 → 重点建筑 → 总览",
    totalDuration: 40,
    dwellTime: 5,
    loop: true,
    cinemaBarAspect: 2.39,
    events: [
      { time: 0, type: "camera:fly", payload: { position: [0, 25, 0], target: [0, 0, 0], fov: 1.2 } },
      { time: 4, type: "effect:intensity", payload: { bloomIntensity: 0.9, particleSpeed: 1.2 } },
      { time: 6, type: "camera:fly", payload: { position: [15, 12, 15], target: [0, 0, 0], fov: 0.9 } },
      { time: 10, type: "building:highlight", payload: { buildingId: "BLD_OF01", color: [0.23, 0.74, 0.98] } },
      { time: 12, type: "building:select", payload: { buildingId: "BLD_OF01" } },
      { time: 15, type: "camera:fly", payload: { position: [-3.9, 8, -2.7], target: [-3.9, 4, -2.7], fov: 0.6 } },
      { time: 20, type: "panel:tab", payload: { tab: "energy" } },
      { time: 22, type: "building:select", payload: { buildingId: null } },
      { time: 24, type: "camera:fly", payload: { position: [4.5, 10, -4], target: [4, 3, -3.5], fov: 0.7 } },
      { time: 28, type: "building:highlight", payload: { buildingId: "BLD_HP01" } },
      { time: 30, type: "panel:tab", payload: { tab: "alert" } },
      { time: 32, type: "camera:fly", payload: { position: [-5, 12, 5], target: [-3, 3, 3], fov: 0.85 } },
      { time: 36, type: "building:highlight", payload: { buildingId: "BLD_FC01" } },
      { time: 38, type: "camera:fly", payload: { position: [0, 20, 0], target: [0, 0, 0], fov: 1.2 } },
    ],
  },

  report: {
    label: "高层汇报",
    description: "能源总览 → 核心数据 → 同比分析 → 决策建议",
    totalDuration: 35,
    dwellTime: 8,
    loop: false,
    cinemaBarAspect: 2.39,
    events: [
      { time: 0, type: "camera:fly", payload: { position: [0, 28, 0], target: [0, 0, 0], fov: 1.3 } },
      { time: 5, type: "panel:tab", payload: { tab: "energy" } },
      { time: 8, type: "camera:fly", payload: { position: [8, 6, 8], target: [0, 1, 0], fov: 0.75 } },
      { time: 13, type: "building:select", payload: { buildingId: "BLD_EC" } },
      { time: 15, type: "effect:intensity", payload: { bloomIntensity: 1.0, glowIntensity: 1.0 } },
      { time: 17, type: "camera:fly", payload: { position: [-8, 5, -8], target: [-3, 3, -3], fov: 0.6 } },
      { time: 22, type: "panel:tab", payload: { tab: "account" } },
      { time: 26, type: "camera:fly", payload: { position: [0, 15, 12], target: [0, 1, 0], fov: 0.9 } },
      { time: 30, type: "building:select", payload: { buildingId: null } },
    ],
  },

  inspection: {
    label: "设备巡检",
    description: "设备清单 → 运行状态 → 能耗明细 → 告警确认",
    totalDuration: 45,
    dwellTime: 6,
    loop: true,
    cinemaBarAspect: 1.85,
    events: [
      { time: 0, type: "camera:fly", payload: { position: [12, 8, 12], target: [0, 0, 0], fov: 0.9 } },
      { time: 5, type: "panel:tab", payload: { tab: "device" } },
      { time: 7, type: "camera:fly", payload: { position: [-2.9, 5, -3.3], target: [-2.9, 3, -3.3], fov: 0.55 } },
      { time: 12, type: "building:select", payload: { buildingId: "BLD_OF01" } },
      { time: 15, type: "effect:intensity", payload: { particleSpeed: 2.0 } },
      { time: 17, type: "camera:fly", payload: { position: [3.8, 5, -3.4], target: [3.8, 3, -3.4], fov: 0.55 } },
      { time: 22, type: "building:select", payload: { buildingId: "BLD_HP01" } },
      { time: 25, type: "camera:fly", payload: { position: [-2.9, 5, 3.1], target: [-2.9, 3, 3.1], fov: 0.55 } },
      { time: 30, type: "building:select", payload: { buildingId: "BLD_FC01" } },
      { time: 33, type: "camera:fly", payload: { position: [0, 6, 0], target: [0, 1, 0], fov: 0.8 } },
      { time: 38, type: "building:select", payload: { buildingId: null } },
      { time: 40, type: "camera:fly", payload: { position: [12, 8, 12], target: [0, 0, 0], fov: 0.9 } },
    ],
  },

  emergency: {
    label: "应急演练",
    description: "告警定位 → 联动处置 → 恢复确认 → 总结复盘",
    totalDuration: 30,
    dwellTime: 4,
    loop: true,
    cinemaBarAspect: 2.39,
    events: [
      { time: 0, type: "camera:fly", payload: { position: [0, 20, 0], target: [0, 0, 0], fov: 1.1 } },
      { time: 3, type: "pipeline:alert", payload: { buildingId: "BLD_FC01", level: "warning" } },
      { time: 5, type: "camera:fly", payload: { position: [-3.5, 6, 3.5], target: [-3, 3, 3], fov: 0.6 } },
      { time: 8, type: "building:highlight", payload: { buildingId: "BLD_FC01", color: [0.94, 0.27, 0.27] } },
      { time: 10, type: "building:select", payload: { buildingId: "BLD_FC01" } },
      { time: 12, type: "panel:tab", payload: { tab: "alert" } },
      { time: 15, type: "camera:fly", payload: { position: [3, 6, -4], target: [3.8, 3, -3.4], fov: 0.6 } },
      { time: 18, type: "pipeline:alert", payload: { buildingId: "BLD_HP02", level: "critical" } },
      { time: 20, type: "building:highlight", payload: { buildingId: "BLD_HP02", color: [0.94, 0.27, 0.27] } },
      { time: 22, type: "camera:fly", payload: { position: [0, 12, 0], target: [0, 1, 0], fov: 0.9 } },
      { time: 26, type: "building:select", payload: { buildingId: null } },
    ],
  },
};

// ─────────────────────────────────────────────────────────────
//  演示脚本编辑器配置
// ─────────────────────────────────────────────────────────────

export interface ScriptEditorKeyframe extends DemoKeyframe {
  easing: EasingType;
}

/** 将配置转换为可编辑脚本 */
export function exportScriptAsEditable(mode: DemoMode): ScriptEditorKeyframe[] {
  const config = DEMO_MODE_CONFIGS[mode];
  return config.events.map((e, idx) => ({
    id: `kf-${idx}`,
    time: e.time,
    type: e.type as ScriptEditorKeyframe["type"],
    payload: e.payload,
    easing: "ease-out",
    enabled: true,
  }));
}

/** 验证脚本配置 */
export function validateScript(keyframes: ScriptEditorKeyframe[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (keyframes.length === 0) {
    errors.push("脚本至少需要一个关键帧");
  }

  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    if (kf.time < 0) {
      errors.push(`关键帧 ${i + 1}: 时间不能为负数`);
    }
    if (kf.time > 300) {
      errors.push(`关键帧 ${i + 1}: 时间不能超过300秒`);
    }
    if (kf.type === "camera:fly") {
      const pos = kf.payload.position as number[];
      const target = kf.payload.target as number[];
      if (!Array.isArray(pos) || pos.length !== 3) {
        errors.push(`关键帧 ${i + 1}: camera:fly 需要有效的 position [x, y, z]`);
      }
      if (!Array.isArray(target) || target.length !== 3) {
        errors.push(`关键帧 ${i + 1}: camera:fly 需要有效的 target [x, y, z]`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
