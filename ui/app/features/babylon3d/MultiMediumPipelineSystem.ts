/**
 * ============================================================
 * MultiMediumPipelineSystem — 多介质管网粒子流动系统
 * ============================================================
 * 覆盖：电力/供暖/供水/燃气/光伏/储能 六类介质的差异化渲染
 *
 * 每种介质的视觉差异化设计：
 *   electricity  — 电弧流光：电离蓝白闪烁，Y字形分支
 *   water        — 水流粒子：球形液滴下落+溅射，水蓝色
 *   heating      — 热蒸汽流：扩散烟雾状橙红，上升弧线
 *   gas          — 气体扩散：紫罗兰色粒子，带旋转尾迹
 *   photovoltaic — 绿光能量流：光子流聚集效果，光斑闪烁
 *   storage      — 储能脉冲：脉冲波纹式粉色渐变，充放电指示
 *
 * 告警联动：告警触发时对应管线进入脉冲告警模式
 */

import {
  Scene,
  Vector3,
  Color3,
  Color4,
  MeshBuilder,
  Mesh,
  StandardMaterial,
  PBRMaterial,
  ParticleSystem,
  DynamicTexture,
  LinesMesh,
  TransformNode,
  AbstractMesh,
  Animation,
  EasingFunction,
  QuadraticEase,
  ParticleSystemDistribution,
} from "@babylonjs/core";
import {
  EnergyMedium,
  MEDIUM_VISUAL_CONFIGS,
  MediumVisualConfig,
  PipelineSegment,
  PipelineNode,
  AlertData,
} from "./types";

/** 单条管网（连接两个节点） */
export interface PipeNetwork {
  /** 唯一ID */
  id: string;
  /** 介质类型 */
  medium: EnergyMedium;
  /** 路径点（世界坐标） */
  pathPoints: Vector3[];
  /** 曲线段（用于粒子沿路径移动） */
  curve: { getPoint: (t: number) => Vector3 };
  /** 基础管线网格 */
  lineMesh: LinesMesh;
  /** 流动粒子系统 */
  flowParticles: ParticleSystem[];
  /** 当前流量（0-1） */
  flowRate: number;
  /** 是否告警 */
  isAlert: boolean;
  /** 告警动画 */
  alertAnim: Animation | null;
  /** 管径 */
  diameter: number;
}

/** 介质粒子视觉特征 */
interface MediumParticleTraits {
  /** 粒子形状描述 */
  shape: "spark" | "droplet" | "mist" | "trail" | "photon" | "pulse";
  /** 生命时长下限（秒） */
  lifeMin: number;
  /** 生命时长上限 */
  lifeMax: number;
  /** 尺寸下限 */
  sizeMin: number;
  /** 尺寸上限 */
  sizeMax: number;
  /** 混合模式 */
  blendMode: number;
  /** 粒子发射率 */
  emitRate: number;
  /** 重力方向 */
  gravity: Vector3;
  /** 发射功率范围 */
  emitPowerMin: number;
  emitPowerMax: number;
  /** 是否使用自定义更新函数 */
  useCustomUpdate: boolean;
  /** 告警闪烁色 */
  alertColor: Color4;
}

