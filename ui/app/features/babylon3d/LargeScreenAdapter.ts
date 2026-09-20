/**
 * ============================================================
 * LargeScreenAdapter — 大屏适配系统
 * ============================================================
 * 第四阶段核心功能：
 *
 * 1. 超宽屏比例支持 — 32:9 / 21:9 / 16:9 自动检测和适配
 * 2. 多屏拼接支持 — 横/纵多块屏幕无缝拼接
 * 3. 分辨率自适应 — 从 1080p 到 8K 的全适配
 * 4. DPI 缩放 — Retina / HiDPI 屏幕正确渲染
 * 5. 视角范围优化 — 宽屏场景下视野调整
 * 6. UI布局适配 — 大屏模式下 UI 元素尺寸/间距调整
 * 7. 拼接缝隙补偿 — 多屏间的边框/缝隙区域特殊处理
 *
 * 典型大屏分辨率：
 *   - 1080p:  1920×1080
 *   - 2K:     2560×1440
 *   - 4K:     3840×2160
 *   - 5K:     5120×2880
 *   - 8K:     7680×4320
 *   - 16:9超宽: 3440×1440
 *   - 32:9超宽: 5120×1440
 */

import {
  Scene,
  Engine,
  Camera,
  Vector3,
} from "@babylonjs/core";

// ─────────────────────────────────────────────────────────────
//  屏幕配置
// ─────────────────────────────────────────────────────────────

export type AspectRatioPreset =
  | "16:9"   // 标准
  | "21:9"   // 影院宽屏
  | "32:9"   // 超宽屏
  | "4:3"    // 经典
  | "9:16"   // 竖屏
  | "custom";

/** 单块物理屏幕配置 */
export interface PhysicalScreen {
  /** 屏幕序号 */
  index: number;
  /** 物理宽度 px */
  width: number;
  /** 物理高度 px */
  height: number;
  /** 左上角 x 偏移（拼接模式） */
  offsetX: number;
  /** 左上角 y 偏移（拼接模式） */
  offsetY: number;
  /** 拼接方向 */
  direction: "horizontal" | "vertical" | "single";
}

/** 大屏拼接配置 */
export interface WallConfig {
  /** 拼接列数 */
  columns: number;
  /** 拼接行数 */
  rows: number;
  /** 单块物理分辨率 */
  singleScreenResolution: [number, number]; // [width, height]
  /** 屏幕间缝隙 px（横向） */
  gapX: number;
  /** 屏幕间缝隙 px（纵向） */
  gapY: number;
  /** 屏幕边框宽度（用于缝隙补偿） */
  bezelWidth: number;
  /** 是否启用无缝拼接（补偿边框区域） */
  seamlessMode: boolean;
}

/** 大屏适配配置 */
export interface LargeScreenConfig {
  /** 目标屏幕宽高 */
  targetWidth: number;
  targetHeight: number;
  /** 目标宽高比 */
  targetAspectRatio: AspectRatioPreset;
  /** 实际宽高比（计算得出） */
  actualAspectRatio: number;
  /** 是否为超宽屏 */
  isUltrawide: boolean;
  /** 是否为竖屏 */
  isPortrait: boolean;
  /** 物理像素密度 */
  devicePixelRatio: number;
  /** 是否为 HiDPI / Retina */
  isHiDPI: boolean;
  /** 缩放比例（UI适配用） */
  uiScaleFactor: number;
  /** 渲染缩放（性能适配） */
  renderScale: number;
  /** 是否拼接模式 */
  isWallMode: boolean;
  /** 拼接墙配置 */
  wallConfig: WallConfig | null;
  /** 目标刷新率 */
  targetFps: number;
  /** 抗锯齿级别 */
  antialiasLevel: "none" | "msaa" | "taa";
  /** 是否启用性能模式（降低质量提升性能） */
  performanceMode: boolean;
}

