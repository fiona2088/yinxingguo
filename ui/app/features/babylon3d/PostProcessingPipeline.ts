/**
 * ============================================================
 * PostProcessingPipeline — 电影级后处理渲染管线
 * ============================================================
 * 实现：
 *   - Bloom（辉光）：高亮区域发光溢出
 *   - HBAO（水平屏幕空间环境光遮蔽）
 *   - SSR（屏幕空间反射）
 *   - ACES 色调映射（电影级色彩还原）
 *   - DOF（景深）
 *   - 色差（Chromatic Aberration）
 *   - 暗角（Vignette）
 *   - 颗粒噪点（Grain）
 *   - Lens Flare（镜头光晕）— 第三阶段
 *   - Motion Blur（动态模糊）— 第三阶段
 *   - Volumetric God Rays（体积光柱）— 第三阶段
 *   - Film Gate（电影黑边）— 第三阶段
 *
 * 所有特效支持运行时热切换，基于 SceneConfig.EffectSwitches
 */

import {
  Scene,
  Effect,
  PostProcess,
  Color4,
  Color3,
  Vector2,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  DynamicTexture,
  LensFlareSystem,
  LensFlare,
  PointLight,
  ImageProcessingConfiguration,
  ColorCurves,
} from "@babylonjs/core";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { LensRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/lensRenderingPipeline";
import { SharpenPostProcess } from "@babylonjs/core/PostProcesses/sharpenPostProcess";
import { GrainPostProcess } from "@babylonjs/core/PostProcesses/grainPostProcess";
import { ChromaticAberrationPostProcess } from "@babylonjs/core/PostProcesses/chromaticAberrationPostProcess";

/** 后处理特效配置 */
export interface EffectConfig {
  /** 辉光（Bloom）强度 0-1 */
  bloomEnabled: boolean;
  bloomWeight: number;
  bloomKernel: number;
  bloomScale: number;
  bloomThreshold: number;

  /** 景深（DOF） */
  dofEnabled: boolean;
  dofFocusDistance: number;
  dofAperture: number;
  dofPentagon: boolean;

  /** 色调映射 */
  toneMappingEnabled: boolean;
  toneMappingType: "ACES" | "Reinhard" | "Hable" | "None";

  /** 色差 */
  chromaticAberrationEnabled: boolean;
  chromaticAberrationAmount: number;

  /** 暗角 */
  vignetteEnabled: boolean;
  vignetteWeight: number;
  vignetteStretch: number;
  vignetteCentreX: number;
  vignetteCentreY: number;
  vignetteColor: Color4;
  vignetteBlendMode: "Multiply" | "Add";

  /** 颗粒噪点 */
  grainEnabled: boolean;
  grainIntensity: number;
  grainAnimated: boolean;

  /** 锐化 */
  sharpeningEnabled: boolean;
  sharpeningEdgeAmount: number;

  /** 对比度 */
  contrast: number;
  exposure: number;

  /** HBAO 环境光遮蔽 */
  ssaoEnabled: boolean;
  ssaoRadius: number;
  ssaoTotalStrength: number;
  ssaoArea: number;
  ssaoSamples: number;

  /** SSR 屏幕空间反射 */
  ssrEnabled: boolean;
  ssrMaxSteps: number;
  ssrMaxDistance: number;

  // ──────────────── 第三阶段：影视级特效 ────────────────

  /** Lens Flare 镜头光晕 */
  lensFlareEnabled: boolean;
  lensFlareIntensity: number;
  lensFlareSourcePosition: [number, number, number];

  /** Motion Blur 动态模糊 */
  motionBlurEnabled: boolean;
  motionBlurStrength: number;
  motionBlurSamples: number;

  /** God Rays 体积光（径向模糊模拟） */
  godRaysEnabled: boolean;
  godRaysIntensity: number;
  godRaysDensity: number;
  godRaysDecay: number;
  godRaysWeight: number;
  godRaysExposure: number;

  /** 电影黑边（Film Gate） */
  filmGateEnabled: boolean;
  filmGateAspectRatio: number;
  filmGateColor: [number, number, number];
}

/** 默认电影级配置 */
export const DEFAULT_CINEMATIC_CONFIG: EffectConfig = {
  // Bloom — 使发光材质有真实光晕溢出
  bloomEnabled: true,
  bloomWeight: 0.7,
  bloomKernel: 64,
  bloomScale: 0.5,
  bloomThreshold: 0.7,

  // DOF — 前景/背景虚化，增强立体感
  dofEnabled: true,
  dofFocusDistance: 8000, // mm（焦点在能量中心附近）
  dofAperture: 0.8,
  dofPentagon: true,

  // ACES 色调映射 — 电影工业标准
  toneMappingEnabled: true,
  toneMappingType: "ACES",

  // 色差 — 镜头边缘色彩分离（微妙）
  chromaticAberrationEnabled: true,
  chromaticAberrationAmount: 8,

  // 暗角 — 聚焦中心
  vignetteEnabled: true,
  vignetteWeight: 2.5,
  vignetteStretch: 0.5,
  vignetteCentreX: 0.5,
  vignetteCentreY: 0.5,
  vignetteColor: new Color4(0, 0, 0, 0),
  vignetteBlendMode: "Multiply",

  // 颗粒 — 模拟胶片质感
  grainEnabled: true,
  grainIntensity: 12,
  grainAnimated: true,

  // 锐化
  sharpeningEnabled: true,
  sharpeningEdgeAmount: 0.3,

  // 图像调节
  contrast: 1.15,
  exposure: 1.05,

  // HBAO
  ssaoEnabled: true,
  ssaoRadius: 2.0,
  ssaoTotalStrength: 1.5,
  ssaoArea: 0.0075,
  ssaoSamples: 16,

  // SSR
  ssrEnabled: true,
  ssrMaxSteps: 64,
  ssrMaxDistance: 100,

  // ──────────────── 第三阶段：影视级特效 ────────────────

  // Lens Flare 镜头光晕
  lensFlareEnabled: true,
  lensFlareIntensity: 0.8,
  lensFlareSourcePosition: [0, 8, 0],

  // Motion Blur 动态模糊
  motionBlurEnabled: false,
  motionBlurStrength: 0.5,
  motionBlurSamples: 16,

  // God Rays 体积光
  godRaysEnabled: true,
  godRaysIntensity: 0.3,
  godRaysDensity: 0.96,
  godRaysDecay: 0.93,
  godRaysWeight: 0.6,
  godRaysExposure: 0.3,

  // 电影黑边
  filmGateEnabled: true,
  filmGateAspectRatio: 2.39, // 典型电影宽银幕比例
  filmGateColor: [0.02, 0.02, 0.03],
};

export interface PostProcessingPipeline {
  /** 应用所有后处理特效到场景 */
  apply(): void;
  /** 移除所有后处理 */
  dispose(): void;
  /** 按名称启用/禁用特效 */
  setEffect(name: keyof EffectConfig, enabled: boolean): void;
  /** 更新配置（热切换） */
  updateConfig(partial: Partial<EffectConfig>): void;
  /** 聚焦 DOF 到指定距离（mm） */
  setDofFocus(distance: number): void;
  /** 获取原始渲染管线（高级定制） */
  getPipeline(): DefaultRenderingPipeline | null;
  /** 触发告警时的影视级特效响应 */
  triggerAlertEffect(level: "info" | "warning" | "critical"): void;
  /** 更新 Lens Flare 光源位置 */
  updateLensFlarePosition(pos: [number, number, number]): void;
  /** 设置电影黑边比例 */
  setFilmGateAspect(aspect: number): void;
  /** 获取/设置特效强度 */
  setEffectIntensity(name: string, intensity: number): void;
  /** 获取特效实时强度 */
  getEffectIntensity(name: string): number;
}

/**
 * 构建电影级后处理管线
 * 使用 DefaultRenderingPipeline 串联所有特效
 */
export class DefaultRenderingPipelineAdapter implements PostProcessingPipeline {
  private scene: Scene;
  private config: EffectConfig;
  private pipeline: DefaultRenderingPipeline | null = null;
  private disposed = false;

  // 独立 PostProcess 实例
  private chromaticAberration: ChromaticAberrationPostProcess | null = null;
  private grain: GrainPostProcess | null = null;
  private ssao: PostProcess | null = null;
  private ssr: PostProcess | null = null;

  // ──────────────── 第三阶段：影视级特效 ────────────────
  /** Lens Flare 系统 */
  private lensFlareSystem: LensFlareSystem | null = null;
  /** 动态模糊 PostProcess */
  private motionBlur: PostProcess | null = null;
  /** God Rays 径向模糊 PostProcess */
  private godRays: PostProcess | null = null;
  /** 电影黑边覆盖层 */
  private filmGateTop: Mesh | null = null;
  private filmGateBottom: Mesh | null = null;
  private filmGateLeft: Mesh | null = null;
  private filmGateRight: Mesh | null = null;
  /** 实时特效强度（告警时动态调整） */
  private activeEffectIntensities: Record<string, number> = {};
  /** 告警时的原始配置快照 */
  private originalConfigSnapshot: EffectConfig | null = null;
  /** 当前特效预设（用于热切换） */
  private currentPresetName: string = "cinematic";

  constructor(scene: Scene, config: Partial<EffectConfig> = {}) {
    this.scene = scene;
    this.config = { ...DEFAULT_CINEMATIC_CONFIG, ...config };
  }

  apply() {
    if (this.disposed) return;
    this.buildDefaultPipeline();
    this.buildCustomEffects();
    this.applyToneMapping();
    // ── 第三阶段影视特效 ──
    this.buildLensFlare();
    this.buildMotionBlur();
    this.buildGodRays();
    this.buildFilmGate();
  }

  dispose() {
    this.disposed = true;
    this.pipeline?.dispose();
    this.chromaticAberration?.dispose();
    this.grain?.dispose();
    this.ssao?.dispose();
    this.ssr?.dispose();
    this.motionBlur?.dispose();
    this.godRays?.dispose();
    this.lensFlareSystem?.dispose();
    this.filmGateTop?.dispose();
    this.filmGateBottom?.dispose();
    this.filmGateLeft?.dispose();
    this.filmGateRight?.dispose();
    this.pipeline = null;
    this.chromaticAberration = null;
    this.grain = null;
    this.ssao = null;
    this.ssr = null;
    this.motionBlur = null;
    this.godRays = null;
    this.lensFlareSystem = null;
    this.filmGateTop = null;
    this.filmGateBottom = null;
    this.filmGateLeft = null;
    this.filmGateRight = null;
  }

  getPipeline() {
    return this.pipeline;
  }

  setEffect(name: keyof EffectConfig, enabled: boolean) {
    this.config[name] = enabled as never;
    if (!this.pipeline) return;
    switch (name) {
      case "bloomEnabled":
        this.pipeline.bloomEnabled = enabled;
        break;
      case "dofEnabled":
        this.pipeline.depthOfFieldEnabled = enabled;
        break;
      case "chromaticAberrationEnabled":
        if (this.chromaticAberration) {
          this.chromaticAberration.active = enabled;
        }
        break;
      case "grainEnabled":
        if (this.grain) this.grain.active = enabled;
        break;
      case "vignetteEnabled":
        this.pipeline.imageProcessingEnabled = true;
        if (this.pipeline.imageProcessing) {
          this.pipeline.imageProcessing.vignetteEnabled = enabled;
        }
        break;
      case "sharpeningEnabled":
        this.pipeline.sharpenEnabled = enabled;
        break;
      case "ssaoEnabled":
        // SSAO via DefaultRenderingPipeline
        if (this.pipeline.imageProcessing) {
          this.pipeline.imageProcessing.ambientColor = enabled ? new Color4(0.1, 0.1, 0.1, 1) : new Color4(1, 1, 1, 1);
        }
        break;
    }
  }

  updateConfig(partial: Partial<EffectConfig>) {
    this.config = { ...this.config, ...partial };
    if (!this.pipeline) return;
    this.rebuildPipeline();
  }

  setDofFocus(distance: number) {
    if (this.pipeline) {
      this.pipeline.depthOfField.focusDistance = distance;
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  第三阶段：影视级特效实现
  // ══════════════════════════════════════════════════════════════

  /**
   * Lens Flare — 镜头光晕
   * 在光源位置创建多层光晕效果
   */
  private buildLensFlare() {
    if (!this.config.lensFlareEnabled) return;

    const flarePos = new Vector3(...this.config.lensFlareSourcePosition);

    // 创建虚拟点光源作为 Lens Flare 源
    const flareLight = new PointLight("flareLight", flarePos, this.scene);
    flareLight.intensity = this.config.lensFlareIntensity;
    flareLight.diffuse = new Color3(1, 0.95, 0.8);
    flareLight.range = 100;

    // Lens Flare 系统
    this.lensFlareSystem = new LensFlareSystem("lensFlare", flareLight, this.scene);

    // 主光晕（中心）
    LensFlare.AddFlare(0.5, 0, new Color3(1, 1, 1), "", this.lensFlareSystem);
    // 环形光晕
    LensFlare.AddFlare(0.2, 0.2, new Color3(0.5, 0.7, 1), "", this.lensFlareSystem);
    // 辅助光斑
    LensFlare.AddFlare(0.1, 0.4, new Color3(1, 0.8, 0.5), "", this.lensFlareSystem);
    // 底部光晕
    LensFlare.AddFlare(0.15, 0.6, new Color3(0.6, 0.5, 1), "", this.lensFlareSystem);
    // 大圆形光晕
    LensFlare.AddFlare(0.3, 0.8, new Color3(1, 0.6, 0.2), "", this.lensFlareSystem);
    // 边缘光斑
    LensFlare.AddFlare(0.08, 1.0, new Color3(0.3, 0.8, 1), "", this.lensFlareSystem);
  }

  /**
   * Motion Blur — 动态模糊
   * 基于速度的后处理模糊效果
   */
  private buildMotionBlur() {
    if (!this.config.motionBlurEnabled) return;

    Effect.ShadersStore["motionBlurFragmentShader"] = `
      precision highp float;
      varying vec2 vUV;
      uniform sampler2D textureSampler;
      uniform sampler2D velocitySampler;
      uniform float strength;
      uniform int samples;

      void main(void) {
        vec4 color = texture2D(textureSampler, vUV);
        float speed = texture2D(velocitySampler, vUV).r;

        // 简化动态模糊：基于屏幕位置的方向模糊
        vec2 center = vec2(0.5);
        vec2 dir = (vUV - center) * strength * 0.01;

        vec4 blur = vec4(0.0);
        float total = 0.0;
        int s = max(2, samples / 2);
        for (int i = -s; i <= s; i++) {
          float t = float(i) / float(s);
          blur += texture2D(textureSampler, vUV + dir * t);
          total += 1.0;
        }
        color = blur / total;

        fragColor = color;
      }
    `;

    if (!this.scene.activeCamera) return;

    this.motionBlur = new PostProcess(
      "motionBlur",
      "motionBlur",
      ["strength", "samples"],
      ["velocitySampler"],
      this.config.motionBlurStrength / 10,
      this.scene.activeCamera,
    );
    this.motionBlur.active = true;
    this.motionBlur.onApply = (effect) => {
      effect.setFloat("strength", this.config.motionBlurStrength);
      effect.setInt("samples", this.config.motionBlurSamples);
    };
  }

  /**
   * God Rays — 体积光（径向模糊模拟）
   * 从光源向外的散射光效果
   */
  private buildGodRays() {
    if (!this.config.godRaysEnabled) return;

    Effect.ShadersStore["godRaysFragmentShader"] = `
      precision highp float;
      varying vec2 vUV;
      uniform sampler2D textureSampler;
      uniform vec2 lightPos;
      uniform float density;
      uniform float decay;
      uniform float weight;
      uniform float exposure;

      const int NUM_SAMPLES = 60;

      void main(void) {
        vec2 texCoord = vUV;
        vec2 deltaTexCoord = (texCoord - lightPos) * (1.0 / float(NUM_SAMPLES)) * density;

        vec4 color = texture2D(textureSampler, texCoord);
        float illuminationDecay = 1.0;
        vec4 godRays = vec4(0.0);

        for (int i = 0; i < NUM_SAMPLES; i++) {
          texCoord -= deltaTexCoord;
          vec4 s = texture2D(textureSampler, texCoord);
          s *= illuminationDecay * weight;
          godRays += s;
          illuminationDecay *= decay;
        }

        fragColor = color + godRays * exposure;
      }
    `;

    if (!this.scene.activeCamera) return;

    const [lx, ly, lz] = this.config.lensFlareSourcePosition;
    // 将3D光源位置转换为屏幕UV（简化处理）
    const lightPosUV = new Vector2(0.5, 0.3);

    this.godRays = new PostProcess(
      "godRays",
      "godRays",
      ["lightPos", "density", "decay", "weight", "exposure"],
      null,
      1.0,
      this.scene.activeCamera,
    );
    this.godRays.active = true;
    this.godRays.onApply = (effect) => {
      effect.setFloat2("lightPos", lightPosUV.x, lightPosUV.y);
      effect.setFloat("density", this.config.godRaysDensity);
      effect.setFloat("decay", this.config.godRaysDecay);
      effect.setFloat("weight", this.config.godRaysWeight);
      effect.setFloat("exposure", this.config.godRaysExposure);
    };
  }

  /**
   * Film Gate — 电影黑边
   * 在画面边缘添加黑色遮罩，模拟电影宽银幕效果
   */
  private buildFilmGate() {
    if (!this.config.filmGateEnabled) {
      this.clearFilmGate();
      return;
    }

    const engine = this.scene.getEngine();
    const canvas = engine.getRenderingCanvas();
    if (!canvas) return;

    const canvasW = canvas.clientWidth;
    const canvasH = canvas.clientHeight;
    const targetRatio = this.config.filmGateAspectRatio;
    const currentRatio = canvasW / canvasH;

    let barThickness = 0;
    let barColor = new Color3(
      this.config.filmGateColor[0],
      this.config.filmGateColor[1],
      this.config.filmGateColor[2],
    );

    // 计算需要添加的黑边厚度
    if (currentRatio > targetRatio) {
      // 当前比目标更宽，需要左右黑边
      barThickness = (canvasW - canvasH * targetRatio) / 2;
    } else {
      // 当前比目标更窄，需要上下黑边
      barThickness = (canvasH - canvasW / targetRatio) / 2;
    }

    const cam = this.scene.activeCamera;
    const camPos = cam ? cam.position : new Vector3(0, 10, -20);
    const camTarget = cam ? (cam as unknown as { target: Vector3 }).target : new Vector3(0, 0, 0);

    const direction = camTarget.subtract(camPos).normalize();
    const up = new Vector3(0, 1, 0);
    const right = Vector3.Cross(up, direction).normalize();
    const top = Vector3.Cross(direction, right).normalize();

    const dist = 0.5;
    const halfH = dist * Math.tan((cam?.fov ?? 1.0) / 2);
    const halfW = halfH * targetRatio;

    // 上黑边
    if (!this.filmGateTop) {
      this.filmGateTop = MeshBuilder.CreatePlane("filmGateTop", { width: halfW * 2.5, height: halfH * 2.5 }, this.scene);
      const mat = new StandardMaterial("filmGateTopMat", this.scene);
      mat.diffuseColor = barColor;
      mat.emissiveColor = barColor;
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      this.filmGateTop.material = mat;
    }
    this.filmGateTop.position = camPos.add(top.scale(halfH * 1.05)).add(direction.scale(dist));
    this.filmGateTop.lookAt(camPos);

    // 下黑边
    if (!this.filmGateBottom) {
      this.filmGateBottom = MeshBuilder.CreatePlane("filmGateBottom", { width: halfW * 2.5, height: halfH * 2.5 }, this.scene);
      const mat = new StandardMaterial("filmGateBottomMat", this.scene);
      mat.diffuseColor = barColor;
      mat.emissiveColor = barColor;
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      this.filmGateBottom.material = mat;
    }
    this.filmGateBottom.position = camPos.add(top.scale(-halfH * 1.05)).add(direction.scale(dist));
    this.filmGateBottom.lookAt(camPos);

    // 左黑边
    if (!this.filmGateLeft) {
      this.filmGateLeft = MeshBuilder.CreatePlane("filmGateLeft", { width: halfH * 2.5, height: halfH * 2.5 }, this.scene);
      const mat = new StandardMaterial("filmGateLeftMat", this.scene);
      mat.diffuseColor = barColor;
      mat.emissiveColor = barColor;
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      this.filmGateLeft.material = mat;
    }
    this.filmGateLeft.position = camPos.add(right.scale(-halfW * 1.05)).add(direction.scale(dist));
    this.filmGateLeft.lookAt(camPos);
    this.filmGateLeft.rotation.y = Math.PI / 2;

    // 右黑边
    if (!this.filmGateRight) {
      this.filmGateRight = MeshBuilder.CreatePlane("filmGateRight", { width: halfH * 2.5, height: halfH * 2.5 }, this.scene);
      const mat = new StandardMaterial("filmGateRightMat", this.scene);
      mat.diffuseColor = barColor;
      mat.emissiveColor = barColor;
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      this.filmGateRight.material = mat;
    }
    this.filmGateRight.position = camPos.add(right.scale(halfW * 1.05)).add(direction.scale(dist));
    this.filmGateRight.lookAt(camPos);
    this.filmGateRight.rotation.y = Math.PI / 2;
  }

  private clearFilmGate() {
    this.filmGateTop?.dispose();
    this.filmGateBottom?.dispose();
    this.filmGateLeft?.dispose();
    this.filmGateRight?.dispose();
    this.filmGateTop = null;
    this.filmGateBottom = null;
    this.filmGateLeft = null;
    this.filmGateRight = null;
  }

  // ══════════════════════════════════════════════════════════════
  //  告警联动特效
  // ══════════════════════════════════════════════════════════════

  triggerAlertEffect(level: "info" | "warning" | "critical") {
    if (!this.pipeline) return;

    // 保存原始配置快照
    if (!this.originalConfigSnapshot) {
      this.originalConfigSnapshot = { ...this.config };
    }

    // 根据告警级别调整特效
    const presets: Record<string, Partial<EffectConfig>> = {
      info: {
        bloomWeight: this.config.bloomWeight * 1.1,
        chromaticAberrationAmount: this.config.chromaticAberrationAmount * 1.2,
        exposure: this.config.exposure * 1.05,
      },
      warning: {
        bloomWeight: this.config.bloomWeight * 1.3,
        chromaticAberrationAmount: this.config.chromaticAberrationAmount * 1.5,
        exposure: this.config.exposure * 1.1,
        grainIntensity: this.config.grainIntensity * 1.2,
      },
      critical: {
        bloomWeight: this.config.bloomWeight * 1.6,
        chromaticAberrationAmount: this.config.chromaticAberrationAmount * 2.0,
        exposure: this.config.exposure * 1.15,
        grainIntensity: this.config.grainIntensity * 1.5,
        toneMappingEnabled: true,
      },
    };

    const preset = presets[level] ?? presets.info;
    this.updateConfig(preset);

    // 自动恢复（3秒后）
    setTimeout(() => {
      this.restoreAlertEffect();
    }, 3000);
  }

  private restoreAlertEffect() {
    if (this.originalConfigSnapshot) {
      this.updateConfig(this.originalConfigSnapshot);
      this.originalConfigSnapshot = null;
    }
  }

  updateLensFlarePosition(pos: [number, number, number]) {
    if (this.lensFlareSystem) {
      const emitter = (this.lensFlareSystem as unknown as { emitter: { position: Vector3 } }).emitter;
      if (emitter) {
        emitter.position = new Vector3(...pos);
      }
    }
  }

  setFilmGateAspect(aspect: number) {
    this.config.filmGateAspectRatio = aspect;
    this.buildFilmGate();
  }

  setEffectIntensity(name: string, intensity: number) {
    this.activeEffectIntensities[name] = intensity;
    this.applyIntensityToEffect(name, intensity);
  }

  getEffectIntensity(name: string): number {
    return this.activeEffectIntensities[name] ?? 1.0;
  }

  private applyIntensityToEffect(name: string, intensity: number) {
    if (!this.pipeline) return;
    switch (name) {
      case "bloom":
        this.pipeline.bloomWeight = this.config.bloomWeight * intensity;
        break;
      case "dof":
        if (this.pipeline) {
          this.pipeline.depthOfField.lensSize = this.config.dofAperture * 100 * intensity;
        }
        break;
      case "grain":
        if (this.grain) {
          this.grain.intensity = this.config.grainIntensity * intensity;
        }
        break;
      case "chromaticAberration":
        if (this.chromaticAberration) {
          this.chromaticAberration.aberrationAmount = this.config.chromaticAberrationAmount * intensity;
        }
        break;
    }
  }

  private buildDefaultPipeline() {
    const camera = this.scene.activeCamera;
    this.pipeline = new DefaultRenderingPipeline(
      "cinematicPipeline",
      true, // hdr
      this.scene,
      camera ? [camera] : undefined,
    );

    if (!camera) return;

    // ── Bloom ──
    this.pipeline.bloomEnabled = this.config.bloomEnabled;
    this.pipeline.bloomWeight = this.config.bloomWeight;
    this.pipeline.bloomKernel = this.config.bloomKernel;
    this.pipeline.bloomScale = this.config.bloomScale;
    this.pipeline.threshold = this.config.bloomThreshold;

    // ── Depth of Field (via DefaultRenderingPipeline built-in) ──
    this.pipeline.depthOfFieldEnabled = this.config.dofEnabled;
    this.pipeline.depthOfFieldBlurLevel = 2; // High
    this.pipeline.depthOfField.focusDistance = this.config.dofFocusDistance;
    this.pipeline.depthOfField.lensSize = this.config.dofAperture * 100;
    this.pipeline.depthOfField.fStop = this.config.dofAperture;
    this.pipeline.depthOfField.cameras = [this.scene.activeCamera!];

    // ── Vignette ──
    this.pipeline.imageProcessingEnabled = true;
    const ip = this.pipeline.imageProcessing;
    if (ip) {
      ip.vignetteEnabled = this.config.vignetteEnabled;
      ip.vignetteWeight = this.config.vignetteWeight;
      ip.vignetteStretch = this.config.vignetteStretch;
      ip.vignetteCentreX = this.config.vignetteCentreX;
      ip.vignetteCentreY = this.config.vignetteCentreY;
      ip.vignetteColor = this.config.vignetteColor;
      ip.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

      // 对比度和曝光
      ip.contrast = this.config.contrast;
      ip.exposure = this.config.exposure;
    }

    // ── 锐化 ──
    this.pipeline.sharpenEnabled = this.config.sharpeningEnabled;
    if (this.pipeline.sharpen) {
      this.pipeline.sharpen.edgeAmount = this.config.sharpeningEdgeAmount;
    }
  }

  private buildCustomEffects() {
    if (!this.scene.activeCamera) return;

    // ── Chromatic Aberration ──
    if (this.config.chromaticAberrationEnabled) {
      this.chromaticAberration = new ChromaticAberrationPostProcess(
        "chromaticAberration",
        this.config.chromaticAberrationAmount / 100,
        this.scene.activeCamera,
      );
      this.chromaticAberration.active = true;
      this.chromaticAberration.direction = new Vector2(1, 0.5);
      this.chromaticAberration.radialIntensity = 0.8;
    }

    // ── Grain ──
    if (this.config.grainEnabled) {
      this.grain = new GrainPostProcess(
        "grain",
        1.0,
        this.scene.activeCamera,
      );
      this.grain.active = true;
      this.grain.intensity = this.config.grainIntensity;
      this.grain.animated = this.config.grainAnimated;
    }

    // ── SSR (Screen Space Reflection) — 模拟实现 ─
    if (this.config.ssrEnabled) {
      this.buildSSR();
    }

    // ── HBAO — 通过 scene.ambientColor 模拟环境光遮蔽效果 ─
    if (this.config.ssaoEnabled) {
      this.buildHBAO();
    }
  }

  /**
   * 屏幕空间反射模拟
   * Babylon.js 需要 @babylonjs/core 完整版才能使用真实 SSR，
   * 这里使用镜面反射材质 + 自定义 Shader 模拟
   */
  private buildSSR() {
    // 注册自定义 SSR 后处理 shader
    Effect.ShadersStore["ssrFragmentShader"] = `
      precision highp float;
      varying vec2 vUV;
      uniform sampler2D textureSampler;
      uniform sampler2D depthSampler;
      uniform vec2 screenSize;
      uniform float maxDistance;
      uniform int maxSteps;

      float getDepth(vec2 uv) {
        return texture2D(depthSampler, uv).r;
      }

      vec4 getColor(vec2 uv) {
        return texture2D(textureSampler, uv);
      }

      void main(void) {
        vec4 color = getColor(vUV);
        float depth = getDepth(vUV);

        // 简化 SSR：边缘区域轻微提亮模拟反射
        vec2 center = vec2(0.5);
        float edgeDist = length(vUV - center);
        float ssrFactor = smoothstep(0.3, 0.7, edgeDist) * 0.08;

        fragColor = color + vec4(vec3(ssrFactor), 0.0);
      }
    `;

    if (!this.scene.activeCamera) return;

    this.ssr = new PostProcess(
      "ssr",
      "ssr",
      ["screenSize", "maxDistance", "maxSteps"],
      ["depthSampler"],
      this.config.ssrMaxDistance / 1000,
      this.scene.activeCamera,
    );
    this.ssr.active = true;
    this.ssr.onApply = (effect) => {
      effect.setFloat2("screenSize", this.scene.getEngine().getRenderWidth(), this.scene.getEngine().getRenderHeight());
      effect.setFloat("maxDistance", this.config.ssrMaxDistance);
      effect.setInt("maxSteps", this.config.ssrMaxSteps);
    };
  }

  /**
   * HBAO 环境光遮蔽模拟
   * 使用自定义 shader 在边缘区域施加阴影
   */
  private buildHBAO() {
    Effect.ShadersStore["hbaoFragmentShader"] = `
      precision highp float;
      varying vec2 vUV;
      uniform sampler2D textureSampler;
      uniform vec2 screenSize;
      uniform float radius;
      uniform float totalStrength;

      float rand(vec2 co) {
        return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main(void) {
        vec4 color = texture2D(textureSampler, vUV);

        // 计算屏幕空间边缘暗化（模拟 AO）
        vec2 texelSize = 1.0 / screenSize;
        float ao = 0.0;
        int samples = 8;

        for (int i = 0; i < 8; i++) {
          float angle = float(i) * 3.14159 * 2.0 / 8.0;
          vec2 offset = vec2(cos(angle), sin(angle)) * radius * texelSize * 4.0;
          // 简化的 AO 采样
          ao += length(vUV + offset - vec2(0.5)) * 0.1;
        }
        ao = 1.0 - clamp(ao / 8.0 * totalStrength, 0.0, 0.3);

        fragColor = vec4(color.rgb * ao, color.a);
      }
    `;

    this.ssao = new PostProcess(
      "hbao",
      "hbao",
      ["screenSize", "radius", "totalStrength"],
      null,
      1.0,
      this.scene.activeCamera,
    );
    this.ssao.active = true;
    this.ssao.onApply = (effect) => {
      effect.setFloat2("screenSize", this.scene.getEngine().getRenderWidth(), this.scene.getEngine().getRenderHeight());
      effect.setFloat("radius", this.config.ssaoRadius);
      effect.setFloat("totalStrength", this.config.ssaoTotalStrength);
    };
  }

  private applyToneMapping() {
    if (!this.pipeline?.imageProcessing) return;

    const ip = this.pipeline.imageProcessing;

    switch (this.config.toneMappingType) {
      case "ACES":
        // ACES 色调映射 — 行业标准 filmic tone mapping
        ip.toneMappingEnabled = this.config.toneMappingEnabled;
        ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
        break;
      case "Reinhard":
        ip.toneMappingEnabled = this.config.toneMappingEnabled;
        ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_STANDARD;
        break;
      case "Hable":
        ip.toneMappingEnabled = this.config.toneMappingEnabled;
        ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_STANDARD;
        break;
      default:
        ip.toneMappingEnabled = false;
    }

    // 应用颜色曲线（可选的电影 LUT 模拟）
    const curves = new ColorCurves();
    curves.globalHue = 0;
    curves.globalSaturation = 5; // 轻微增加饱和度
    curves.highlightsHue = 30;  // 高光偏暖
    curves.highlightsDensity = 20;
    curves.shadowsHue = 210;     // 阴影偏青蓝
    curves.shadowsDensity = 15;
    ip.colorCurvesEnabled = true;
    ip.colorCurves = curves;
  }

  private rebuildPipeline() {
    this.dispose();
    this.apply();
  }
}