const MEDIUM_TRAITS: Record<EnergyMedium, MediumParticleTraits> = {
  electricity: {
    shape: "spark",
    lifeMin: 0.3,
    lifeMax: 0.8,
    sizeMin: 0.04,
    sizeMax: 0.09,
    blendMode: ParticleSystem.BLENDMODE_ADD,
    emitRate: 60,
    gravity: Vector3.Zero(),
    emitPowerMin: 0.8,
    emitPowerMax: 1.5,
    useCustomUpdate: true,
    alertColor: new Color4(1, 0.2, 0, 1),
  },
  water: {
    shape: "droplet",
    lifeMin: 1.0,
    lifeMax: 2.5,
    sizeMin: 0.06,
    sizeMax: 0.14,
    blendMode: ParticleSystem.BLENDMODE_STANDARD,
    emitRate: 35,
    gravity: new Vector3(0, -0.8, 0),
    emitPowerMin: 0.2,
    emitPowerMax: 0.6,
    useCustomUpdate: true,
    alertColor: new Color4(1, 0, 0, 1),
  },
  heating: {
    shape: "mist",
    lifeMin: 1.5,
    lifeMax: 3.5,
    sizeMin: 0.12,
    sizeMax: 0.25,
    blendMode: ParticleSystem.BLENDMODE_ADD,
    emitRate: 20,
    gravity: new Vector3(0, 0.4, 0),
    emitPowerMin: 0.15,
    emitPowerMax: 0.5,
    useCustomUpdate: true,
    alertColor: new Color4(1, 0.3, 0, 1),
  },
  gas: {
    shape: "trail",
    lifeMin: 1.2,
    lifeMax: 3.0,
    sizeMin: 0.05,
    sizeMax: 0.11,
    blendMode: ParticleSystem.BLENDMODE_ADD,
    emitRate: 40,
    gravity: new Vector3(0, 0.1, 0),
    emitPowerMin: 0.3,
    emitPowerMax: 0.7,
    useCustomUpdate: true,
    alertColor: new Color4(0.8, 0, 1, 1),
  },
  photovoltaic: {
    shape: "photon",
    lifeMin: 0.5,
    lifeMax: 1.2,
    sizeMin: 0.03,
    sizeMax: 0.08,
    blendMode: ParticleSystem.BLENDMODE_ADD,
    emitRate: 80,
    gravity: Vector3.Zero(),
    emitPowerMin: 1.0,
    emitPowerMax: 2.0,
    useCustomUpdate: true,
    alertColor: new Color4(1, 1, 0, 1),
  },
  storage: {
    shape: "pulse",
    lifeMin: 0.8,
    lifeMax: 1.8,
    sizeMin: 0.08,
    sizeMax: 0.16,
    blendMode: ParticleSystem.BLENDMODE_ADD,
    emitRate: 25,
    gravity: Vector3.Zero(),
    emitPowerMin: 0.5,
    emitPowerMax: 1.0,
    useCustomUpdate: true,
    alertColor: new Color4(1, 0.5, 0.8, 1),
  },
};

/** 纹理缓存（每种介质形状一张纹理） */
const textureCache = new Map<EnergyMedium, DynamicTexture>();

export class MultiMediumPipelineSystem {
  private scene: Scene;
  private pipes = new Map<string, PipeNetwork>();
  private alertPulseAnimations = new Map<string, Animation>();
  private disposed = false;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /** 根据拓扑数据自动生成所有管线 */
  buildFromTopology(
    nodes: PipelineNode[],
    segments: PipelineSegment[],
  ) {
    this.clearAll();

    for (const segment of segments) {
      const sourceNode = nodes.find((n) => n.id === segment.sourceNodeId);
      const targetNode = nodes.find((n) => n.id === segment.targetNodeId);
      if (!sourceNode || !targetNode) continue;

      const pathPoints = this.computePathPoints(sourceNode, targetNode, segment);
      const curve = this.createBezierCurve(pathPoints);

      this.buildPipeNetwork(segment.id, segment.medium, curve, segment);
    }
  }

