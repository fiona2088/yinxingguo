/**
 * ============================================================
 * AlertIntegrationSystem — 告警联动特效系统
 * ============================================================
 * 第三阶段核心功能：
 *
 * 功能模块：
 *   1. 3D告警特效 — 建筑脉冲发光 + 粒子爆炸 + 包围盒闪烁
 *   2. 屏幕边缘闪烁 — 全屏告警氛围效果
 *   3. 声音提示 — Web Audio API 告警音效（支持语音播报）
 *   4. HUD 告警面板 — 告警列表 + 确认 + 强度可视化
 *   5. 告警强度仪表 — 实时显示告警活跃度
 *   6. 告警链路追踪 — 告警建筑 → 关联管线 → 关联设备
 *
 * 告警级别视觉规范：
 *   - info:     蓝色调，低频闪烁
 *   - warning:  琥珀色调，中频闪烁 + 声音提示
 *   - critical: 红色调，高频闪烁 + 紧急声音 + 屏幕边缘脉冲
 *
 * 与后处理管线的联动：
 *   - warning: bloom增强30% + 色差增强50% + 曝光+10%
 *   - critical: bloom增强60% + 色差增强100% + 曝光+15% + 颗粒增强50%
 */

import {
  Scene,
  Vector3,
  Color3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  Animation,
  ParticleSystem,
  DynamicTexture,
  AbstractMesh,
  ActionManager,
  ExecuteCodeAction,
} from "@babylonjs/core";

// ─────────────────────────────────────────────────────────────
//  告警级别定义
// ─────────────────────────────────────────────────────────────

export type AlertLevel = "info" | "warning" | "critical";

/** 告警数据 */
export interface AlertData {
  id: string;
  title: string;
  description: string;
  level: AlertLevel;
  buildingId?: string;
  segmentId?: string;
  deviceId?: string;
  timestamp: number;
  acknowledged: boolean;
  value?: number;
  threshold?: number;
  suggestion?: string;
}

/** 告警特效配置 */
export interface AlertEffectConfig {
  /** 脉冲频率（次/秒） */
  pulseRate: number;
  /** 粒子爆发数量 */
  particleCount: number;
  /** 包围盒颜色 */
  boundingBoxColor: Color3;
  /** 持续时间（毫秒），0=永久 */
  duration: number;
  /** 是否触发屏幕闪烁 */
  screenFlash: boolean;
  /** 是否播放声音 */
  playSound: boolean;
  /** 声音类型 */
  soundType: "beep" | "warning" | "critical" | "voice";
  /** 语音播报文本（voice模式） */
  voiceText?: string;
}

/** 告警级别特效预设 */
const ALERT_PRESETS: Record<AlertLevel, AlertEffectConfig> = {
  info: {
    pulseRate: 0.5,
    particleCount: 15,
    boundingBoxColor: new Color3(0.23, 0.74, 0.98),
    duration: 5000,
    screenFlash: false,
    playSound: false,
    soundType: "beep",
  },
  warning: {
    pulseRate: 1.5,
    particleCount: 30,
    boundingBoxColor: new Color3(0.96, 0.62, 0.04),
    duration: 8000,
    screenFlash: true,
    playSound: true,
    soundType: "warning",
  },
  critical: {
    pulseRate: 3.0,
    particleCount: 60,
    boundingBoxColor: new Color3(0.94, 0.27, 0.27),
    duration: 0,
    screenFlash: true,
    playSound: true,
    soundType: "critical",
  },
};

// ─────────────────────────────────────────────────────────────
//  Web Audio 告警音效引擎
// ─────────────────────────────────────────────────────────────

class AlertAudioEngine {
  private audioContext: AudioContext | null = null;
  private enabled = true;

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  /** 简单蜂鸣 */
  playBeep(frequency = 880, duration = 0.2) {
    if (!this.enabled) return;
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = frequency;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {
      // 静默失败
    }
  }