/** 预定义拼接墙配置 */
export const PRESET_WALL_CONFIGS: Record<string, WallConfig> = {
  "2x2_1080p": {
    columns: 2,
    rows: 2,
    singleScreenResolution: [1920, 1080],
    gapX: 0,
    gapY: 0,
    bezelWidth: 5,
    seamlessMode: true,
  },
  "3x3_1080p": {
    columns: 3,
    rows: 3,
    singleScreenResolution: [1920, 1080],
    gapX: 0,
    gapY: 0,
    bezelWidth: 5,
    seamlessMode: true,
  },
  "4x4_1080p": {
    columns: 4,
    rows: 4,
    singleScreenResolution: [1920, 1080],
    gapX: 0,
    gapY: 0,
    bezelWidth: 5,
    seamlessMode: true,
  },
  "2x2_4K": {
    columns: 2,
    rows: 2,
    singleScreenResolution: [3840, 2160],
    gapX: 0,
    gapY: 0,
    bezelWidth: 3,
    seamlessMode: true,
  },
  "ultrawide_32:9": {
    columns: 2,
    rows: 1,
    singleScreenResolution: [2560, 1440],
    gapX: 0,
    gapY: 0,
    bezelWidth: 0,
    seamlessMode: false,
  },
};

// ─────────────────────────────────────────────────────────────
//  宽高比预设映射
// ─────────────────────────────────────────────────────────────

const ASPECT_RATIO_MAP: Record<AspectRatioPreset, number> = {
  "16:9": 16 / 9,
  "21:9": 21 / 9,
  "32:9": 32 / 9,
  "4:3": 4 / 3,
  "9:16": 9 / 16,
  "custom": 0,
};

// ─────────────────────────────────────────────────────────────
//  UI布局配置（基于屏幕尺寸）
// ─────────────────────────────────────────────────────────────

export interface UILayoutConfig {
  /** 面板宽度 */
  panelWidth: number;
  /** 面板最大宽度 */
  panelMaxWidth: number;
  /** 工具栏高度 */
  toolbarHeight: number;
  /** 图例字体大小 */
  legendFontSize: number;
  /** 面板内边距 */
  panelPadding: number;
  /** 按钮尺寸 */
  buttonSize: number;
  /** 间距 */
  spacing: number;
  /** 是否显示完整图例 */
  showFullLegend: boolean;
  /** 是否显示大字号标题 */
  useLargeTitle: boolean;
}

/** 基于分辨率计算UI布局 */
function computeUILayoutConfig(config: LargeScreenConfig): UILayoutConfig {
  const { targetWidth, isHiDPI, isUltrawide } = config;

  // 基础字体比例（基于1080p宽度）
  const fontScale = Math.min(1.5, Math.max(0.8, targetWidth / 1920));

  return {
    panelWidth: Math.round(380 * fontScale),
    panelMaxWidth: Math.round(500 * fontScale),
    toolbarHeight: Math.round(56 * fontScale),
    legendFontSize: Math.round(12 * fontScale),
    panelPadding: Math.round(16 * fontScale),
    buttonSize: Math.round(36 * fontScale),
    spacing: Math.round(12 * fontScale),
    showFullLegend: targetWidth > 2560,
    useLargeTitle: targetWidth > 3840 || isUltrawide,
  };
}

// ─────────────────────────────────────────────────────────────
//  主适配器类
// ─────────────────────────────────────────────────────────────

export class LargeScreenAdapter {
  private engine: Engine;
  private scene: Scene;
  private config: LargeScreenConfig;
  private uiLayout: UILayoutConfig;
  private wallScreens: PhysicalScreen[] = [];
  private disposed = false;