  /** 根据建筑数据自动生成管线（能源中心 → 各建筑） */
  buildFromBuildings(
    buildings: Array<{
      id: string;
      position: [number, number, number];
      buildingType: string;
      energyHeight?: number;
    }>,
    energyCenterPos: [number, number, number] = [0, 0, 0],
    energyCenterOutputHeight = 2.8,
  ) {
    this.clearAll();

    // 为每种介质类型创建一个从能源中心出发的分支
    const mediums: EnergyMedium[] = [
      "electricity",
      "water",
      "heating",
      "gas",
      "photovoltaic",
      "storage",
    ];

    // 分配建筑到不同介质
    const mediumBuildings: Record<EnergyMedium, typeof buildings> = {
      electricity: [],
      water: [],
      heating: [],
      gas: [],
      photovoltaic: [],
      storage: [],
    };

    buildings.forEach((b, idx) => {
      if (b.id === "BLD_EC" || b.buildingType === "energy") return;
      mediumBuildings[mediums[idx % mediums.length]].push(b);
    });

    // 为每种介质建立主管道
    mediums.forEach((medium) => {
      const targetBuildings = mediumBuildings[medium];
      if (targetBuildings.length === 0) return;

      const config = MEDIUM_VISUAL_CONFIGS[medium];
      const traits = MEDIUM_TRAITS[medium];

      // 主管道：能源中心 → 分支节点 → 各建筑
      const branchNode = this.computeBranchNode(
        energyCenterPos,
        targetBuildings.map((b) => b.position),
        medium,
      );

      // 1. 主管道（能源中心 → 分支节点）
      const mainPath = [
        new Vector3(...energyCenterPos).addInPlaceFromFloats(0, energyCenterOutputHeight, 0),
        branchNode,
      ];
      const mainCurve = this.createLinearCurve(mainPath);
      this.buildPipeNetwork(
        `main-${medium}`,
        medium,
        mainCurve,
        {
          id: `main-${medium}`,
          medium,
          diameter: 120,
          length: 10,
          flowRate: 0.7,
          loadRate: 0.7,
          isAlert: false,
          sourceNodeId: "BLD_EC",
          targetNodeId: `branch-${medium}`,
          name: `${medium} 主管`,
        },
      );

      // 2. 分支管道（分支节点 → 各建筑）
      targetBuildings.forEach((building, bIdx) => {
        const buildingHeight = building.energyHeight ?? 3.5;
        const start = branchNode.clone().addInPlaceFromFloats(
          Math.sin((bIdx / targetBuildings.length) * Math.PI * 2) * 0.5,
          bIdx * 0.1,
          Math.cos((bIdx / targetBuildings.length) * Math.PI * 2) * 0.5,
        );
        const end = new Vector3(
          building.position[0],
          buildingHeight,
          building.position[2],
        );

        const subCurve = this.createBezierCurve([start, this.computeMidPoint(start, end, medium), end]);

        // 分配子管线ID
        const subId = `${building.id}-${medium}`;
        this.buildPipeNetwork(
          subId,
          medium,
          subCurve,
          {
            id: subId,
            medium,
            diameter: 80,
            length: Vector3.Distance(start, end),
            flowRate: 0.5 + Math.random() * 0.3,
            loadRate: 0.5 + Math.random() * 0.3,
            isAlert: false,
            sourceNodeId: `branch-${medium}`,
            targetNodeId: building.id,
            name: `${building.id} ${medium}`,
          },
        );
      });
    });
  }

  /** 更新管线流量（数据驱动） */
  updateFlowRate(segmentId: string, flowRate: number) {
    const pipe = this.pipes.get(segmentId);
    if (!pipe) return;
    pipe.flowRate = flowRate;

    // 根据流量动态调整粒子率
    const traits = MEDIUM_TRAITS[pipe.medium];
    const effectiveRate = traits.emitRate * flowRate;
    pipe.flowParticles.forEach((ps) => {
      ps.emitRate = effectiveRate;
    });
  }

  /** 触发告警脉冲动画 */
  triggerAlert(alert: AlertData) {
    const segmentId = alert.segmentId;
    const buildingId = alert.buildingId;

    // 找到匹配的管线
    const matches: PipeNetwork[] = [];
    this.pipes.forEach((pipe) => {
      if (pipe.id.includes(segmentId ?? "") || pipe.id.includes(buildingId ?? "")) {
        matches.push(pipe);
      }
    });

    matches.forEach((pipe) => {
      this.startAlertPulse(pipe);
    });
  }

