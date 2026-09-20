/**
 * ============================================================
 * HistoricalTimeline — 历史时序回放系统
 * ============================================================
 * 功能：
 *   - 时间轴 scrubber 控件（可拖拽）
 *   - 历史能耗状态3D场景还原
 *   - 回放速度控制（0.5x/1x/2x/4x）
 *   - 时间范围选择
 *   - 事件标记（告警时间点高亮）
 *
 * 数据源：EnergyDataAdapter 的 energyHistory 缓存
 * 驱动方式：通过 onTimeChange 回调通知 SceneBuilder 还原历史状态
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Clock,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Zap,
  Gauge,
} from "lucide-react";
import { cn } from "../../components/ui/utils";

/** 时间轴回放配置 */
export interface TimelineConfig {
  /** 数据来源 */
  dataSource: {
    /** 获取指定时间范围的历史数据 */
    getRangeData: (startTime: number, endTime: number) => HistoricalDataPoint[];
    /** 获取数据时间范围 */
    getTimeRange: () => { min: number; max: number };
  };
  /** 步进间隔（毫秒），默认 1 小时 */
  stepInterval?: number;
  /** 是否自动播放 */
  autoPlay?: boolean;
  /** 最大历史缓存点 */
  maxPoints?: number;
}

/** 单个时间点的历史数据 */
export interface HistoricalDataPoint {
  timestamp: number;
  /** 建筑ID → 能耗数据 */
  buildings: Record<string, {
    electricity: number;
    hvac: number;
    lighting: number;
    equipment: number;
    total: number;
    loadRate: number;
  }>;
  /** 告警快照 */
  alerts?: Array<{
    id: string;
    level: "info" | "warning" | "critical";
    buildingId: string;
  }>;
  /** 管网流量快照 */
  pipelines?: Record<string, {
    flowRate: number;
    loadRate: number;
    isAlert: boolean;
  }>;
}

/** 时间轴控件 Props */
export interface TimelineControlsProps {
  /** 当前时间戳（毫秒） */
  currentTime: number;
  /** 时间范围 */
  timeRange: { start: number; end: number };
  /** 是否正在播放 */
  isPlaying: boolean;
  /** 播放速度 */
  playbackSpeed: number;
  /** 事件标记 */
  markers?: TimelineMarker[];
  /** 回调：时间变化 */
  onTimeChange: (timestamp: number) => void;
  /** 回调：播放状态切换 */
  onPlayPause: (playing: boolean) => void;
  /** 回调：播放速度变化 */
  onSpeedChange: (speed: number) => void;
  /** 是否展开详情 */
  expanded?: boolean;
}

export interface TimelineMarker {
  timestamp: number;
  label: string;
  type: "alert" | "event" | "checkpoint";
  color?: string;
}

const SPEED_OPTIONS = [0.5, 1, 2, 4];

