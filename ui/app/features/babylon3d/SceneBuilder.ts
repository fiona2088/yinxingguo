/**
 * ============================================================
 * SceneBuilder — Babylon.js 场景构建器
 * ============================================================
 * 职责：
 *   - 管理场景中的所有3D对象（建筑、管网、地面、粒子等）
 *   - 提供建筑增删改查、选中、高亮、告警联动等交互接口
 *   - 管理相机视角切换、动画关键帧系统
 *   - 与数据适配层解耦，所有内容由数据驱动
 *
 * 核心API：
 *   const builder = new SceneBuilder(scene, camera, lights);
 *   builder.buildCampus(mockData);
 *   builder.selectBuilding(id);
 *   builder.flyTo(id, { duration: 1.5 });
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
  HemisphericLight,
  DirectionalLight,
  PointLight,
  ShadowGenerator,
  AbstractMesh,
  TransformNode,
  Animation,
  EasingFunction,
  QuadraticEase,
  ActionManager,
  ExecuteCodeAction,
  HighlightLayer,
  GlowLayer,
  ParticleSystem,
  DynamicTexture,
  LinesMesh,
} from "@babylonjs/core";
import {
  BuildingKind,
  StandardBuilding,
  EnergyMedium,
  MEDIUM_VISUAL_CONFIGS,
  CameraState,
  CameraKeyframe,
  AlertData,
  BuildingEnergyData,
} from "./types";

const DEFAULT_ENERGY_COLOR = new Color3(0.22, 0.74, 0.98);
const DEFAULT_CORE_COLOR = new Color3(0.98, 0.75, 0.14);
const BEVEL_RADIUS = 0.08;

// ─────────────────────────────────────────────────────────────
//  建筑高度映射
// ─────────────────────────────────────────────────────────────

const HEIGHT_CONFIG: Record<BuildingKind, { base: number; max: number }> = {
  energy: { base: 2.5, max: 2.5 },
  office: { base: 2.2, max: 6.0 },
  commercial: { base: 2.0, max: 3.5 },
  residential: { base: 2.0, max: 3.5 },
  school: { base: 2.0, max: 3.0 },
  hospital: { base: 2.2, max: 4.0 },
  factory: { base: 2.0, max: 3.0 },
};

// ─────────────────────────────────────────────────────────────
//  主构建器
// ─────────────────────────────────────────────────────────────

export class SceneBuilder {
  private scene: Scene;
  private shadowGenerator: ShadowGenerator | null = null;
  private highlightLayer: HighlightLayer | null = null;
  private glowLayer: GlowLayer | null = null;
  private buildings = new Map<string, TransformNode>();
  private buildingMeshes = new Map<string, Mesh[]>();
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private pipelineLines = new Map<string, { line: LinesMesh; particles: ParticleSystem[] }>();
  private labels = new Map<string, Mesh>();
  private energyParticleSystems = new Map<string, ParticleSystem>();
  private alertAnimations = new Map<string, Animation[]>();

  constructor(scene: Scene) {
    this.scene = scene;
    this.initLayers();
  }

  // ─────────────────────────────────────────────────────────
  //  公开API：初始化
  // ─────────────────────────────────────────────────────────

  initLayers() {
    // 轮廓高亮层
    this.highlightLayer = new HighlightLayer("hl", this.scene);
    this.highlightLayer.innerGlow = false;

    // 发光层
    this.glowLayer = new GlowLayer("glow", this.scene, {
      mainTextureSamples: 4,
      blurKernelSize: 64,
    });
    this.glowLayer.intensity = 0.6;
  }

  setupLighting() {
    // 环境光
    const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), this.scene);
    ambient.intensity = 0.35;
    ambient.diffuse = new Color3(0.58, 0.67, 0.76);
    ambient.groundColor = new Color3(0.05, 0.08, 0.15);

    // 主方向光（太阳）
    const sun = new DirectionalLight("sun", new Vector3(-0.5, -1.5, -0.8), this.scene);
    sun.intensity = 0.85;
    sun.diffuse = new Color3(0.88, 0.91, 0.97);

    // 阴影生成
    this.shadowGenerator = new ShadowGenerator(2048, sun);
    this.shadowGenerator.useBlurExponentialShadowMap = true;
    this.shadowGenerator.blurScale = 2;
    this.shadowGenerator.darkness = 0.3;

    // 补光（蓝色冷光）
    const fill = new DirectionalLight("fill", new Vector3(0.8, 0.4, 0.4), this.scene);
    fill.intensity = 0.25;
    fill.diffuse = new Color3(0.22, 0.74, 0.98);

    // 能源中心点光源
    const centerLight = new PointLight("centerLight", new Vector3(0, 3.5, 0), this.scene);
    centerLight.intensity = 1.2;
    centerLight.diffuse = DEFAULT_CORE_COLOR;
    centerLight.range = 22;
  }

  // ─────────────────────────────────────────────────────────
  //  公开API：构建园区
  // ─────────────────────────────────────────────────────────

  buildCampus(buildings: StandardBuilding[]) {
    this.clearCampus();
    this.buildGround();
    buildings.forEach((b) => this.addBuilding(b));
  }

  clearCampus() {
    this.buildings.forEach((node) => node.dispose(false, true));
    this.buildings.clear();
    this.buildingMeshes.clear();
    this.labels.forEach((m) => m.dispose());
    this.labels.clear();
    this.pipelineLines.forEach(({ line, particles }) => {
      line.dispose();
      particles.forEach((p) => p.dispose());
    });
    this.pipelineLines.clear();
    this.energyParticleSystems.forEach((p) => p.dispose());
    this.energyParticleSystems.clear();
    this.alertAnimations.forEach((anims) => anims.forEach((a) => a.dispose()));
    this.alertAnimations.clear();
  }

  // ─────────────────────────────────────────────────────────
  //  地面
  // ─────────────────────────────────────────────────────────

  buildGround() {
    // 主地面
    const ground = MeshBuilder.CreateGround("ground", { width: 28, height: 28, subdivisions: 1 }, this.scene);
    const groundMat = new StandardMaterial("groundMat", this.scene);
    groundMat.diffuseColor = new Color3(0.03, 0.05, 0.1);
    groundMat.specularColor = new Color3(0.1, 0.1, 0.1);
    ground.material = groundMat;
    ground.receiveShadows = true;

    // 道路系统
    this.buildRoads();

    // 环形能源总线
    this.buildEnergyRing();
  }

  private buildRoads() {
    const roadY = 0.015;
    const roadW = 0.55;
    const roadColor = new Color3(0.08, 0.11, 0.18);
    const roadMat = new StandardMaterial("roadMat", this.scene);
    roadMat.diffuseColor = roadColor;
    roadMat.specularColor = new Color3(0.05, 0.05, 0.05);

    const roadAxes = [-4.6, 0, 4.6];

    roadAxes.forEach((x) => {
      const road = MeshBuilder.CreateBox(`road-x-${x}`, { width: roadW, height: 0.025, depth: 28 }, this.scene);
      road.position = new Vector3(x, roadY, 0);
      road.material = roadMat;
      road.receiveShadows = true;
    });

    roadAxes.forEach((z) => {
      const road = MeshBuilder.CreateBox(`road-z-${z}`, { width: 28, height: 0.025, depth: roadW }, this.scene);
      road.position = new Vector3(0, roadY, z);
      road.material = roadMat;
      road.receiveShadows = true;
    });

    // 中心环形区域
    const centerRing = MeshBuilder.CreateDisc("centerRing", { radius: 2.2, tessellation: 48 }, this.scene);
    centerRing.rotation.x = Math.PI / 2;
    centerRing.position.y = 0.02;
    const ringMat = new StandardMaterial("ringMat", this.scene);
    ringMat.diffuseColor = new Color3(0.04, 0.12, 0.22);
    ringMat.specularColor = new Color3(0.1, 0.2, 0.3);
    ringMat.emissiveColor = new Color3(0.01, 0.05, 0.1);
    centerRing.material = ringMat;
    centerRing.receiveShadows = true;

    // 外发光圈
    const glowRing = MeshBuilder.CreateTorus("glowRing", { diameter: 4.5, thickness: 0.08, tessellation: 48 }, this.scene);
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.y = 0.03;
    const glowMat = new StandardMaterial("glowRingMat", this.scene);
    glowMat.diffuseColor = new Color3(0.0, 0.4, 0.8);
    glowMat.emissiveColor = new Color3(0.0, 0.35, 0.7);
    glowRing.material = glowMat;
  }

  private buildEnergyRing() {
    // 环形能源管线
    const ring = MeshBuilder.CreateTorus("energyRing", { diameter: 3.2, thickness: 0.04, tessellation: 64 }, this.scene);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    const mat = new StandardMaterial("energyRingMat", this.scene);
    mat.diffuseColor = new Color3(0.14, 0.61, 0.98);
    mat.emissiveColor = new Color3(0.1, 0.5, 0.8);
    mat.alpha = 0.7;
    ring.material = mat;

    // 环形粒子流
    this.createRingParticleFlow();
  }

  private createRingParticleFlow() {
    const ps = new ParticleSystem("ringParticles", 200, this.scene);
    ps.particleTexture = this.createParticleTexture();
    ps.emitter = new Vector3(0, 0.06, 0);
    // 使用扁平球形发射器模拟环形发射面
    const sphereEmitter = ps.createSphereEmitter(1.6, 0);
    sphereEmitter.direction1 = new Vector3(-0.05, 1, -0.05);
    sphereEmitter.direction2 = new Vector3(0.05, 1, 0.05);

    ps.color1 = new Color4(0.22, 0.74, 0.98, 1.0);
    ps.color2 = new Color4(0.98, 0.75, 0.14, 1.0);
    ps.colorDead = new Color4(0.22, 0.74, 0.98, 0.0);

    ps.minSize = 0.04;
    ps.maxSize = 0.08;
    ps.minLifeTime = 2.5;
    ps.maxLifeTime = 4.0;
    ps.emitRate = 30;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;

    ps.minEmitPower = 0.1;
    ps.maxEmitPower = 0.3;
    ps.updateSpeed = 0.01;
    ps.gravity = new Vector3(0, 0.05, 0);

    ps.start();
    this.energyParticleSystems.set("ring", ps);
  }

  // ─────────────────────────────────────────────────────────
  //  建筑构建
  // ─────────────────────────────────────────────────────────

  addBuilding(building: StandardBuilding) {
    const node = new TransformNode(building.id, this.scene);
    node.position = new Vector3(...building.position);

    const meshes: Mesh[] = [];
    const kind = building.buildingType;

    switch (kind) {
      case "energy":
        meshes.push(...this.buildEnergyCenter(node, building));
        break;
      case "office":
        meshes.push(...this.buildOfficeBuilding(node, building));
        break;
      case "commercial":
        meshes.push(...this.buildCommercialBuilding(node, building));
        break;
      case "residential":
        meshes.push(...this.buildResidentialBuilding(node, building));
        break;
      case "school":
        meshes.push(...this.buildSchoolBuilding(node, building));
        break;
      case "hospital":
        meshes.push(...this.buildHospitalBuilding(node, building));
        break;
      case "factory":
        meshes.push(...this.buildFactoryBuilding(node, building));
        break;
      default:
        meshes.push(...this.buildOfficeBuilding(node, building));
    }

    // 统一设置阴影
    meshes.forEach((m) => {
      m.metadata = { buildingId: building.id, building };
      m.receiveShadows = true;
      this.shadowGenerator?.addShadowCaster(m, true);

      // 点击交互
      m.actionManager = new ActionManager(this.scene);
      m.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
          this.onBuildingPick(building.id);
        }),
      );
    });

    // 标签
    this.addBuildingLabel(building, meshes, node);

    // 管线连接
    if (kind !== "energy") {
      this.buildEnergyPipe(building);
    }

    this.buildings.set(building.id, node);
    this.buildingMeshes.set(building.id, meshes);
  }

  private buildEnergyCenter(parent: TransformNode, building: StandardBuilding): Mesh[] {
    const meshes: Mesh[] = [];

    // 底座平台
    const base = MeshBuilder.CreateCylinder("base", { height: 0.4, diameter: 2.6, tessellation: 8 }, this.scene);
    base.position.y = 0.2;
    const baseMat = new StandardMaterial("ecBaseMat", this.scene);
    baseMat.diffuseColor = new Color3(0.04, 0.2, 0.38);
    baseMat.specularColor = new Color3(0.2, 0.3, 0.4);
    baseMat.emissiveColor = new Color3(0.02, 0.08, 0.15);
    base.material = baseMat;
    base.parent = parent;
    meshes.push(base);

    // 主体
    const body = MeshBuilder.CreateCylinder("ecBody", { height: 2.2, diameter: 1.5, tessellation: 8 }, this.scene);
    body.position.y = 1.5;
    const bodyMat = new StandardMaterial("ecBodyMat", this.scene);
    bodyMat.diffuseColor = new Color3(0.05, 0.25, 0.45);
    bodyMat.specularColor = new Color3(0.3, 0.5, 0.7);
    bodyMat.emissiveColor = new Color3(0.02, 0.1, 0.2);
    body.material = bodyMat;
    body.parent = parent;
    meshes.push(body);

    // 旋转光环
    const ring1 = MeshBuilder.CreateTorus("ecRing1", { diameter: 1.8, thickness: 0.08, tessellation: 32 }, this.scene);
    ring1.position.y = 2.8;
    const ringMat = new StandardMaterial("ecRingMat", this.scene);
    ringMat.diffuseColor = DEFAULT_CORE_COLOR;
    ringMat.emissiveColor = DEFAULT_CORE_COLOR;
    ringMat.emissiveIntensity = 1.2;
    ring1.material = ringMat;
    ring1.parent = parent;
    meshes.push(ring1);

    // 旋转动画
    this.animateRing(ring1);

    const ring2 = MeshBuilder.CreateTorus("ecRing2", { diameter: 2.3, thickness: 0.05, tessellation: 32 }, this.scene);
    ring2.position.y = 2.5;
    const ring2Mat = new StandardMaterial("ecRing2Mat", this.scene);
    ring2Mat.diffuseColor = DEFAULT_ENERGY_COLOR;
    ring2Mat.emissiveColor = DEFAULT_ENERGY_COLOR;
    ring2Mat.emissiveIntensity = 0.8;
    ring2.material = ring2Mat;
    ring2.parent = parent;
    meshes.push(ring2);
    this.animateRing(ring2, -1, 0.3);

    // 顶部能量核心
    const core = MeshBuilder.CreateSphere("ecCore", { diameter: 0.5, segments: 16 }, this.scene);
    core.position.y = 3.3;
    const coreMat = new StandardMaterial("ecCoreMat", this.scene);
    coreMat.diffuseColor = DEFAULT_CORE_COLOR;
    coreMat.emissiveColor = DEFAULT_CORE_COLOR;
    coreMat.emissiveIntensity = 1.5;
    coreMat.specularColor = new Color3(1, 1, 1);
    core.material = coreMat;
    core.parent = parent;
    meshes.push(core);

    // 环形粒子系统
    this.createEnergyCoreParticles(parent, new Vector3(0, 2.8, 0));

    return meshes;
  }

  private buildOfficeBuilding(parent: TransformNode, building: StandardBuilding): Mesh[] {
    const meshes: Mesh[] = [];
    const config = HEIGHT_CONFIG.office;
    const h = this.calcHeight(building, config);
    const w = 0.9, d = 0.9;

    const body = MeshBuilder.CreateBox("officeBody", { width: w, height: h, depth: d }, this.scene);
    body.position.y = h / 2;
    const bodyMat = new PBRMaterial("officeMat", this.scene);
    bodyMat.albedoColor = this.hexToColor3(building.color);
    bodyMat.metallic = 0.75;
    bodyMat.roughness = 0.18;
    bodyMat.emissiveColor = this.hexToColor3(building.color).scale(0.08);
    body.material = bodyMat;
    body.parent = parent;
    meshes.push(body);

    // 玻璃幕墙
    const glass = MeshBuilder.CreateBox("officeGlass", { width: w * 0.7, height: h * 0.75, depth: 0.02 }, this.scene);
    glass.position = new Vector3(0, h * 0.45, d / 2 + 0.01);
    const glassMat = new PBRMaterial("officeGlassMat", this.scene);
    glassMat.albedoColor = new Color3(0.4, 0.8, 1.0);
    glassMat.metallic = 0.3;
    glassMat.roughness = 0.05;
    glassMat.alpha = 0.6;
    glass.material = glassMat;
    glass.parent = parent;
    meshes.push(glass);

    return meshes;
  }

  private buildCommercialBuilding(parent: TransformNode, building: StandardBuilding): Mesh[] {
    const meshes: Mesh[] = [];
    const config = HEIGHT_CONFIG.commercial;
    const h = this.calcHeight(building, config);
    const w = 1.1, d = 1.0;

    const body = MeshBuilder.CreateBox("commBody", { width: w, height: h, depth: d }, this.scene);
    body.position.y = h / 2;
    const mat = new PBRMaterial("commMat", this.scene);
    mat.albedoColor = this.hexToColor3(building.color);
    mat.metallic = 0.5;
    mat.roughness = 0.3;
    mat.emissiveColor = this.hexToColor3(building.color).scale(0.1);
    body.material = mat;
    body.parent = parent;
    meshes.push(body);

    return meshes;
  }

  private buildResidentialBuilding(parent: TransformNode, building: StandardBuilding): Mesh[] {
    const meshes: Mesh[] = [];
    const config = HEIGHT_CONFIG.residential;
    const h = this.calcHeight(building, config);
    const w = 1.0, d = 0.9;

    const body = MeshBuilder.CreateBox("resBody", { width: w, height: h, depth: d }, this.scene);
    body.position.y = h / 2;
    const mat = new StandardMaterial("resMat", this.scene);
    mat.diffuseColor = this.hexToColor3(building.color);
    mat.specularColor = new Color3(0.1, 0.1, 0.1);
    mat.emissiveColor = this.hexToColor3(building.color).scale(0.06);
    body.material = mat;
    body.parent = parent;
    meshes.push(body);

    return meshes;
  }

  private buildSchoolBuilding(parent: TransformNode, building: StandardBuilding): Mesh[] {
    const meshes: Mesh[] = [];
    const config = HEIGHT_CONFIG.school;
    const h = this.calcHeight(building, config);
    const w = 1.2, d = 0.85;

    const body = MeshBuilder.CreateBox("schoolBody", { width: w, height: h, depth: d }, this.scene);
    body.position.y = h / 2;
    const mat = new StandardMaterial("schoolMat", this.scene);
    mat.diffuseColor = this.hexToColor3(building.color);
    mat.specularColor = new Color3(0.05, 0.05, 0.05);
    body.material = mat;
    body.parent = parent;
    meshes.push(body);

    return meshes;
  }

  private buildHospitalBuilding(parent: TransformNode, building: StandardBuilding): Mesh[] {
    const meshes: Mesh[] = [];
    const config = HEIGHT_CONFIG.hospital;
    const h = this.calcHeight(building, config);
    const w = 1.0, d = 0.95;

    const body = MeshBuilder.CreateBox("hospBody", { width: w, height: h, depth: d }, this.scene);
    body.position.y = h / 2;
    const mat = new StandardMaterial("hospMat", this.scene);
    mat.diffuseColor = this.hexToColor3(building.color);
    mat.specularColor = new Color3(0.1, 0.1, 0.1);
    mat.emissiveColor = this.hexToColor3(building.color).scale(0.05);
    body.material = mat;
    body.parent = parent;
    meshes.push(body);

    return meshes;
  }

  private buildFactoryBuilding(parent: TransformNode, building: StandardBuilding): Mesh[] {
    const meshes: Mesh[] = [];
    const config = HEIGHT_CONFIG.factory;
    const h = this.calcHeight(building, config);
    const w = 1.4, d = 1.0;

    const body = MeshBuilder.CreateBox("factBody", { width: w, height: h, depth: d }, this.scene);
    body.position.y = h / 2;
    const mat = new StandardMaterial("factMat", this.scene);
    mat.diffuseColor = this.hexToColor3(building.color);
    mat.metallic = 0.45;
    mat.roughness = 0.55;
    body.material = mat;
    body.parent = parent;
    meshes.push(body);

    // 烟囱
    const chimney = MeshBuilder.CreateCylinder("chimney", { height: 1.2, diameter: 0.18, tessellation: 8 }, this.scene);
    chimney.position = new Vector3(w * 0.3, h + 0.6, 0);
    const chimMat = new StandardMaterial("chimMat", this.scene);
    chimMat.diffuseColor = new Color3(0.5, 0.1, 0.1);
    chimMat.specularColor = new Color3(0.1, 0.05, 0.05);
    chimney.material = chimMat;
    chimney.parent = parent;
    meshes.push(chimney);

    return meshes;
  }

  // ─────────────────────────────────────────────────────────
  //  管线连接
  // ─────────────────────────────────────────────────────────

  buildEnergyPipe(building: StandardBuilding) {
    const energyNode = this.buildings.get("BLD_EC");
    if (!energyNode) return;

    const config = MEDIUM_VISUAL_CONFIGS.electricity;
    const startPos = energyNode.position.clone().addInPlaceFromFloats(0, 2.8, 0);
    const endPos = new Vector3(...building.position).addInPlaceFromFloats(0, this.calcHeightFromBuilding(building) * 0.85, 0);
    const midY = (startPos.y + endPos.y) / 2 + 0.6;

    // 创建曲线点
    const points = [
      startPos,
      new Vector3((startPos.x + endPos.x) / 2, midY, (startPos.z + endPos.z) / 2),
      endPos,
    ];

    // 管线基础线
    const line = MeshBuilder.CreateLines(`pipe-${building.id}`, {
      points,
      updatable: false,
    }, this.scene);
    const pipeMat = new StandardMaterial(`pipeMat-${building.id}`, this.scene);
    pipeMat.diffuseColor = this.hexToColor3(config.lineColor);
    pipeMat.emissiveColor = this.hexToColor3(config.lineColor);
    pipeMat.emissiveIntensity = 0.4;
    pipeMat.alpha = 0.5;
    line.color = this.hexToColor3(config.lineColor);
    line.alpha = 0.5;

    // 流光粒子
    const particles = this.createFlowParticles(startPos, endPos, midY, config);

    this.pipelineLines.set(building.id, { line, particles });
  }

  private createFlowParticles(start: Vector3, end: Vector3, midY: number, config: typeof MEDIUM_VISUAL_CONFIGS[EnergyMedium]) {
    const particles: ParticleSystem[] = [];

    const curvePoints = [
      start,
      new Vector3((start.x + end.x) / 2, midY, (start.z + end.z) / 2),
      end,
    ];
    const qb = this.createQuadraticBezier(curvePoints[0], curvePoints[1], curvePoints[2]);
    const c = this.hexToColor4(config.particleColor);

    for (let i = 0; i < 3; i++) {
      const delay = (i / 3);

      const ps = new ParticleSystem(`flow-${i}`, 50, this.scene);
      ps.particleTexture = this.createParticleTexture();

      // 使用球形发射器
      ps.createSphereEmitter(0.02);

      ps.color1 = c;
      ps.color2 = c;
      ps.colorDead = new Color4(c.r, c.g, c.b, 0);

      ps.minSize = 0.06;
      ps.maxSize = 0.12;
      ps.minLifeTime = 2.0;
      ps.maxLifeTime = 3.5;
      ps.emitRate = 10;
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;

      ps.minEmitPower = 0.05;
      ps.maxEmitPower = 0.15;

      // 自定义粒子更新：沿贝塞尔曲线循环移动发射器位置
      ps.updateFunction = (particleArray) => {
        const t = ((Date.now() / 1000 * 0.28 + delay) % 1);
        const newPos = qb.getPoint(t);
        // 移动发射器位置实现流光效果
        ps.emitter = newPos;
        void particleArray;
      };

      ps.start();
      particles.push(ps);
    }

    return particles;
  }

  // ─────────────────────────────────────────────────────────
  //  粒子纹理
  // ─────────────────────────────────────────────────────────

  private createParticleTexture(): DynamicTexture {
    const size = 64;
    const tex = new DynamicTexture("ptex", size, this.scene, false);
    const ctx = tex.getContext();

    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.8)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    tex.update();

    return tex;
  }

  // ─────────────────────────────────────────────────────────
  //  标签
  // ─────────────────────────────────────────────────────────

  private addBuildingLabel(building: StandardBuilding, meshes: Mesh[], parent: TransformNode) {
    // 使用Billboard模式的文字平面
    const h = this.calcHeightFromBuilding(building);
    const labelPos = new Vector3(0, h + 0.8, 0);
    const labelPlane = MeshBuilder.CreatePlane(`label-${building.id}`, { width: 1.5, height: 0.5 }, this.scene);
    labelPlane.position = labelPos;
    labelPlane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    labelPlane.parent = parent;

    const labelTex = new DynamicTexture(`labelTex-${building.id}`, { width: 256, height: 96 }, this.scene);
    const ctx = labelTex.getContext();
    ctx.fillStyle = "rgba(3,7,18,0.85)";
    ctx.roundRect(0, 0, 256, 96, 12);
    ctx.fill();

    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(building.name, 128, 38);

    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#fbbf24";
    const energyVal = building.latestEnergy?.electricity.toFixed(1) ?? "0.0";
    ctx.fillText(`${energyVal} kW`, 128, 68);

    labelTex.update();
    const labelMat = new StandardMaterial(`labelMat-${building.id}`, this.scene);
    labelMat.diffuseTexture = labelTex;
    labelMat.emissiveTexture = labelTex;
    labelMat.specularColor = new Color3(0, 0, 0);
    labelMat.useAlphaFromDiffuseTexture = true;
    labelMat.backFaceCulling = false;
    labelPlane.material = labelMat;

    this.labels.set(building.id, labelPlane);
  }

  // ─────────────────────────────────────────────────────────
  //  能源核心粒子
  // ─────────────────────────────────────────────────────────

  private createEnergyCoreParticles(parent: TransformNode, localPos: Vector3) {
    const ps = new ParticleSystem("coreParticles", 80, this.scene);
    ps.particleTexture = this.createParticleTexture();

    ps.emitter = localPos;
    ps.createSphereEmitter(0.6);

    const c = new Color4(0.98, 0.75, 0.14, 1.0);
    ps.color1 = c;
    ps.color2 = new Color4(0.22, 0.74, 0.98, 1.0);
    ps.colorDead = new Color4(0.98, 0.75, 0.14, 0);

    ps.minSize = 0.05;
    ps.maxSize = 0.12;
    ps.minLifeTime = 1.5;
    ps.maxLifeTime = 3.0;
    ps.emitRate = 25;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;

    ps.minEmitPower = 0.15;
    ps.maxEmitPower = 0.4;
    ps.gravity = new Vector3(0, 0.5, 0);

    ps.start();
    this.energyParticleSystems.set("core", ps);
  }

  // ─────────────────────────────────────────────────────────
  //  动画
  // ─────────────────────────────────────────────────────────

  private animateRing(ring: Mesh, direction = 1, speed = 0.5) {
    const anim = new Animation(
      `ringRot-${ring.name}`,
      "rotation.y",
      60,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CYCLE,
    );

    const easing = new QuadraticEase();
    easing.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
    anim.setEasingFunction(easing);

    anim.setKeys([
      { frame: 0, value: 0 },
      { frame: 300, value: direction * Math.PI * 2 },
    ]);

    ring.animations = [anim];
    this.scene.beginAnimation(ring, 0, 300, true, speed);
  }

  // ─────────────────────────────────────────────────────────
  //  选中 / 高亮 / 告警
  // ─────────────────────────────────────────────────────────

  onBuildingPick(id: string) {
    if (this.selectedId === id) {
      this.deselectBuilding();
    } else {
      this.selectBuilding(id);
    }
  }

  selectBuilding(id: string) {
    this.deselectBuilding();
    this.selectedId = id;

    const meshes = this.buildingMeshes.get(id);
    if (!meshes || !this.highlightLayer) return;

    meshes.forEach((m) => {
      this.highlightLayer.addMesh(m, new Color3(0.22, 0.74, 0.98));
    });

    // 选中光环
    const node = this.buildings.get(id);
    if (node) {
      const h = this.calcHeightFromBuildingId(id);
      const halo = MeshBuilder.CreateDisc("selHalo", { radius: 1.2, tessellation: 32 }, this.scene);
      halo.rotation.x = Math.PI / 2;
      halo.position = node.position.clone().addInPlaceFromFloats(0, 0.05, 0);
      const haloMat = new StandardMaterial("haloMat", this.scene);
      haloMat.diffuseColor = new Color3(0.22, 0.74, 0.98);
      haloMat.emissiveColor = new Color3(0.22, 0.74, 0.98);
      haloMat.alpha = 0.25;
      halo.material = haloMat;
    }
  }

  deselectBuilding() {
    if (!this.selectedId || !this.highlightLayer) return;
    const meshes = this.buildingMeshes.get(this.selectedId);
    if (meshes) {
      meshes.forEach((m) => {
        try { this.highlightLayer?.removeMesh(m); } catch { /* noop */ }
      });
    }
    this.selectedId = null;
  }

  highlightBuilding(id: string, color: Color3) {
    const meshes = this.buildingMeshes.get(id);
    if (!meshes || !this.highlightLayer) return;
    meshes.forEach((m) => this.highlightLayer!.addMesh(m, color));
  }

  removeHighlight(id: string) {
    const meshes = this.buildingMeshes.get(id);
    if (!meshes) return;
    meshes.forEach((m) => {
      try { this.highlightLayer?.removeMesh(m); } catch { /* noop */ }
    });
  }

  triggerAlert(alert: AlertData) {
    const meshes = this.buildingMeshes.get(alert.buildingId ?? "");
    if (!meshes?.length) return;

    const alertColor = new Color3(0.94, 0.27, 0.27);

    // 脉冲闪烁动画
    meshes.forEach((mesh) => {
      const mat = mesh.material as StandardMaterial | PBRMaterial | null;
      if (!mat) return;

      const originalEmissive = (mat as PBRMaterial).emissiveColor
        ? (mat as PBRMaterial).emissiveColor!.clone()
        : new Color3(0, 0, 0);

      const animColor = new Animation(
        `alertColor-${alert.id}`,
        "material.emissiveColor",
        60,
        Animation.ANIMATIONTYPE_COLOR3,
        Animation.ANIMATIONLOOPMODE_CYCLE,
      );
      animColor.setKeys([
        { frame: 0, value: alertColor },
        { frame: 15, value: originalEmissive },
        { frame: 30, value: alertColor },
        { frame: 45, value: originalEmissive },
      ]);

      mesh.animations = [animColor];
      this.scene.beginAnimation(mesh, 0, 45, false, 2, () => {
        if (mat instanceof PBRMaterial && originalEmissive) {
          mat.emissiveColor = originalEmissive;
        }
      });

      // 添加高亮
      this.highlightLayer?.addMesh(mesh, alertColor);

      const existing = this.alertAnimations.get(alert.buildingId ?? "") ?? [];
      existing.push(animColor);
      this.alertAnimations.set(alert.buildingId ?? "", existing);
    });
  }

  // ─────────────────────────────────────────────────────────
  //  相机控制
  // ─────────────────────────────────────────────────────────

  flyTo(buildingId: string, options: { duration?: number; fov?: number } = {}) {
    const node = this.buildings.get(buildingId);
    if (!node) return;

    const h = this.calcHeightFromBuildingId(buildingId);
    const target = node.position.clone().addInPlaceFromFloats(0, h * 0.5, 0);
    const offset = new Vector3(8, 6, 8);

    const camera = this.scene.activeCamera;
    if (!camera) return;

    const animPos = new Animation("camPos", "position", 60, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
    const ease = new QuadraticEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
    animPos.setEasingFunction(ease);

    animPos.setKeys([
      { frame: 0, value: camera.position.clone() },
      { frame: (options.duration ?? 1.5) * 60, value: target.add(offset) },
    ]);

    camera.animations = [animPos];
    this.scene.beginAnimation(camera, 0, (options.duration ?? 1.5) * 60, false);

    // 相机看向目标
    const animTarget = new Animation("camTarget", "target", 60, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
    animTarget.setEasingFunction(ease);
    animTarget.setKeys([
      { frame: 0, value: (camera as unknown as { target: Vector3 }).target.clone() },
      { frame: (options.duration ?? 1.5) * 60, value: target },
    ]);
    (camera as unknown as { animations: Animation[] }).animations.push(animTarget);
  }

  playDemoKeyframes(keyframes: CameraKeyframe[]) {
    if (keyframes.length === 0) return;
    const camera = this.scene.activeCamera;
    if (!camera) return;

    keyframes.forEach((kf, idx) => {
      const animPos = new Animation(`kfPos-${idx}`, "position", 60, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
      const easing = new QuadraticEase();
      easing.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
      animPos.setEasingFunction(easing);

      const prevFrame = idx === 0 ? 0 : keyframes[idx - 1].time * 60;
      const nextFrame = kf.time * 60;

      animPos.setKeys([
        { frame: prevFrame, value: idx === 0 ? camera.position.clone() : keyframes[idx - 1].state.position.map((v) => new Vector3(...v)) as unknown as Vector3 },
        { frame: nextFrame, value: new Vector3(...kf.state.position) },
      ]);

      (camera as unknown as { animations: Animation[] }).animations.push(animPos);
    });

    const totalFrames = keyframes[keyframes.length - 1].time * 60;
    this.scene.beginAnimation(camera, 0, totalFrames, false);
  }

  // ─────────────────────────────────────────────────────────
  //  工具方法
  // ─────────────────────────────────────────────────────────

  private calcHeight(building: StandardBuilding, config: { base: number; max: number }): number {
    const energy = building.latestEnergy?.electricity ?? 80;
    const h = config.base * (energy / 80);
    return Math.min(h, config.max);
  }

  private calcHeightFromBuilding(building: StandardBuilding): number {
    const config = HEIGHT_CONFIG[building.buildingType] ?? HEIGHT_CONFIG.office;
    return this.calcHeight(building, config);
  }

  private calcHeightFromBuildingId(id: string): number {
    const node = this.buildings.get(id);
    if (!node) return 3;
    const meshes = this.buildingMeshes.get(id);
    if (!meshes?.length) return 3;
    return meshes.reduce((max, m) => Math.max(max, m.getBoundingInfo().boundingBox.extendSize.y * 2), 0.5);
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

  private createQuadraticBezier(p0: Vector3, p1: Vector3, p2: Vector3) {
    const curve = { getPoint: (t: number) => Vector3.Zero() };
    const pts = [p0, p1, p2];
    curve.getPoint = (t: number) => {
      const mt = 1 - t;
      return new Vector3(
        mt * mt * pts[0].x + 2 * mt * t * pts[1].x + t * t * pts[2].x,
        mt * mt * pts[0].y + 2 * mt * t * pts[1].y + t * t * pts[2].y,
        mt * mt * pts[0].z + 2 * mt * t * pts[1].z + t * t * pts[2].z,
      );
    };
    return curve;
  }
}
