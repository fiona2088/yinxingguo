/**
 * ============================================================
 * Babylon.js Engine Adapter — 引擎适配层
 * ============================================================
 * 职责：
 *   - 创建并管理 Babylon.js Engine / Scene / Camera / Light
 *   - 提供标准化的 WebGPU / WebGL 自适应初始化
 *   - 封装渲染循环、尺寸自适应、事件绑定
 *   - 与 React 生命周期解耦，供 SceneComponent 调用
 *
 * 使用方式：
 *   const adapter = new BabylonEngineAdapter(canvasRef.current, { antialias: true });
 *   adapter.init().then(scene => { ... });
 */

import {
  Engine,
  Scene,
  EngineOptions,
  SceneOptions,
  Color4,
  Vector3,
  Color3,
  Animation,
  PointerEventTypes,
} from "@babylonjs/core";

export interface BabylonEngineAdapterOptions {
  antialias?: boolean;
  adaptToDeviceRatio?: boolean;
  preserveDrawingBuffer?: boolean;
  stencil?: boolean;
  powerPreference?: "high-performance" | "default" | "low-power";
  doNotHandleContextLost?: boolean;
  doNotHandleResize?: boolean;
  /** 大屏目标帧率，默认 60 */
  targetFrameRate?: number;
  /** 场景背景色 (RGBA) */
  backgroundColor?: [number, number, number, number];
  /** 雾效密度（fog density），设为 0 则不启用雾 */
  fogDensity?: number;
  /** 雾效颜色 */
  fogColor?: [number, number, number];
  /** 是否启用 WebGPU（优先），不支持时自动降级 WebGL2 */
  preferWebGPU?: boolean;
}

export interface BabylonEngineAdapterEvents {
  onReady?: (scene: Scene) => void;
  onResize?: (width: number, height: number) => void;
  onPointerDown?: (evt: { pickResult: ReturnType<Scene["pick"]> }) => void;
  onPointerUp?: (evt: { pickResult: ReturnType<Scene["pick"]> }) => void;
  onPointerMove?: (evt: { pickResult: ReturnType<Scene["pick"]> }) => void;
  onBuildingPointerDown?: (metadata: Record<string, unknown>) => void;
}

const DEFAULT_OPTIONS: Required<BabylonEngineAdapterOptions> = {
  antialias: true,
  adaptToDeviceRatio: true,
  preserveDrawingBuffer: false,
  stencil: true,
  powerPreference: "high-performance",
  doNotHandleContextLost: false,
  doNotHandleResize: false,
  targetFrameRate: 60,
  backgroundColor: [0.012, 0.027, 0.071, 1],
  fogDensity: 0.045,
  fogColor: [0.012, 0.027, 0.071],
  preferWebGPU: false,
};