const MARKER_COLORS = {
  alert: "#ef4444",
  event: "#38bdf8",
  checkpoint: "#fbbf24",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${mins}m`;
}

/** 时间轴核心控件 */
export function TimelineControls({
  currentTime,
  timeRange,
  isPlaying,
  playbackSpeed,
  markers = [],
  onTimeChange,
  onPlayPause,
  onSpeedChange,
  expanded = false,
}: TimelineControlsProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // 计算进度百分比
  const progress = useMemo(() => {
    const range = timeRange.end - timeRange.start;
    if (range <= 0) return 0;
    return Math.min(1, Math.max(0, (currentTime - timeRange.start) / range));
  }, [currentTime, timeRange]);

  // 时间范围进度
  const hoverProgress = useMemo(() => {
    if (hoverTime === null) return null;
    const range = timeRange.end - timeRange.start;
    if (range <= 0) return 0;
    return Math.min(1, Math.max(0, (hoverTime - timeRange.start) / range));
  }, [hoverTime, timeRange]);

  // 跳转到标记点
  const jumpToMarker = useCallback((marker: TimelineMarker) => {
    onTimeChange(marker.timestamp);
  }, [onTimeChange]);

  // 拖拽逻辑
  const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.min(1, Math.max(0, x / rect.width));
    const ts = timeRange.start + pct * (timeRange.end - timeRange.start);
    onTimeChange(ts);
  }, [timeRange, onTimeChange]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.min(1, Math.max(0, x / rect.width));
    const ts = timeRange.start + pct * (timeRange.end - timeRange.start);
    setHoverTime(ts);
  }, [timeRange]);

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMoveGlobal = (e: MouseEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.min(1, Math.max(0, x / rect.width));
      const ts = timeRange.start + pct * (timeRange.end - timeRange.start);
      onTimeChange(ts);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMoveGlobal);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMoveGlobal);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, timeRange, onTimeChange]);

  return (
    <div className={cn(
      "w-full rounded-2xl border border-slate-700/50 bg-slate-950/95 shadow-2xl backdrop-blur-xl transition-all duration-300",
      expanded ? "p-4" : "p-3",
    )}>
      {/* 顶部：时间显示 + 播放控制 */}
      <div className="flex items-center justify-between gap-3">
        {/* 当前时间 */}
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="h-4 w-4 flex-shrink-0 text-cyan-400" />
          <span className="font-mono text-sm font-semibold text-cyan-300">
            {formatTime(currentTime)}
          </span>
        </div>

        {/* 播放控制 */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onTimeChange(timeRange.start)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            title="跳转到起点"
          >
            <SkipBack className="h-4 w-4" />
          </button>

          <button
            onClick={() => {
              const step = 3600000; // 1小时步进
              onTimeChange(Math.max(timeRange.start, currentTime - step));
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            title="后退1小时"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            onClick={() => onPlayPause(!isPlaying)}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full transition-all",
              isPlaying
                ? "bg-amber-500/20 text-amber-400 ring-2 ring-amber-500/40"
                : "bg-cyan-500/20 text-cyan-400 ring-2 ring-cyan-500/40 hover:bg-cyan-500/30",
            )}
            title={isPlaying ? "暂停" : "播放"}
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
          </button>

          <button
            onClick={() => {
              const step = 3600000;
              onTimeChange(Math.min(timeRange.end, currentTime + step));
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            title="前进1小时"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <button
            onClick={() => onTimeChange(timeRange.end)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            title="跳转到终点"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        {/* 速度控制 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">速度</span>
          <div className="flex rounded-lg border border-slate-700/50 bg-slate-900 p-0.5">
            {SPEED_OPTIONS.map((speed) => (
              <button
                key={speed}
                onClick={() => onSpeedChange(speed)}
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs font-medium transition-all",
                  playbackSpeed === speed
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "text-slate-500 hover:text-slate-300",
                )}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 时间轴轨道 */}
      <div
        ref={trackRef}
        className="relative mt-3 h-8 cursor-pointer rounded-lg bg-slate-900/80"
        onClick={handleTrackClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverTime(null)}
      >
        {/* 已播放区域 */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-l-lg bg-gradient-to-r from-cyan-500/30 to-cyan-400/20"
          style={{ width: `${progress * 100}%` }}
          layoutId="timeline-progress"
        />

        {/* 鼠标悬停提示 */}
        <AnimatePresence>
          {hoverTime !== null && hoverProgress !== null && !isDragging && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute -top-8 z-10 -translate-x-1/2 transform"
              style={{ left: `${hoverProgress * 100}%` }}
            >
              <div className="rounded-lg border border-slate-600/50 bg-slate-900/95 px-2 py-1 shadow-lg">
                <span className="whitespace-nowrap font-mono text-xs text-cyan-300">
                  {formatTime(hoverTime)}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 事件标记 */}
        {markers.map((marker) => {
          const markerPct = Math.min(1, Math.max(0,
            (marker.timestamp - timeRange.start) / (timeRange.end - timeRange.start)
          ));
          return (
            <button
              key={`${marker.timestamp}-${marker.label}`}
              onClick={(e) => {
                e.stopPropagation();
                jumpToMarker(marker);
              }}
              className="absolute top-1/2 z-10 -translate-y-1/2 -translate-x-1/2 transform cursor-pointer"
              style={{ left: `${markerPct * 100}%` }}
              title={marker.label}
            >
              <div
                className="h-3 w-1.5 rounded-full shadow-lg transition-transform hover:scale-125"
                style={{ backgroundColor: marker.color ?? MARKER_COLORS[marker.type] }}
              />
            </button>
          );
        })}

        {/* 播放头 */}
        <motion.div
          className="absolute top-1/2 z-20 h-6 w-0.5 -translate-y-1/2 transform rounded-full bg-white shadow-lg"
          style={{ left: `${progress * 100}%` }}
          layoutId="timeline-playhead"
        >
          <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-white shadow" />
        </motion.div>

        {/* 时间刻度（仅展开时显示） */}
        {expanded && (
          <div className="absolute inset-x-0 bottom-0 flex justify-between px-2">
            <span className="font-mono text-[10px] text-slate-600">{formatTime(timeRange.start)}</span>
            <span className="font-mono text-[10px] text-slate-600">{formatTime(timeRange.end)}</span>
          </div>
        )}
      </div>

      {/* 时间范围 */}
      <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
        <span className="font-mono">{formatTime(timeRange.start)}</span>
        <span className="text-slate-500">
          {formatDuration(timeRange.end - timeRange.start)}
        </span>
        <span className="font-mono">{formatTime(timeRange.end)}</span>
      </div>
    </div>
  );
}

/** 时间轴回放 Hook */
export function useHistoricalPlayback(
  dataAdapter: {
    getEnergyHistory: (buildingId: string, limit?: number) => Array<{ timestamp: number; electricity: number; hvac: number; lighting: number; equipment: number; total: number; loadRate?: number }>;
    getBuildings: () => Array<{ id: string }>;
  } | null,
) {
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [markers, setMarkers] = useState<TimelineMarker[]>([]);

  // 时间范围（基于所有建筑的能耗历史）
  const timeRange = useMemo((): { start: number; end: number } => {
    if (!dataAdapter) {
      const now = Date.now();
      return { start: now - 86400000, end: now }; // 默认 24h
    }

    const buildings = dataAdapter.getBuildings();
    let min = Infinity, max = -Infinity;

    buildings.forEach((b) => {
      const history = dataAdapter.getEnergyHistory(b.id, 500);
      history.forEach((pt) => {
        if (pt.timestamp < min) min = pt.timestamp;
        if (pt.timestamp > max) max = pt.timestamp;
      });
    });

    if (min === Infinity) {
      const now = Date.now();
      return { start: now - 86400000, end: now };
    }

    return { start: min, end: max };
  }, [dataAdapter]);

  // 获取当前时间点的历史快照
  const currentSnapshot = useMemo((): HistoricalDataPoint | null => {
    if (!dataAdapter) return null;

    const buildings = dataAdapter.getBuildings();
    const snapshot: HistoricalDataPoint = {
      timestamp: currentTime,
      buildings: {},
    };

    buildings.forEach((b) => {
      const history = dataAdapter.getEnergyHistory(b.id);
      // 找到最接近当前时间的历史记录
      let closest = history[0];
      let closestDiff = Infinity;
      for (const pt of history) {
        const diff = Math.abs(pt.timestamp - currentTime);
        if (diff < closestDiff) {
          closestDiff = diff;
          closest = pt;
        }
      }
      if (closest) {
        snapshot.buildings[b.id] = closest;
      }
    });

    return snapshot;
  }, [dataAdapter, currentTime]);

  // 自动播放定时器
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isPlaying) {
      const interval = 100; // 100ms 更新
      const timeStep = 3600000 / 10 * playbackSpeed; // 每 tick 前进 6 分钟（加速后）
      timerRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          const next = prev + timeStep;
          if (next >= timeRange.end) {
            setIsPlaying(false);
            return timeRange.end;
          }
          return next;
        });
      }, interval);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, timeRange.end]);

  return {
    currentTime,
    timeRange,
    isPlaying,
    playbackSpeed,
    markers,
    currentSnapshot,
    setCurrentTime,
    setIsPlaying,
    setPlaybackSpeed,
    setMarkers,
  };
}

/** 历史回放总成组件（集成时间轴 + 数据还原） */
export interface HistoricalPlaybackProps {
  /** 数据适配器 */
  dataAdapter: {
    getEnergyHistory: (buildingId: string, limit?: number) => Array<{
      timestamp: number; electricity: number; hvac: number; lighting: number; equipment: number; total: number; loadRate?: number
    }>;
    getBuildings: () => Array<{ id: string }>;
    getAlerts: () => Array<{ id: string; timestamp: number; level: "info" | "warning" | "critical"; buildingId: string }>;
  } | null;
  /** 回放数据变化回调（驱动3D场景更新） */
  onSnapshotChange?: (snapshot: HistoricalDataPoint | null) => void;
  /** 默认展开 */
  defaultExpanded?: boolean;
  /** 初始时间 */
  initialTime?: number;
}

export function HistoricalPlayback({
  dataAdapter,
  onSnapshotChange,
  defaultExpanded = false,
  initialTime,
}: HistoricalPlaybackProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const {
    currentTime,
    timeRange,
    isPlaying,
    playbackSpeed,
    markers,
    currentSnapshot,
    setCurrentTime,
    setIsPlaying,
    setPlaybackSpeed,
  } = useHistoricalPlayback(dataAdapter);

  // 同步时间到外部
  useEffect(() => {
    if (initialTime !== undefined) {
      setCurrentTime(initialTime);
    }
  }, [initialTime]);

  // 快照变化时通知外部
  useEffect(() => {
    onSnapshotChange?.(currentSnapshot);
  }, [currentSnapshot, onSnapshotChange]);

  // 自动生成告警标记
  useEffect(() => {
    if (!dataAdapter) return;
    const alerts = dataAdapter.getAlerts();
    const alertMarkers: TimelineMarker[] = alerts.map((a) => ({
      timestamp: a.timestamp,
      label: `${a.level === "critical" ? "严重" : a.level === "warning" ? "警告" : "信息"}告警`,
      type: "alert" as const,
      color: MARKER_COLORS.alert,
    }));
    setMarkers(alertMarkers);
  }, [dataAdapter]);

  return (
    <div className="relative">
      {/* 展开/收起按钮 */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between rounded-xl border border-slate-700/50 bg-slate-950/90 px-4 py-2.5 backdrop-blur-md transition-all",
          expanded ? "rounded-b-none border-b-0" : "hover:bg-slate-900",
        )}
      >
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-medium text-slate-300">历史回放</span>
          {!expanded && (
            <span className="font-mono text-xs text-slate-500">
              {formatTime(currentTime)}
            </span>
          )}
        </div>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </motion.div>
      </button>

      {/* 展开内容 */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden rounded-b-xl border border-t-0 border-slate-700/50 bg-slate-950/95 p-4"
          >
            {/* 能源统计概览 */}
            {currentSnapshot && (
              <div className="mb-3 grid grid-cols-4 gap-2">
                {[
                  { label: "总电力", value: Object.values(currentSnapshot.buildings).reduce((s, b) => s + b.electricity, 0).toFixed(1), unit: "kW", icon: Zap, color: "text-amber-400" },
                  { label: "HVAC", value: Object.values(currentSnapshot.buildings).reduce((s, b) => s + b.hvac, 0).toFixed(0), unit: "kWh", icon: Zap, color: "text-cyan-400" },
                  { label: "平均负载率", value: Object.values(currentSnapshot.buildings).length > 0 ? (Object.values(currentSnapshot.buildings).reduce((s, b) => s + (b.loadRate ?? 0), 0) / Object.values(currentSnapshot.buildings).length * 100).toFixed(0) : "0", unit: "%", icon: Gauge, color: "text-emerald-400" },
                  { label: "建筑数量", value: Object.keys(currentSnapshot.buildings).length.toString(), unit: "栋", icon: Gauge, color: "text-violet-400" },
                ].map(({ label, value, unit, icon: Icon, color }) => (
                  <div key={label} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-center">
                    <Icon className={cn("mx-auto h-3.5 w-3.5", color)} />
                    <p className={cn("mt-0.5 font-mono text-sm font-bold", color)}>{value}</p>
                    <p className="text-[10px] text-slate-600">{unit}</p>
                    <p className="text-[9px] text-slate-700">{label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* 时间轴控件 */}
            <TimelineControls
              currentTime={currentTime}
              timeRange={timeRange}
              isPlaying={isPlaying}
              playbackSpeed={playbackSpeed}
              markers={markers}
              onTimeChange={setCurrentTime}
              onPlayPause={setIsPlaying}
              onSpeedChange={setPlaybackSpeed}
              expanded={expanded}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
