/**
 * 可视化大屏页面
 * 包含真实3D建筑模型和桑基图能量流向
 */
import { useState, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Float, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { motion, AnimatePresence } from "framer-motion";
import { SankeyChart } from "../components/SankeyChart";
import { Maximize2, Minimize2, Mic, MicOff, BarChart3, Box } from "lucide-react";
import { Button } from "../components/ui/button";
import { cn } from "../components/ui/utils";

// ─────────────────────────────────────────────────────────────
//  全局常量
// ─────────────────────────────────────────────────────────────
const FH = 0.38; // 标准层层高

// ─────────────────────────────────────────────────────────────
//  建筑数据 — 分散布局
// ─────────────────────────────────────────────────────────────
const BUILDINGS = [
  {
    name: "Aral",
    electricity: 94.52,
    hvac: 48523.45,
    position: [-9, 0, 4] as [number, number, number],
    accentColor: "#2563eb",
    floors: 24,
    facing: 0.15,
    style: "office",
  },
  {
    name: "Caspian",
    electricity: 88.76,
    hvac: 45231.23,
    position: [-5.5, 0, -6] as [number, number, number],
    accentColor: "#b91c1c",
    floors: 16,
    facing: 0.4,
    style: "residential",
  },
  {
    name: "Michigan",
    electricity: 92.34,
    hvac: 47890.12,
    position: [0, 0, -9] as [number, number, number],
    accentColor: "#6b7280",
    floors: 30,
    facing: 0.0,
    style: "tower",
  },
  {
    name: "Superior",
    electricity: 87.45,
    hvac: 44123.67,
    position: [5.5, 0, -6] as [number, number, number],
    accentColor: "#0369a1",
    floors: 20,
    facing: -0.4,
    style: "modern",
  },
  {
    name: "Victoria",
    electricity: 91.23,
    hvac: 46543.89,
    position: [9, 0, 4] as [number, number, number],
    accentColor: "#92400e",
    floors: 14,
    facing: -0.15,
    style: "classical",
  },
];

const ENERGY_LINKS = BUILDINGS.map((b) => ({
  source: [0, 5.5, 0] as [number, number, number],
  target: [b.position[0], (b.floors * FH) / 2, b.position[2]] as [number, number, number],
  value: Math.round(b.electricity),
}));

// ─────────────────────────────────────────────────────────────
//  几何工具
// ─────────────────────────────────────────────────────────────
const _dummy = new THREE.Object3D();
function makeEdges(geo: THREE.BufferGeometry) {
  return new THREE.EdgesGeometry(geo);
}

// ─────────────────────────────────────────────────────────────
//  组件：阳台（实际突出的板 + 栏杆）
// ─────────────────────────────────────────────────────────────
function BalconyRow({ floor, w, depth, color }: {
  floor: number; w: number; depth: number; color: string;
}) {
  const y = floor * FH;
  return (
    <group position={[0, y + FH * 0.85, depth / 2 + 0.08]}>
      {/* 阳台板 */}
      <mesh castShadow>
        <boxGeometry args={[w * 0.55, 0.06, 0.28]} />
        <meshStandardMaterial color="#9ca3af" roughness={0.85} />
      </mesh>
      {/* 前栏杆立柱 */}
      {[-w * 0.22, 0, w * 0.22].map((x, i) => (
        <mesh key={i} position={[x, 0.14, 0.12]}>
          <cylinderGeometry args={[0.015, 0.015, 0.28, 6]} />
          <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
        </mesh>
      ))}
      {/* 栏杆横杆 */}
      <mesh position={[0, 0.28, 0.12]}>
        <boxGeometry args={[w * 0.55 + 0.02, 0.015, 0.015]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
//  组件：真实窗格（使用 InstancedMesh，大幅降低 draw call）
// ─────────────────────────────────────────────────────────────
function InstancedWindows({ floors, w, h, side }: {
  floors: number; w: number; h: number; side: "front" | "back" | "left" | "right";
}) {
  const cols = Math.max(1, Math.floor(w / 0.38));
  const total = floors * cols;
  const meshRef = useRef<THREE.InstancedMesh>(null!);

  const geom = useMemo(() => new THREE.BoxGeometry(0.18, 0.22, 0.06), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#93c5fd",
    transparent: true,
    opacity: 0.7,
    roughness: 0.1,
    metalness: 0.3,
  }), []);

  useMemo(() => {
    if (!meshRef.current) return;
    let idx = 0;
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        _dummy.position.set(
          -w / 2 + 0.19 + c * ((w - 0.19 * 2) / Math.max(1, cols - 1)) + (cols === 1 ? 0 : 0),
          f * FH + FH * 0.5,
          0
        );
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        meshRef.current.setMatrixAt(idx++, _dummy.matrix);
      }
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  const rotY = side === "back" ? Math.PI : side === "left" ? -Math.PI / 2 : side === "right" ? Math.PI / 2 : 0;
  const offsetZ = side === "front" ? h / 2 + 0.03 : side === "back" ? -h / 2 - 0.03 : 0;
  const offsetX = side === "left" ? -w / 2 - 0.03 : side === "right" ? w / 2 + 0.03 : 0;

  return (
    <group rotation={[0, rotY, 0]} position={[offsetX, 0, offsetZ]}>
      <instancedMesh ref={meshRef} args={[geom, mat, total]} castShadow />
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
//  组件：女儿墙/护栏
// ─────────────────────────────────────────────────────────────
function Parapet({ w, d, color }: { w: number; d: number; color: string }) {
  const posts = Math.ceil(w / 0.5);
  return (
    <>
      {/* 矮墙主体 */}
      <mesh position={[0, 0, d / 2]}>
        <boxGeometry args={[w + 0.05, 0.32, 0.12]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.9} />
      </mesh>
      {/* 装饰块 */}
      {Array.from({ length: posts }).map((_, i) => (
        <mesh key={i} position={[-w / 2 + i * (w / (posts - 1)) + (posts === 1 ? 0 : 0), 0.32, d / 2 + 0.07]}>
          <boxGeometry args={[0.06, 0.18, 0.06]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  组件：门廊入口（台阶 + 柱子 + 雨棚）
// ─────────────────────────────────────────────────────────────
function Entrance({ w, d, color }: { w: number; d: number; color: string }) {
  const steps = 3;
  return (
    <group position={[0, 0, d / 2 + 0.1]}>
      {/* 台阶 */}
      {Array.from({ length: steps }).map((_, i) => (
        <mesh key={i} position={[0, i * 0.1 - 0.1, i * 0.2]} receiveShadow>
          <boxGeometry args={[w * 0.8, 0.1, 0.22]} />
          <meshStandardMaterial color="#d1d5db" roughness={0.9} />
        </mesh>
      ))}
      {/* 雨棚支柱 */}
      {[-w * 0.3, w * 0.3].map((x, i) => (
        <mesh key={i} position={[x, 1.4, 0.3]} castShadow>
          <cylinderGeometry args={[0.05, 0.06, 2.8, 8]} />
          <meshStandardMaterial color="#9ca3af" roughness={0.7} metalness={0.2} />
        </mesh>
      ))}
      {/* 雨棚顶 */}
      <mesh position={[0, 2.85, 0.42]} rotation={[-0.15, 0, 0]} castShadow>
        <boxGeometry args={[w * 0.75, 0.08, 0.7]} />
        <meshStandardMaterial color="#6b7280" roughness={0.6} metalness={0.3} />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
//  组件：水平遮阳板（现代建筑特色）
// ─────────────────────────────────────────────────────────────
function Sunshades({ floors, w, depth }: { floors: number; w: number; depth: number }) {
  const intervals = 4;
  const shades = Math.floor(floors / intervals);
  return (
    <group>
      {Array.from({ length: shades }).map((_, i) => {
        const y = i * intervals * FH + FH * 0.5;
        return (
          <mesh key={i} position={[0, y, depth / 2 + 0.1]} castShadow>
            <boxGeometry args={[w + 0.05, 0.07, 0.3]} />
            <meshStandardMaterial color="#d1d5db" roughness={0.7} metalness={0.25} />
          </mesh>
        );
      })}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
//  组件：横向线脚（古典装饰带）
// ─────────────────────────────────────────────────────────────
function Cornice({ w, d, y }: { w: number; d: number; y: number }) {
  return (
    <group>
      <mesh position={[0, y, d / 2 + 0.01]} castShadow>
        <boxGeometry args={[w + 0.08, 0.12, 0.14]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.85} />
      </mesh>
      <mesh position={[0, y, -d / 2 - 0.01]} castShadow>
        <boxGeometry args={[w + 0.08, 0.12, 0.14]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.85} />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
//  组件：檐口装饰
// ─────────────────────────────────────────────────────────────
function CorniceTop({ w, d, color }: { w: number; d: number; color: string }) {
  return (
    <group position={[0, 0, 0]}>
      {/* 檐口主体 */}
      <mesh position={[0, 0, d / 2 + 0.01]} castShadow>
        <boxGeometry args={[w + 0.12, 0.25, 0.18]} />
        <meshStandardMaterial color="#f5f5f4" roughness={0.85} />
      </mesh>
      {/* 檐口底部收边 */}
      <mesh position={[0, -0.15, d / 2 + 0.01]}>
        <boxGeometry args={[w + 0.06, 0.06, 0.12]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* 背面 */}
      <mesh position={[0, 0, -d / 2 - 0.01]} castShadow>
        <boxGeometry args={[w + 0.12, 0.25, 0.18]} />
        <meshStandardMaterial color="#f5f5f4" roughness={0.85} />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
//  组件：塔楼顶部机房/水箱
// ─────────────────────────────────────────────────────────────
function RooftopMech({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[w * 0.35, 0.7, d * 0.35]} />
        <meshStandardMaterial color="#d1d5db" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <boxGeometry args={[w * 0.38, 0.08, d * 0.38]} />
        <meshStandardMaterial color="#9ca3af" roughness={0.8} />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
//  风格1：现代办公建筑（Aral）
//  特点：玻璃幕墙 + 铝扣板 + 水平线脚
// ─────────────────────────────────────────────────────────────
function OfficeBuilding({ floors, color, facing }: {
  floors: number; color: string; facing: number;
}) {
  const bh = floors * FH;
  const w = 2.2, d = 1.8;
  const glassColor = useMemo(() => new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.65).getStyle(), [color]);

  const edges = useMemo(() => makeEdges(new THREE.BoxGeometry(w, bh, d)), [w, bh, d]);

  return (
    <group rotation={[0, facing, 0]}>
      {/* 地基裙房 */}
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.4, 0.8, d + 0.4]} />
        <meshStandardMaterial color="#9ca3af" roughness={0.85} metalness={0.1} />
      </mesh>
      {/* 主塔楼体 */}
      <mesh position={[0, 0.8 + bh / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, bh, d]} />
        <meshStandardMaterial color={glassColor} roughness={0.08} metalness={0.55} />
      </mesh>
      {/* 铝合金竖向装饰条 */}
      {[-0.8, -0.4, 0, 0.4, 0.8].map((x, i) => (
        <mesh key={i} position={[x, 0.8 + bh / 2, d / 2 + 0.01]} castShadow>
          <boxGeometry args={[0.04, bh, 0.04]} />
          <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
        </mesh>
      ))}
      {/* 横向线脚带（每4层） */}
      {Array.from({ length: Math.floor(floors / 4) }).map((_, i) => (
        <Cornice key={i} w={w} d={d} y={0.8 + i * 4 * FH + FH * 2} />
      ))}
      {/* 窗格（前后） */}
      <group position={[0, 0.8 + bh / 2, 0]}>
        <InstancedWindows floors={floors} w={w} h={bh} side="front" />
        <InstancedWindows floors={floors} w={w} h={bh} side="back" />
      </group>
      {/* 女儿墙 */}
      <group position={[0, 0.8 + bh, 0]}>
        <Parapet w={w} d={d} color={color} />
      </group>
      {/* 入口门廊 */}
      <Entrance w={w} d={d} color={color} />
      {/* 顶层机房 */}
      <group position={[0, 0.8 + bh + 0.02, 0]}>
        <RooftopMech w={w} d={d} />
      </group>
      {/* 边框 */}
      <lineSegments position={[0, 0.8 + bh / 2, 0]} geometry={edges}>
        <lineBasicMaterial color={color} transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
//  风格2：住宅楼（Caspian）
//  特点：红砖外墙 + 真实阳台 + 坡屋顶老虎窗
// ─────────────────────────────────────────────────────────────
function ResidentialBuilding({ floors, color, facing }: {
  floors: number; color: string; facing: number;
}) {
  const bh = floors * FH;
  const w = 2.4, d = 2.0;
  const balconyFloors = Array.from({ length: Math.floor(floors / 3) }, (_, i) => i * 3 + 2);
  const edges = useMemo(() => makeEdges(new THREE.BoxGeometry(w, bh, d)), [w, bh, d]);

  return (
    <group rotation={[0, facing, 0]}>
      {/* 地基 */}
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.3, 0.7, d + 0.3]} />
        <meshStandardMaterial color="#92400e" roughness={0.95} />
      </mesh>
      {/* 主楼体 */}
      <mesh position={[0, 0.7 + bh / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, bh, d]} />
        <meshStandardMaterial color="#b45309" roughness={0.92} />
      </mesh>
      {/* 砖缝水平线（每层） */}
      {Array.from({ length: floors }).map((_, i) => (
        <mesh key={i} position={[0, 0.7 + i * FH + 0.01, d / 2 + 0.01]}>
          <boxGeometry args={[w + 0.01, 0.012, 0.012]} />
          <meshStandardMaterial color="#78350f" />
        </mesh>
      ))}
      {/* 窗格 */}
      <group position={[0, 0.7 + bh / 2, 0]}>
        <InstancedWindows floors={floors} w={w} h={bh} side="front" />
        <InstancedWindows floors={floors} w={w} h={bh} side="back" />
        {/* 左右侧窗（少一些） */}
        <InstancedWindows floors={Math.floor(floors * 0.8)} w={d} h={bh * 0.8} side="left" />
        <InstancedWindows floors={Math.floor(floors * 0.8)} w={d} h={bh * 0.8} side="right" />
      </group>
      {/* 阳台（仅正面） */}
      {balconyFloors.map((f) => (
        <BalconyRow key={f} floor={f} w={w} depth={d} color={color} />
      ))}
      {/* 女儿墙 */}
      <group position={[0, 0.7 + bh, 0]}>
        <Parapet w={w} d={d} color={color} />
      </group>
      {/* 入口 */}
      <Entrance w={w} d={d} color={color} />
      {/* 边框 */}
      <lineSegments position={[0, 0.7 + bh / 2, 0]} geometry={edges}>
        <lineBasicMaterial color={color} transparent opacity={0.45} />
      </lineSegments>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
//  风格3：摩天塔楼（Michigan）
//  特点：超高层 + 极简玻璃幕墙 + 顶部皇冠
// ─────────────────────────────────────────────────────────────
function TowerBuilding({ floors, color, facing }: {
  floors: number; color: string; facing: number;
}) {
  const bh = floors * FH;
  const w = 1.8, d = 1.8;
  const glassColor = useMemo(() => new THREE.Color("#d1d5db").lerp(new THREE.Color("#ffffff"), 0.5).getStyle(), []);
  const edges = useMemo(() => makeEdges(new THREE.BoxGeometry(w, bh, d)), [w, bh, d]);

  return (
    <group rotation={[0, facing, 0]}>
      {/* 超宽基底 */}
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.8, 1.2, d + 0.8]} />
        <meshStandardMaterial color="#4b5563" roughness={0.85} metalness={0.2} />
      </mesh>
      {/* 主塔体 */}
      <mesh position={[0, 0.6 + 0.6 + bh / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, bh, d]} />
        <meshStandardMaterial color={glassColor} roughness={0.06} metalness={0.6} />
      </mesh>
      {/* 竖向金属肋条 */}
      {[-0.6, -0.2, 0.2, 0.6].map((x, i) => (
        <mesh key={i} position={[x, 0.6 + 0.6 + bh / 2, d / 2 + 0.01]} castShadow>
          <boxGeometry args={[0.03, bh, 0.03]} />
          <meshStandardMaterial color="#374151" metalness={0.85} roughness={0.15} />
        </mesh>
      ))}
      {/* 横向带（每6层） */}
      {Array.from({ length: Math.floor(floors / 6) }).map((_, i) => (
        <mesh key={i} position={[0, 0.6 + 0.6 + i * 6 * FH + FH * 3, d / 2 + 0.01]} castShadow>
          <boxGeometry args={[w + 0.02, 0.08, 0.06]} />
          <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.2} />
        </mesh>
      ))}
      {/* 窗格 */}
      <group position={[0, 0.6 + 0.6 + bh / 2, 0]}>
        <InstancedWindows floors={floors} w={w} h={bh} side="front" />
        <InstancedWindows floors={floors} w={w} h={bh} side="back" />
        <InstancedWindows floors={Math.floor(floors * 0.9)} w={d} h={bh * 0.9} side="left" />
        <InstancedWindows floors={Math.floor(floors * 0.9)} w={d} h={bh * 0.9} side="right" />
      </group>
      {/* 顶层皇冠 */}
      <group position={[0, 0.6 + 0.6 + bh + 0.05, 0]}>
        <mesh castShadow>
          <boxGeometry args={[w + 0.15, 0.5, d + 0.15]} />
          <meshStandardMaterial color="#9ca3af" roughness={0.7} metalness={0.3} />
        </mesh>
        {/* 皇冠顶部尖顶 */}
        <mesh position={[0, 0.5, 0]}>
          <coneGeometry args={[Math.min(w, d) * 0.4, 0.6, 4]} />
          <meshStandardMaterial color={color} metalness={0.8} roughness={0.15} />
        </mesh>
        {/* 皇冠水平环 */}
        <mesh position={[0, 0.25, 0]}>
          <torusGeometry args={[Math.min(w, d) * 0.45, 0.04, 8, 4]} />
          <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.2} />
        </mesh>
      </group>
      {/* 边框 */}
      <lineSegments position={[0, 0.6 + 0.6 + bh / 2, 0]} geometry={edges}>
        <lineBasicMaterial color="#374151" transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
//  风格4：现代白色建筑（Superior）
//  特点：白色混凝土 + 水平遮阳板 + 大面积落地窗
// ─────────────────────────────────────────────────────────────
function ModernBuilding({ floors, color, facing }: {
  floors: number; color: string; facing: number;
}) {
  const bh = floors * FH;
  const w = 2.0, d = 1.6;
  const edges = useMemo(() => makeEdges(new THREE.BoxGeometry(w, bh, d)), [w, bh, d]);

  return (
    <group rotation={[0, facing, 0]}>
      {/* 基座 */}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.3, 1.0, d + 0.3]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.88} />
      </mesh>
      {/* 主塔体 */}
      <mesh position={[0, 0.5 + 0.5 + bh / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, bh, d]} />
        <meshStandardMaterial color="#fafafa" roughness={0.82} metalness={0.08} />
      </mesh>
      {/* 水平遮阳板 */}
      <Sunshades floors={floors} w={w} d={d} />
      {/* 大面积落地窗带（每层一个高窗） */}
      <group position={[0, 0.5 + 0.5 + bh / 2, d / 2 + 0.01]}>
        {Array.from({ length: floors }).map((_, f) => (
          <mesh key={f} position={[0, f * FH + FH * 0.5, 0]}>
            <boxGeometry args={[w * 0.85, FH * 0.72, 0.06]} />
            <meshStandardMaterial color="#7dd3fc" transparent opacity={0.55} roughness={0.05} metalness={0.2} />
          </mesh>
        ))}
      </group>
      {/* 窗框竖条 */}
      {[-w * 0.3, w * 0.3].map((x, i) => (
        <group key={i} position={[x, 0.5 + 0.5 + bh / 2, d / 2 + 0.04]}>
          {Array.from({ length: floors }).map((_, f) => (
            <mesh key={f} position={[0, f * FH + FH * 0.5, 0]}>
              <boxGeometry args={[0.04, FH * 0.78, 0.03]} />
              <meshStandardMaterial color={color} metalness={0.7} roughness={0.2} />
            </mesh>
          ))}
        </group>
      ))}
      {/* 檐口 */}
      <group position={[0, 0.5 + 0.5 + bh, 0]}>
        <CorniceTop w={w} d={d} color={color} />
      </group>
      {/* 入口雨棚 */}
      <Entrance w={w} d={d} color={color} />
      {/* 边框 */}
      <lineSegments position={[0, 0.5 + 0.5 + bh / 2, 0]} geometry={edges}>
        <lineBasicMaterial color={color} transparent opacity={0.45} />
      </lineSegments>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
//  风格5：古典建筑（Victoria）
//  特点：石材立面 + 多立克柱式 + 山形墙
// ─────────────────────────────────────────────────────────────
function ClassicalBuilding({ floors, color, facing }: {
  floors: number; color: string; facing: number;
}) {
  const bh = floors * FH;
  const w = 2.6, d = 2.2;
  const colCount = 5;
  const colSpacing = (w - 0.3) / (colCount - 1);
  const colH = bh + 1.2;
  const edges = useMemo(() => makeEdges(new THREE.BoxGeometry(w, bh, d)), [w, bh, d]);

  return (
    <group rotation={[0, facing, 0]}>
      {/* 台阶基座 */}
      {[-0.15, 0.15].map((z, level) => (
        <mesh key={level} position={[0, level * 0.12 - 0.06, z]} receiveShadow>
          <boxGeometry args={[w + 0.5 - level * 0.25, 0.24, d + 0.4 - level * 0.2]} />
          <meshStandardMaterial color="#d6d3d1" roughness={0.95} />
        </mesh>
      ))}
      {/* 柱廊楼体 */}
      <mesh position={[0, colH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, bh, d]} />
        <meshStandardMaterial color="#f5f5f4" roughness={0.9} />
      </mesh>
      {/* 多立克柱 */}
      {Array.from({ length: colCount }).map((_, i) => (
        <group key={i} position={[-w / 2 + colSpacing * i, 0, d / 2 + 0.25]}>
          {/* 柱础 */}
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.14, 0.16, 0.24, 12]} />
            <meshStandardMaterial color="#d4d4d4" roughness={0.9} />
          </mesh>
          {/* 柱身 */}
          <mesh position={[0, 0.24 + colH / 2, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.12, colH - 0.48, 12]} />
            <meshStandardMaterial color="#e5e5e5" roughness={0.85} />
          </mesh>
          {/* 柱头 */}
          <mesh position={[0, colH - 0.08, 0]}>
            <cylinderGeometry args={[0.16, 0.1, 0.16, 12]} />
            <meshStandardMaterial color="#d4d4d4" roughness={0.9} />
          </mesh>
        </group>
      ))}
      {/* 柱廊横梁 */}
      <mesh position={[0, colH + 0.04, d / 2 + 0.25]} castShadow>
        <boxGeometry args={[w + 0.05, 0.25, 0.28]} />
        <meshStandardMaterial color="#d4d4d4" roughness={0.88} />
      </mesh>
      {/* 窗格 */}
      <group position={[0, colH / 2, 0]}>
        <InstancedWindows floors={floors} w={w} h={bh} side="front" />
        <InstancedWindows floors={floors} w={w} h={bh} side="back" />
      </group>
      {/* 檐口 */}
      <group position={[0, colH + 0.17, 0]}>
        <CorniceTop w={w} d={d} color={color} />
      </group>
      {/* 山形墙 / 三角楣饰 */}
      <mesh position={[0, colH + 0.17 + 0.35, 0]} castShadow>
        <boxGeometry args={[w + 0.14, 0.7, d + 0.14]} />
        <meshStandardMaterial color="#e5e5e5" roughness={0.9} />
      </mesh>
      {/* 三角形山花（正面） */}
      <mesh position={[0, colH + 0.17 + 0.35 + 0.35, d / 2 + 0.08]} castShadow>
        <boxGeometry args={[w + 0.16, 0.04, 0.06]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      {/* 边框 */}
      <lineSegments position={[0, colH / 2, 0]} geometry={edges}>
        <lineBasicMaterial color={color} transparent opacity={0.4} />
      </lineSegments>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
//  建筑总模型
// ─────────────────────────────────────────────────────────────
function BuildingModel({ position, name, electricity, floors, accentColor, style, facing, onClick, isSelected }: {
  position: [number, number, number];
  name: string;
  electricity: number;
  floors: number;
  accentColor: string;
  style: "office" | "residential" | "tower" | "modern" | "classical";
  facing: number;
  onClick: () => void;
  isSelected: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const bh = floors * FH;
  const baseY = floors * FH / 2;

  useFrame(({ clock }) => {
    if (groupRef.current && !isSelected) {
      groupRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.12 + position[0]) * 0.006;
    }
  });

  return (
    <group ref={groupRef} position={position} onClick={onClick}>
      {style === "office" && <OfficeBuilding floors={floors} color={accentColor} facing={facing} />}
      {style === "residential" && <ResidentialBuilding floors={floors} color={accentColor} facing={facing} />}
      {style === "tower" && <TowerBuilding floors={floors} color={accentColor} facing={facing} />}
      {style === "modern" && <ModernBuilding floors={floors} color={accentColor} facing={facing} />}
      {style === "classical" && <ClassicalBuilding floors={floors} color={accentColor} facing={facing} />}

      {/* 选中光圈 */}
      {isSelected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.6, 2.2, 32]} />
          <meshBasicMaterial color={accentColor} transparent opacity={0.18} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* 名称标牌 */}
      <Html position={[0, -0.3, 0]} center transform occlude={false}>
        <div className={cn(
          "pointer-events-none whitespace-nowrap rounded border px-2.5 py-1 text-xs font-semibold shadow-sm",
          isSelected ? "border-zinc-900 bg-white text-zinc-900" : "border-zinc-300 bg-white/90 text-zinc-800"
        )}>
          {name}
        </div>
      </Html>

      {/* 能耗悬浮卡 */}
      <Html position={[0, bh + 1.8, 0]} center occlude={false}>
        <div className={cn(
          "pointer-events-none rounded-lg border px-3 py-2 shadow-sm transition-all duration-300",
          isSelected ? "scale-110 border-zinc-900 bg-white" : "border-zinc-200 bg-white/95"
        )}>
          <p className="whitespace-nowrap text-sm font-bold text-zinc-900">{electricity.toFixed(1)} kW</p>
          <p className="text-center text-xs text-zinc-500">{floors} 层</p>
        </div>
      </Html>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
//  能源中心
// ─────────────────────────────────────────────────────────────
function PowerStation() {
  const coreRef = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => { if (coreRef.current) coreRef.current.rotation.y = clock.getElapsedTime() * 0.2; });

  return (
    <group position={[0, 0, 0]}>
      {/* 圆形平台基座 */}
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <cylinderGeometry args={[1.3, 1.5, 0.2, 12]} />
        <meshStandardMaterial color="#d4d4d8" roughness={0.88} />
      </mesh>
      {/* 八边形底座 */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.9, 1.0, 0.5, 8]} />
        <meshStandardMaterial color="#9ca3af" roughness={0.8} metalness={0.15} />
      </mesh>
      {/* 旋转核心 */}
      <group ref={coreRef} position={[0, 3.0, 0]}>
        <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.2}>
          <mesh castShadow>
            <octahedronGeometry args={[0.5, 0]} />
            <meshStandardMaterial color="#fafafa" emissive="#18181b" emissiveIntensity={0.18} metalness={0.72} roughness={0.18} />
          </mesh>
          {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((a, i) => (
            <mesh key={i} rotation={[0, a, 0]}>
              <torusGeometry args={[0.68, 0.04, 10, 28]} />
              <meshBasicMaterial color="#52525b" transparent opacity={0.4} />
            </mesh>
          ))}
        </Float>
      </group>
      {/* 外圈轨道 */}
      <mesh position={[0, 1.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.0, 0.05, 8, 32]} />
        <meshStandardMaterial color="#6b7280" roughness={0.7} metalness={0.35} />
      </mesh>
      <EnergyParticles position={[0, 3.0, 0]} />
      <Html position={[0, 0.55, 1.5]} center transform occlude={false}>
        <div className="pointer-events-none rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-900 shadow-sm">
          能源中心
        </div>
      </Html>
    </group>
  );
}

function EnergyParticles({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Points>(null!);
  const COUNT = 50;
  const geo = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 0.4;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 3;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame(() => { if (ref.current) ref.current.rotation.y += 0.01; });
  return (
    <points ref={ref} position={position} geometry={geo}>
      <pointsMaterial size={0.055} color="#52525b" transparent opacity={0.65} sizeAttenuation />
    </points>
  );
}

// ─────────────────────────────────────────────────────────────
//  能量流线
// ─────────────────────────────────────────────────────────────
function EnergyFlowLines() {
  const curves = useMemo(() =>
    ENERGY_LINKS.map((link, i) => {
      const s = new THREE.Vector3(...link.source);
      const e = new THREE.Vector3(...link.target);
      const mid = new THREE.Vector3().lerpVectors(s, e, 0.5);
      mid.y += 1.5 + Math.sin(i * 1.4) * 0.6;
      return { pts: new THREE.QuadraticBezierCurve3(s, mid, e).getPoints(50), v: link.value, s, e, mid };
    }), []);

  return (
    <group>
      {curves.map(({ pts, v, s, e, mid }, i) => (
        <group key={i}>
          <Line points={pts} color="#71717a" lineWidth={Math.max(1.5, v / 28)} transparent opacity={0.4} />
          <EnergyDot start={s} end={e} mid={mid} delay={i * 0.55} />
        </group>
      ))}
    </group>
  );
}

function EnergyDot({ start, end, mid, delay }: {
  start: THREE.Vector3; end: THREE.Vector3; mid: THREE.Vector3; delay: number;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(start, mid, end), [start, mid, end]);
  useFrame(({ clock }) => {
    if (ref.current) {
      const t = ((clock.getElapsedTime() * 0.38 + delay) % 1);
      ref.current.position.copy(curve.getPoint(t));
    }
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.07, 8, 8]} />
      <meshBasicMaterial color="#18181b" />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────
//  地面
// ─────────────────────────────────────────────────────────────
function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#f4f4f5" metalness={0.05} roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <planeGeometry args={[60, 60, 60, 60]} />
        <meshBasicMaterial color="#d4d4d8" transparent opacity={0.28} wireframe />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
//  场景
// ─────────────────────────────────────────────────────────────
function Scene({ selectedBuilding, onBuildingSelect }: {
  selectedBuilding: string | null;
  onBuildingSelect: (name: string | null) => void;
}) {
  return (
    <>
      <color attach="background" args={["#fafafa"]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[18, 28, 12]} intensity={1.15} castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5} shadow-camera-far={100}
        shadow-camera-left={-35} shadow-camera-right={35}
        shadow-camera-top={35} shadow-camera-bottom={-35}
      />
      <directionalLight position={[-12, 10, -10]} intensity={0.28} />
      <hemisphereLight args={["#ffffff", "#e4e4e7", 0.48]} />

      <Ground />
      <PowerStation />
      <EnergyFlowLines />

      {BUILDINGS.map((b) => (
        <BuildingModel
          key={b.name}
          position={b.position}
          name={b.name}
          electricity={b.electricity}
          floors={b.floors}
          accentColor={b.accentColor}
          style={b.style}
          facing={b.facing}
          isSelected={selectedBuilding === b.name}
          onClick={() => onBuildingSelect(selectedBuilding === b.name ? null : b.name)}
        />
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  主组件
// ─────────────────────────────────────────────────────────────
export function VisualizationPage() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<"3d" | "sankey" | "both">("both");
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [showVoice, setShowVoice] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const selectedBuildingData = BUILDINGS.find((b) => b.name === selectedBuilding);

  return (
    <div ref={containerRef} className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* 子工具栏 */}
      <motion.div
        className="fixed top-20 left-0 right-0 z-40 border-b border-zinc-200 bg-white/90 px-6 py-3 backdrop-blur-md"
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        <div className="mx-auto flex max-w-[1400px] items-center justify-between">
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            <h1 className="text-lg font-bold tracking-tight text-zinc-900 md:text-xl">可视化大屏</h1>
            <div className="flex gap-1 rounded-lg border border-zinc-200 bg-zinc-100/80 p-1">
              {([
                { id: "both", icon: BarChart3, label: "综合" },
                { id: "3d", icon: Box, label: "3D模型" },
                { id: "sankey", icon: Maximize2, label: "流向图" },
              ] as const).map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setViewMode(id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-all",
                    viewMode === id
                      ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                      : "text-zinc-500 hover:bg-white/80 hover:text-zinc-900"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowVoice(!showVoice)}
              className={cn(
                "rounded-full text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                showVoice && "bg-zinc-900 text-white hover:bg-zinc-800 hover:text-white"
              )}
            >
              {showVoice ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className="rounded-full text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            >
              {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* 语音面板 */}
      <AnimatePresence>
        {showVoice && (
          <motion.div
            initial={{ x: -400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -400, opacity: 0 }}
            className="fixed left-6 top-36 z-50 w-96 max-w-[calc(100vw-3rem)]"
          >
            <div className="rounded-2xl border border-zinc-200 bg-white shadow-xl backdrop-blur-md">
              <div className="border-b border-zinc-100 p-4">
                <h3 className="font-medium text-zinc-900">语音助手</h3>
                <p className="mt-1 text-xs text-zinc-500">说出您的命令或问题</p>
              </div>
              <div className="p-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <button
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-white transition-all hover:bg-zinc-800"
                      onClick={() => alert("语音输入：请在右上角「AI助手」中使用语音功能")}
                    >
                      <Mic className="h-5 w-5" />
                    </button>
                    <span className="text-sm text-zinc-600">点击麦克风开始语音输入</span>
                  </div>
                  <p className="px-2 text-xs text-zinc-500">提示：请使用右上角「AI助手」按钮进行语音输入</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 主内容区 */}
      <div className="px-6 pb-8 pt-36">
        <div className={cn("grid gap-6", viewMode === "both" ? "lg:grid-cols-2" : "grid-cols-1")}>
          {/* 3D视图 */}
          {viewMode !== "sankey" && (
            <motion.div
              className={cn(
                "relative min-h-[560px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm",
                "h-[600px] lg:h-[calc(100vh-11rem)]"
              )}
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <Canvas
                shadows
                dpr={[1, 2]}
                className="!h-full !w-full"
                style={{ width: "100%", height: "100%", display: "block" }}
                gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
                camera={{ position: [0, 16, 26], fov: 42, near: 0.1, far: 200 }}
              >
                <OrbitControls
                  enablePan={true}
                  enableZoom={true}
                  enableRotate={true}
                  autoRotate={!selectedBuilding}
                  autoRotateSpeed={0.18}
                  minDistance={6}
                  maxDistance={50}
                  minPolarAngle={0.12}
                  maxPolarAngle={Math.PI / 2.1}
                  target={[0, 4, 0]}
                />
                <Scene selectedBuilding={selectedBuilding} onBuildingSelect={setSelectedBuilding} />
              </Canvas>

              {/* 底部统计条 */}
              <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex justify-center">
                <div className="flex flex-wrap justify-center gap-6 rounded-xl border border-zinc-200 bg-white/95 p-4 shadow-sm backdrop-blur-sm">
                  {([
                    { label: "总装机容量", value: "454.3", unit: "kW" },
                    { label: "建筑数量", value: "5", unit: "栋" },
                    { label: "总层数", value: "104", unit: "层" },
                    { label: "今日用电", value: "2,847", unit: "kWh" },
                  ] as const).map((item) => (
                    <div key={item.label} className="min-w-[100px] text-center">
                      <p className="text-xs text-zinc-500">{item.label}</p>
                      <p className="text-2xl font-bold text-zinc-900">
                        {item.value}
                        <span className="ml-1 text-xs font-normal text-zinc-500">{item.unit}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* 桑基图 */}
          {viewMode !== "3d" && (
            <motion.div
              className={cn(
                "overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-sm",
                "h-auto lg:h-[calc(100vh-11rem)]"
              )}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="p-6">
                <SankeyChart />
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* 选中建筑详情面板 */}
      {selectedBuilding && selectedBuildingData && (
        <motion.div
          className="fixed right-6 top-36 z-40 w-80 max-w-[calc(100vw-3rem)] rounded-2xl border border-zinc-200 bg-white shadow-xl backdrop-blur-md"
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
        >
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 rounded" style={{ backgroundColor: selectedBuildingData.accentColor }} />
                <h3 className="text-xl font-bold text-zinc-900">{selectedBuildingData.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBuilding(null)}
                className="text-2xl text-zinc-400 hover:text-zinc-900"
              >
                &times;
              </button>
            </div>

            <div className="mb-3 rounded-xl border border-zinc-100 bg-zinc-50 p-4">
              <p className="mb-1 text-xs text-zinc-500">建筑信息</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-zinc-200 bg-white p-2">
                  <p className="text-xs text-zinc-500">层数</p>
                  <p className="font-bold text-zinc-900">{selectedBuildingData.floors} 层</p>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-white p-2">
                  <p className="text-xs text-zinc-500">建筑风格</p>
                  <p className="font-bold text-zinc-900 capitalize">
                    {{ office: "办公", residential: "住宅", tower: "塔楼", modern: "现代", classical: "古典" }[selectedBuildingData.style]}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {([
                { label: "电力消耗", value: selectedBuildingData.electricity.toFixed(2), unit: "kW" },
                { label: "HVAC 能耗", value: selectedBuildingData.hvac.toFixed(0), unit: "kWh" },
                { label: "能效比", value: (selectedBuildingData.electricity / (selectedBuildingData.hvac / 1000)).toFixed(3), unit: "kW/kWh" },
              ] as const).map((item) => (
                <div key={item.label} className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
                  <p className="mb-1 text-xs text-zinc-500">{item.label}</p>
                  <p className="text-2xl font-bold text-zinc-900">
                    {item.value}
                    <span className="ml-1 text-sm font-normal text-zinc-500">{item.unit}</span>
                  </p>
                </div>
              ))}
            </div>

            <Button
              className="mt-4 w-full bg-zinc-900 text-white hover:bg-zinc-800"
              onClick={() => { setSelectedBuilding(null); setViewMode("sankey"); }}
            >
              查看详细分析
            </Button>
          </div>
        </motion.div>
      )}

      {/* 图例 */}
      <div className="fixed bottom-6 left-6 z-30 rounded-xl border border-zinc-200 bg-white/95 p-4 shadow-sm backdrop-blur-sm">
        <h4 className="mb-3 text-sm font-medium text-zinc-900">建筑图例</h4>
        <div className="grid grid-cols-2 gap-3">
          {BUILDINGS.map((b) => (
            <div key={b.name} className="flex items-center gap-2">
              <div className="h-3 w-3 rounded" style={{ backgroundColor: b.accentColor }} />
              <span className="text-xs text-zinc-600">
                {b.name} · {
                  { office: "办公", residential: "住宅", tower: "塔楼", modern: "现代", classical: "古典" }[b.style]
                }
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-zinc-900" />
            <span className="text-xs text-zinc-600">能源中心</span>
          </div>
        </div>
      </div>
    </div>
  );
}