export class BabylonEngineAdapter {
  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private options: Required<BabylonEngineAdapterOptions>;
  private events: BabylonEngineAdapterEvents;
  private running = false;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, options: BabylonEngineAdapterOptions = {}, events: BabylonEngineAdapterEvents = {}) {
    this.canvas = canvas;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.events = events;
  }

  async init(): Promise<Scene> {
    if (this.disposed) {
      throw new Error("BabylonEngineAdapter has been disposed.");
    }

    const engineOptions: EngineOptions = {
      antialias: this.options.antialias,
      adaptToDeviceRatio: this.options.adaptToDeviceRatio,
      preserveDrawingBuffer: this.options.preserveDrawingBuffer,
      stencil: this.options.stencil,
      powerPreference: this.options.powerPreference,
      doNotHandleContextLost: this.options.doNotHandleContextLost,
      doNotHandleResize: this.options.doNotHandleResize,
    };

    // 优先尝试 WebGPU，不支持时降级到 WebGL
    if (this.options.preferWebGPU) {
      try {
        const { WebGPUEngine } = await import("@babylonjs/core/engines/webgpuEngine");
        const webgpuEngine = new WebGPUEngine(this.canvas!, {
          antialias: this.options.antialias,
          stencil: this.options.stencil,
          doNotHandleContextLost: this.options.doNotHandleContextLost,
        });
        await webgpuEngine.init();
        this.engine = webgpuEngine;
        console.log("[BabylonEngine] WebGPU initialized.");
      } catch {
        console.warn("[BabylonEngine] WebGPU not supported, falling back to WebGL2.");
        this.engine = new Engine(this.canvas!, true, engineOptions);
      }
    } else {
      // WebGL2 engine: new Engine(canvas, true, engineOptions) 创建 WebGL2
      this.engine = new Engine(this.canvas!, true, engineOptions);
    }

    // 场景初始化
    const sceneOptions: SceneOptions = {
      preserveDrawingBuffer: this.options.preserveDrawingBuffer,
      stencil: this.options.stencil,
    };
    this.scene = new Scene(this.engine, sceneOptions);
    this.scene.clearColor = new Color4(
      this.options.backgroundColor[0],
      this.options.backgroundColor[1],
      this.options.backgroundColor[2],
      this.options.backgroundColor[3],
    );

    // 雾效
    if (this.options.fogDensity > 0) {
      this.scene.fogMode = Scene.FOGMODE_EXP2;
      this.scene.fogDensity = this.options.fogDensity;
      this.scene.fogColor = new Color3(
        this.options.fogColor[0],
        this.options.fogColor[1],
        this.options.fogColor[2],
      );
    }

    // 启用动画系统
    this.scene.animationPropertiesOverride = new Animation.AnimationPropertiesOverride();
    this.scene.animationPropertiesOverride.enableBlending = true;
    this.scene.animationPropertiesOverride.blendingSpeed = 0.04;

    // 全局拾取配置
    this.scene.pickPrecision = 0.1;

    // 绑定指针事件
    this.bindPointerEvents();

    // 窗口 resize 响应
    const resizeHandler = () => {
      if (this.engine && !this.disposed) {
        this.engine.resize();
        this.events.onResize?.(this.canvas!.clientWidth, this.canvas!.clientHeight);
      }
    };
    window.addEventListener("resize", resizeHandler);

    // 启动渲染循环
    this.running = true;
    this.engine.runRenderLoop(() => {
      if (this.running && this.scene && !this.disposed) {
        this.scene.render();
      }
    });

    this.events.onReady?.(this.scene);
    return this.scene;
  }

  private bindPointerEvents() {
    if (!this.scene) return;

    this.scene.onPointerObservable.add((pointerInfo) => {
      const { type } = pointerInfo;
      const pickResult = this.scene!.pick(
        this.scene!.pointerX,
        this.scene!.pointerY,
      );

      if (type === PointerEventTypes.POINTERDOWN) {
        this.events.onPointerDown?.({ pickResult });
        // 拾取到建筑
        if (pickResult?.pickedMesh?.metadata) {
          this.events.onBuildingPointerDown?.(pickResult.pickedMesh.metadata);
        }
      } else if (type === PointerEventTypes.POINTERUP) {
        this.events.onPointerUp?.({ pickResult });
      } else if (type === PointerEventTypes.POINTERMOVE) {
        this.events.onPointerMove?.({ pickResult });
      }
    });
  }

  getScene(): Scene | null {
    return this.scene;
  }

  getEngine(): Engine | null {
    return this.engine;
  }

  setAutoClear(color: boolean, depth: boolean, stencil: boolean) {
    this.scene?.setRenderingAutoClearDepthStencil(color, depth, stencil);
  }

  dispose() {
    this.running = false;
    this.disposed = true;
    window.removeEventListener("resize", () => { /* cleanup */ });
    this.scene?.dispose();
    this.engine?.dispose();
    this.scene = null;
    this.engine = null;
    this.canvas = null;
  }
}