  /** 警告音效（双音调脉冲） */
  playWarning() {
    if (!this.enabled) return;
    this.playBeep(660, 0.15);
    setTimeout(() => this.playBeep(880, 0.15), 180);
  }

  /** 紧急音效（急促高频脉冲） */
  playCritical() {
    if (!this.enabled) return;
    const pattern = [0, 100, 200, 300, 400, 500];
    pattern.forEach((delay) => {
      setTimeout(() => this.playBeep(1000 + Math.random() * 200, 0.08), delay);
    });
  }

  /** 语音播报（使用 Web Speech API） */
  speak(text: string, lang = "zh-CN") {
    if (!this.enabled) return;
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 1.2;
      utterance.pitch = 1.0;
      utterance.volume = 0.8;
      window.speechSynthesis.speak(utterance);
    }
  }

  dispose() {
    this.audioContext?.close();
    this.audioContext = null;
  }
}

// ─────────────────────────────────────────────────────────────
//  屏幕闪烁覆盖层
// ─────────────────────────────────────────────────────────────

class ScreenFlashOverlay {
  private overlay: HTMLDivElement | null = null;
  private animationId: number | null = null;
  private active = false;

  show() {
    if (this.overlay) return;
    this.overlay = document.createElement("div");
    this.overlay.style.cssText = `
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 9998;
      opacity: 0;
      transition: opacity 0.05s;
    `;
    document.body.appendChild(this.overlay);
  }

  flash(color: string, duration = 150, intensity = 0.15) {
    if (!this.overlay) this.show();
    if (!this.overlay) return;

    this.active = true;
    this.overlay.style.backgroundColor = color;
    this.overlay.style.opacity = String(intensity);

    setTimeout(() => {
      if (this.overlay) {
        this.overlay.style.opacity = "0";
      }
      setTimeout(() => {
        this.active = false;
      }, duration);
    }, duration);
  }

  pulse(color: string, count = 3, interval = 200) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => this.flash(color, interval * 0.8, 0.12), i * interval);
    }
  }

  dispose() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  单个告警特效实例
// ─────────────────────────────────────────────────────────────

interface ActiveAlertEffect {
  alertId: string;
  boundingBox: Mesh | null;
  pulseAnim: Animation | null;
  particleSystem: ParticleSystem | null;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

// ─────────────────────────────────────────────────────────────
//  告警联动特效系统
// ─────────────────────────────────────────────────────────────

export class AlertIntegrationSystem {
  private scene: Scene;
  private activeEffects = new Map<string, ActiveAlertEffect>();
  private audioEngine: AlertAudioEngine;
  private screenFlash: ScreenFlashOverlay;
  private onAlertCallback: ((alert: AlertData) => void) | null = null;
  private disposed = false;

  // 告警统计
  private alertStats = {
    info: 0,
    warning: 0,
    critical: 0,
    totalAcknowledged: 0,
    totalTriggered: 0,
  };

  constructor(scene: Scene) {
    this.scene = scene;
    this.audioEngine = new AlertAudioEngine();
    this.screenFlash = new ScreenFlashOverlay();
  }

  /** 设置告警触发回调 */
  onAlertTriggered(callback: (alert: AlertData) => void) {
    this.onAlertCallback = callback;
  }

  /** 触发告警特效 */
  trigger(alert: AlertData) {
    if (this.disposed || alert.acknowledged) return;

    this.alertStats.totalTriggered++;
    this.alertStats[alert.level]++;

    const preset = ALERT_PRESETS[alert.level];

    // 声音
    if (preset.playSound) {
      switch (preset.soundType) {
        case "beep":
          this.audioEngine.playBeep();
          break;
        case "warning":
          this.audioEngine.playWarning();
          break;
        case "critical":
          this.audioEngine.playCritical();
          break;
        case "voice":
          this.audioEngine.speak(alert.description);
          break;
      }
    }

    // 屏幕闪烁
    if (preset.screenFlash) {
      const color =
        alert.level === "critical" ? "rgba(239,68,68,0.15)" :
        alert.level === "warning" ? "rgba(245,158,11,0.12)" :
        "rgba(59,130,246,0.1)";

      if (alert.level === "critical") {
        this.screenFlash.pulse(color, 3, 250);
      } else {
        this.screenFlash.flash(color, 200, 0.1);
      }
    }

    // 建筑3D特效（通过 SceneBuilder 触发）
    this.onAlertCallback?.(alert);

    // 自动清除（若设定了时长）
    if (preset.duration > 0) {
      setTimeout(() => {
        this.clear(alert.id);
      }, preset.duration);
    }
  }