  constructor(
    engine: Engine,
    scene: Scene,
    targetWidth: number,
    targetHeight: number,
    wallConfig?: WallConfig,
  ) {
    this.engine = engine;
    this.scene = scene;

    // 检测环境
    const dpr = window.devicePixelRatio ?? 1;
    const aspectRatio = targetWidth / targetHeight;
    const isUltrawide = aspectRatio >= 2.2;
    const isPortrait = aspectRatio < 0.8;
    const isHiDPI = dpr >= 2;

    // 确定宽高比预设
    let preset: AspectRatioPreset = "custom";
    for (const [key, ratio] of Object.entries(ASPECT_RATIO_MAP)) {
      if (Math.abs(aspectRatio - ratio) < 0.05) {
        preset = key as AspectRatioPreset;
        break;
      }
    }

    // 计算UI缩放
    let uiScale = 1.0;
    if (targetWidth >= 7680) {
      uiScale = 1.5; // 8K
    } else if (targetWidth >= 5120) {
      uiScale = 1.3; // 5K / 32:9
    } else if (targetWidth >= 3840) {
      uiScale = 1.15; // 4K
    } else if (targetWidth >= 2560) {
      uiScale = 1.05; // 2K
    }

    // 渲染缩放（高分辨率下降低以保证性能）
    let renderScale = 1.0;
    if (targetWidth >= 7680) {
      renderScale = 0.7;
    } else if (targetWidth >= 5120) {
      renderScale = 0.8;
    } else if (targetWidth >= 3840) {
      renderScale = 0.9;
    }

    // 抗锯齿级别
    let antialiasLevel: "none" | "msaa" | "taa" = "msaa";
    if (targetWidth >= 5120) {
      antialiasLevel = "none"; // 超高分辨率下关闭MSAA以提升性能
    }

    this.config = {
      targetWidth,
      targetHeight,
      targetAspectRatio: preset,
      actualAspectRatio: aspectRatio,
      isUltrawide,
      isPortrait,
      devicePixelRatio: dpr,
      isHiDPI,
      uiScaleFactor: uiScale,
      renderScale,
      isWallMode: !!wallConfig,
      wallConfig: wallConfig ?? null,
      targetFps: targetWidth >= 5120 ? 30 : 60,
      antialiasLevel,
      performanceMode: targetWidth >= 5120,
    };

    this.uiLayout = computeUILayoutConfig(this.config);

    // 生成拼接屏幕信息
    if (wallConfig) {
      this.wallScreens = this.generateWallScreens(wallConfig);
    } else {
      this.wallScreens = [{
        index: 0,
        width: targetWidth,
        height: targetHeight,
        offsetX: 0,
        offsetY: 0,
        direction: "single",
      }];
    }

    this.applyEngineSettings();
  }

