/**
 * ============================================================
 * VisualizationBabylon — 数字孪生大屏主页面
 * ============================================================
 * 功能：
 *   - Babylon.js 3D 数字孪生场景（WebGPU/WebGL 自适应）
 *   - 多Tab HMI 信息面板（台账/能耗/设备/告警/管网）
 *   - 演示数据驱动（本地模拟，无后端依赖）
 *   - 告警联动、选中高亮、相机飞巡
 *   - 多视图模式切换（综合/3D/能源流向）
 *   - 演示脚本一键切换（第二阶段：4套关键帧脚本）
 *   - 多介质管网粒子流动（第二阶段：电力/供暖/供水/燃气/光伏/储能）
 *   - 历史时序回放（第二阶段：时间轴控件驱动3D场景还原）
 *   - 电影级后处理（第二阶段：Bloom/HBAO/ACES/DOF/色差/暗角）
 *   - ★ 第三阶段：影视级特效 — Lens Flare / Motion Blur / God Rays / Film Gate
 *   - ★ 第三阶段：告警联动系统 — 3D告警特效 + 屏幕闪烁 + 声音提示 + HUD面板
 *   - ★ 第四阶段：性能优化 — LOD / FPS监控 / 视锥剔除 / 帧率动态限制
 *   - ★ 第四阶段：大屏适配 — 超宽屏 / 多屏拼接 / DPI缩放 / UI布局自适应
 *   - ★ 第四阶段：演示动画 — 电影黑边 / 进度指示 / 相机路径预览
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Maximize2,
  Minimize2,
  Box,
  BarChart3,
  Zap,
  AlertTriangle,
  Settings2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  RefreshCw,
  Thermometer,
  Wind,
  Lightbulb,
  Cpu,
  Droplets,
  Flame,
  Wind as WindIcon,
  Sun,
  Battery,
  Film,
  History,
  Eye as EyeIcon,
  Sparkles,
  Volume2,
  VolumeX,
  Activity,
  Layers,
} from "lucide-react";
import { cn } from "../components/ui/utils";
import { Button } from "../components/ui/button";
import {
  BabylonScene,
} from "../components/babylon/BabylonScene";
import {
  createMockBuildings,
  createDataAdapter,
  EnergyDataAdapter,
} from "../features/babylon3d/dataAdapter";
import {
  StandardBuilding,
  AlertData,
  HmiPanelConfig,
  DemoMode,
  DemoScript,
  CameraKeyframe,
  EnergyMedium,
} from "../features/babylon3d/types";
import { HistoricalPlayback } from "../features/babylon3d/HistoricalTimeline";
import { AlertLevel } from "../features/babylon3d/AlertIntegrationSystem";

// ─────────────────────────────────────────────────────────────
//  第二阶段扩展：六类介质图例配置
// ─────────────────────────────────────────────────────────────

const MEDIUM_LEGEND: Array<{
  medium: EnergyMedium;
  label: string;
  color: string;
  icon: React.ElementType;
}> = [
  { medium: "electricity", label: "电力", color: "#fbbf24", icon: Zap },
  { medium: "water", label: "供水", color: "#38bdf8", icon: Droplets },
  { medium: "heating", label: "供暖", color: "#f97316", icon: Flame },
  { medium: "gas", label: "燃气", color: "#a78bfa", icon: WindIcon },
  { medium: "photovoltaic", label: "光伏", color: "#22c55e", icon: Sun },
  { medium: "storage", label: "储能", color: "#f472b6", icon: Battery },
];

// ─────────────────────────────────────────────────────────────
//  告警级别颜色
// ─────────────────────────────────────────────────────────────

const ALERT_LEVEL_COLORS = {
  info: "#38bdf8",
  warning: "#f59e0b",
  critical: "#ef4444",
};

// ─────────────────────────────────────────────────────────────
//  工具函数
// ─────────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

function getAlertIcon(level: string) {
  return <AlertTriangle className="h-4 w-4" style={{ color: ALERT_LEVEL_COLORS[level as keyof typeof ALERT_LEVEL_COLORS] ?? "#38bdf8" }} />;
}

// ─────────────────────────────────────────────────────────────
//  主组件
// ─────────────────────────────────────────────────────────────

export function VisualizationBabylon() {
  // 状态
  const [buildings, setBuildings] = useState<StandardBuilding[]>([]);
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [hoveredBuildingId, setHoveredBuildingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"3d" | "sankey" | "both">("3d");
  const [panelConfig, setPanelConfig] = useState<HmiPanelConfig>({
    visible: true,
    width: 380,
    position: "right",
    activeTab: "energy",
    opacity: 0.95,
    draggable: true,
  });
  const [demoMode, setDemoMode] = useState<DemoMode | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showEffects, setShowEffects] = useState(false);
  const [historicalPlaybackMode, setHistoricalPlaybackMode] = useState(false);
  const [historicalTime, setHistoricalTime] = useState<number>(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  const dataAdapterRef = useRef<EnergyDataAdapter | null>(null);

  // 第二阶段新增状态
  // 媒体类型过滤器
  const [activeMediums, setActiveMediums] = useState<Set<EnergyMedium>>(
    new Set(["electricity", "water", "heating", "gas", "photovoltaic", "storage"])
  );
  // 特效开关
  const [effectToggles, setEffectToggles] = useState({
    bloom: true,
    dof: true,
    chromaticAberration: true,
    grain: true,
    vignette: true,
    ssao: true,
    ssr: true,
    toneMapping: true,
    // 第三阶段新增
    lensFlare: true,
    motionBlur: false,
    godRays: true,
    filmGate: true,
  });

  // ──────────────── 第三/四阶段新增状态 ────────────────
  // 告警声音开关
  const [alertAudioEnabled, setAlertAudioEnabled] = useState(true);
  // 活跃告警统计
  const [alertStats, setAlertStats] = useState({
    total: 0,
    info: 0,
    warning: 0,
    critical: 0,
  });
  // 性能统计
  const [perfStats, setPerfStats] = useState({
    fps: 60, avgFps: 60, lodLevel: 0,
    activeMeshes: 0, isThrottled: false,
  });
  // 大屏模式
  const [largeScreenMode, setLargeScreenMode] = useState(false);
  // 当前告警强度
  const [currentAlertLevel, setCurrentAlertLevel] = useState<AlertLevel | null>(null);

  // 选中的建筑数据
  const selectedBuilding = buildings.find((b) => b.id === selectedBuildingId);

  // 切换媒体类型
  const toggleMedium = useCallback((medium: EnergyMedium) => {
    setActiveMediums((prev) => {
      const next = new Set(prev);
      if (next.has(medium)) {
        next.delete(medium);
      } else {
        next.add(medium);
      }
      return next;
    });
  }, []);

  const handleDemoModeChange = useCallback((mode: DemoMode) => {
    setDemoMode((prev) => prev === mode ? null : mode);
    if (mode !== null) {
      setHistoricalPlaybackMode(false);
    }
  }, []);

  // 切换历史回放
  const handleHistoricalModeToggle = useCallback(() => {
    setHistoricalPlaybackMode((v) => !v);
  }, []);

  // 历史快照回调（驱动场景更新）
  const handleHistoricalSnapshot = useCallback((snapshot: unknown) => {
    // 在这里实现历史能耗状态还原逻辑
    // snapshot 包含 timestamp 和 buildings 能源数据
    void snapshot;
  }, []);

  // ─────────────────────────────────────────────────────────
  //  数据连接（演示模式：仅使用 Mock 数据 + 模拟实时波动）
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    // 初始化模拟数据
    const initialBuildings = createMockBuildings();
    setBuildings(initialBuildings);
    setLastUpdate(new Date());
    setConnected(true);

    // 模拟实时数据波动（每 3 秒更新一次能耗）
    const updateInterval = setInterval(() => {
      setBuildings((prev) => {
        if (prev.length === 0) return prev;
        return prev.map((b) => {
          const baseElec = b.latestEnergy?.electricity ?? 80;
          const fluctuation = baseElec * 0.08 * (Math.random() - 0.4); // ±4% 波动
          const newElec = Math.max(20, baseElec + fluctuation);
          const newHvac = newElec * (480 + Math.random() * 60);
          const newLighting = newElec * (0.28 + Math.random() * 0.08);
          const newEquipment = newElec * (0.25 + Math.random() * 0.08);
          return {
            ...b,
            latestEnergy: {
              buildingId: b.id,
              timestamp: Date.now(),
              electricity: parseFloat(newElec.toFixed(2)),
              hvac: parseFloat(newHvac.toFixed(1)),
              lighting: parseFloat(newLighting.toFixed(2)),
              equipment: parseFloat(newEquipment.toFixed(2)),
              total: parseFloat((newElec + newHvac / 1000).toFixed(2)),
              loadRate: Math.min(1, newElec / 150),
            },
          };
        });
      });
      setLastUpdate(new Date());
    }, 3000);

    // 模拟告警事件（每 20-40 秒随机触发）
    const alertSeedData: AlertData[] = [
      {
        id: "alert-seed-1",
        title: "能耗超阈值告警",
        description: "智造一厂实时负荷超过设定阈值的 85%",
        level: "warning",
        buildingId: "BLD_FC01",
        timestamp: Date.now() - 120000,
        acknowledged: false,
        value: 112.4,
        threshold: 100,
        suggestion: "建议降低生产负载或启动备机",
      },
      {
        id: "alert-seed-2",
        title: "设备离线告警",
        description: "急诊中心 HVAC 设备通信中断",
        level: "critical",
        buildingId: "BLD_HP02",
        timestamp: Date.now() - 300000,
        acknowledged: false,
        suggestion: "检查网络连接和设备电源",
      },
    ];

    // 初始加载 2 条告警
    setTimeout(() => setAlerts(alertSeedData), 800);

    // 随机追加新告警（模拟真实场景）
    const alertPool: Omit<AlertData, "id" | "timestamp">[] = [
      { title: "光伏发电效率下降", description: "金融塔A光伏板受遮挡，发电量下降 15%", level: "info", buildingId: "BLD_OF01", acknowledged: false },
      { title: "储能电池温度告警", description: "能源中心储能 BMS 温度超过 45°C", level: "warning", buildingId: "BLD_EC", acknowledged: false, suggestion: "检查散热系统" },
      { title: "燃气管道压力异常", description: "智造一厂燃气管道压力波动超限", level: "critical", buildingId: "BLD_FC01", acknowledged: false, suggestion: "立即排查泄漏风险" },
      { title: "HVAC 能耗突增", description: "总部大厦 HVAC 能耗突增 30%", level: "warning", buildingId: "BLD_OF03", acknowledged: false },
      { title: "供水管网流量异常", description: "市立医院供水流量持续偏低", level: "info", buildingId: "BLD_HP01", acknowledged: false },
    ];

    let alertSeq = 100;
    const scheduleNextAlert = () => {
      const delay = 20000 + Math.random() * 20000; // 20-40秒
      return setTimeout(() => {
        const template = alertPool[Math.floor(Math.random() * alertPool.length)];
        const newAlert: AlertData = {
          ...template,
          id: `alert-demo-${alertSeq++}`,
          timestamp: Date.now(),
        };
        setAlerts((prev) => {
          if (prev.length >= 6) return prev; // 最多保留6条
          return [newAlert, ...prev];
        });
        scheduleNextAlert();
      }, delay);
    };

    const alertTimer = scheduleNextAlert();

    return () => {
      clearInterval(updateInterval);
      clearTimeout(alertTimer);
    };
  }, []);

  // ─────────────────────────────────────────────────────────
  //  事件处理
  // ─────────────────────────────────────────────────────────

  const handleBuildingClick = useCallback((id: string) => {
    setSelectedBuildingId((prev) => (prev === id ? null : id));
  }, []);

  const handleBuildingHover = useCallback((id: string | null) => {
    setHoveredBuildingId(id);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // ─────────────────────────────────────────────────────────
  //  渲染
  // ─────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="relative h-screen w-full overflow-hidden bg-slate-950 text-white">
      {/* ── 顶部工具栏 ── */}
      <motion.div
        className="absolute left-0 right-0 z-30 border-b border-slate-800/60 bg-slate-950/80 px-6 py-3 backdrop-blur-md"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center justify-between">
          {/* 标题 + 模式切换 */}
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold tracking-tight text-white">
              智慧园区数字孪生平台
            </h1>

            {/* 视图模式切换 */}
            <div className="flex rounded-lg border border-slate-700/50 bg-slate-900/60 p-1">
              {([
                { id: "both", icon: Maximize2, label: "综合" },
                { id: "3d", icon: Box, label: "3D视图" },
                { id: "sankey", icon: BarChart3, label: "流向图" },
              ] as const).map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setViewMode(id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    viewMode === id
                      ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/30"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* 演示模式切换 */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">演示：</span>
              {(["normal", "report", "inspection", "emergency"] as DemoMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleDemoModeChange(mode)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                    demoMode === mode
                      ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30"
                      : "text-slate-500 hover:bg-slate-800 hover:text-slate-300",
                  )}
                >
                  {mode === "normal" ? "日常" :
                   mode === "report" ? "汇报" :
                   mode === "inspection" ? "巡检" :
                   mode === "emergency" ? "应急" : mode}
                </button>
              ))}
              {demoMode !== null && (
                <button
                  onClick={() => handleDemoModeChange(demoMode)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-red-400 transition-all hover:bg-red-500/10"
                >
                  停止
                </button>
              )}
            </div>

            {/* 媒体类型过滤器 */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">介质：</span>
              {MEDIUM_LEGEND.map(({ medium, label, color }) => (
                <button
                  key={medium}
                  onClick={() => toggleMedium(medium)}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all",
                    activeMediums.has(medium)
                      ? "bg-slate-800 text-white ring-1 ring-white/20"
                      : "text-slate-600 hover:bg-slate-800 hover:text-slate-400",
                  )}
                  title={`${label} 管网 ${activeMediums.has(medium) ? "显示" : "隐藏"}`}
                >
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: activeMediums.has(medium) ? color : "#374151" }}
                  />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 右侧状态栏 */}
          <div className="flex items-center gap-3">
            {/* 历史回放按钮 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleHistoricalModeToggle}
              className={cn("h-8 w-8 rounded-full", historicalPlaybackMode ? "text-violet-400" : "text-slate-500")}
              title="历史回放"
            >
              <History className="h-4 w-4" />
            </Button>

            {/* 告警声音开关（第三阶段） */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setAlertAudioEnabled((v) => !v)}
              className={cn("h-8 w-8 rounded-full", alertAudioEnabled ? "text-cyan-400" : "text-slate-600")}
              title={alertAudioEnabled ? "关闭告警声音" : "开启告警声音"}
            >
              {alertAudioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>

            {/* 活跃告警统计指示器（第三阶段） */}
            {alerts.filter((a) => !a.acknowledged).length > 0 && (
              <div className="flex items-center gap-1.5">
                <div className={cn(
                  "flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold",
                  alerts.some((a) => a.level === "critical" && !a.acknowledged)
                    ? "bg-red-500/20 text-red-400"
                    : alerts.some((a) => a.level === "warning" && !a.acknowledged)
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-cyan-500/20 text-cyan-400"
                )}>
                  {alerts.filter((a) => !a.acknowledged).length}
                </div>
                <span className="text-xs text-slate-500">告警</span>
              </div>
            )}

            {/* 大屏模式切换（第四阶段） */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLargeScreenMode((v) => !v)}
              className={cn("h-8 w-8 rounded-full", largeScreenMode ? "text-emerald-400" : "text-slate-500")}
              title={largeScreenMode ? "退出大屏模式" : "进入大屏模式（自动降帧优化）"}
            >
              <Maximize2 className={cn("h-4 w-4", largeScreenMode && "text-emerald-400")} />
            </Button>

            {/* 特效控制 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowEffects((v) => !v)}
              className={cn("h-8 w-8 rounded-full", showEffects ? "text-amber-400" : "text-slate-500")}
              title="渲染特效"
            >
              <Sparkles className="h-4 w-4" />
            </Button>

            {/* 连接状态 */}
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse",
                )}
              />
              <span className="text-xs text-cyan-400 font-medium">
                演示模式
              </span>
            </div>

            {/* 更新时间 */}
            {lastUpdate && (
              <span className="text-xs text-slate-500">
                更新 {formatTimestamp(lastUpdate.getTime())}
              </span>
            )}

            {/* 控制按钮 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setAutoRotate((v) => !v)}
              className={cn("h-8 w-8 rounded-full", autoRotate ? "text-cyan-400" : "text-slate-500")}
              title={autoRotate ? "停止自动旋转" : "开启自动旋转"}
            >
              <RefreshCw className={cn("h-4 w-4", autoRotate && "animate-spin")} />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowLegend((v) => !v)}
              className="h-8 w-8 rounded-full text-slate-400"
              title="图例"
            >
              {showLegend ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className="h-8 w-8 rounded-full text-slate-400"
              title="全屏"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ── 主内容区 ── */}
      <div className="h-full pt-16">
        {viewMode !== "sankey" && (
          <div className={cn("h-full", viewMode === "both" ? "w-1/2" : "w-full")}>
            <BabylonScene
              buildings={buildings}
              alerts={alerts.filter((a) => !a.acknowledged)}
              selectedBuildingId={selectedBuildingId}
              onBuildingClick={handleBuildingClick}
              onBuildingHover={handleBuildingHover}
              autoRotate={autoRotate && !historicalPlaybackMode}
              preferWebGPU={false}
              screenConfig={{ targetFps: 60 }}
              demoMode={demoMode ?? undefined}
              onDemoModeChange={handleDemoModeChange}
              historicalPlaybackMode={historicalPlaybackMode}
              historicalTime={historicalTime}
              onHistoricalSnapshot={handleHistoricalSnapshot}
              showMultiMediumPipelines={activeMediums.size > 0}
              // 第三阶段
              enableAlertEffects={true}
              enableAlertAudio={alertAudioEnabled}
              onAlertTriggered={(alert) => {
                setCurrentAlertLevel(alert.level);
                // 更新告警统计
                setAlertStats((prev) => ({
                  ...prev,
                  total: prev.total + 1,
                  [alert.level]: prev[alert.level as keyof typeof prev] + 1,
                }));
              }}
              // 第四阶段
              enableLOD={true}
              maxVisibleBuildings={largeScreenMode ? 15 : 20}
              targetFps={largeScreenMode ? 30 : 60}
              onPerformanceStats={setPerfStats}
            />
          </div>
        )}

        {viewMode === "both" && (
          <div className="absolute inset-y-16 left-1/2 w-px bg-slate-800" />
        )}
      </div>

      {/* ── 右侧 HMI 面板 ── */}
      <AnimatePresence>
        {panelConfig.visible && (
          <motion.div
            key="hmi-panel"
            initial={{ x: panelConfig.position === "right" ? 420 : -420, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: panelConfig.position === "right" ? 420 : -420, opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="absolute bottom-4 top-20 z-20 flex flex-col"
            style={{
              [panelConfig.position]: 16,
              width: panelConfig.width,
              maxWidth: `calc(100vw - 2rem)`,
            }}
          >
            {/* 面板内容 */}
            <div
              className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-950/90 shadow-2xl backdrop-blur-xl"
              style={{ opacity: panelConfig.opacity }}
            >
              {/* 面板头部 */}
              <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                <div className="flex items-center gap-2">
                  {selectedBuilding ? (
                    <>
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: selectedBuilding.color }}
                      />
                      <h2 className="font-semibold text-white">{selectedBuilding.name}</h2>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">
                        {selectedBuilding.buildingType}
                      </span>
                    </>
                  ) : (
                    <h2 className="font-semibold text-slate-300">园区总览</h2>
                  )}
                </div>
                <button
                  onClick={() => setSelectedBuildingId(null)}
                  className="text-xl text-slate-500 hover:text-slate-300"
                >
                  &times;
                </button>
              </div>

              {/* Tab 切换 */}
              <div className="flex border-b border-slate-800 px-2">
                {([
                  { id: "energy", label: "能耗", icon: Zap },
                  { id: "device", label: "设备", icon: Cpu },
                  { id: "alert", label: "告警", icon: AlertTriangle },
                  { id: "account", label: "台账", icon: Settings2 },
                ] as const).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setPanelConfig((c) => ({ ...c, activeTab: id }))}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-xs font-medium transition-colors",
                      panelConfig.activeTab === id
                        ? "border-cyan-400 text-cyan-300"
                        : "border-transparent text-slate-500 hover:text-slate-300",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                    {id === "alert" && alerts.filter((a) => !a.acknowledged).length > 0 && (
                      <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500/20 px-1 text-[10px] text-red-400">
                        {alerts.filter((a) => !a.acknowledged).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab 内容 */}
              <div className="flex-1 overflow-y-auto p-4">
                {/* 能耗 Tab */}
                {panelConfig.activeTab === "energy" && (
                  <div className="space-y-3">
                    {selectedBuilding ? (
                      <>
                        <EnergyMetricRow
                          icon={<Zap className="h-4 w-4 text-amber-400" />}
                          label="电力消耗"
                          value={selectedBuilding.latestEnergy?.electricity.toFixed(2) ?? "—"}
                          unit="kW"
                          color="text-amber-300"
                        />
                        <EnergyMetricRow
                          icon={<Wind className="h-4 w-4 text-cyan-400" />}
                          label="HVAC 能耗"
                          value={selectedBuilding.latestEnergy?.hvac.toFixed(0) ?? "—"}
                          unit="kWh"
                          color="text-cyan-300"
                        />
                        <EnergyMetricRow
                          icon={<Lightbulb className="h-4 w-4 text-violet-400" />}
                          label="照明负载"
                          value={selectedBuilding.latestEnergy?.lighting.toFixed(2) ?? "—"}
                          unit="kW"
                          color="text-violet-300"
                        />
                        <EnergyMetricRow
                          icon={<Cpu className="h-4 w-4 text-rose-400" />}
                          label="设备负载"
                          value={selectedBuilding.latestEnergy?.equipment.toFixed(2) ?? "—"}
                          unit="kW"
                          color="text-rose-300"
                        />
                        {/* 能耗占比图 */}
                        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                          <p className="mb-3 text-xs font-medium text-slate-400">能耗结构</p>
                          <div className="space-y-2">
                            {[
                              { label: "电力", value: selectedBuilding.latestEnergy?.electricity ?? 0, color: "#fbbf24" },
                              { label: "HVAC", value: (selectedBuilding.latestEnergy?.hvac ?? 0) / 1000, color: "#38bdf8" },
                              { label: "照明", value: selectedBuilding.latestEnergy?.lighting ?? 0, color: "#a78bfa" },
                              { label: "设备", value: selectedBuilding.latestEnergy?.equipment ?? 0, color: "#f472b6" },
                            ].map(({ label, value, color }) => {
                              const total = (selectedBuilding.latestEnergy?.total ?? 1);
                              const pct = Math.min(100, Math.round((value / total) * 100));
                              return (
                                <div key={label}>
                                  <div className="mb-1 flex justify-between text-xs">
                                    <span className="text-slate-400">{label}</span>
                                    <span className="text-white">{pct}%</span>
                                  </div>
                                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                                    <div
                                      className="h-full rounded-full transition-all duration-700"
                                      style={{ width: `${pct}%`, backgroundColor: color }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    ) : (
                      /* 园区总览统计 */
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: "建筑总数", value: buildings.length, unit: "栋", color: "text-cyan-300" },
                            { label: "在线设备", value: buildings.length * 12, unit: "台", color: "text-amber-300" },
                            { label: "总装机容量", value: buildings.reduce((s, b) => s + (b.latestEnergy?.electricity ?? 0), 0).toFixed(1), unit: "kW", color: "text-emerald-300" },
                            { label: "活跃告警", value: alerts.filter((a) => !a.acknowledged).length, unit: "条", color: "text-red-400" },
                          ].map(({ label, value, unit, color }) => (
                            <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                              <p className="text-xs text-slate-500">{label}</p>
                              <p className={cn("mt-1 text-xl font-bold", color)}>
                                {value}<span className="ml-1 text-xs font-normal text-slate-500">{unit}</span>
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 告警 Tab */}
                {panelConfig.activeTab === "alert" && (
                  <div className="space-y-2">
                    {alerts.length === 0 && (
                      <div className="py-8 text-center text-sm text-slate-500">暂无告警信息</div>
                    )}
                    {alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={cn(
                          "group relative cursor-pointer rounded-xl border p-3 transition-all hover:border-slate-600",
                          alert.level === "critical" ? "border-red-500/40 bg-red-500/5" :
                          alert.level === "warning" ? "border-amber-500/40 bg-amber-500/5" :
                          "border-slate-700/40 bg-slate-800/30",
                        )}
                        onClick={() => {
                          if (alert.buildingId) {
                            setSelectedBuildingId(alert.buildingId);
                          }
                        }}
                      >
                        <div className="flex items-start gap-2">
                          {getAlertIcon(alert.level)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{alert.title}</p>
                            <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">{alert.description}</p>
                            {alert.suggestion && (
                              <p className="mt-1 text-xs text-slate-500 italic">{alert.suggestion}</p>
                            )}
                          </div>
                          <span className="whitespace-nowrap text-xs text-slate-600">
                            {formatTimestamp(alert.timestamp)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 设备 Tab */}
                {panelConfig.activeTab === "device" && (
                  <div className="space-y-2">
                    {selectedBuilding ? (
                      <>
                        {[
                          { name: "HVAC主机", status: "运行中", online: true },
                          { name: "照明控制柜", status: "运行中", online: true },
                          { name: "能耗计量表", status: "运行中", online: true },
                          { name: "光伏逆变器", status: Math.random() > 0.5 ? "运行中" : "待机", online: true },
                          { name: "储能BMS", status: "运行中", online: Math.random() > 0.2 },
                        ].map((device) => (
                          <div key={device.name} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
                            <div>
                              <p className="text-sm font-medium text-white">{device.name}</p>
                              <p className="text-xs text-slate-500">{device.status}</p>
                            </div>
                            <div className={cn("h-2 w-2 rounded-full", device.online ? "bg-emerald-400" : "bg-slate-600")} />
                          </div>
                        ))}
                      </>
                    ) : (
                      <div className="py-8 text-center text-sm text-slate-500">请先选择建筑</div>
                    )}
                  </div>
                )}

                {/* 台账 Tab */}
                {panelConfig.activeTab === "account" && selectedBuilding && (
                  <div className="space-y-2">
                    {[
                      { label: "建筑面积", value: `${selectedBuilding.floorArea} m²` },
                      { label: "楼层数", value: `${selectedBuilding.floors} 层` },
                      { label: "建筑高度", value: `${selectedBuilding.height} m` },
                      { label: "建造年份", value: `${selectedBuilding.buildYear}` },
                      { label: "建筑类型", value: selectedBuilding.buildingType },
                      { label: "区域位置", value: selectedBuilding.zone ?? "—", },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
                        <span className="text-xs text-slate-500">{label}</span>
                        <span className="text-sm font-medium text-white">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 图例 ── */}
      <AnimatePresence>
        {showLegend && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-6 left-6 z-20 rounded-2xl border border-slate-700/50 bg-slate-950/90 p-4 shadow-xl backdrop-blur-md"
          >
            <h3 className="mb-3 text-sm font-medium text-white">建筑图例</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {([
                { type: "能源中心", color: "#3b82f6" },
                { type: "办公楼", color: "#3b82f6" },
                { type: "商业", color: "#14b8a6" },
                { type: "住宅", color: "#eab308" },
                { type: "学校", color: "#f59e0b" },
                { type: "医院", color: "#ef4444" },
                { type: "工厂", color: "#64748b" },
              ] as const).map(({ type, color }) => (
                <div key={type} className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
                  <span className="text-xs text-slate-400">{type}</span>
                </div>
              ))}
              {/* 告警 */}
              <div className="col-span-2 mt-1 flex items-center gap-2 border-t border-slate-800 pt-2">
                <div className="h-2.5 w-2.5 rounded-sm bg-red-500" />
                <span className="text-xs text-slate-400">告警建筑</span>
              </div>
            </div>

            {/* 六类介质图例 */}
            <h3 className="mb-3 mt-4 text-sm font-medium text-white">介质管网</h3>
            <div className="space-y-1.5">
              {MEDIUM_LEGEND.map(({ medium, label, color, icon: MediumIcon }) => (
                <div key={medium} className="flex items-center gap-2">
                  <MediumIcon className="h-3.5 w-3.5" style={{ color }} />
                  <span className="text-xs text-slate-400">{label}</span>
                  <div
                    className={cn(
                      "ml-auto h-1.5 w-1.5 rounded-full",
                      activeMediums.has(medium) ? "opacity-100" : "opacity-30",
                    )}
                    style={{ backgroundColor: color }}
                  />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 特效控制面板 ── */}
      <AnimatePresence>
        {showEffects && (
          <motion.div
            initial={{ opacity: 0, x: -420 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -420 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="absolute bottom-4 left-4 z-20 w-80 rounded-2xl border border-slate-700/50 bg-slate-950/90 shadow-2xl backdrop-blur-xl"
          >
            <div className="border-b border-slate-800 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Film className="h-4 w-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-white">渲染特效</h3>
                </div>
                <button
                  onClick={() => setShowEffects(false)}
                  className="text-lg text-slate-500 hover:text-slate-300"
                >
                  &times;
                </button>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">★ 第三/四阶段：影视级特效</p>
            </div>
            <div className="space-y-3 p-4">
              {/* 辉光 */}
              <EffectToggleRow
                label="Bloom 辉光" description="发光区域光晕溢出" enabled={effectToggles.bloom}
                onChange={(v) => setEffectToggles((e) => ({ ...e, bloom: v }))} color="#fbbf24"
              />
              <EffectToggleRow
                label="DOF 景深" description="前景/背景虚化" enabled={effectToggles.dof}
                onChange={(v) => setEffectToggles((e) => ({ ...e, dof: v }))} color="#a78bfa"
              />
              <EffectToggleRow
                label="ACES 色调映射" description="电影级色彩还原" enabled={effectToggles.toneMapping}
                onChange={(v) => setEffectToggles((e) => ({ ...e, toneMapping: v }))} color="#38bdf8"
              />
              <EffectToggleRow
                label="色差 Chromatic" description="镜头边缘色彩分离" enabled={effectToggles.chromaticAberration}
                onChange={(v) => setEffectToggles((e) => ({ ...e, chromaticAberration: v }))} color="#f472b6"
              />
              <EffectToggleRow
                label="暗角 Vignette" description="边缘压暗聚焦中心" enabled={effectToggles.vignette}
                onChange={(v) => setEffectToggles((e) => ({ ...e, vignette: v }))} color="#64748b"
              />
              <EffectToggleRow
                label="颗粒 Grain" description="胶片质感噪点" enabled={effectToggles.grain}
                onChange={(v) => setEffectToggles((e) => ({ ...e, grain: v }))} color="#78716c"
              />
              <EffectToggleRow
                label="HBAO 环境光遮蔽" description="边缘接触阴影" enabled={effectToggles.ssao}
                onChange={(v) => setEffectToggles((e) => ({ ...e, ssao: v }))} color="#a3e635"
              />
              <EffectToggleRow
                label="SSR 屏幕反射" description="地面/玻璃反射" enabled={effectToggles.ssr}
                onChange={(v) => setEffectToggles((e) => ({ ...e, ssr: v }))} color="#22d3ee"
              />
              {/* ── 第三阶段影视级特效 ── */}
              <div className="border-t border-slate-800 pt-3">
                <p className="mb-2 text-xs font-medium text-amber-400">★ 影视级特效</p>
                <EffectToggleRow
                  label="Lens Flare" description="镜头光晕炫光" enabled={effectToggles.lensFlare}
                  onChange={(v) => setEffectToggles((e) => ({ ...e, lensFlare: v }))} color="#fde047"
                />
                <EffectToggleRow
                  label="Motion Blur" description="动态运动模糊" enabled={effectToggles.motionBlur}
                  onChange={(v) => setEffectToggles((e) => ({ ...e, motionBlur: v }))} color="#67e8f9"
                />
                <EffectToggleRow
                  label="God Rays" description="体积光/体积光柱" enabled={effectToggles.godRays}
                  onChange={(v) => setEffectToggles((e) => ({ ...e, godRays: v }))} color="#fca5a5"
                />
                <EffectToggleRow
                  label="Film Gate" description="电影黑边宽银幕" enabled={effectToggles.filmGate}
                  onChange={(v) => setEffectToggles((e) => ({ ...e, filmGate: v }))} color="#6b7280"
                />
              </div>
            </div>

            {/* ── 第四阶段：性能监控面板 ── */}
            <div className="border-t border-slate-800 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-medium text-slate-400">性能监控</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "font-mono text-sm font-bold",
                    perfStats.fps >= 50 ? "text-emerald-400" :
                    perfStats.fps >= 30 ? "text-amber-400" : "text-red-400"
                  )}>
                    {perfStats.fps} FPS
                  </span>
                  {perfStats.isThrottled && (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-400">限帧</span>
                  )}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                <span>LOD级别：{perfStats.lodLevel}</span>
                <span>活跃网格：{perfStats.activeMeshes}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 历史回放面板 ── */}
      <AnimatePresence>
        {historicalPlaybackMode && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="absolute bottom-4 left-1/2 z-20 w-[600px] -translate-x-1/2"
          >
            <HistoricalPlayback
              dataAdapter={dataAdapterRef.current}
              onSnapshotChange={handleHistoricalSnapshot}
              defaultExpanded={true}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 告警 Toast ── */}
      <AnimatePresence>
        {alerts.filter((a) => !a.acknowledged && a.level === "critical").map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ x: 420, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 420, opacity: 0 }}
            className="absolute bottom-6 right-6 z-40 w-80 rounded-2xl border border-red-500/50 bg-red-950/90 p-4 shadow-2xl backdrop-blur-md"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-400" />
              <div>
                <p className="font-semibold text-red-300">{alert.title}</p>
                <p className="mt-1 text-sm text-slate-400">{alert.description}</p>
                {alert.suggestion && (
                  <p className="mt-2 text-xs text-slate-500">{alert.suggestion}</p>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* 面板显隐切换按钮 */}
      <button
        onClick={() => setPanelConfig((c) => ({ ...c, visible: !c.visible }))}
        className="absolute bottom-6 z-30 rounded-l-full bg-slate-900/90 px-2 py-3 text-slate-400 backdrop-blur-md transition-colors hover:bg-slate-800 hover:text-white"
        style={{ [panelConfig.position === "right" ? "right" : "left"]: panelConfig.visible ? panelConfig.width + 16 : 16 }}
      >
        {panelConfig.position === "right"
          ? <ChevronRight className={cn("h-4 w-4", panelConfig.visible && "rotate-180")} />
          : <ChevronLeft className={cn("h-4 w-4", panelConfig.visible && "rotate-180")} />
        }
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  子组件：能耗行
// ─────────────────────────────────────────────────────────────

function EnergyMetricRow({
  icon,
  label,
  value,
  unit,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <div className="text-right">
        <span className={cn("text-xl font-bold", color)}>{value}</span>
        <span className="ml-1 text-xs text-slate-500">{unit}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  子组件：特效开关行
// ─────────────────────────────────────────────────────────────

function EffectToggleRow({
  label,
  description,
  enabled,
  onChange,
  color,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: enabled ? color : "#374151" }}
        />
        <div>
          <p className={cn("text-sm font-medium", enabled ? "text-white" : "text-slate-500")}>
            {label}
          </p>
          <p className="text-xs text-slate-600">{description}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          enabled ? "bg-cyan-500/30" : "bg-slate-800",
        )}
      >
        <motion.div
          animate={{ x: enabled ? 16 : 2 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow"
        />
      </button>
    </div>
  );
}