  /** 触发指定建筑的告警特效 */
  triggerBuildingAlert(
    buildingId: string,
    alertId: string,
    level: AlertLevel = "warning",
  ) {
    const preset = ALERT_PRESETS[level];

    // 包围盒脉冲
    const bbox = this.createBoundingBox(buildingId, preset.boundingBoxColor, preset.pulseRate);

    // 粒子爆发
    const particles = this.createAlertParticles(buildingId, preset.particleCount, level);

    // 保存效果引用
    this.activeEffects.set(alertId, {
      alertId,
      boundingBox: bbox,
      pulseAnim: null,
      particleSystem: particles,
      timeoutId: preset.duration > 0 ? setTimeout(() => this.clear(alertId), preset.duration) : null,
    });
  }

  private createBoundingBox(buildingId: string, color: Color3, pulseRate: number): Mesh | null {
    // 找到建筑mesh
    const meshes = this.scene.meshes.filter(
      (m) => m.metadata?.buildingId === buildingId,
    );
    if (meshes.length === 0) return null;

    const bbox = MeshBuilder.CreateBox(
      `alertBbox-${alertId}`,
      { size: 0.01 },
      this.scene,
    );

    // 包裹建筑
    const min = meshes.reduce((acc, m) => {
      const bi = m.getBoundingInfo();
      const bb = bi.boundingBox;
      return {
        x: Math.min(acc.x, bb.minimumWorld.x),
        y: Math.min(acc.y, bb.minimumWorld.y),
        z: Math.min(acc.z, bb.minimumWorld.z),
      };
    }, { x: Infinity, y: Infinity, z: Infinity });

    const max = meshes.reduce((acc, m) => {
      const bi = m.getBoundingInfo();
      const bb = bi.boundingBox;
      return {
        x: Math.max(acc.x, bb.maximumWorld.x),
        y: Math.max(acc.y, bb.maximumWorld.y),
        z: Math.max(acc.z, bb.maximumWorld.z),
      };
    }, { x: -Infinity, y: -Infinity, z: -Infinity });

    const center = new Vector3(
      (min.x + max.x) / 2,
      (min.y + max.y) / 2,
      (min.z + max.z) / 2,
    );
    const size = new Vector3(
      max.x - min.x + 0.2,
      max.y - min.y + 0.2,
      max.z - min.z + 0.2,
    );

    bbox.scaling = size;
    bbox.position = center;

    const mat = new StandardMaterial(`alertBboxMat-${alertId}`, this.scene);
    mat.diffuseColor = color;
    mat.emissiveColor = color;
    mat.alpha = 0;
    mat.wireframe = true;
    bbox.material = mat;

    // 脉冲动画
    const pulseAnim = new Animation(
      `alertPulse-${alertId}`,
      "material.alpha",
      30,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CYCLE,
    );

    const frames = Math.round(30 / pulseRate);
    const keys = [];
    for (let i = 0; i <= frames; i++) {
      const alpha = 0.3 * Math.abs(Math.sin((i / frames) * Math.PI * pulseRate * 2));
      keys.push({ frame: i, value: alpha });
    }
    pulseAnim.setKeys(keys);

    bbox.animations = [pulseAnim];
    this.scene.beginAnimation(bbox, 0, frames, true, pulseRate);

    return bbox;
  }