  /** 生成拼接墙的屏幕信息 */
  private generateWallScreens(wallConfig: WallConfig): PhysicalScreen[] {
    const screens: PhysicalScreen[] = [];
    const [sw, sh] = wallConfig.singleScreenResolution;
    const { columns, rows, gapX, gapY, bezelWidth } = wallConfig;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        screens.push({
          index: r * columns + c,
          width: sw,
          height: sh,
          offsetX: c * (sw + gapX) - bezelWidth,
          offsetY: r * (sh + gapY) - bezelWidth,
          direction: columns > 1 ? "horizontal" : "vertical",
        });
      }
    }

    return screens;
  }

  /** 应用引擎设置 */
  private applyEngineSettings() {
    // 渲染缩放
    const hw = Math.round(this.config.targetWidth * this.config.renderScale);
    const hh = Math.round(this.config.targetHeight * this.config.renderScale);
    this.engine.setHardwareScalingLevel(1 / this.config.renderScale);

    // 抗锯齿
    if (this.config.antialiasLevel === "none") {
      this.engine.setHardwareScalingLevel(this.engine.getHardwareScalingLevel() * 1.5);
    }

    // 目标FPS
    this.engine.setDesiredFrameRate(this.config.targetFps);
  }

  /** 获取完整配置 */
  getConfig(): LargeScreenConfig {
    return { ...this.config };
  }

  /** 获取UI布局配置 */
  getUILayout(): UILayoutConfig {
    return { ...this.uiLayout };
  }

  /** 获取拼接墙屏幕列表 */
  getWallScreens(): PhysicalScreen[] {
    return [...this.wallScreens];
  }

  /** 获取主屏幕（第一块） */
  getMainScreen(): PhysicalScreen {
    return this.wallScreens[0] ?? {
      index: 0,
      width: this.config.targetWidth,
      height: this.config.targetHeight,
      offsetX: 0,
      offsetY: 0,
      direction: "single" as const,
    };
  }

  /** 获取拼接墙总分辨率 */
  getTotalWallResolution(): { width: number; height: number } {
    if (!this.config.wallConfig) {
      return { width: this.config.targetWidth, height: this.config.targetHeight };
    }

    const wc = this.config.wallConfig;
    const totalW = wc.columns * wc.singleScreenResolution[0] + (wc.columns - 1) * wc.gapX;
    const totalH = wc.rows * wc.singleScreenResolution[1] + (wc.rows - 1) * wc.gapY;
    return { width: totalW, height: totalH };
  }

  /** 调整相机FOV（超宽屏模式） */
  adjustCameraForUltrawide(camera: Camera) {
    if (!this.config.isUltrawide) return;

    const targetFov = this.config.isPortrait ? 0.8 : 1.4;
    const currentFov = camera.fov;

    // 平滑调整FOV
    const diff = targetFov - currentFov;
    if (Math.abs(diff) > 0.01) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (camera as any).fov = currentFov + diff * 0.05;
    }
  }

  /** 获取CSS样式（用于UI适配） */
  getCSSVariables(): Record<string, string> {
    const { uiScaleFactor, isUltrawide, isHiDPI } = this.config;

    return {
      "--screen-scale": String(uiScaleFactor),
      "--panel-width": `${this.uiLayout.panelWidth}px`,
      "--toolbar-height": `${this.uiLayout.toolbarHeight}px`,
      "--legend-font-size": `${this.uiLayout.legendFontSize}px`,
      "--panel-padding": `${this.uiLayout.panelPadding}px`,
      "--button-size": `${this.uiLayout.buttonSize}px`,
      "--spacing": `${this.uiLayout.spacing}px`,
      "--is-ultrawide": isUltrawide ? "1" : "0",
      "--is-hidpi": isHiDPI ? "1" : "0",
    };
  }

  /** 获取推荐渲染配置 */
  getRecommendedRenderConfig(): {
    antialias: boolean;
    antialiasSamples: number;
    maxLights: number;
    maxParticles: number;
    textureQuality: "low" | "medium" | "high";
    shadowMapSize: number;
    enableBloom: boolean;
    enableDOF: boolean;
  } {
    const { performanceMode, targetWidth } = this.config;

    if (performanceMode || targetWidth >= 7680) {
      return {
        antialias: false,
        antialiasSamples: 0,
        maxLights: 8,
        maxParticles: 200,
        textureQuality: "low",
        shadowMapSize: 512,
        enableBloom: true,
        enableDOF: false,
      };
    }

    if (targetWidth >= 5120) {
      return {
        antialias: false,
        antialiasSamples: 0,
        maxLights: 16,
        maxParticles: 400,
        textureQuality: "medium",
        shadowMapSize: 1024,
        enableBloom: true,
        enableDOF: true,
      };
    }

    return {
      antialias: true,
      antialiasSamples: 4,
      maxLights: 32,
      maxParticles: 800,
      textureQuality: "high",
      shadowMapSize: 2048,
      enableBloom: true,
      enableDOF: true,
    };
  }

  /** 应用到引擎（重新设置分辨率） */
  resize(newWidth: number, newHeight: number) {
    this.engine.resize();
    void newWidth;
    void newHeight;
  }

  dispose() {
    this.disposed = true;
  }
}

// ─────────────────────────────────────────────────────────────
//  自动检测工具
// ─────────────────────────────────────────────────────────────

/** 自动检测屏幕配置 */
export function detectScreenConfig(): {
  width: number;
  height: number;
  dpr: number;
  aspectRatio: AspectRatioPreset;
} {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = window.devicePixelRatio ?? 1;

  const aspectRatio = width / height;
  let preset: AspectRatioPreset = "custom";
  for (const [key, ratio] of Object.entries(ASPECT_RATIO_MAP)) {
    if (Math.abs(aspectRatio - ratio) < 0.05) {
      preset = key as AspectRatioPreset;
      break;
    }
  }

  return { width, height, dpr, aspectRatio: preset };
}