  /** 清除告警动画 */
  clearAlert(segmentId: string) {
    const pipe = this.pipes.get(segmentId);
    if (!pipe) return;

    const anim = this.alertPulseAnimations.get(pipe.id);
    if (anim) {
      anim.stop();
      this.alertPulseAnimations.delete(pipe.id);
    }
    pipe.isAlert = false;

    // 恢复粒子颜色
    const config = MEDIUM_VISUAL_CONFIGS[pipe.medium];
    pipe.flowParticles.forEach((ps) => {
      ps.color1 = this.hexToColor4(config.particleColor);
      ps.color2 = this.hexToColor4(config.particleColor);
      ps.colorDead = new Color4(this.hexToColor3(config.particleColor).r, this.hexToColor3(config.particleColor).g, this.hexToColor3(config.particleColor).b, 0);
    });
  }

  /** 清除所有管线 */
  clearAll() {
    this.pipes.forEach((pipe) => {
      pipe.lineMesh.dispose();
      pipe.flowParticles.forEach((ps) => ps.dispose());
      const anim = this.alertPulseAnimations.get(pipe.id);
      if (anim) anim.stop();
    });
    this.pipes.clear();
    this.alertPulseAnimations.clear();
  }

  /** 销毁系统 */
  dispose() {
    this.disposed = true;
    this.clearAll();
  }

  // ═══════════════════════════════════════════════════════════
  //  管线构建
  // ═══════════════════════════════════════════════════════════

  private buildPipeNetwork(
    id: string,
    medium: EnergyMedium,
    curve: { getPoint: (t: number) => Vector3 },
    segment: PipelineSegment,
  ) {
    const config = MEDIUM_VISUAL_CONFIGS[medium];
    const traits = MEDIUM_TRAITS[medium];

    // 1. 生成路径点用于管线可视化
    const pathPoints: Vector3[] = [];
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      pathPoints.push(curve.getPoint(i / steps));
    }

    // 2. 管线基础线（半透明发光）
    const lineMesh = MeshBuilder.CreateLines(`pipe-${id}`, {
      points: pathPoints,
      updatable: false,
    }, this.scene);
    lineMesh.color = this.hexToColor3(config.lineColor);
    lineMesh.alpha = 0.35;

    // 3. 管壁网格（可选，用于交互拾取）
    const tubeMesh = MeshBuilder.CreateTube(`tube-${id}`, {
      path: pathPoints,
      radius: 0.015,
      tessellation: 8,
      sideOrientation: Mesh.DOUBLESIDE,
      updatable: false,
    }, this.scene);
    const tubeMat = new StandardMaterial(`tubeMat-${id}`, this.scene);
    tubeMat.diffuseColor = this.hexToColor3(config.lineColor);
    tubeMat.emissiveColor = this.hexToColor3(config.lineColor).scale(0.15);
    tubeMat.alpha = 0.2;
    tubeMesh.material = tubeMat;

    // 4. 流动粒子（沿贝塞尔曲线循环移动）
    const flowParticles = this.createMediumFlowParticles(
      `${id}-flow`,
      medium,
      curve,
      config,
      traits,
      segment.flowRate,
    );

    const pipe: PipeNetwork = {
      id,
      medium,
      pathPoints,
      curve,
      lineMesh,
      flowParticles,
      flowRate: segment.flowRate,
      isAlert: false,
      alertAnim: null,
      diameter: segment.diameter,
    };

