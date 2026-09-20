/**
 * ============================================================
 * BabylonScene — React 集成层
 * ============================================================
 * 职责：
 *   - 管理 Babylon.js 引擎生命周期（与 React 生命周期同步）
 *   - 提供标准 React Props 接口
 *   - 集成相机、ArcRotateCamera
 *   - 绑定 React 事件回调
 *   - 集成第二阶段：后处理管线 / 多介质管网 / 演示动画 / 历史回放
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Clock } from "lucide-react";
import { cn } from "../../components/ui/utils";
import { BabylonEngineAdapter } from "./BabylonEngineAdapter";
import { SceneBuilder } from "../../features/babylon3d/SceneBuilder";
import {
  DefaultRenderingPipelineAdapter,
  DEFAULT_CINEMATIC_CONFIG,
  EffectConfig,
} from "../../features/babylon3d/PostProcessingPipeline";
import { MultiMediumPipelineSystem } from "../../features/babylon3d/MultiMediumPipelineSystem";
import {
  DemoAnimationSystem,
  DemoMode,
  createEasingFunction,
} from "../../features/babylon3d/DemoAnimationSystem";
import { AlertIntegrationSystem, AlertLevel } from "../../features/babylon3d/AlertIntegrationSystem";
import { PerformanceOptimizer } from "../../features/babylon3d/PerformanceOptimizer";
import { LargeScreenAdapter } from "../../features/babylon3d/LargeScreenAdapter";
import {
  StandardBuilding,
} from "../../features/babylon3d/dataAdapter";
import { AlertData, SceneEventType, SceneConfig, ScreenConfig } from "../../features/babylon3d/types";
import { HistoricalDataPoint } from "../../features/babylon3d/HistoricalTimeline";

export interface BabylonSceneProps {
  /** 建筑数据（驱动场景内容） */
  buildings: StandardBuilding[];
  /** 活跃告警列表 */
  alerts?: AlertData[];
  /** 选中的建筑ID */
  selectedBuildingId?: string | null;
  /** 选中回调 */
  onBuildingSelect?: (buildingId: string | null) => void;
  /** 点击回调 */
  onBuildingClick?: (buildingId: string) => void;
  /** Hover 回调 */
  onBuildingHover?: (buildingId: string | null) => void;
  /** 初始相机状态 */
  initialCameraState?: {
    alpha?: number;
    beta?: number;
    radius?: number;
    target?: [number, number, number];
  };
  /** 是否自动旋转 */
  autoRotate?: boolean;
  /** 自动旋转速度 */
  autoRotateSpeed?: number;
  /** WebGPU 优先 */
  preferWebGPU?: boolean;
  /** 大屏配置 */
  screenConfig?: Partial<ScreenConfig>;
  /** 3D场景加载完成回调 */
  onReady?: (builder: SceneBuilder) => void;
  /** 当前演示模式 */
  demoMode?: DemoMode;
  /** 演示模式切换回调 */
  onDemoModeChange?: (mode: DemoMode) => void;
  /** 历史快照回调（用于历史回放） */
  onHistoricalSnapshot?: (snapshot: HistoricalDataPoint | null) => void;
  /** 历史回放当前时间 */
  historicalTime?: number;
  /** 是否启用历史回放模式 */
  historicalPlaybackMode?: boolean;
  /** 后处理特效配置 */
  postProcessingConfig?: Partial<EffectConfig>;
  /** 是否显示多介质管网 */
  showMultiMediumPipelines?: boolean;
  /** 管线告警变化回调 */
  onPipelineAlert?: (alert: AlertData) => void;

  // ──────────────── 第三阶段：告警联动 ────────────────
  /** 是否启用告警3D特效 */
  enableAlertEffects?: boolean;
  /** 是否启用告警声音 */
  enableAlertAudio?: boolean;
  /** 告警触发回调 */
  onAlertTriggered?: (alert: AlertData) => void;

  // ──────────────── 第四阶段：性能优化 ────────────────
  /** 是否启用LOD系统 */
  enableLOD?: boolean;
  /** 最大可见建筑数 */
  maxVisibleBuildings?: number;
  /** 目标FPS */
  targetFps?: number;
  /** 性能统计回调 */
  onPerformanceStats?: (stats: {
    fps: number; avgFps: number; lodLevel: number;
    activeMeshes: number; isThrottled: boolean;
  }) => void;
}