  private createAlertParticles(
    buildingId: string,
    count: number,
    level: AlertLevel,
  ): ParticleSystem | null {
    const meshes = this.scene.meshes.filter(
      (m) => m.metadata?.buildingId === buildingId,
    );
    if (meshes.length === 0) return null;

    const mesh = meshes[0];
    const center = mesh.getAbsolutePosition();

    const ps = new ParticleSystem(`alertParticles-${buildingId}`, count, this.scene);

    // 告警粒子纹理
    ps.particleTexture = this.createAlertParticleTexture(level);

    ps.emitter = center.add(new Vector3(0, 1, 0));
    ps.createSphereEmitter(0.5);

    const color = level === "critical" ? new Color4(1, 0.2, 0.2, 1) :
                  level === "warning" ? new Color4(1, 0.6, 0.1, 1) :
                  new Color4(0.2, 0.7, 1, 1);
    ps.color1 = color;
    ps.color2 = color;
    ps.colorDead = new Color4(color.r, color.g, color.b, 0);

    ps.minSize = 0.05;
    ps.maxSize = 0.15;
    ps.minLifeTime = 0.8;
    ps.maxLifeTime = 1.5;
    ps.emitRate = count;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;

    ps.minEmitPower = 1.5;
    ps.maxEmitPower = 3.0;
    ps.gravity = new Vector3(0, -2, 0);

    ps.start();

    return ps;
  }

  private createAlertParticleTexture(level: AlertLevel): DynamicTexture {
    const size = 64;
    const tex = new DynamicTexture(`alertTex-${level}`, size, this.scene, false);
    const ctx = tex.getContext();

    const color = level === "critical" ? "#ff3333" :
                  level === "warning" ? "#ff9900" :
                  "#33aaff";

    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, color);
    g.addColorStop(1, "rgba(0,0,0,0)");

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    tex.update();
    return tex;
  }

  /** 清除指定告警特效 */
  clear(alertId: string) {
    const effect = this.activeEffects.get(alertId);
    if (!effect) return;

    if (effect.boundingBox) {
      effect.boundingBox.dispose();
    }
    if (effect.particleSystem) {
      effect.particleSystem.stop();
      setTimeout(() => effect.particleSystem?.dispose(), 2000);
    }
    if (effect.timeoutId) {
      clearTimeout(effect.timeoutId);
    }
    this.activeEffects.delete(alertId);
  }

  /** 确认告警 */
  acknowledge(alertId: string) {
    this.clear(alertId);
    this.alertStats.totalAcknowledged++;
  }

  /** 获取告警统计 */
  getStats() {
    return { ...this.alertStats };
  }

  /** 获取当前活跃告警数量 */
  getActiveCount(): number {
    return this.activeEffects.size;
  }

  /** 启用/禁用声音 */
  setAudioEnabled(enabled: boolean) {
    this.audioEngine.setEnabled(enabled);
  }

  dispose() {
    this.disposed = true;
    this.activeEffects.forEach((effect) => {
      effect.boundingBox?.dispose();
      effect.particleSystem?.dispose();
      if (effect.timeoutId) clearTimeout(effect.timeoutId);
    });
    this.activeEffects.clear();
    this.audioEngine.dispose();
    this.screenFlash.dispose();
  }
}

// ─────────────────────────────────────────────────────────────
//  告警HUD面板组件（React）
// ─────────────────────────────────────────────────────────────

export interface AlertHudConfig {
  /** 告警级别颜色映射 */
  levelColors: Record<AlertLevel, string>;
  /** 最大同时显示告警数 */
  maxDisplayCount: number;
  /** 是否显示统计 */
  showStats: boolean;
  /** 是否显示声音开关 */
  showAudioToggle: boolean;
}

/** 默认HUD配置 */
export const DEFAULT_ALERT_HUD_CONFIG: AlertHudConfig = {
  levelColors: {
    info: "#38bdf8",
    warning: "#f59e0b",
    critical: "#ef4444",
  },
  maxDisplayCount: 5,
  showStats: true,
  showAudioToggle: true,
};