    this.pipes.set(id, pipe);
  }

  private createMediumFlowParticles(
    name: string,
    medium: EnergyMedium,
    curve: { getPoint: (t: number) => Vector3 },
    config: MediumVisualConfig,
    traits: MediumParticleTraits,
    flowRate: number,
  ): ParticleSystem[] {
    const particles: ParticleSystem[] = [];
    const streams = medium === "electricity" ? 4 : 3; // 电力多一股
    const baseColor = this.hexToColor4(config.particleColor);

    for (let i = 0; i < streams; i++) {
      const delay = i / streams;
      const ps = new ParticleSystem(`${name}-${i}`, 80, this.scene);
      ps.particleTexture = this.getOrCreateMediumTexture(medium);

      // 发射器
      ps.createSphereEmitter(0.03);

      // 颜色（基于介质类型差异化）
      const c1 = this.getMediumColor1(medium, baseColor);
      const c2 = this.getMediumColor2(medium, baseColor);
      ps.color1 = c1;
      ps.color2 = c2;
      ps.colorDead = new Color4(c1.r, c1.g, c1.b, 0);

      // 尺寸和生命周期
      ps.minSize = traits.sizeMin;
      ps.maxSize = traits.sizeMax;
      ps.minLifeTime = traits.lifeMin;
      ps.maxLifeTime = traits.lifeMax;

      // 发射率
      ps.emitRate = Math.round(traits.emitRate * flowRate * config.particleDensity);

      // 混合模式
      ps.blendMode = traits.blendMode;

      // 发射功率和重力
      ps.minEmitPower = traits.emitPowerMin;
      ps.maxEmitPower = traits.emitPowerMax;
      ps.gravity = traits.gravity;

      // 自定义更新函数（沿曲线循环）
      if (traits.useCustomUpdate) {
        ps.updateFunction = this.buildMediumUpdateFunction(
          medium,
          curve,
          traits,
          delay,
        );
      }

      ps.start();
      particles.push(ps);
    }

    return particles;
  }

  /** 根据介质类型构建自定义粒子更新函数 */
  private buildMediumUpdateFunction(
    medium: EnergyMedium,
    curve: { getPoint: (t: number) => Vector3 },
    traits: MediumParticleTraits,
    delay: number,
  ): (particles: ParticleSystem[]) => void {
    // 根据形状选择不同的运动模式
    switch (traits.shape) {
      case "spark":
        // 电弧流光：快速闪烁跳跃
        return (psArr) => {
          const t = ((Date.now() / 1000 * 0.6 + delay) % 1);
          const jitter = (Math.random() - 0.5) * 0.08;
          psArr.emitter = curve.getPoint(t).addInPlaceFromFloats(jitter, jitter, jitter);
          void psArr;
        };

      case "droplet":
        // 水滴：沿管道缓慢流动，垂直方向有下落
        return (psArr) => {
          const t = ((Date.now() / 1000 * 0.25 + delay) % 1);
          const pos = curve.getPoint(t);
          // 加一点溅射偏移
          pos.addInPlaceFromFloats(
            (Math.random() - 0.5) * 0.03,
            -0.01,
            (Math.random() - 0.5) * 0.03,
          );
          psArr.emitter = pos;
          void psArr;
        };

      case "mist":
        // 热蒸汽：扩散上升，带湍流
        return (psArr) => {
          const t = ((Date.now() / 1000 * 0.18 + delay) % 1);
          const pos = curve.getPoint(t);
          const turbulence = Math.sin(Date.now() / 100) * 0.05;
          pos.addInPlaceFromFloats(turbulence, 0.04, turbulence);
          psArr.emitter = pos;
          void psArr;
        };

      case "trail":
        // 气体：带旋转尾迹的扩散流
        return (psArr) => {
          const t = ((Date.now() / 1000 * 0.3 + delay) % 1);
          const pos = curve.getPoint(t);
          const angle = Date.now() / 300 + delay * Math.PI * 2;
          pos.addInPlaceFromFloats(
            Math.cos(angle) * 0.04,
            0.02,
            Math.sin(angle) * 0.04,
          );
          psArr.emitter = pos;
          void psArr;
        };

      case "photon":
        // 光子流：高速闪烁聚集
        return (psArr) => {
          const rawT = (Date.now() / 1000 * 0.8 + delay) % 1;
          // 光子聚集效果：在路径上聚集几个光子簇
          const clusterSize = 3;
          for (let c = 0; c < clusterSize; c++) {
            const t = (rawT + c * 0.08) % 1;
            const pos = curve.getPoint(t);
            const flicker = Math.random() * 0.06;
            pos.addInPlaceFromFloats(flicker - 0.03, flicker - 0.03, flicker - 0.03);
            if (c === 0) psArr.emitter = pos;
          }
          void psArr;
        };

      case "pulse":
        // 脉冲波纹：沿管道传播的能量波
        return (psArr) => {
          const rawT = (Date.now() / 1000 * 0.5 + delay) % 1;
          const pos = curve.getPoint(rawT);
          // 脉冲宽度
          const pulseWidth = 0.12;
          psArr.emitRate = Math.abs(rawT - 0.5) < pulseWidth ? traits.emitRate * 3 : 0;
          psArr.emitter = pos;
          void psArr;
        };

      default:
        return (psArr) => {
          const t = ((Date.now() / 1000 * 0.3 + delay) % 1);
          psArr.emitter = curve.getPoint(t);
          void psArr;
        };
    }
  }

  /** 告警脉冲动画 */
  private startAlertPulse(pipe: PipeNetwork) {
    if (pipe.isAlert) return;
    pipe.isAlert = true;

    const traits = MEDIUM_TRAITS[pipe.medium];
    const alertColor = traits.alertColor;
    const originalColor = this.hexToColor3(MEDIUM_VISUAL_CONFIGS[pipe.medium].particleColor);

    // 粒子颜色闪烁
    pipe.flowParticles.forEach((ps, i) => {
      const anim = new Animation(
        `alertPulse-${pipe.id}-${i}`,
        "color1",
        60,
        Animation.ANIMATIONTYPE_COLOR4,
        Animation.ANIMATIONLOOPMODE_CYCLE,
      );

      anim.setKeys([
        { frame: 0, value: new Color4(originalColor.r, originalColor.g, originalColor.b, 1) },
        { frame: 10, value: alertColor },
        { frame: 20, value: new Color4(originalColor.r, originalColor.g, originalColor.b, 1) },
        { frame: 30, value: alertColor },
      ]);

      ps.animations = [anim];
      this.scene.beginAnimation(ps, 0, 30, true, 1.5);
    });

    // 管线发光闪烁
    const lineAnim = new Animation(
      `alertLine-${pipe.id}`,
      "color",
      60,
      Animation.ANIMATIONTYPE_COLOR3,
      Animation.ANIMATIONLOOPMODE_CYCLE,
    );
    lineAnim.setKeys([
      { frame: 0, value: this.hexToColor3(MEDIUM_VISUAL_CONFIGS[pipe.medium].lineColor) },
      { frame: 8, value: new Color3(alertColor.r, alertColor.g, alertColor.b) },
      { frame: 16, value: this.hexToColor3(MEDIUM_VISUAL_CONFIGS[pipe.medium].lineColor) },
      { frame: 24, value: new Color3(alertColor.r, alertColor.g, alertColor.b) },
    ]);
    pipe.lineMesh.animations = [lineAnim];
    this.scene.beginAnimation(pipe.lineMesh, 0, 24, true, 2);

    this.alertPulseAnimations.set(pipe.id, lineAnim);
  }

  // ═══════════════════════════════════════════════════════════
  //  路径计算
  // ═══════════════════════════════════════════════════════════

  private computePathPoints(
    source: PipelineNode,
    target: PipelineNode,
    segment: PipelineSegment,
  ): Vector3[] {
    const start = new Vector3(...source.position);
    const end = new Vector3(...target.position);
    const mid = this.computeMidPoint(start, end, segment.medium);

    return [start, mid, end];
  }

  private computeMidPoint(
    start: Vector3,
    end: Vector3,
    medium: EnergyMedium,
  ): Vector3 {
    const mid = Vector3.Lerp(start, end, 0.5);

    // 不同介质有不同的中间点偏移
    const traits = MEDIUM_TRAITS[medium];
    switch (traits.shape) {
      case "spark":
        // 电弧：S形走线
        mid.addInPlaceFromFloats(
          (Math.random() - 0.5) * 0.3,
          Math.random() * 0.4,
          (Math.random() - 0.5) * 0.3,
        );
        break;
      case "mist":
        // 热蒸汽：上扬弧线
        mid.addInPlaceFromFloats(0, 0.8, 0);
        break;
      case "photon":
        // 光子：水平偏转
        mid.addInPlaceFromFloats(0.2, 0.1, 0);
        break;
      default:
        // 默认：轻微上抬
        mid.addInPlaceFromFloats(0, 0.3, 0);
    }

    return mid;
  }

  private computeBranchNode(
    center: [number, number, number],
    targets: [number, number, number][],
    medium: EnergyMedium,
  ): Vector3 {
    // 计算所有目标建筑的平均方向，然后偏移
    const centerV = new Vector3(...center);
    const avgTarget = targets.reduce(
      (acc, pos) => acc.add(new Vector3(...pos)),
      Vector3.Zero(),
    ).scale(1 / targets.length);

    const direction = avgTarget.subtract(centerV).normalize();
    const branchDist = 3 + targets.length * 0.3;

    return centerV.add(direction.scale(branchDist)).addInPlaceFromFloats(0, 1.5, 0);
  }

  // ═══════════════════════════════════════════════════════════
  //  曲线工具
  // ═══════════════════════════════════════════════════════════

  private createBezierCurve(points: Vector3[]): { getPoint: (t: number) => Vector3 } {
    if (points.length === 2) {
      return this.createLinearCurve(points);
    }
    const pts = [...points];
    return {
      getPoint: (t: number) => {
        if (pts.length === 3) {
          return this.quadraticBezier(pts[0], pts[1], pts[2], t);
        }
        // 多段贝塞尔
        const segCount = pts.length - 1;
        const scaled = t * segCount;
        const idx = Math.min(Math.floor(scaled), segCount - 1);
        const local = scaled - idx;
        return this.quadraticBezier(pts[idx], pts[idx + 1], pts[Math.min(idx + 2, pts.length - 1)], local);
      },
    };
  }

  private createLinearCurve(points: Vector3[]): { getPoint: (t: number) => Vector3 } {
    return {
      getPoint: (t: number) => Vector3.Lerp(points[0], points[1], t),
    };
  }

  private quadraticBezier(p0: Vector3, p1: Vector3, p2: Vector3, t: number): Vector3 {
    const mt = 1 - t;
    return new Vector3(
      mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
      mt * mt * p0.z + 2 * mt * t * p1.z + t * t * p2.z,
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  纹理管理
  // ═══════════════════════════════════════════════════════════

  private getOrCreateMediumTexture(medium: EnergyMedium): DynamicTexture {
    if (textureCache.has(medium)) {
      return textureCache.get(medium)!;
    }

    const size = 64;
    const tex = new DynamicTexture(`mediumTex-${medium}`, size, this.scene, false);
    const ctx = tex.getContext();

    switch (MEDIUM_TRAITS[medium].shape) {
      case "spark":
        this.drawSparkTexture(ctx, size, medium);
        break;
      case "droplet":
        this.drawDropletTexture(ctx, size, medium);
        break;
      case "mist":
        this.drawMistTexture(ctx, size, medium);
        break;
      case "trail":
        this.drawTrailTexture(ctx, size, medium);
        break;
      case "photon":
        this.drawPhotonTexture(ctx, size, medium);
        break;
      case "pulse":
        this.drawPulseTexture(ctx, size, medium);
        break;
    }

    tex.update();
    textureCache.set(medium, tex);
    return tex;
  }

  private drawSparkTexture(ctx: CanvasRenderingContext2D, size: number, medium: EnergyMedium) {
    ctx.clearRect(0, 0, size, size);
    // 电弧：十字星形
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.2, "rgba(255,255,200,0.9)");
    g.addColorStop(0.5, "rgba(200,220,255,0.5)");
    g.addColorStop(1, "rgba(100,150,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  private drawDropletTexture(ctx: CanvasRenderingContext2D, size: number, medium: EnergyMedium) {
    ctx.clearRect(0, 0, size, size);
    // 水滴：椭圆，带高光
    const cx = size / 2, cy = size / 2;
    const g = ctx.createRadialGradient(cx, cy - 4, 0, cx, cy, size / 2);
    g.addColorStop(0, "rgba(200,230,255,0.95)");
    g.addColorStop(0.6, "rgba(100,180,255,0.7)");
    g.addColorStop(1, "rgba(50,100,200,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, size * 0.35, size * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    // 高光
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.ellipse(cx - 5, cy - 5, 4, 3, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawMistTexture(ctx: CanvasRenderingContext2D, size: number, medium: EnergyMedium) {
    ctx.clearRect(0, 0, size, size);
    // 热蒸汽：柔和扩散圆
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,200,100,0.8)");
    g.addColorStop(0.4, "rgba(255,120,50,0.4)");
    g.addColorStop(0.8, "rgba(200,80,20,0.15)");
    g.addColorStop(1, "rgba(100,40,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  private drawTrailTexture(ctx: CanvasRenderingContext2D, size: number, medium: EnergyMedium) {
    ctx.clearRect(0, 0, size, size);
    // 气体：半透明旋转椭圆
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(200,150,255,0.9)");
    g.addColorStop(0.5, "rgba(150,100,220,0.5)");
    g.addColorStop(1, "rgba(80,40,150,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(size / 2, size / 2, size * 0.45, size * 0.3, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPhotonTexture(ctx: CanvasRenderingContext2D, size: number, medium: EnergyMedium) {
    ctx.clearRect(0, 0, size, size);
    // 光子：十字星，带辉光
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.1, "rgba(200,255,150,0.9)");
    g.addColorStop(0.4, "rgba(100,255,50,0.5)");
    g.addColorStop(1, "rgba(20,200,20,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // 十字光芒
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillRect(size / 2 - 1, 0, 2, size);
    ctx.fillRect(0, size / 2 - 1, size, 2);
  }

  private drawPulseTexture(ctx: CanvasRenderingContext2D, size: number, medium: EnergyMedium) {
    ctx.clearRect(0, 0, size, size);
    // 脉冲：同心圆环
    for (let r = 1; r <= 3; r++) {
      const g = ctx.createRadialGradient(size / 2, size / 2, (r - 1) * 8, size / 2, size / 2, r * 10);
      g.addColorStop(0, `rgba(255,180,220,${0.8 - r * 0.2})`);
      g.addColorStop(1, "rgba(255,100,180,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, r * 10, 0, Math.PI * 2);
      ctx.fill();
    }
    // 中心亮点
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // ═══════════════════════════════════════════════════════════
  //  颜色工具
  // ═══════════════════════════════════════════════════════════

  private getMediumColor1(medium: EnergyMedium, base: Color4): Color4 {
    switch (medium) {
      case "electricity":
        return new Color4(1, 1, 1, 1);
      case "water":
        return new Color4(0.4, 0.8, 1, 0.9);
      case "heating":
        return new Color4(1, 0.6, 0.2, 0.9);
      case "gas":
        return new Color4(0.8, 0.6, 1, 0.9);
      case "photovoltaic":
        return new Color4(0.6, 1, 0.3, 1);
      case "storage":
        return new Color4(1, 0.6, 0.85, 0.9);
      default:
        return base;
    }
  }

  private getMediumColor2(medium: EnergyMedium, base: Color4): Color4 {
    switch (medium) {
      case "electricity":
        return new Color4(0.5, 0.7, 1, 1);
      case "water":
        return new Color4(0.2, 0.5, 0.9, 0.8);
      case "heating":
        return new Color4(1, 0.3, 0, 0.8);
      case "gas":
        return new Color4(0.5, 0.3, 0.8, 0.8);
      case "photovoltaic":
        return new Color4(0.2, 0.8, 0.2, 0.9);
      case "storage":
        return new Color4(0.9, 0.3, 0.6, 0.8);
      default:
        return base;
    }
  }

  private hexToColor3(hex: string): Color3 {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return new Color3(r, g, b);
  }

  private hexToColor4(hex: string): Color4 {
    const c = this.hexToColor3(hex);
    return new Color4(c.r, c.g, c.b, 1);
  }
}