export function BabylonScene({
  buildings,
  alerts = [],
  selectedBuildingId,
  onBuildingSelect,
  onBuildingClick,
  onBuildingHover,
  initialCameraState,
  autoRotate = true,
  autoRotateSpeed = 0.15,
  preferWebGPU = false,
  screenConfig,
  onReady,
  demoMode,
  onDemoModeChange,
  onHistoricalSnapshot,
  historicalTime,
  historicalPlaybackMode = false,
  postProcessingConfig,
  showMultiMediumPipelines = true,
  onPipelineAlert,
  // 第三阶段
  enableAlertEffects = true,
  enableAlertAudio = true,
  onAlertTriggered,
  // 第四阶段
  enableLOD = true,
  maxVisibleBuildings = 20,
  targetFps = 60,
  onPerformanceStats,
}: BabylonSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const adapterRef = useRef<BabylonEngineAdapter | null>(null);
  const builderRef = useRef<SceneBuilder | null>(null);
  const pipelineSystemRef = useRef<MultiMediumPipelineSystem | null>(null);
  const demoSystemRef = useRef<DemoAnimationSystem | null>(null);
  const postProcessingRef = useRef<DefaultRenderingPipelineAdapter | null>(null);
  const alertSystemRef = useRef<AlertIntegrationSystem | null>(null);
  const perfOptimizerRef = useRef<PerformanceOptimizer | null>(null);
  const largeScreenAdapterRef = useRef<LargeScreenAdapter | null>(null);
  const cameraRef = useRef<{
    setTarget: (v: { x: number; y: number; z: number }) => void;
    alpha: number;
    beta: number;
    radius: number;
    target: { x: number; y: number; z: number };
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [perfStats, setPerfStats] = useState({
    fps: 60, avgFps: 60, lodLevel: 0,
    activeMeshes: 0, isThrottled: false,
  });

  // 初始化引擎
  useEffect(() => {
    if (!canvasRef.current) return;

    const adapter = new BabylonEngineAdapter(canvasRef.current, {
      antialias: true,
      adaptToDeviceRatio: true,
      stencil: true,
      powerPreference: "high-performance",
      targetFrameRate: screenConfig?.targetFps ?? 60,
      backgroundColor: [0.012, 0.027, 0.071, 1],
      fogDensity: 0.04,
      fogColor: [0.012, 0.027, 0.071],
      preferWebGPU,
    });

    adapterRef.current = adapter;

    adapter.init().then((scene) => {
      // 导入 Babylon.js 相机和引擎组件
      import("@babylonjs/core").then((BABYLON) => {
        try {
          const { ArcRotateCamera, Vector3 } = BABYLON;

          const canvas = canvasRef.current!;
          console.log("[BabylonScene] Scene initialized, creating camera...");

          // 创建 ArcRotateCamera
          const camera = new ArcRotateCamera(
            "mainCam",
            initialCameraState?.alpha ?? -Math.PI / 3,
            initialCameraState?.beta ?? Math.PI / 4,
            initialCameraState?.radius ?? 18,
            new Vector3(
              initialCameraState?.target?.[0] ?? 0,
              initialCameraState?.target?.[1] ?? 1,
              initialCameraState?.target?.[2] ?? 0,
            ),
            scene,
          );
          camera.attachControl(canvas, true);
          camera.lowerRadiusLimit = 5;
          camera.upperRadiusLimit = 35;
          camera.lowerBetaLimit = 0.2;
          camera.upperBetaLimit = Math.PI / 2 - 0.1;
          camera.wheelPrecision = 20;
          camera.panningSensibility = 500;
          camera.panningInertia = 0.7;

          cameraRef.current = camera as unknown as typeof cameraRef.current;

          // 自动旋转
          if (autoRotate) {
            camera.useAutoRotationBehavior = true;
            camera.autoRotationBehavior!.idleRotationSpeed = autoRotateSpeed;
            camera.autoRotationBehavior!.idleRotationWaitTime = 2000;
            camera.autoRotationBehavior!.idleRotationSpinupTime = 1000;
          }

          // ── 初始化场景子系统（仅运行一次）─
          const builder = new SceneBuilder(scene);
          builder.setupLighting();
          builderRef.current = builder;

          const postProcessing = new DefaultRenderingPipelineAdapter(
            scene,
            { ...DEFAULT_CINEMATIC_CONFIG, ...postProcessingConfig },
          );
          postProcessingRef.current = postProcessing;

          const pipelineSystem = new MultiMediumPipelineSystem(scene);
          pipelineSystemRef.current = pipelineSystem;

          const demoSystem = new DemoAnimationSystem(scene);
          demoSystemRef.current = demoSystem;

          // 告警联动系统（第三阶段）
          if (enableAlertEffects) {
            const alertSystem = new AlertIntegrationSystem(scene);
            alertSystem.setAudioEnabled(enableAlertAudio);
            alertSystem.onAlertTriggered((alert) => {
              alertSystem.triggerBuildingAlert(alert.buildingId ?? "", alert.id, alert.level);
              postProcessing.triggerAlertEffect(alert.level);
              onAlertTriggered?.(alert);
            });
            alertSystemRef.current = alertSystem;
          }

          // 性能优化系统（第四阶段）
          const perfOptimizer = new PerformanceOptimizer(scene, {}, {
            targetFps,
            autoThrottle: true,
            minFpsThreshold: 30,
            maxVisibleBuildings,
          });
          perfOptimizer.setMaxVisibleBuildings(maxVisibleBuildings);
          perfOptimizer.setLODEnabled(enableLOD);
          perfOptimizerRef.current = perfOptimizer;

          // 大屏适配系统（第四阶段）
          const engine = adapter.getEngine();
          if (engine) {
            const lsa = new LargeScreenAdapter(
              engine,
              scene,
              canvas.clientWidth || 1920,
              canvas.clientHeight || 1080,
            );
            largeScreenAdapterRef.current = lsa;
          }

          // 注册演示事件回调
          demoSystem.onEvent("camera:fly", (payload) => {
            const { position, target, fov } = payload as {
              position: number[]; target: number[]; fov: number;
            };
            demoSystem.flyTo({
              position: position as [number, number, number],
              target: target as [number, number, number],
              fov,
            }, 2.0, "ease-out");
          });

          demoSystem.onEvent("building:select", (payload) => {
            const { buildingId } = payload as { buildingId: string | null };
            onBuildingClick?.(buildingId ?? "");
          });

          demoSystem.onEvent("building:highlight", (payload) => {
            const { buildingId, color } = payload as {
              buildingId: string; color: number[];
            };
            if (buildingId && color) {
              const BABYLON_COLOR = new BABYLON.Color3(color[0], color[1], color[2]);
              builder.highlightBuilding(buildingId, BABYLON_COLOR);
            }
          });

          demoSystem.onEvent("pipeline:alert", (payload) => {
            const alertData = payload as unknown as AlertData;
            pipelineSystem.triggerAlert(alertData);
            onPipelineAlert?.(alertData);
          });

          demoSystem.onEvent("effect:intensity", (payload) => {
            const pp = postProcessingRef.current;
            if (!pp) return;
            const { bloomIntensity, particleSpeed } = payload as {
              bloomIntensity?: number; particleSpeed?: number;
            };
            if (bloomIntensity !== undefined) {
              pp.updateConfig({ bloomWeight: bloomIntensity });
            }
            void particleSpeed;
          });

          // ── 绑定指针事件 ─
          scene.onPointerObservable.add((pointerInfo) => {
            if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERPICK) {
              const pickResult = pointerInfo.pickInfo;
              if (pickResult?.pickedMesh?.metadata?.buildingId) {
                const id = pickResult.pickedMesh.metadata.buildingId as string;
                onBuildingClick?.(id);
              }
            }
            if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE) {
              const pickResult = pointerInfo.pickInfo;
              const id = pickResult?.pickedMesh?.metadata?.buildingId as string | undefined;
              onBuildingHover?.(id ?? null);
            }
          });

          console.log("[BabylonScene] Babylon subsystems initialized, waiting for buildings...");
          setReady(true);
          onReady?.(builder);
        } catch (err) {
          console.error("[BabylonScene] Babylon.js init error:", err);
        }
      });
    }).catch((err) => {
      console.error("[BabylonScene] Engine init error:", err);
    });

    return () => {
      pipelineSystemRef.current?.dispose();
      demoSystemRef.current?.dispose();
      postProcessingRef.current?.dispose();
      alertSystemRef.current?.dispose();
      perfOptimizerRef.current?.dispose();
      largeScreenAdapterRef.current?.dispose();
      adapter.dispose();
      adapterRef.current = null;
      builderRef.current = null;
      pipelineSystemRef.current = null;
      demoSystemRef.current = null;
      postProcessingRef.current = null;
      alertSystemRef.current = null;
      perfOptimizerRef.current = null;
      largeScreenAdapterRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 数据更新：建筑数据到达时构建园区 + 管线 + 特效
  // 使用建筑 ID 集合作为依赖，避免每次能耗波动都重建场景
  useEffect(() => {
    if (!ready || buildings.length === 0) return;
    if (!builderRef.current) return;

    console.log("[BabylonScene] Building campus with", buildings.length, "buildings");

    // 构建园区
    builderRef.current.buildCampus(buildings);

    // 后处理管线应用（等待场景有内容后应用）
    postProcessingRef.current?.apply();

    // 构建多介质管网
    pipelineSystemRef.current?.buildFromBuildings(
      buildings.map((b) => ({
        id: b.id,
        position: b.position,
        buildingType: b.buildingType,
        energyHeight: b.buildingType === "energy" ? 3.5 : (b.latestEnergy?.electricity ?? 80) / 80 * 4,
      })),
      [0, 0, 0],
      2.8,
    );

    console.log("[BabylonScene] Campus and pipelines built");
  }, [ready, buildings.length > 0 && buildings.map((b) => b.id).join(",")]);

  // 选中状态联动
  useEffect(() => {
    if (!ready || !builderRef.current) return;
    if (selectedBuildingId) {
      builderRef.current.selectBuilding(selectedBuildingId);
      builderRef.current.flyTo(selectedBuildingId, { duration: 1.2 });
    } else {
      builderRef.current.deselectBuilding();
    }
  }, [selectedBuildingId, ready]);

  // 性能统计上报（第四阶段）
  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(() => {
      const stats = perfOptimizerRef.current?.getStats();
      if (stats) {
        const simplified = {
          fps: stats.fps,
          avgFps: stats.avgFps,
          lodLevel: stats.lodLevel,
          activeMeshes: stats.activeMeshes,
          isThrottled: stats.isThrottled,
        };
        setPerfStats(simplified);
        onPerformanceStats?.(simplified);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [ready, onPerformanceStats]);

  // 告警联动（第三阶段：管线告警 + 告警特效）
  useEffect(() => {
    if (!ready) return;
    alerts.forEach((alert) => {
      if (!alert.acknowledged) {
        // 触发管线告警
        pipelineSystemRef.current?.triggerAlert(alert);
        // 触发3D告警特效
        alertSystemRef.current?.trigger(alert);
        // 触发后处理特效响应
        postProcessingRef.current?.triggerAlertEffect(alert.level);
        onPipelineAlert?.(alert);
      }
    });
  }, [alerts, ready, onPipelineAlert]);

  // 演示模式切换
  useEffect(() => {
    if (!ready || !demoSystemRef.current) return;
    if (demoMode) {
      demoSystemRef.current.play(demoMode);
      setDemoPlaying(true);
    } else {
      demoSystemRef.current.stop();
      setDemoPlaying(false);
    }
  }, [demoMode, ready]);

  // 历史回放时间同步
  useEffect(() => {
    if (!ready || !historicalPlaybackMode) return;
    // 在历史回放模式下，停止自动旋转和演示动画
    if (cameraRef.current) {
      const camera = adapterRef.current?.getScene()?.activeCamera;
      if (camera && "useAutoRotationBehavior" in camera) {
        (camera as unknown as { useAutoRotationBehavior: boolean }).useAutoRotationBehavior = false;
      }
    }
    void historicalTime;
  }, [historicalPlaybackMode, historicalTime, ready]);

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "#030712" }}>
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ display: "block", touchAction: "none", outline: "none" }}
      />

      {/* 加载中 */}
      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/80">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            <p className="mt-3 text-sm text-cyan-300">3D 场景加载中...</p>
            <div className="mt-2 flex items-center justify-center gap-2">
              <div className="h-1 w-20 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full animate-pulse rounded-full bg-gradient-to-r from-cyan-400 to-amber-400" style={{ width: "70%" }} />
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-600">后处理管线 · 多介质管网 · 告警联动 · 性能优化</p>
          </div>
        </div>
      )}

      {/* 演示模式指示器 */}
      {ready && demoPlaying && (
        <div className="pointer-events-none absolute left-4 top-20 z-10">
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-950/80 px-3 py-1.5 backdrop-blur-md">
            <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            <span className="text-xs font-medium text-amber-300">
              {demoMode === "normal" ? "日常巡检" :
               demoMode === "report" ? "高层汇报" :
               demoMode === "inspection" ? "设备巡检" :
               demoMode === "emergency" ? "应急演练" : "演示模式"}
            </span>
          </div>
        </div>
      )}

      {/* 历史回放模式指示器 */}
      {ready && historicalPlaybackMode && (
        <div className="pointer-events-none absolute left-4 top-20 z-10">
          <div className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-950/80 px-3 py-1.5 backdrop-blur-md">
            <Clock className="h-3.5 w-3.5 text-violet-400" />
            <span className="text-xs font-medium text-violet-300">历史回放模式</span>
          </div>
        </div>
      )}

      {/* ── 第四阶段：性能统计HUD ── */}
      {ready && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-10">
          <div className="flex items-center gap-3 rounded-xl border border-slate-700/40 bg-slate-950/70 px-3 py-2 backdrop-blur-sm">
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "h-1.5 w-1.5 rounded-full",
                perfStats.fps >= 50 ? "bg-emerald-400" :
                perfStats.fps >= 30 ? "bg-amber-400" : "bg-red-400"
              )} />
              <span className="font-mono text-xs font-medium text-slate-300">
                {perfStats.fps}
                <span className="ml-0.5 text-slate-600">FPS</span>
              </span>
            </div>
            {perfStats.isThrottled && (
              <div className="flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="font-mono text-[10px] text-amber-400">限帧</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-slate-600">
                LOD {perfStats.lodLevel}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-slate-600">
                网格 {perfStats.activeMeshes}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── 第四阶段：演示进度指示器 ── */}
      {ready && demoPlaying && demoMode && (
        <DemoProgressIndicator demoSystem={demoSystemRef} mode={demoMode} />
      )}

      {/* WebGL 不支持提示 */}
      <div id="webgl-error" className="hidden absolute inset-0 flex items-center justify-center bg-slate-950 text-slate-200">
        <div className="text-center">
          <p className="text-base font-semibold">当前环境不支持 WebGL</p>
          <p className="mt-2 text-sm text-slate-400">请启用硬件加速或使用支持的浏览器</p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  演示进度指示器（第四阶段）
// ─────────────────────────────────────────────────────────────

function DemoProgressIndicator({
  demoSystem,
  mode,
}: {
  demoSystem: React.MutableRefObject<DemoAnimationSystem | null>;
  mode: DemoMode;
}) {
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [total, setTotal] = useState(40);

  useEffect(() => {
    const system = demoSystem.current;
    if (!system) return;

    system.onProgress((p, e, t) => {
      setProgress(p);
      setElapsed(e);
      setTotal(t);
    });

    return () => {
      // 清理
    };
  }, [demoSystem]);

  const progressPct = Math.round(progress * 100);
  const modeLabels: Record<DemoMode, string> = {
    normal: "日常巡检",
    report: "高层汇报",
    inspection: "设备巡检",
    emergency: "应急演练",
  };

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full border border-amber-500/30 bg-amber-950/80 px-4 py-2 backdrop-blur-md">
        {/* 模式标签 */}
        <span className="text-xs font-medium text-amber-300">{modeLabels[mode]}</span>

        {/* 进度条 */}
        <div className="relative h-1.5 w-40 overflow-hidden rounded-full bg-slate-800">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* 进度文字 */}
        <span className="font-mono text-xs text-amber-400">
          {Math.floor(elapsed)}s / {total}s
        </span>

        {/* 百分比 */}
        <span className="font-mono text-xs text-amber-500/70">
          {progressPct}%
        </span>
      </div>
    </div>
  );
}
