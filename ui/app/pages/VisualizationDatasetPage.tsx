import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, ThreeEvent, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { SankeyChart } from "../components/SankeyChart";

type CsvRow = {
  Time: string;
  Building_ID: string;
  Building_Type: string;
  T_core: number;
  T_peri: number;
  T_roof: number;
  T_avg: number;
  E_core: number;
  E_peri: number;
  E_roof: number;
  E_total: number;
  Text: number;
  GHI: number;
};

type BuildingMeta = {
  buildingId: string;
  buildingType: string;
};

type BuildingSnapshot = {
  buildingId: string;
  buildingType: string;
  time: string;
  eCore: number;
  ePeri: number;
  eRoof: number;
  eTotal: number;
  tCore: number;
  tPeri: number;
  tRoof: number;
  tAvg: number;
  /** 室外温度 Text（℃） */
  outdoorTemp: number;
  /** 水平面总辐射 GHI（W/m²） */
  ghi: number;
};

type SankeyData = {
  nodes: Array<{ name: string; color: string }>;
  links: Array<{ source: number; target: number; value: number }>;
};

type PrescriptionItem = {
  title: string;
  priority: "high" | "medium" | "low";
  expectedReductionPct: number;
  costLevel: "low" | "medium" | "high";
};

const TYPE_COLOR: Record<string, string> = {
  Office_Small: "#3b82f6",
  Office_Medium: "#2563eb",
  Residential: "#22c55e",
  School: "#f59e0b",
  Hospital: "#ef4444",
  Hotel: "#8b5cf6",
  Shopping_Mall: "#ea580c",
  Factory: "#64748b",
};

const TYPE_LABEL: Record<string, string> = {
  Office_Small: "小型办公",
  Office_Medium: "中型办公",
  Residential: "住宅",
  School: "学校",
  Hospital: "医院",
  Hotel: "酒店",
  Shopping_Mall: "商业综合体",
  Factory: "工厂",
};

const TYPE_ICON: Record<string, string> = {
  Office_Small: "办",
  Office_Medium: "办",
  Residential: "住",
  School: "学",
  Hospital: "医",
  Hotel: "酒",
  Shopping_Mall: "商",
  Factory: "厂",
};

const TYPE_HEIGHT: Record<string, number> = {
  Office_Small: 3.5,    // 小办公楼 - 中等
  Office_Medium: 5.2,   // 中型办公 - 高层
  Residential: 4.0,     // 住宅 - 中高层
  School: 2.8,          // 学校 - 低矮
  Hospital: 4.5,        // 医院 - 高层
  Hotel: 5.0,           // 酒店 - 高层
  Shopping_Mall: 3.2,   // 商业 - 低矮
  Factory: 3.8,         // 工厂 - 中等
};

const DEFAULT_COLOR = "#64748b";
const GRID_EMISSION_FACTOR = 0.524;
const _dummy = new THREE.Object3D();

const TYPE_EFFICIENCY_BASELINE: Record<string, number> = {
  Office_Small: 20,
  Office_Medium: 24,
  Residential: 16,
  School: 15,
  Hospital: 26,
  Hotel: 22,
  Shopping_Mall: 21,
  Factory: 23,
};

const toNumber = (value: string) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

function parseHourFromTime(timeStr: string): number {
  const m = timeStr.match(/\s(\d{1,2}):/);
  if (m) {
    const h = parseInt(m[1], 10);
    return Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 12;
  }
  return 12;
}

function getSimulatedTariff(hour: number): { yuanPerKwh: number; isPeak: boolean; isValley: boolean; label: string } {
  const isPeak = (hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 21);
  const isValley = hour >= 23 || hour <= 7;
  const yuanPerKwh = isPeak ? 1.15 : isValley ? 0.32 : 0.68;
  const label = isPeak ? "峰段" : isValley ? "谷段" : "平段";
  return { yuanPerKwh, isPeak, isValley, label };
}

function buildZoneDiagnosisPrompt(snapshot: BuildingSnapshot, zone: "core" | "perimeter" | "roof", zoneCn: string): string {
  const typeName = TYPE_LABEL[snapshot.buildingType] || snapshot.buildingType;
  const total = Math.max(snapshot.eTotal, 1e-6);
  const periShare = snapshot.ePeri / total;
  const ghiNote =
    snapshot.ghi > 500 && periShare > 0.35
      ? "\n（环境因素：GHI 较高且周边区能耗占比较大，可审计围护遮阳与保温是否达标。）"
      : "";
  return (
    `你是建筑能源管理专家。请针对以下分区给出**诊断结论**与**可执行处方**（分条，含运维与改造）：\n` +
    `- 建筑：${snapshot.buildingId}（${typeName}）\n` +
    `- 时间切片：${snapshot.time}\n` +
    `- 用户点击的分区：${zoneCn}\n` +
    `- 室外温度 Text=${snapshot.outdoorTemp.toFixed(1)}℃，太阳辐射 GHI=${snapshot.ghi.toFixed(0)} W/m²\n` +
    `- 能耗(kW)：核心区=${snapshot.eCore.toFixed(2)}，周边区=${snapshot.ePeri.toFixed(2)}，屋面=${snapshot.eRoof.toFixed(2)}，合计=${snapshot.eTotal.toFixed(2)}\n` +
    `- 室内(℃)：核心=${snapshot.tCore.toFixed(1)}，周边=${snapshot.tPeri.toFixed(1)}，屋面=${snapshot.tRoof.toFixed(1)}，平均=${snapshot.tAvg.toFixed(1)}${ghiNote}\n` +
    `请结合 GB 55015 等建筑节能思路作答。`
  );
}

const buildingSeed = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

function parseCsv(content: string): CsvRow[] {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length <= 1) {
    return [];
  }

  const headers = lines[0].split(",");
  const indexByName: Record<string, number> = {};
  headers.forEach((header, index) => {
    indexByName[header] = index;
  });

  const required = [
    "Time",
    "Building_ID",
    "Building_Type",
    "T_core",
    "T_peri",
    "T_roof",
    "T_avg",
    "E_core",
    "E_peri",
    "E_roof",
    "E_total",
    "Text",
    "GHI",
  ];

  for (const field of required) {
    if (indexByName[field] === undefined) {
      throw new Error(`CSV 缺少字段: ${field}`);
    }
  }

  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return {
      Time: cells[indexByName.Time],
      Building_ID: cells[indexByName.Building_ID],
      Building_Type: cells[indexByName.Building_Type],
      T_core: toNumber(cells[indexByName.T_core]),
      T_peri: toNumber(cells[indexByName.T_peri]),
      T_roof: toNumber(cells[indexByName.T_roof]),
      T_avg: toNumber(cells[indexByName.T_avg]),
      E_core: toNumber(cells[indexByName.E_core]),
      E_peri: toNumber(cells[indexByName.E_peri]),
      E_roof: toNumber(cells[indexByName.E_roof]),
      E_total: toNumber(cells[indexByName.E_total]),
      Text: toNumber(cells[indexByName.Text]),
      GHI: toNumber(cells[indexByName.GHI]),
    };
  });
}

function createUrbanLayout(catalog: BuildingMeta[]) {
  const typeAnchor: Record<string, [number, number, number]> = {
    Office_Medium: [-10.5, 0, -9.8],
    Office_Small: [-6.2, 0, -6.8],
    Shopping_Mall: [0.4, 0, 3.8],
    Hotel: [3.0, 0, 0.6],
    Hospital: [9.2, 0, -9.1],
    Residential: [9.4, 0, 9.1],
    School: [5.8, 0, 11.2],
    Factory: [-10.8, 0, 9.8],
  };

  const typePattern: Record<string, Array<[number, number, number]>> = {
    Office_Medium: [
      [0, 0, 0],
      [2.8, 0, 0.5],
      [-2.6, 0, 0.7],
      [1.2, 0, -2.5],
      [-1.4, 0, -2.3],
      [4.1, 0, -1.1],
    ],
    Office_Small: [
      [0, 0, 0],
      [2.4, 0, 1.1],
      [2.3, 0, -1.7],
      [-2.2, 0, 1.0],
      [-2.4, 0, -1.3],
    ],
    Hotel: [
      [0, 0, 0],
      [-1.9, 0, 1.3],
      [2.0, 0, -1.3],
      [0.2, 0, 2.2],
    ],
    Shopping_Mall: [
      [0, 0, 0],
      [3.6, 0, 0.8],
      [-3.6, 0, 0.8],
      [1.6, 0, -2.2],
      [-1.6, 0, -2.2],
    ],
    Residential: [
      [0, 0, 0],
      [2.0, 0, 1.4],
      [4.2, 0, 2.0],
      [6.4, 0, 2.5],
      [-2.2, 0, 1.1],
      [-4.3, 0, 1.8],
      [1.3, 0, -1.7],
      [3.6, 0, -1.1],
    ],
    School: [
      [0, 0, 0],
      [2.8, 0, 0.8],
      [-2.7, 0, 0.5],
      [0.5, 0, -2.5],
    ],
    Hospital: [
      [0, 0, 0],
      [2.5, 0, 0.5],
      [-2.5, 0, 0.7],
      [0.3, 0, -2.4],
      [3.9, 0, -1.5],
    ],
    Factory: [
      [0, 0, 0],
      [3.0, 0, -0.2],
      [-3.0, 0, 0.4],
      [1.2, 0, 2.4],
      [-1.4, 0, 2.2],
    ],
  };

  const grouped = new Map<string, BuildingMeta[]>();
  for (const item of catalog) {
    const list = grouped.get(item.buildingType) || [];
    list.push(item);
    grouped.set(item.buildingType, list);
  }

  const positionMap = new Map<string, [number, number, number]>();
  for (const [type, items] of grouped.entries()) {
    const center = typeAnchor[type] || [0, 0, 0];
    const pattern = typePattern[type] || [[0, 0, 0]];
    items.sort((a, b) => a.buildingId.localeCompare(b.buildingId));
    items.forEach((item, index) => {
      const slot = pattern[index % pattern.length];
      const ring = Math.floor(index / pattern.length);
      const drift = ring * 1.7;
      const x = center[0] + slot[0] + (index % 2 === 0 ? drift : -drift * 0.6);
      const z = center[2] + slot[2] + (index % 3 === 0 ? drift * 0.35 : -drift * 0.2);
      positionMap.set(item.buildingId, [x, 0, z]);
    });
  }

  return positionMap;
}

function TypeBuilding({ type, color, night }: { type: string; color: string; night: boolean }) {
  const h = TYPE_HEIGHT[type] || 3;
  const glass = "#e0f2fe";
  const edgeRadius = 0.08;

  if (type === "Office_Medium") {
    const glassEmissive = night ? 0.8 : 0.15;
    const glassOpacity = night ? 0.75 : 0.65;

    return (
      <group>
        {/* 主体 - 玻璃幕墙办公楼 */}
        <RoundedBox args={[1.8, h, 1.55]} radius={edgeRadius} smoothness={4} position={[0, h / 2, 0]} castShadow>
          <meshStandardMaterial color={color} roughness={0.18} metalness={0.5} />
        </RoundedBox>

        {/* 底层基座 */}
        <RoundedBox args={[2.2, 0.44, 1.9]} radius={edgeRadius} smoothness={4} position={[0, 0.22, 0]}>
          <meshStandardMaterial color="#334155" roughness={0.42} metalness={0.58} />
        </RoundedBox>

        {/* 玻璃幕墙 - 前后面 - 大面积玻璃分格，夜间发光 */}
        {[-0.58, 0, 0.58].map((x, i) => (
          <group key={`glass-front-${i}`}>
            {/* 竖向玻璃肋 */}
            <mesh position={[x, h * 0.5, 0.78]}>
              <boxGeometry args={[0.06, h * 0.85, 0.02]} />
              <meshStandardMaterial color="#bae6fd" transparent opacity={glassOpacity} roughness={0.06} metalness={0.22} emissive="#38bdf8" emissiveIntensity={glassEmissive} />
            </mesh>
            {/* 横向分格线 */}
            {[0.15, 0.3, 0.45, 0.6, 0.75, 0.88].map((yRatio, j) => (
              <mesh key={`h-line-${j}`} position={[x, h * yRatio, 0.79]}>
                <boxGeometry args={[0.04, 0.015, 0.025]} />
                <meshStandardMaterial color="#1e3a5f" metalness={0.6} roughness={0.3} />
              </mesh>
            ))}
          </group>
        ))}

        {/* 玻璃幕墙 - 左右侧，夜间发光 */}
        {[-0.62, 0, 0.62].map((x, i) => (
          <mesh key={`glass-side-${i}`} position={[x, h * 0.5, 0]}>
            <boxGeometry args={[0.02, h * 0.85, 1.1]} />
            <meshStandardMaterial color="#bae6fd" transparent opacity={glassOpacity - 0.1} roughness={0.08} metalness={0.2} emissive="#67e8f9" emissiveIntensity={glassEmissive * 0.8} />
          </mesh>
        ))}

        {/* 顶层设备间 */}
        <RoundedBox args={[1.5, 0.6, 1.25]} radius={0.05} smoothness={4} position={[0, h + 0.3, 0]}>
          <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.4} />
        </RoundedBox>

        {/* 屋顶设备管道 */}
        <mesh position={[0, h + 0.7, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.35, 12]} />
          <meshStandardMaterial color="#64748b" metalness={0.5} roughness={0.4} />
        </mesh>

        {/* 竖向装饰线条 - 夜间发光 */}
        {[0.7, -0.7].map((x, i) => (
          <mesh key={`vert-line-${i}`} position={[x, h * 0.5, 0.79]}>
            <boxGeometry args={[0.02, h * 0.9, 0.015]} />
            <meshStandardMaterial color="#60a5fa" emissive="#60a5fa" emissiveIntensity={night ? 1.5 : 0.3} />
          </mesh>
        ))}

        {/* 顶部发光边缘 */}
        <mesh position={[0, h + 0.62, 0]}>
          <boxGeometry args={[1.6, 0.03, 1.35]} />
          <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={night ? 1.2 : 0.2} />
        </mesh>
      </group>
    );
  }

  if (type === "Office_Small") {
    return (
      <group>
        {/* 主体 */}
        <RoundedBox args={[1.55, h, 1.3]} radius={edgeRadius} smoothness={4} position={[0, h / 2, 0]} castShadow>
          <meshStandardMaterial color={color} roughness={0.46} metalness={0.24} />
        </RoundedBox>

        {/* 基座 */}
        <RoundedBox args={[1.9, 0.34, 1.56]} radius={edgeRadius} smoothness={4} position={[0, 0.17, 0]}>
          <meshStandardMaterial color="#3f3f46" roughness={0.5} metalness={0.42} />
        </RoundedBox>

        {/* 玻璃窗 - 横向排列 */}
        {[0.7, 0.42, 0.15, -0.12].map((yRatio, i) => (
          <group key={`win-${i}`}>
            <mesh position={[0, h * yRatio, 0.67]}>
              <boxGeometry args={[1.04, 0.18, 0.02]} />
              <meshStandardMaterial color={glass} transparent opacity={0.55} roughness={0.08} metalness={0.2} emissive="#38bdf8" emissiveIntensity={night ? 0.22 : 0} />
            </mesh>
            {/* 窗框竖向分格 */}
            {[-0.35, 0, 0.35].map((xOff, j) => (
              <mesh key={`v-div-${j}`} position={[xOff, h * yRatio, 0.68]}>
                <boxGeometry args={[0.02, 0.18, 0.025]} />
                <meshStandardMaterial color="#334155" metalness={0.4} roughness={0.5} />
              </mesh>
            ))}
          </group>
        ))}

        {/* 顶层小型设备间 */}
        <RoundedBox args={[1.1, 0.35, 0.95]} radius={0.04} smoothness={4} position={[0, h + 0.175, 0]}>
          <meshStandardMaterial color="#52525b" roughness={0.5} metalness={0.35} />
        </RoundedBox>

        {/* 屋顶通风管道 */}
        <mesh position={[0.25, h + 0.5, 0.2]}>
          <cylinderGeometry args={[0.06, 0.06, 0.25, 8]} />
          <meshStandardMaterial color="#71717a" metalness={0.4} roughness={0.5} />
        </mesh>
      </group>
    );
  }

  if (type === "Residential") {
    const windowEmissive = night ? 0.6 : 0.1;
    const windowOpacity = night ? 0.7 : 0.45;

    return (
      <group>
        {/* 主体 - 混凝土住宅楼 */}
        <RoundedBox args={[1.7, h, 1.5]} radius={edgeRadius} smoothness={4} position={[0, h / 2, 0]} castShadow>
          <meshStandardMaterial color="#d6d3d1" roughness={0.88} metalness={0.02} />
        </RoundedBox>

        {/* 窗户分格 - 多层多列，夜间发光 */}
        {[-0.5, 0, 0.5].map((xOff, col) => (
          <group key={`col-${col}`}>
            {[0.78, 0.58, 0.38, 0.18].map((yRatio, row) => (
              <group key={`win-${row}`}>
                {/* 窗户主体 - 夜间发光 */}
                <mesh position={[xOff, h * yRatio, 0.77]}>
                  <boxGeometry args={[0.28, 0.22, 0.02]} />
                  <meshStandardMaterial color={glass} transparent opacity={windowOpacity} metalness={0.15} roughness={0.08} emissive="#fbbf24" emissiveIntensity={windowEmissive} />
                </mesh>
                {/* 竖向窗框 */}
                <mesh position={[xOff - 0.12, h * yRatio, 0.785]}>
                  <boxGeometry args={[0.02, 0.22, 0.025]} />
                  <meshStandardMaterial color="#78716c" roughness={0.7} />
                </mesh>
                <mesh position={[xOff + 0.12, h * yRatio, 0.785]}>
                  <boxGeometry args={[0.02, 0.22, 0.025]} />
                  <meshStandardMaterial color="#78716c" roughness={0.7} />
                </mesh>
                {/* 横向窗框 */}
                <mesh position={[xOff, h * yRatio + 0.1, 0.785]}>
                  <boxGeometry args={[0.28, 0.02, 0.025]} />
                  <meshStandardMaterial color="#78716c" roughness={0.7} />
                </mesh>
                <mesh position={[xOff, h * yRatio - 0.1, 0.785]}>
                  <boxGeometry args={[0.28, 0.02, 0.025]} />
                  <meshStandardMaterial color="#78716c" roughness={0.7} />
                </mesh>
              </group>
            ))}
          </group>
        ))}

        {/* 阳台 - 正面 */}
        {[0.65, 0.35].map((yRatio, i) => (
          <group key={`balcony-${i}`}>
            {/* 阳台板 */}
            <mesh position={[0, h * yRatio, 0.78]}>
              <boxGeometry args={[0.8, 0.06, 0.4]} />
              <meshStandardMaterial color="#a8a29e" roughness={0.85} />
            </mesh>
            {/* 阳台栏杆 */}
            <mesh position={[0, h * yRatio + 0.18, 0.98]}>
              <boxGeometry args={[0.78, 0.35, 0.03]} />
              <meshStandardMaterial color="#e5e7eb" roughness={0.6} metalness={0.2} />
            </mesh>
            {/* 阳台栏杆竖向分格 */}
            {[-0.3, -0.1, 0.1, 0.3].map((xOff, k) => (
              <mesh key={`rail-${k}`} position={[xOff, h * yRatio + 0.18, 0.99]}>
                <boxGeometry args={[0.02, 0.35, 0.04]} />
                <meshStandardMaterial color="#d1d5db" roughness={0.6} metalness={0.2} />
              </mesh>
            ))}
          </group>
        ))}

        {/* 女儿墙 - 屋顶栏杆 */}
        <mesh position={[0, h + 0.14, 0]}>
          <boxGeometry args={[1.42, 0.25, 1.24]} />
          <meshStandardMaterial color="#9ca3af" roughness={0.72} metalness={0.08} />
        </mesh>
        {/* 女儿墙镂空装饰 */}
        {[0, 0.15, -0.15].map((xOff, i) => (
          <mesh key={`parapet-${i}`} position={[xOff, h + 0.22, 0.6]}>
            <boxGeometry args={[0.08, 0.15, 0.06]} />
            <meshStandardMaterial color="#a1a1aa" roughness={0.7} />
          </mesh>
        ))}
        {[0, 0.15, -0.15].map((xOff, i) => (
          <mesh key={`parapet-back-${i}`} position={[xOff, h + 0.22, -0.6]}>
            <boxGeometry args={[0.08, 0.15, 0.06]} />
            <meshStandardMaterial color="#a1a1aa" roughness={0.7} />
          </mesh>
        ))}

        {/* 空调外机 - 侧面 */}
        {[-0.72, 0.72].map((xOff, i) => (
          <mesh key={`ac-${i}`} position={[xOff, h * 0.28, 0.76]}>
            <boxGeometry args={[0.18, 0.22, 0.12]} />
            <meshStandardMaterial color="#6b7280" roughness={0.8} metalness={0.3} />
          </mesh>
        ))}

        {/* 楼梯间突出部分 */}
        <RoundedBox args={[0.5, h * 0.6, 0.4]} radius={0.05} smoothness={4} position={[-0.85, h * 0.3, 0]}>
          <meshStandardMaterial color="#c7c4bf" roughness={0.85} />
        </RoundedBox>
      </group>
    );
  }

  if (type === "Hospital") {
    const hospitalGlassEmissive = night ? 0.7 : 0.15;

    return (
      <group>
        {/* 主体 */}
        <RoundedBox args={[1.9, h, 1.5]} radius={edgeRadius} smoothness={4} position={[0, h / 2, 0]} castShadow>
          <meshStandardMaterial color="#99f6e4" roughness={0.74} metalness={0.08} />
        </RoundedBox>

        {/* 基座 */}
        <RoundedBox args={[2.2, 0.36, 1.85]} radius={edgeRadius} smoothness={4} position={[0, 0.18, 0]}>
          <meshStandardMaterial color="#cbd5e1" roughness={0.64} metalness={0.2} />
        </RoundedBox>

        {/* 规律窗户 - 网格排列，夜间发光 */}
        {[-0.5, -0.15, 0.2, 0.55].map((xOff, col) => (
          <group key={`h-win-col-${col}`}>
            {[0.72, 0.48, 0.24].map((yRatio, row) => (
              <mesh key={`h-win-${row}`} position={[xOff, h * yRatio, 0.77]}>
                <boxGeometry args={[0.22, 0.28, 0.02]} />
                <meshStandardMaterial color="#dbeafe" transparent opacity={0.7} roughness={0.08} metalness={0.16} emissive="#67e8f9" emissiveIntensity={hospitalGlassEmissive} />
              </mesh>
            ))}
          </group>
        ))}

        {/* 顶层十字架 - 夜间发光 */}
        <mesh position={[0, h + 0.5, 0]}>
          <boxGeometry args={[0.22, 0.7, 0.12]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={night ? 1.2 : 0.2} />
        </mesh>
        <mesh position={[0, h + 0.5, 0]}>
          <boxGeometry args={[0.7, 0.22, 0.12]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={night ? 1.2 : 0.2} />
        </mesh>

        {/* 入口雨棚 */}
        <mesh position={[0, h * 0.12, 0.85]}>
          <boxGeometry args={[1.2, 0.06, 0.5]} />
          <meshStandardMaterial color="#f1f5f9" metalness={0.3} roughness={0.4} />
        </mesh>

        {/* 入口门 */}
        <mesh position={[0, h * 0.1, 0.77]}>
          <boxGeometry args={[0.6, 0.5, 0.02]} />
          <meshStandardMaterial color="#cbd5e1" transparent opacity={0.7} roughness={0.2} metalness={0.3} />
        </mesh>
      </group>
    );
  }

  if (type === "Shopping_Mall") {
    const showcaseEmissive = night ? 0.55 : 0.12;
    const facadeDark = `#${new THREE.Color(color).clone().multiplyScalar(0.72).getHexString()}`;

    return (
      <group>
        {/* 主体 - 与图例一致的暖色砖石立面 */}
        <RoundedBox args={[2.5, h, 2.0]} radius={edgeRadius} smoothness={4} position={[0, h / 2, 0]} castShadow>
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.22} />
        </RoundedBox>

        {/* 顶层设备层 */}
        <RoundedBox args={[2.3, 0.5, 1.8]} radius={0.05} smoothness={4} position={[0, h + 0.25, 0]}>
          <meshStandardMaterial color="#f8fafc" metalness={0.3} roughness={0.3} />
        </RoundedBox>

        {/* 大橱窗 - 暖色玻璃，避免整体发青绿 */}
        <mesh position={[0, h * 0.38, 1.02]}>
          <boxGeometry args={[2.1, h * 0.55, 0.03]} />
          <meshStandardMaterial
            color="#ffedd5"
            transparent
            opacity={0.78}
            roughness={0.12}
            metalness={0.15}
            emissive="#ea580c"
            emissiveIntensity={showcaseEmissive * 0.9}
          />
        </mesh>
        {/* 橱窗竖向分格 */}
        {[-0.7, -0.2, 0.3, 0.8].map((xOff, i) => (
          <mesh key={`showcase-${i}`} position={[xOff, h * 0.38, 1.035]}>
            <boxGeometry args={[0.03, h * 0.55, 0.04]} />
            <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.3} />
          </mesh>
        ))}

        {/* 主入口雨棚 */}
        <mesh position={[0, h * 0.22, 1.12]}>
          <boxGeometry args={[1.8, 0.08, 0.7]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.35} roughness={0.3} />
        </mesh>
        {/* 雨棚支撑柱 */}
        {[-0.7, 0.7].map((xOff, i) => (
          <mesh key={`canopy-pillar-${i}`} position={[xOff, h * 0.12, 1.4]}>
            <cylinderGeometry args={[0.06, 0.06, h * 0.25, 8]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.5} roughness={0.4} />
          </mesh>
        ))}

        {/* 入口门 */}
        <mesh position={[0, h * 0.14, 1.03]}>
          <boxGeometry args={[1.0, 0.65, 0.02]} />
          <meshStandardMaterial color="#fed7aa" transparent opacity={0.65} roughness={0.12} metalness={0.18} emissive="#c2410c" emissiveIntensity={night ? 0.22 : 0} />
        </mesh>

        {/* 侧面广告牌 */}
        <mesh position={[1.26, h * 0.6, 0]}>
          <boxGeometry args={[0.03, 0.8, 1.5]} />
          <meshStandardMaterial color={facadeDark} emissive={color} emissiveIntensity={night ? 0.35 : 0.08} />
        </mesh>

        {/* 台阶 */}
        {[0, 0.12, 0.24].map((yOff, i) => (
          <mesh key={`step-${i}`} position={[0, yOff, 1.55 - i * 0.15]}>
            <boxGeometry args={[2.0, 0.1, 0.15]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.7} />
          </mesh>
        ))}
      </group>
    );
  }

  if (type === "Factory") {
    return (
      <group>
        {/* 主体 - 钢结构厂房 */}
        <RoundedBox args={[2.4, h, 1.9]} radius={edgeRadius} smoothness={4} position={[0, h / 2, 0]} castShadow>
          <meshStandardMaterial color="#f5f5f4" roughness={0.84} metalness={0.04} />
        </RoundedBox>

        {/* 钢结构横梁装饰 */}
        {[0.7, 0.5, 0.3, 0.1].map((yRatio, i) => (
          <mesh key={`beam-${i}`} position={[0, h * yRatio, 0.97]}>
            <boxGeometry args={[2.2, 0.04, 0.03]} />
            <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
        {[0.7, 0.5, 0.3, 0.1].map((yRatio, i) => (
          <mesh key={`beam-back-${i}`} position={[0, h * yRatio, -0.97]}>
            <boxGeometry args={[2.2, 0.04, 0.03]} />
            <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.4} />
          </mesh>
        ))}

        {/* 工业管道 - 横向主管 */}
        {[-0.4, 0.4].map((zOff, i) => (
          <group key={`pipe-h-${i}`}>
            <mesh position={[0, h + 0.3, zOff]} rotation={[0, 0, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 2.3, 12]} />
              <meshStandardMaterial color="#ef4444" metalness={0.38} roughness={0.4} />
            </mesh>
            {/* 管道接头 */}
            {[-0.8, 0, 0.8].map((xOff, j) => (
              <mesh key={`elbow-${j}`} position={[xOff, h + 0.3, zOff]}>
                <sphereGeometry args={[0.12, 8, 8]} />
                <meshStandardMaterial color="#dc2626" metalness={0.4} roughness={0.4} />
              </mesh>
            ))}
          </group>
        ))}

        {/* 工业管道 - 竖向 */}
        {[-0.6, 0, 0.6].map((xOff, i) => (
          <mesh key={`pipe-v-${i}`} position={[xOff, h + 0.7, -0.55]}>
            <cylinderGeometry args={[0.08, 0.08, 0.9, 10]} />
            <meshStandardMaterial color="#ef4444" metalness={0.38} roughness={0.4} />
          </mesh>
        ))}

        {/* 通风口 */}
        <mesh position={[0, h * 0.2, 0.97]}>
          <boxGeometry args={[1.6, 0.4, 0.03]} />
          <meshStandardMaterial color="#404040" roughness={0.9} />
        </mesh>
        {[0.5, 0, -0.5].map((xOff, i) => (
          <mesh key={`vent-${i}`} position={[xOff, h * 0.2, 0.985]}>
            <boxGeometry args={[0.4, 0.3, 0.04]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.95} />
          </mesh>
        ))}

        {/* 吊车轨道 */}
        <mesh position={[0, h + 0.15, 0]}>
          <boxGeometry args={[2.2, 0.06, 0.08]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} />
        </mesh>
      </group>
    );
  }

  if (type === "School") {
    return (
      <group>
        {/* 主体 */}
        <RoundedBox args={[2.2, h, 1.7]} radius={edgeRadius} smoothness={4} position={[0, h / 2, 0]} castShadow>
          <meshStandardMaterial color="#fdba74" roughness={0.84} metalness={0.04} />
        </RoundedBox>

        {/* 顶层栏杆/女儿墙 */}
        <mesh position={[0, h + 0.18, 0]}>
          <boxGeometry args={[2.35, 0.12, 1.8]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.24} roughness={0.34} />
        </mesh>

        {/* 旗杆 */}
        <mesh position={[0, h + 0.43, 0]}>
          <cylinderGeometry args={[0.04, 0.06, 0.5, 8]} />
          <meshStandardMaterial color="#0f172a" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[0.15, h + 0.58, 0]}>
          <boxGeometry args={[0.3, 0.18, 0.02]} />
          <meshStandardMaterial color="#ef4444" roughness={0.38} />
        </mesh>

        {/* 窗户 */}
        {[-0.6, -0.1, 0.4].map((xOff, col) => (
          <group key={`school-win-${col}`}>
            {[0.7, 0.45, 0.2].map((yRatio, row) => (
              <mesh key={`school-win-${row}`} position={[xOff, h * yRatio, 0.87]}>
                <boxGeometry args={[0.3, 0.22, 0.02]} />
                <meshStandardMaterial color="#bae6fd" transparent opacity={0.6} roughness={0.1} metalness={0.15} />
              </mesh>
            ))}
          </group>
        ))}

        {/* 底层走廊雨棚 */}
        <mesh position={[0, h * 0.12, 0.95]}>
          <boxGeometry args={[1.8, 0.05, 0.4]} />
          <meshStandardMaterial color="#f8fafc" metalness={0.3} roughness={0.4} />
        </mesh>

        {/* 操场跑道环 */}
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.88, 1.05, 32]} />
          <meshBasicMaterial color="#fb923c" transparent opacity={night ? 0.52 : 0.35} side={THREE.DoubleSide} />
        </mesh>
      </group>
    );
  }

  if (type === "Hotel") {
    return (
      <group>
        {/* 主体 */}
        <RoundedBox args={[1.65, h, 1.45]} radius={edgeRadius} smoothness={4} position={[0, h / 2, 0]} castShadow>
          <meshStandardMaterial color="#7e22ce" roughness={0.22} metalness={0.62} />
        </RoundedBox>

        {/* 顶层旋转餐厅 */}
        <RoundedBox args={[1.2, 0.8, 1.1]} radius={0.06} smoothness={4} position={[0, h + 0.4, 0]}>
          <meshStandardMaterial color="#dbeafe" transparent opacity={0.75} roughness={0.1} metalness={0.15} />
        </RoundedBox>

        {/* 玻璃幕墙 - 竖向线条 */}
        {[-0.4, -0.2, 0, 0.2, 0.4].map((xOff, i) => (
          <mesh key={`hotel-glass-${i}`} position={[xOff, h * 0.5, 0.75]}>
            <boxGeometry args={[0.03, h * 0.8, 0.02]} />
            <meshStandardMaterial color="#bfdbfe" transparent opacity={0.6} roughness={0.06} metalness={0.22} emissive="#e879f9" emissiveIntensity={night ? 0.4 : 0.1} />
          </mesh>
        ))}

        {/* 屋顶装饰环 */}
        <mesh position={[0, h + 0.96, 0]}>
          <torusGeometry args={[0.42, 0.04, 10, 28]} />
          <meshStandardMaterial color="#e879f9" emissive="#e879f9" emissiveIntensity={night ? 1.35 : 0.6} />
        </mesh>

        {/* 顶层设备 */}
        <mesh position={[0, h + 0.1, 0]}>
          <cylinderGeometry args={[0.25, 0.3, 0.2, 12]} />
          <meshStandardMaterial color="#581c87" roughness={0.4} metalness={0.5} />
        </mesh>
      </group>
    );
  }

  // 默认建筑
  return (
    <group>
      <RoundedBox args={[1.6, h, 1.4]} radius={edgeRadius} smoothness={4} position={[0, h / 2, 0]} castShadow>
        <meshStandardMaterial color={color} roughness={0.32} metalness={0.28} />
      </RoundedBox>
      {[-0.5, 0, 0.5].map((x, i) => (
        <mesh key={i} position={[x, h / 2, 0.72]}>
          <boxGeometry args={[0.08, h * 0.92, 0.03]} />
          <meshStandardMaterial color="#dbeafe" />
        </mesh>
      ))}
    </group>
  );
}

type ZoneKey = "core" | "perimeter" | "roof";

function inferDominantZone(snap: BuildingSnapshot): ZoneKey {
  if (snap.eCore >= snap.ePeri && snap.eCore >= snap.eRoof) return "core";
  if (snap.ePeri >= snap.eRoof) return "perimeter";
  return "roof";
}

function BuildingZoneHeat({
  snapshot,
  buildingId,
  night,
  onSelectBuilding,
}: {
  snapshot: BuildingSnapshot;
  buildingId: string;
  night: boolean;
  onSelectBuilding: (id: string, zone: ZoneKey) => void;
}) {
  const h = TYPE_HEIGHT[snapshot.buildingType] || 3;
  const total = Math.max(snapshot.eTotal, 1e-6);
  const heatOpacity = (e: number) => Math.min(0.82, 0.14 + (e / total) * 1.2);

  const zonePointerDown =
    (zone: ZoneKey) => (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      onSelectBuilding(buildingId, zone);
    };

  const coreOp = heatOpacity(snapshot.eCore);
  const periOp = heatOpacity(snapshot.ePeri);
  const roofOp = heatOpacity(snapshot.eRoof);

  return (
    <group>
      <mesh
        position={[0, h * 0.5 + 0.18, 0]}
        onPointerDown={zonePointerDown("core")}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
        renderOrder={2}
      >
        <boxGeometry args={[0.44, h * 0.9, 0.44]} />
        <meshStandardMaterial
          color="#ef4444"
          transparent
          opacity={coreOp}
          depthWrite={false}
          metalness={0.15}
          roughness={0.85}
          emissive="#7f1d1d"
          emissiveIntensity={night ? 0.45 : 0.12}
        />
      </mesh>

      <mesh
        position={[0, h * 0.5 + 0.18, 0.86]}
        onPointerDown={zonePointerDown("perimeter")}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
        renderOrder={2}
      >
        <boxGeometry args={[1.62, h * 0.92, 0.09]} />
        <meshStandardMaterial
          color="#f97316"
          transparent
          opacity={periOp}
          depthWrite={false}
          metalness={0.12}
          roughness={0.9}
          emissive="#9a3412"
          emissiveIntensity={night ? 0.35 : 0.08}
        />
      </mesh>

      <mesh
        position={[0, h + 0.14, 0]}
        onPointerDown={zonePointerDown("roof")}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
        renderOrder={2}
      >
        <boxGeometry args={[1.78, 0.14, 1.58]} />
        <meshStandardMaterial
          color="#dc2626"
          transparent
          opacity={roofOp}
          depthWrite={false}
          metalness={0.2}
          roughness={0.75}
          emissive="#450a0a"
          emissiveIntensity={night ? 0.5 : 0.15}
        />
      </mesh>
    </group>
  );
}

function BuildingBlock({
  meta,
  snapshot,
  position,
  selected,
  night,
  onSelect,
}: {
  meta: BuildingMeta;
  snapshot: BuildingSnapshot | null;
  position: [number, number, number];
  selected: boolean;
  night: boolean;
  onSelect: (id: string | null, zone?: ZoneKey) => void;
}) {
  const ref = useRef<THREE.Group>(null!);
  const seed = useMemo(() => buildingSeed(meta.buildingId), [meta.buildingId]);
  const color = TYPE_COLOR[meta.buildingType] || DEFAULT_COLOR;
  const label = snapshot ? `${snapshot.eTotal.toFixed(1)} kW` : "暂无数据";

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const period = 5 + (seed % 300) / 100;
    const phase = (seed % 360) * (Math.PI / 180);
    const t = clock.getElapsedTime();
    ref.current.position.y = position[1] + Math.sin((t / period) * Math.PI * 2 + phase) * 0.04;
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (selected) {
      onSelect(null);
    } else {
      onSelect(meta.buildingId);
    }
  };

  return (
    <group ref={ref} position={position}>
      <group onClick={handleClick}>
        <RoundedBox args={[2.1, 0.36, 1.9]} radius={0.05} smoothness={4} position={[0, 0.18, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#334155" roughness={0.78} metalness={0.2} />
        </RoundedBox>

        <TypeBuilding type={meta.buildingType} color={color} night={night} />
      </group>

      {snapshot ? (
        <BuildingZoneHeat
          snapshot={snapshot}
          buildingId={meta.buildingId}
          night={night}
          onSelectBuilding={(id, zone) => onSelect(id, zone)}
        />
      ) : null}

      {selected && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.2, 1.65, 32]} />
          <meshBasicMaterial color={snapshot ? color : "#94a3b8"} transparent opacity={0.55} side={THREE.DoubleSide} />
        </mesh>
      )}

      <Html position={[0, (TYPE_HEIGHT[meta.buildingType] || 3) + 1.15, 0]} center distanceFactor={14}>
        <div
          className={
            night
              ? "rounded border border-cyan-500/35 bg-slate-950/90 px-2 py-1 text-[10px] font-semibold text-slate-100 shadow-[0_0_16px_rgba(34,211,238,0.12)] backdrop-blur-sm"
              : "rounded border border-zinc-300 bg-white/95 px-2 py-1 text-[10px] font-semibold text-zinc-900 shadow-sm"
          }
        >
          <div>{meta.buildingId}</div>
          <div className={night ? "text-cyan-200/80" : "text-zinc-500"}>{label}</div>
        </div>
      </Html>
    </group>
  );
}

function InstancedTrees({ points, night }: { points: Array<[number, number, number]>; night: boolean }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null!);
  const crownRef = useRef<THREE.InstancedMesh>(null!);

  useMemo(() => {
    if (!trunkRef.current || !crownRef.current) return;
    points.forEach((p, i) => {
      _dummy.position.set(p[0], 0.22, p[2]);
      _dummy.scale.set(1, 1 + ((i % 3) - 1) * 0.12, 1);
      _dummy.rotation.set(0, (i % 8) * 0.25, 0);
      _dummy.updateMatrix();
      trunkRef.current.setMatrixAt(i, _dummy.matrix);
      _dummy.position.set(p[0], 0.58, p[2]);
      _dummy.scale.set(1 + (i % 4) * 0.03, 1 + (i % 5) * 0.02, 1 + (i % 4) * 0.03);
      _dummy.rotation.set(0, (i % 10) * 0.2, 0);
      _dummy.updateMatrix();
      crownRef.current.setMatrixAt(i, _dummy.matrix);
    });
    trunkRef.current.instanceMatrix.needsUpdate = true;
    crownRef.current.instanceMatrix.needsUpdate = true;
  }, [points]);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, points.length]}>
        <cylinderGeometry args={[0.035, 0.045, 0.3, 8]} />
        <meshStandardMaterial color={night ? "#3f3f46" : "#8b5a2b"} roughness={0.88} />
      </instancedMesh>
      <instancedMesh ref={crownRef} args={[undefined, undefined, points.length]}>
        <coneGeometry args={[0.2, 0.42, 9]} />
        <meshStandardMaterial color={night ? "#166534" : "#4ade80"} roughness={0.82} />
      </instancedMesh>
    </group>
  );
}

function StreetLights({ night }: { night: boolean }) {
  // 沿主干道两侧布置路灯
  const lightPositions: [number, number, number][] = [
    // 横向主干道两侧
    [2.8, 0, -15], [2.8, 0, -10], [2.8, 0, -5], [2.8, 0, 0], [2.8, 0, 5], [2.8, 0, 10], [2.8, 0, 15],
    [-2.8, 0, -15], [-2.8, 0, -10], [-2.8, 0, -5], [-2.8, 0, 0], [-2.8, 0, 5], [-2.8, 0, 10], [-2.8, 0, 15],
    // 纵向主干道两侧
    [-15, 0, 2.8], [-10, 0, 2.8], [-5, 0, 2.8], [0, 0, 2.8], [5, 0, 2.8], [10, 0, 2.8], [15, 0, 2.8],
    [-15, 0, -2.8], [-10, 0, -2.8], [-5, 0, -2.8], [0, 0, -2.8], [5, 0, -2.8], [10, 0, -2.8], [15, 0, -2.8],
    // 次干道
    [-12.5, 0, 2.8], [-12.5, 0, -2.8],
    [12.5, 0, 2.8], [12.5, 0, -2.8],
    [2.8, 0, -12.5], [-2.8, 0, -12.5],
    [2.8, 0, 12.5], [-2.8, 0, 12.5],
  ];

  return (
    <group>
      {lightPositions.map((pos, i) => (
        <group key={`light-${i}`} position={[pos[0], 0, pos[2]]}>
          {/* 灯杆 */}
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.04, 0.06, 1.2, 8]} />
            <meshStandardMaterial color="#4b5563" metalness={0.6} roughness={0.4} />
          </mesh>
          {/* 灯臂 */}
          <mesh position={[pos[0] > 0 ? -0.2 : pos[0] < 0 ? 0.2 : 0, 1.15, pos[2] > 0 ? -0.2 : pos[2] < 0 ? 0.2 : 0]} rotation={[0, 0, pos[0] > 0 || pos[2] > 0 ? 0.3 : -0.3]}>
            <cylinderGeometry args={[0.02, 0.02, 0.5, 6]} />
            <meshStandardMaterial color="#4b5563" metalness={0.6} roughness={0.4} />
          </mesh>
          {/* 灯头 */}
          <mesh position={[pos[0] > 0 ? -0.35 : pos[0] < 0 ? 0.35 : 0, 1.3, pos[2] > 0 ? -0.35 : pos[2] < 0 ? 0.35 : 0]}>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshStandardMaterial
              color={night ? "#fef3c7" : "#d1d5db"}
              emissive={night ? "#fbbf24" : "#9ca3af"}
              emissiveIntensity={night ? 1.5 : 0.2}
            />
          </mesh>
          {/* 发光点光源指示 - 夜间可见 */}
          {night && (
            <pointLight
              position={[pos[0] > 0 ? -0.35 : pos[0] < 0 ? 0.35 : 0, 1.3, pos[2] > 0 ? -0.35 : pos[2] < 0 ? 0.35 : 0]}
              color="#fbbf24"
              intensity={0.4}
              distance={3}
            />
          )}
        </group>
      ))}
    </group>
  );
}

function GroundDecor({ night }: { night: boolean }) {
  // 行道树位置 - 沿道路两侧
  const treePoints: Array<[number, number, number]> = [
    [-14, 0, -2], [-12, 0, 3], [-9, 0, 0], [-3.5, 0, -10], [4.5, 0, -12],
    [13, 0, -4], [12, 0, 4.5], [7, 0, 12], [-1, 0, 12.5], [-13.5, 0, 11],
    [-6.2, 0, -12.4], [10.8, 0, -11.2],
    // 道路交叉口绿化
    [-5, 0, -5], [5, 0, -5], [-5, 0, 5], [5, 0, 5],
  ];

  // 草坪区域
  const lawnAreas: Array<{ pos: [number, number, number]; size: [number, number]; rotation?: number }> = [
    { pos: [-9.2, 0.012, -8.8], size: [4, 3] },
    { pos: [8.5, 0.012, -8.7], size: [4, 3] },
    { pos: [8.7, 0.012, 9.1], size: [4, 3] },
    { pos: [-9.7, 0.012, 9.2], size: [4, 3] },
  ];

  // 绿化带位置
  const greenbelts: Array<{ pos: [number, number, number]; size: [number, number] }> = [
    { pos: [0, 0.011, -10.5], size: [22, 1.2] },
    { pos: [0, 0.011, 10.5], size: [22, 1.2] },
    { pos: [-10.5, 0.011, 0], size: [1.2, 22] },
    { pos: [10.5, 0.011, 0], size: [1.2, 22] },
  ];

  return (
    <group>
      {/* 地面基础 - 白色/浅灰色 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[74, 74]} />
        <meshStandardMaterial color={night ? "#020617" : "#f1f5f9"} roughness={0.95} />
      </mesh>

      {/* 草坪 */}
      {lawnAreas.map((lawn, i) => (
        <mesh key={`lawn-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={lawn.pos}>
          <planeGeometry args={lawn.size} />
          <meshStandardMaterial color={night ? "#0f3320" : "#86efac"} roughness={0.9} />
        </mesh>
      ))}

      {/* 绿化带 - 道路中央分隔带 */}
      {greenbelts.map((belt, i) => (
        <mesh key={`belt-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={belt.pos}>
          <planeGeometry args={belt.size} />
          <meshStandardMaterial color={night ? "#14532d" : "#22c55e"} roughness={0.85} />
        </mesh>
      ))}

      {/* 环形装饰 - 低多边形 */}
      {[3.4, 6.4, 10.0, 14.6].map((r, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004 + i * 0.002, 0]}>
          <ringGeometry args={[r - 0.03, r + 0.03, 80]} />
          <meshBasicMaterial color={night ? "#38bdf8" : "#9ca3af"} transparent opacity={night ? 0.16 : 0.22} side={THREE.DoubleSide} />
        </mesh>
      ))}

      <InstancedTrees points={treePoints} night={night} />
    </group>
  );
}

function ZoneLabels({ night }: { night: boolean }) {
  const labels: Array<{ text: string; pos: [number, number, number] }> = [
    { text: "西北 办公 / CBD", pos: [-14.2, 0.35, -12.5] },
    { text: "东北 医疗 / 公共", pos: [14.5, 0.35, -12.5] },
    { text: "东南 住宅 / 学校", pos: [14.2, 0.35, 13.8] },
    { text: "西南 工业", pos: [-14.5, 0.35, 13.8] },
    { text: "中心 商业", pos: [0, 0.35, 16.2] },
  ];

  return (
    <group>
      {labels.map((item) => (
        <Html key={item.text} position={item.pos} center distanceFactor={26} style={{ pointerEvents: "none" }}>
          <div
            className={
              night
                ? "max-w-[200px] whitespace-nowrap rounded-md border border-cyan-500/30 bg-slate-950/80 px-2 py-0.5 text-[9px] font-medium text-cyan-100/95 shadow-sm backdrop-blur-sm"
                : "max-w-[200px] whitespace-nowrap rounded-md border border-zinc-300/80 bg-white/80 px-2 py-0.5 text-[9px] font-medium text-zinc-700 shadow-sm backdrop-blur-sm"
            }
          >
            {item.text}
          </div>
        </Html>
      ))}
    </group>
  );
}

function RoadNetwork({ night }: { night: boolean }) {
  // 道路颜色
  const mainRoadColor = night ? "#0f172a" : "#64748b";      // 主干道 - 深灰
  const secondaryRoadColor = night ? "#1e293b" : "#94a3b8"; // 次干道 - 中灰
  const sidewalkColor = night ? "#334155" : "#cbd5e1";      // 人行道 - 浅灰
  const laneColor = night ? "#38bdf8" : "#ffffff";          // 车道线

  // 人行道砖块纹理 - 小方块
  const sidewalkBlocks: Array<{ pos: [number, number, number]; size: [number, number] }> = [
    // 沿主干道两侧的人行道
    { pos: [1.7, 0.013, 0], size: [0.3, 0.3] },
    { pos: [2.1, 0.013, 0], size: [0.3, 0.3] },
    { pos: [-1.7, 0.013, 0], size: [0.3, 0.3] },
    { pos: [-2.1, 0.013, 0], size: [0.3, 0.3] },
    { pos: [0, 0.013, 1.7], size: [0.3, 0.3] },
    { pos: [0, 0.013, 2.1], size: [0.3, 0.3] },
    { pos: [0, 0.013, -1.7], size: [0.3, 0.3] },
    { pos: [0, 0.013, -2.1], size: [0.3, 0.3] },
  ];

  // 斑马线
  const crossWalks: Array<[number, number, number]> = [
    [0, 0.017, -8],
    [0, 0.017, 8],
    [-8, 0.017, 0],
    [8, 0.017, 0],
  ];

  return (
    <group>
      {/* 主干道 - 横向 (2.2宽) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[2.2, 66]} />
        <meshStandardMaterial color={mainRoadColor} roughness={0.9} />
      </mesh>
      {/* 主干道 - 纵向 (2.2宽) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <planeGeometry args={[66, 2.2]} />
        <meshStandardMaterial color={mainRoadColor} roughness={0.9} />
      </mesh>

      {/* 次干道 - 横向外侧 (1.6宽) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, -10.5]}>
        <planeGeometry args={[58, 1.6]} />
        <meshStandardMaterial color={secondaryRoadColor} roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, 10.5]}>
        <planeGeometry args={[58, 1.6]} />
        <meshStandardMaterial color={secondaryRoadColor} roughness={0.9} />
      </mesh>
      {/* 次干道 - 纵向外侧 (1.6宽) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-10.5, 0.011, 0]}>
        <planeGeometry args={[1.6, 58]} />
        <meshStandardMaterial color={secondaryRoadColor} roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[10.5, 0.011, 0]}>
        <planeGeometry args={[1.6, 58]} />
        <meshStandardMaterial color={secondaryRoadColor} roughness={0.9} />
      </mesh>

      {/* 主干道中央车道线 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.013, 0]}>
        <planeGeometry args={[0.18, 66]} />
        <meshBasicMaterial color={laneColor} transparent opacity={0.35} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]}>
        <planeGeometry args={[66, 0.18]} />
        <meshBasicMaterial color={laneColor} transparent opacity={0.35} />
      </mesh>

      {/* 次干道边线 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, -10.5]}>
        <planeGeometry args={[26, 0.12]} />
        <meshBasicMaterial color={night ? "#14532d" : "#65a30d"} transparent opacity={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 10.5]}>
        <planeGeometry args={[26, 0.12]} />
        <meshBasicMaterial color={night ? "#14532d" : "#65a30d"} transparent opacity={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-10.5, 0.015, 0]}>
        <planeGeometry args={[0.12, 26]} />
        <meshBasicMaterial color={night ? "#14532d" : "#65a30d"} transparent opacity={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[10.5, 0.015, 0]}>
        <planeGeometry args={[0.12, 26]} />
        <meshBasicMaterial color={night ? "#14532d" : "#65a30d"} transparent opacity={0.5} />
      </mesh>

      {/* 斑马线 */}
      {crossWalks.map((p, i) => (
        <mesh key={`zebra-${i}`} rotation={[-Math.PI / 2, i < 2 ? 0 : Math.PI / 2, 0]} position={p}>
          <planeGeometry args={[2.6, 1.2]} />
          <meshBasicMaterial color={night ? "#e2e8f0" : "#ffffff"} transparent opacity={0.4} />
        </mesh>
      ))}

      {/* 人行道 - 沿主干道两侧 */}
      {[
        { pos: [1.8, 0.016, 0], size: [0.6, 66] },
        { pos: [-1.8, 0.016, 0], size: [0.6, 66] },
        { pos: [0, 0.016, 1.8], size: [66, 0.6] },
        { pos: [0, 0.016, -1.8], size: [66, 0.6] },
      ].map((sw, i) => (
        <mesh key={`walk-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={sw.pos}>
          <planeGeometry args={sw.size} />
          <meshStandardMaterial color={sidewalkColor} roughness={0.85} />
        </mesh>
      ))}

      {/* 人行道砖块纹理 - 低多边形风格 */}
      {sidewalkBlocks.map((block, i) => (
        <mesh key={`block-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={block.pos}>
          <planeGeometry args={[0.28, 0.28]} />
          <meshStandardMaterial color={night ? "#475569" : "#e2e8f0"} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function CenterHub({ night }: { night: boolean }) {
  return (
    <group position={[0, 0, 0]}>
      {/* 地基底座 */}
      <RoundedBox args={[3.0, 0.3, 3.0]} radius={0.05} smoothness={4} position={[0, 0.15, 0]} castShadow>
        <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.3} />
      </RoundedBox>

      {/* 主塔体 */}
      <RoundedBox args={[2.5, 1.45, 2.5]} radius={0.08} smoothness={5} position={[0, 0.72, 0]} castShadow>
        <meshStandardMaterial color="#0f172a" metalness={0.85} roughness={0.24} />
      </RoundedBox>

      {/* 主塔顶部平台 */}
      <mesh position={[0, 1.52, 0]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[1.8, 0.08, 1.8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.2} />
      </mesh>

      {/* 能源核心发光环 - 夜间更亮 */}
      <mesh position={[0, 1.52, 0]} rotation={[0, 0, 0]}>
        <torusGeometry args={[1.0, 0.04, 8, 32]} />
        <meshStandardMaterial
          color="#38bdf8"
          emissive="#38bdf8"
          emissiveIntensity={night ? 2.5 : 1.2}
        />
      </mesh>

      {/* 核心发光线条 - 正面 */}
      {[-0.58, 0, 0.58].map((x, i) => (
        <mesh key={`coreline-${i}`} position={[x, 0.92, 1.22]}>
          <boxGeometry args={[0.08, 1.12, 0.02]} />
          <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={night ? 2.0 : 1.0} />
        </mesh>
      ))}

      {/* 侧面发光线条 */}
      {[1.22, -1.22].map((z, sideIdx) => (
        <group key={`side-${sideIdx}`}>
          {[-0.4, 0.1, 0.6].map((xOff, i) => (
            <mesh key={`side-${sideIdx}-line-${i}`} position={[xOff, 0.92, z * 0.5]}>
              <boxGeometry args={[0.02, 1.0, 0.02]} />
              <meshStandardMaterial color="#67e8f9" emissive="#67e8f9" emissiveIntensity={night ? 1.8 : 0.8} />
            </mesh>
          ))}
        </group>
      ))}

      {/* 光伏板结构 - 东南西北四个方向 */}
      {[
        { rot: [-0.4, 0, 0], pos: [1.4, 1.8, 0] as [number, number, number] },
        { rot: [-0.4, Math.PI / 2, 0], pos: [-1.4, 1.8, 0] as [number, number, number] },
        { rot: [-0.4, Math.PI, 0], pos: [0, 1.8, 1.4] as [number, number, number] },
        { rot: [-0.4, -Math.PI / 2, 0], pos: [0, 1.8, -1.4] as [number, number, number] },
      ].map((panel, i) => (
        <group key={`solar-${i}`} rotation={panel.rot as [number, number, number]} position={panel.pos}>
          {/* 光伏板框架 */}
          <mesh>
            <boxGeometry args={[0.7, 0.04, 0.45]} />
            <meshStandardMaterial color="#1e3a5f" metalness={0.6} roughness={0.3} />
          </mesh>
          {/* 光伏板电池片分格 */}
          {[-0.25, 0, 0.25].map((xOff, j) => (
            <mesh key={`cell-${j}`} position={[xOff, 0.025, 0]}>
              <boxGeometry args={[0.2, 0.045, 0.38]} />
              <meshStandardMaterial color="#0f172a" emissive="#1d4ed8" emissiveIntensity={night ? 0.6 : 0.2} metalness={0.7} roughness={0.2} />
            </mesh>
          ))}
        </group>
      ))}

      {/* 设备管线 - 连接光伏板 */}
      {[
        [1.4, 1.85, 0.3],
        [-1.4, 1.85, 0.3],
        [0.3, 1.85, 1.4],
        [0.3, 1.85, -1.4],
      ].map((pos, i) => (
        <mesh key={`pipe-${i}`} position={[pos[0], 1.5, pos[2]]}>
          <cylinderGeometry args={[0.04, 0.04, 0.7, 8]} />
          <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}

      {/* 四个角的发光柱 */}
      {[
        [1.1, 0, 1.1],
        [-1.1, 0, 1.1],
        [1.1, 0, -1.1],
        [-1.1, 0, -1.1],
      ].map((pos, i) => (
        <group key={`pillar-${i}`}>
          <mesh position={[pos[0], 1.0, pos[2]]}>
            <cylinderGeometry args={[0.08, 0.1, 2.0, 8]} />
            <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} />
          </mesh>
          {/* 发光环 */}
          <mesh position={[pos[0], 1.5, pos[2]]}>
            <torusGeometry args={[0.12, 0.03, 6, 16]} />
            <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={night ? 2.2 : 0.8} />
          </mesh>
          <mesh position={[pos[0], 0.5, pos[2]]}>
            <torusGeometry args={[0.12, 0.03, 6, 16]} />
            <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={night ? 1.8 : 0.6} />
          </mesh>
        </group>
      ))}

      {/* 顶部天线塔 */}
      <mesh position={[0, 2.1, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.78, 16]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.24} />
      </mesh>
      <mesh position={[0, 2.54, 0]}>
        <boxGeometry args={[0.06, 0.9, 0.02]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.2} />
      </mesh>
      <mesh position={[0, 2.54, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[0.06, 0.9, 0.02]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.2} />
      </mesh>
      {/* 天线顶部红灯 */}
      <mesh position={[0, 2.98, 0]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={night ? 2.0 : 0.5} />
      </mesh>

      {/* 地面装饰光环 */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.6, 1.75, 32]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={night ? 0.6 : 0.2} side={THREE.DoubleSide} />
      </mesh>

      <Html position={[0, 0.78, 0]} center>
        <div
          className={
            night
              ? "rounded-md border border-amber-400/40 bg-slate-950/90 px-2 py-1 text-xs font-semibold text-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.2)] backdrop-blur-sm"
              : "rounded-md border border-zinc-300 bg-white/95 px-2 py-1 text-xs font-semibold text-zinc-900 shadow-sm"
          }
        >
          能源中心
        </div>
      </Html>
    </group>
  );
}

function EnergyFlowDot({ curve, speed, offset }: { curve: THREE.QuadraticBezierCurve3; speed: number; offset: number }) {
  const ref = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = (clock.getElapsedTime() * speed + offset) % 1;
    ref.current.position.copy(curve.getPoint(t));
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.06, 8, 8]} />
      <meshBasicMaterial color="#38bdf8" transparent opacity={0.88} />
    </mesh>
  );
}

function EnergyArc({ target, active, night }: { target: [number, number, number]; active: boolean; night: boolean }) {
  const curve = useMemo(() => {
    const start = new THREE.Vector3(0, 0.6, 0);
    const end = new THREE.Vector3(target[0], 1.7, target[2]);
    const mid = new THREE.Vector3().lerpVectors(start, end, 0.5);
    mid.y += 1.8;
    return new THREE.QuadraticBezierCurve3(start, mid, end);
  }, [target]);

  const points = useMemo(() => curve.getPoints(34).map((p) => [p.x, p.y, p.z] as [number, number, number]), [curve]);

  return (
    <group>
      <Line points={points} color={night ? "#38bdf8" : "#60a5fa"} lineWidth={1.2} transparent opacity={active ? (night ? 0.82 : 0.66) : 0.25} />
      {active && <EnergyFlowDot curve={curve} speed={0.25} offset={0.12} />}
      {active && <EnergyFlowDot curve={curve} speed={0.2} offset={0.58} />}
    </group>
  );
}

function buildSankeyData(snapshots: BuildingSnapshot[]): SankeyData {
  const byType = new Map<string, { core: number; peri: number; roof: number; total: number }>();

  for (const s of snapshots) {
    const bucket = byType.get(s.buildingType) || { core: 0, peri: 0, roof: 0, total: 0 };
    bucket.core += s.eCore;
    bucket.peri += s.ePeri;
    bucket.roof += s.eRoof;
    bucket.total += s.eTotal;
    byType.set(s.buildingType, bucket);
  }

  const typeNames = Array.from(byType.keys()).sort();
  const totalE = Array.from(byType.values()).reduce((sum, b) => sum + b.total, 0);

  // 节点：总能耗 -> 区域能耗 -> 建筑类型
  const nodes: SankeyData["nodes"] = [
    { name: "总能耗", color: "#1e40af" },                 // 总入口
    { name: "核心区域", color: "#f97316" },              // E_core 核心区域
    { name: "外围区域", color: "#3b82f6" },              // E_peri 外围区域
    { name: "屋顶区域", color: "#22c55e" },              // E_roof 屋顶区域
    ...typeNames.map((type) => ({ name: TYPE_LABEL[type] || type, color: TYPE_COLOR[type] || DEFAULT_COLOR })),
  ];

  const totalIndex = 0;
  const coreIndex = 1;
  const periIndex = 2;
  const roofIndex = 3;
  const typeStart = 4;

  const links: SankeyData["links"] = [];

  // 总能耗 -> 三个区域
  const totalCore = Array.from(byType.values()).reduce((sum, b) => sum + b.core, 0);
  const totalPeri = Array.from(byType.values()).reduce((sum, b) => sum + b.peri, 0);
  const totalRoof = Array.from(byType.values()).reduce((sum, b) => sum + b.roof, 0);

  links.push({ source: totalIndex, target: coreIndex, value: Number(totalCore.toFixed(2)) });
  links.push({ source: totalIndex, target: periIndex, value: Number(totalPeri.toFixed(2)) });
  links.push({ source: totalIndex, target: roofIndex, value: Number(totalRoof.toFixed(2)) });

  // 三个区域 -> 各建筑类型（按该类型在此区域的能耗分配）
  typeNames.forEach((type, i) => {
    const idx = typeStart + i;
    const b = byType.get(type)!;
    // 核心区域 -> 建筑类型
    links.push({ source: coreIndex, target: idx, value: Number(b.core.toFixed(2)) });
    // 外围区域 -> 建筑类型
    links.push({ source: periIndex, target: idx, value: Number(b.peri.toFixed(2)) });
    // 屋顶区域 -> 建筑类型
    links.push({ source: roofIndex, target: idx, value: Number(b.roof.toFixed(2)) });
  });

  return { nodes, links };
}

function evaluateAudit(snapshot: BuildingSnapshot | null, buildingType: string | null) {
  if (!snapshot || !buildingType) {
    return {
      status: "数据不足",
      risk: "medium",
      clause: "缺少当前时刻能耗数据",
      score: 0,
      maxZone: "unknown",
      advice: [
        { title: "Complete current time-slice data before standard check", priority: "high", expectedReductionPct: 0, costLevel: "low" },
        { title: "Check meter point connectivity first", priority: "high", expectedReductionPct: 0, costLevel: "low" },
      ] as PrescriptionItem[],
      totalPotentialPct: 0,
      estimatedReductionKg: 0,
    };
  }

  const tempGap = Math.abs(snapshot.tAvg - snapshot.tCore);
  const weatherGap = Math.abs(snapshot.tAvg - snapshot.tPeri);
  const delta = Math.abs(snapshot.tAvg - snapshot.tRoof);
  const stress = (tempGap + weatherGap + delta) / 3;
  const efficiency = snapshot.eTotal / (stress + 1);
  const baseline = TYPE_EFFICIENCY_BASELINE[buildingType] || 20;
  const score = Math.max(0, Math.min(100, Math.round((baseline / Math.max(efficiency, 0.1)) * 100)));

  const maxValue = Math.max(snapshot.eCore, snapshot.ePeri, snapshot.eRoof);
  const maxZone = maxValue === snapshot.eCore ? "core" : maxValue === snapshot.ePeri ? "perimeter" : "roof";

  const status = score >= 85 ? "pass" : score >= 70 ? "warning" : "fail";
  const risk = score >= 85 ? "low" : score >= 70 ? "medium" : "high";
  const clause =
    status === "pass"
      ? "满足 GB 55015 基准要求"
      : status === "warning"
        ? "接近 GB 55015 阈值，建议优化运行策略"
        : "偏离 GB 55015 要求，需执行整改措施";

  const advice: PrescriptionItem[] =
    maxZone === "roof"
      ? [
        { title: "检查屋面保温与反射层状态", priority: "high", expectedReductionPct: 9, costLevel: "medium" },
        { title: "高辐射时段启用外遮阳策略", priority: "high", expectedReductionPct: 6, costLevel: "low" },
        { title: "优化屋面设备启停时序", priority: "medium", expectedReductionPct: 4, costLevel: "low" },
      ]
      : maxZone === "perimeter"
        ? [
          { title: "校准外立面开窗与遮阳联动", priority: "high", expectedReductionPct: 8, costLevel: "low" },
          { title: "提升外围护结构保温性能", priority: "medium", expectedReductionPct: 7, costLevel: "high" },
          { title: "削峰时段下调周边区送风", priority: "medium", expectedReductionPct: 4, costLevel: "low" },
        ]
        : [
          { title: "核查核心区新风与空调联动", priority: "high", expectedReductionPct: 7, costLevel: "medium" },
          { title: "按分区与时段细化温控设定", priority: "medium", expectedReductionPct: 5, costLevel: "low" },
          { title: "配置夜间低负荷节能模式", priority: "medium", expectedReductionPct: 4, costLevel: "low" },
        ];

  const totalPotentialPct = Math.min(35, advice.reduce((sum, item) => sum + item.expectedReductionPct, 0));
  const estimatedReductionKg = snapshot.eTotal * GRID_EMISSION_FACTOR * (totalPotentialPct / 100);

  return { status, risk, clause, score, maxZone, advice, totalPotentialPct, estimatedReductionKg };
}

function getCarbonGrade(score: number) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "E";
}

function getRadarMetrics(snapshot: BuildingSnapshot | null, score: number) {
  if (!snapshot) {
    return [
      { label: "碳排强度", value: 0 },
      { label: "温控效率", value: 0 },
      { label: "太阳辐射利用率", value: 0 },
      { label: "区域均衡性", value: 0 },
    ];
  }

  const total = Math.max(snapshot.eTotal, 0.1);
  const maxZone = Math.max(snapshot.eCore, snapshot.ePeri, snapshot.eRoof);
  const minZone = Math.min(snapshot.eCore, snapshot.ePeri, snapshot.eRoof);
  const zoneBalance = Math.max(0, 100 - ((maxZone - minZone) / total) * 100);
  const tempEff = Math.max(0, Math.min(100, 100 - Math.abs(snapshot.tAvg - snapshot.outdoorTemp) * 2.2));
  const ghiNorm = Math.min(1.2, snapshot.ghi / 700);
  const periRoofLoad = (snapshot.ePeri * 0.55 + snapshot.eRoof * 0.45) / total;
  const solarUtil = Math.max(0, Math.min(100, 100 - periRoofLoad * 55 * (0.45 + ghiNorm)));
  const carbonIntensity = Math.max(0, Math.min(100, score));

  return [
    { label: "碳排强度", value: carbonIntensity },
    { label: "温控效率", value: Number(tempEff.toFixed(1)) },
    { label: "太阳辐射利用率", value: Number(solarUtil.toFixed(1)) },
    { label: "区域均衡性", value: Number(zoneBalance.toFixed(1)) },
  ];
}

function ComplianceRadar({ metrics }: { metrics: Array<{ label: string; value: number }> }) {
  const size = 220;
  const center = size / 2;
  const maxRadius = 74;
  const ringLevels = [0.25, 0.5, 0.75, 1];

  const axis = metrics.map((m, i) => {
    const angle = (-Math.PI / 2) + (i * Math.PI * 2) / metrics.length;
    return {
      ...m,
      angle,
      x: center + Math.cos(angle) * maxRadius,
      y: center + Math.sin(angle) * maxRadius,
    };
  });

  const valuePoints = axis
    .map((a) => {
      const r = (Math.max(0, Math.min(100, a.value)) / 100) * maxRadius;
      return `${center + Math.cos(a.angle) * r},${center + Math.sin(a.angle) * r}`;
    })
    .join(" ");

  return (
    <div className="flex items-center justify-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-[220px] w-[220px]">
        {ringLevels.map((ratio) => (
          <polygon
            key={ratio}
            points={axis
              .map((a) => `${center + Math.cos(a.angle) * maxRadius * ratio},${center + Math.sin(a.angle) * maxRadius * ratio}`)
              .join(" ")}
            fill="none"
            stroke="#334155"
            strokeWidth="1"
          />
        ))}

        {axis.map((a) => (
          <line key={`line-${a.label}`} x1={center} y1={center} x2={a.x} y2={a.y} stroke="#334155" strokeWidth="1" />
        ))}

        <polygon points={valuePoints} fill="#22d3ee33" stroke="#06b6d4" strokeWidth="2" />

        {axis.map((a) => (
          <text
            key={`label-${a.label}`}
            x={center + Math.cos(a.angle) * (maxRadius + 18)}
            y={center + Math.sin(a.angle) * (maxRadius + 18)}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="10"
            fill="#cbd5e1"
          >
            {a.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function CarbonEfficiencyMedal({ grade, night }: { grade: string; night: boolean }) {
  const bar: Record<string, string> = {
    A: "bg-gradient-to-b from-emerald-600 to-emerald-400",
    B: "bg-gradient-to-b from-lime-600 to-lime-400",
    C: "bg-gradient-to-b from-amber-500 to-yellow-400",
    D: "bg-gradient-to-b from-orange-600 to-orange-400",
    E: "bg-gradient-to-b from-red-700 to-red-500",
  };

  return (
    <div
      className={`flex h-[118px] w-[52px] shrink-0 flex-col rounded-sm border-2 shadow-md ${night ? "border-white/25" : "border-zinc-500"} ${bar[grade] || bar.C}`}
    >
      <div className="px-1 pt-1 text-center text-[8px] font-bold leading-tight text-white">碳效标识</div>
      <div className="flex flex-1 items-center justify-center text-4xl font-black leading-none text-white drop-shadow-md">{grade}</div>
      <div className="pb-1 text-center text-[7px] font-medium text-white/90">A–E 等级</div>
    </div>
  );
}

export function VisualizationDatasetPage() {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [timeIndex, setTimeIndex] = useState(0);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [detailFocusZone, setDetailFocusZone] = useState<ZoneKey | null>(null);
  const [playing, setPlaying] = useState(false);
  const [isNight, setIsNight] = useState(false);

  const handleSelectBuilding = useCallback((id: string | null, zone?: ZoneKey) => {
    setSelectedBuildingId(id);
    if (id === null) {
      setDetailFocusZone(null);
      return;
    }
    if (zone !== undefined) {
      setDetailFocusZone(zone);
    } else {
      setDetailFocusZone(null);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/multi_zone_building_data.csv");
        if (!response.ok) {
          throw new Error(`读取数据失败 (HTTP ${response.status})`);
        }

        const text = await response.text();
        const parsed = parseCsv(text);
        if (active) {
          setRows(parsed);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "读取数据失败");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const timeList = useMemo(() => Array.from(new Set(rows.map((row) => row.Time))).sort(), [rows]);

  useEffect(() => {
    if (timeList.length === 0) return;
    setTimeIndex((prev) => Math.min(prev, timeList.length - 1));
  }, [timeList]);

  useEffect(() => {
    if (!playing || timeList.length === 0) return;

    const timer = window.setInterval(() => {
      setTimeIndex((prev) => (prev + 1) % timeList.length);
    }, 900);

    return () => window.clearInterval(timer);
  }, [playing, timeList]);

  const buildingCatalog = useMemo(() => {
    const map = new Map<string, BuildingMeta>();
    for (const row of rows) {
      if (!map.has(row.Building_ID)) {
        map.set(row.Building_ID, {
          buildingId: row.Building_ID,
          buildingType: row.Building_Type,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.buildingId.localeCompare(b.buildingId));
  }, [rows]);

  const positionMap = useMemo(() => createUrbanLayout(buildingCatalog), [buildingCatalog]);

  const snapshotMap = useMemo(() => {
    if (timeList.length === 0) {
      return new Map<string, BuildingSnapshot>();
    }

    const currentTime = timeList[timeIndex];
    const map = new Map<string, BuildingSnapshot>();

    rows.forEach((row) => {
      if (row.Time !== currentTime) return;
      map.set(row.Building_ID, {
        buildingId: row.Building_ID,
        buildingType: row.Building_Type,
        time: row.Time,
        eCore: row.E_core,
        ePeri: row.E_peri,
        eRoof: row.E_roof,
        eTotal: row.E_total,
        tCore: row.T_core,
        tPeri: row.T_peri,
        tRoof: row.T_roof,
        tAvg: row.T_avg,
        outdoorTemp: row.Text,
        ghi: row.GHI,
      });
    });

    return map;
  }, [rows, timeIndex, timeList]);

  const selectedMeta = useMemo(
    () => buildingCatalog.find((item) => item.buildingId === selectedBuildingId) || null,
    [buildingCatalog, selectedBuildingId],
  );
  const selectedSnapshot = selectedBuildingId ? snapshotMap.get(selectedBuildingId) || null : null;

  const availableSnapshots = useMemo(() => Array.from(snapshotMap.values()), [snapshotMap]);

  const summary = useMemo(() => {
    const total = availableSnapshots.reduce((sum, item) => sum + item.eTotal, 0);
    const core = availableSnapshots.reduce((sum, item) => sum + item.eCore, 0);
    const peri = availableSnapshots.reduce((sum, item) => sum + item.ePeri, 0);
    const roof = availableSnapshots.reduce((sum, item) => sum + item.eRoof, 0);
    return { total, core, peri, roof };
  }, [availableSnapshots]);

  const sankeyData = useMemo(() => buildSankeyData(availableSnapshots), [availableSnapshots]);

  const primarySnapshot = useMemo(() => {
    if (selectedSnapshot) return selectedSnapshot;
    if (availableSnapshots.length === 0) return null;
    return [...availableSnapshots].sort((a, b) => b.eTotal - a.eTotal)[0];
  }, [availableSnapshots, selectedSnapshot]);

  const primaryMeta = useMemo(() => {
    if (selectedMeta) return selectedMeta;
    if (!primarySnapshot) return null;
    return buildingCatalog.find((item) => item.buildingId === primarySnapshot.buildingId) || null;
  }, [buildingCatalog, primarySnapshot, selectedMeta]);

  const audit = useMemo(
    () => evaluateAudit(primarySnapshot, primaryMeta?.buildingType || null),
    [primaryMeta?.buildingType, primarySnapshot],
  );

  const carbonTotalKg = summary.total * GRID_EMISSION_FACTOR;
  const carbonIntensity = buildingCatalog.length > 0 ? carbonTotalKg / buildingCatalog.length : 0;
  const carbonGrade = getCarbonGrade(audit.score);
  const radarMetrics = useMemo(() => getRadarMetrics(primarySnapshot, audit.score), [primarySnapshot, audit.score]);

  const market = useMemo(() => {
    const label = timeList[timeIndex] ?? "";
    const hour = parseHourFromTime(label);
    const t = getSimulatedTariff(hour);
    const carbonYuanPerTon = 56 + (timeIndex % 9) * 1.2 + (hour % 4) * 0.35;
    return { ...t, carbonYuanPerTon, hour, timeLabel: label };
  }, [timeList, timeIndex]);

  const estimatedSliceElectricYuan = summary.total * market.yuanPerKwh;
  const marqueeGhi = primarySnapshot?.ghi ?? 0;
  const marqueeOutdoor = primarySnapshot?.outdoorTemp ?? 0;

  const openPrimaryAiDiagnosis = () => {
    if (!primarySnapshot || !primaryMeta) return;
    const zKey: "core" | "perimeter" | "roof" =
      audit.maxZone === "perimeter" ? "perimeter" : audit.maxZone === "roof" ? "roof" : "core";
    const zcn = zoneMap[audit.maxZone] || "核心区";
    const base = buildZoneDiagnosisPrompt(primarySnapshot, zKey, zcn);
    const text = `${base}\n\n【合规摘要】${audit.clause}（评分 ${audit.score}）。请给出总结性处方。`;
    window.dispatchEvent(
      new CustomEvent("energy-open-ai-assistant", {
        detail: { seedPrompt: { text, autoSend: true } },
      }),
    );
  };

  // 同步 isNight 到 Navbar，让顶栏文字颜色随昼夜变化
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("energy-night-mode", {
        detail: { night: isNight },
      }),
    );
  }, [isNight]);

  const beforeCarbonKg = primarySnapshot ? primarySnapshot.eTotal * GRID_EMISSION_FACTOR : 0;
  const afterCarbonKg = Math.max(0, beforeCarbonKg - audit.estimatedReductionKg);

  const riskMap: Record<string, string> = { low: "低", medium: "中", high: "高" };
  const statusMap: Record<string, string> = { pass: "通过", warning: "预警", fail: "不通过", "数据不足": "数据不足" };
  const zoneMap: Record<string, string> = { core: "核心区", perimeter: "周边区", roof: "屋面", unknown: "未知" };
  const priorityMap: Record<string, string> = { high: "高", medium: "中", low: "低" };

  const handleAskAIForSelectedBuilding = useCallback(() => {
    if (!selectedMeta) return;
    if (selectedSnapshot) {
      const z = detailFocusZone ?? inferDominantZone(selectedSnapshot);
      const zcn = z === "perimeter" ? "周边区" : z === "roof" ? "屋面" : "核心区";
      const text = buildZoneDiagnosisPrompt(selectedSnapshot, z, zcn);
      window.dispatchEvent(
        new CustomEvent("energy-open-ai-assistant", {
          detail: { seedPrompt: { text, autoSend: true } },
        }),
      );
    } else {
      const typeName = TYPE_LABEL[selectedMeta.buildingType] || selectedMeta.buildingType;
      const text = `你是建筑能源专家。建筑 ${selectedMeta.buildingId}（${typeName}）在当前时间切片暂无能耗数据。请说明可能原因并给出排查与表计接入建议。`;
      window.dispatchEvent(
        new CustomEvent("energy-open-ai-assistant", {
          detail: { seedPrompt: { text, autoSend: true } },
        }),
      );
    }
  }, [detailFocusZone, selectedMeta, selectedSnapshot]);
  const costMap: Record<string, string> = { high: "高", medium: "中", low: "低" };

  return (
    <main className={`min-h-screen px-4 pb-8 pt-24 lg:px-6 ${isNight
        ? "bg-[radial-gradient(circle_at_15%_18%,rgba(34,211,238,0.08),transparent_38%),linear-gradient(165deg,#030712_0%,#0b1120_45%,#111827_100%)] text-slate-100"
        : "bg-gradient-to-br from-slate-100 to-slate-200 text-zinc-900"
      }`}>
      <div className="mx-auto flex max-w-[1650px] flex-col gap-4">
        {!loading && !error && timeList.length > 0 && (
          <>
            <style>
              {`
                @keyframes viz-energy-marquee {
                  0% { transform: translateX(0); }
                  100% { transform: translateX(-50%); }
                }
              `}
            </style>
            <div
              className={`relative h-10 w-full overflow-hidden rounded-xl border shadow-sm ${isNight ? "border-cyan-500/35 bg-slate-950/95" : "border-zinc-400 bg-white"}`}
            >
              <div
                className="absolute left-0 top-0 flex h-full w-max items-center"
                style={{ animation: "viz-energy-marquee 32s linear infinite" }}
              >
                {[
                  "a",
                  "b",
                ].map((key) => (
                  <span
                    key={key}
                    className={`inline-flex items-center gap-2 px-10 text-xs ${isNight ? "text-slate-200" : "text-zinc-800"}`}
                  >
                    <span className="font-semibold text-amber-500">【实时播报】</span>
                    <span>
                      碳市场参考均价：
                      <strong className={isNight ? "text-teal-300" : "text-teal-700"}>{market.carbonYuanPerTon.toFixed(1)}</strong>
                      元/tCO₂
                    </span>
                    <span className={isNight ? "text-slate-500" : "text-zinc-500"}>|</span>
                    <span>
                      室外 {marqueeOutdoor.toFixed(1)}℃ · GHI {marqueeGhi.toFixed(0)} W/m²
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
        <header className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 shadow-[0_20px_50px_rgba(2,6,23,0.5)] ${isNight
            ? "border border-cyan-500/20 bg-slate-950/70 backdrop-blur"
            : "border border-zinc-300 bg-white/90 backdrop-blur"
          }`}>
          <div>
            <h1 className={`text-xl font-semibold ${isNight ? "text-white" : "text-zinc-900"}`}>多建筑能耗 3D 驾驶舱</h1>
            <p className={`mt-1 text-sm ${isNight ? "text-slate-400" : "text-zinc-600"}`}>四象限分区 · CSV 时间切片联动</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsNight(!isNight)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${isNight
                  ? "border border-amber-400/50 bg-amber-950/40 text-amber-200 hover:bg-amber-950/60"
                  : "border border-zinc-400 bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
                }`}
              type="button"
            >
              {isNight ? "切换白天" : "切换黑夜"}
            </button>
            <button
              onClick={() => setPlaying((prev) => !prev)}
              className={`rounded-md border px-3 py-2 text-sm transition-colors ${isNight
                  ? "border-cyan-500/35 bg-cyan-950/40 text-cyan-100 hover:bg-cyan-950/60"
                  : "border-zinc-400 bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
                }`}
              type="button"
            >
              {playing ? "暂停回放" : "自动回放"}
            </button>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <div className={`rounded-2xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ${isNight
                ? "border border-slate-600/35 bg-slate-950/75 backdrop-blur"
                : "border border-zinc-300 bg-white/90 backdrop-blur"
              }`}>
              {loading ? (
                <div className={`flex h-[62vh] min-h-[420px] items-center justify-center ${isNight ? "text-slate-400" : "text-zinc-600"}`}>正在加载数据...</div>
              ) : error ? (
                <div className="flex h-[62vh] min-h-[420px] items-center justify-center text-red-500">{error}</div>
              ) : (
                <div className={`relative h-[62vh] min-h-[420px] overflow-hidden rounded-xl border ${isNight ? "border-cyan-500/15 bg-slate-950" : "border-zinc-300 bg-slate-50"}`}>
                  <Canvas
                    shadows
                    camera={{ position: [25, 25, 25], fov: 42, near: 0.1, far: 220 }}
                    onPointerMissed={() => handleSelectBuilding(null)}
                  >
                    <color attach="background" args={[isNight ? "#020617" : "#f8fafc"]} />
                    {isNight && <fogExp2 attach="fog" args={["#030712", 0.011]} />}
                    {/* 环境光 - 白天明亮，夜间深邃 */}
                    <ambientLight intensity={isNight ? 0.25 : 0.85} color={isNight ? "#67e8f9" : "#ffffff"} />
                    {/* 主光源 - 太阳/月光 */}
                    <directionalLight
                      color={isNight ? "#93c5fd" : "#fffbeb"}
                      position={[20, 25, 14]}
                      intensity={isNight ? 0.6 : 1.2}
                      castShadow
                      shadow-mapSize-width={2048}
                      shadow-mapSize-height={2048}
                    />
                    {/* 补光 - 营造氛围 */}
                    <directionalLight color={isNight ? "#22d3ee" : "#e0f2fe"} position={[-14, 10, -10]} intensity={isNight ? 0.3 : 0.4} />
                    {/* 夜间补充蓝调环境光 */}
                    {isNight && (
                      <>
                        <pointLight position={[0, 5, 0]} color="#38bdf8" intensity={0.5} distance={30} />
                        <hemisphereLight skyColor="#1e3a5f" groundColor="#0f172a" intensity={0.4} />
                      </>
                    )}
                    {/* 白天柔和阴影 */}
                    {!isNight && (
                      <directionalLight color="#fef3c7" position={[0, 30, 0]} intensity={0.3} />
                    )}

                    <GroundDecor night={isNight} />
                    <RoadNetwork night={isNight} />
                    <StreetLights night={isNight} />
                    <CenterHub night={isNight} />
                    <ZoneLabels night={isNight} />

                    {buildingCatalog.map((item) => (
                      <EnergyArc key={`arc-${item.buildingId}`} target={positionMap.get(item.buildingId) || [0, 0, 0]} active={snapshotMap.has(item.buildingId)} night={isNight} />
                    ))}

                    {buildingCatalog.map((item) => (
                      <BuildingBlock
                        key={item.buildingId}
                        meta={item}
                        snapshot={snapshotMap.get(item.buildingId) || null}
                        position={positionMap.get(item.buildingId) || [0, 0, 0]}
                        selected={item.buildingId === selectedBuildingId}
                        night={isNight}
                        onSelect={handleSelectBuilding}
                      />
                    ))}

                    <OrbitControls
                      enablePan
                      enableZoom
                      enableRotate
                      autoRotate={!selectedBuildingId}
                      autoRotateSpeed={0.1}
                      minDistance={12}
                      maxDistance={80}
                      minPolarAngle={0.45}
                      maxPolarAngle={Math.PI / 2.05}
                      target={[0, 2.5, 0]}
                    />
                  </Canvas>

                  {selectedMeta && (
                    <div
                      className={`absolute left-4 top-20 z-30 w-[min(100%,280px)] max-h-[min(72vh,520px)] overflow-y-auto rounded-2xl border p-4 shadow-[0_16px_48px_rgba(2,6,23,0.45)] backdrop-blur-md ${isNight
                          ? "border-cyan-500/25 bg-slate-950/95 text-slate-100"
                          : "border-zinc-300 bg-white/95 text-zinc-900"
                        }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className={`text-sm font-semibold ${isNight ? "text-white" : "text-zinc-900"}`}>建筑详情</h3>
                        <button
                          type="button"
                          onClick={() => handleSelectBuilding(null)}
                          className={`shrink-0 rounded-md px-2 py-0.5 text-xs ${isNight ? "text-slate-400 hover:bg-white/10" : "text-zinc-500 hover:bg-zinc-100"}`}
                        >
                          关闭
                        </button>
                      </div>
                      <p className={`mt-1 text-[11px] ${isNight ? "text-slate-400" : "text-zinc-500"}`}>
                        {selectedMeta.buildingId} · {TYPE_LABEL[selectedMeta.buildingType] || selectedMeta.buildingType}
                        {detailFocusZone ? ` · 已选分区：${zoneMap[detailFocusZone]}` : ""}
                      </p>
                      {!selectedSnapshot ? (
                        <div
                          className={`mt-3 rounded-lg border p-3 text-xs ${isNight ? "border-amber-500/35 bg-amber-500/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-900"}`}
                        >
                          当前时间切片暂无数据
                        </div>
                      ) : (
                        <div className={`mt-3 space-y-2 text-xs ${isNight ? "text-slate-300" : "text-zinc-700"}`}>
                          <div className="grid grid-cols-2 gap-2">
                            <div className={`rounded-lg border p-2 ${isNight ? "border-slate-600/40 bg-slate-900/50" : "border-zinc-200 bg-zinc-50"}`}>
                              <p className={isNight ? "text-slate-500" : "text-zinc-500"}>核心区</p>
                              <p className={`font-semibold ${isNight ? "text-white" : "text-zinc-900"}`}>{selectedSnapshot.eCore.toFixed(2)} kW</p>
                            </div>
                            <div className={`rounded-lg border p-2 ${isNight ? "border-slate-600/40 bg-slate-900/50" : "border-zinc-200 bg-zinc-50"}`}>
                              <p className={isNight ? "text-slate-500" : "text-zinc-500"}>周边区</p>
                              <p className={`font-semibold ${isNight ? "text-white" : "text-zinc-900"}`}>{selectedSnapshot.ePeri.toFixed(2)} kW</p>
                            </div>
                            <div className={`rounded-lg border p-2 ${isNight ? "border-slate-600/40 bg-slate-900/50" : "border-zinc-200 bg-zinc-50"}`}>
                              <p className={isNight ? "text-slate-500" : "text-zinc-500"}>屋面</p>
                              <p className={`font-semibold ${isNight ? "text-white" : "text-zinc-900"}`}>{selectedSnapshot.eRoof.toFixed(2)} kW</p>
                            </div>
                            <div className={`rounded-lg border p-2 ${isNight ? "border-cyan-500/30 bg-cyan-950/40" : "border-cyan-200 bg-cyan-50"}`}>
                              <p className={isNight ? "text-cyan-200/80" : "text-cyan-800"}>合计</p>
                              <p className={`font-semibold ${isNight ? "text-cyan-100" : "text-cyan-900"}`}>{selectedSnapshot.eTotal.toFixed(2)} kW</p>
                            </div>
                          </div>
                          <div className={`rounded-lg border p-2 ${isNight ? "border-slate-600/40" : "border-zinc-200"}`}>
                            <p className="mb-1 font-medium">分区占比</p>
                            <p>
                              核心 {selectedSnapshot.eTotal > 0 ? ((selectedSnapshot.eCore / selectedSnapshot.eTotal) * 100).toFixed(1) : "0"}% · 周边{" "}
                              {selectedSnapshot.eTotal > 0 ? ((selectedSnapshot.ePeri / selectedSnapshot.eTotal) * 100).toFixed(1) : "0"}% · 屋面{" "}
                              {selectedSnapshot.eTotal > 0 ? ((selectedSnapshot.eRoof / selectedSnapshot.eTotal) * 100).toFixed(1) : "0"}%
                            </p>
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={handleAskAIForSelectedBuilding}
                        className={`mt-4 w-full rounded-lg py-2.5 text-sm font-semibold transition-colors ${isNight
                            ? "bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/40 hover:bg-cyan-500/30"
                            : "bg-cyan-600 text-white hover:bg-cyan-700"
                          }`}
                      >
                        问 AI
                      </button>
                    </div>
                  )}

                  {/* 图例 - 右上角（缩小，仅图标模式，白天保持低调） */}
                  <div className={`pointer-events-none absolute top-16 right-4 z-20 w-[180px] rounded-xl p-2 shadow-[0_4px_12px_rgba(2,6,23,0.35)] backdrop-blur-sm transition-opacity duration-500 ${isNight
                      ? "bg-slate-950/80 border border-cyan-500/20 text-slate-100"
                      : "bg-white/70 border border-zinc-200 text-zinc-900"
                    }`}>
                    <div className={`grid grid-cols-2 gap-x-1 gap-y-0.5 text-[9px] ${isNight ? "text-slate-300" : "text-zinc-600"}`}>
                      {Object.entries(TYPE_LABEL).map(([type, label]) => (
                        <div key={type} className="flex items-center gap-0.5">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: TYPE_COLOR[type] || DEFAULT_COLOR }} />
                          <span className="truncate">{label}</span>
                        </div>
                      ))}
                      <div className="col-span-2 flex items-center gap-0.5 pt-0.5 mt-0.5 border-t">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                        <span className={isNight ? "text-slate-400" : "text-zinc-500"}>能源中心</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {!loading && !error && timeList.length > 0 && (
              <div className={`rounded-2xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ${isNight
                  ? "border border-slate-600/35 bg-slate-950/75 backdrop-blur"
                  : "border border-zinc-300 bg-white/90 backdrop-blur"
                }`}>
                <div className={`mb-2 flex items-center justify-between text-sm ${isNight ? "text-slate-400" : "text-zinc-600"}`}>
                  <span>时间切片</span>
                  <span className={`font-medium ${isNight ? "text-slate-100" : "text-zinc-900"}`}>{timeList[timeIndex]}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, timeList.length - 1)}
                  value={timeIndex}
                  onChange={(event) => setTimeIndex(Number(event.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>
            )}

            {!loading && !error && availableSnapshots.length > 0 && (
              <div className={`rounded-2xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.12)] ${isNight
                  ? "border border-slate-300 bg-white/90 backdrop-blur"
                  : "border border-zinc-300 bg-white/90 backdrop-blur"
                }`}>
                <SankeyChart data={sankeyData} />
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className={`rounded-2xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ${isNight
                ? "border border-slate-600/35 bg-slate-950/75 backdrop-blur"
                : "border border-zinc-300 bg-white/90 backdrop-blur"
              }`}>
              <h2 className={`text-base font-semibold ${isNight ? "text-slate-100" : "text-zinc-900"}`}>全局概览</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className={`rounded-lg border p-3 ${isNight ? "border-slate-600/35 bg-slate-900/55" : "border-zinc-200 bg-zinc-50"}`}>
                  <p className={isNight ? "text-slate-400" : "text-zinc-600"}>当前碳排</p>
                  <p className={`mt-1 text-xl font-bold ${isNight ? "text-white" : "text-zinc-900"}`}>{carbonTotalKg.toFixed(1)} kgCO2e</p>
                </div>
                <div className={`rounded-lg border p-3 ${isNight ? "border-slate-600/35 bg-slate-900/55" : "border-zinc-200 bg-zinc-50"}`}>
                  <p className={isNight ? "text-slate-400" : "text-zinc-600"}>碳强度</p>
                  <p className={`mt-1 text-xl font-bold ${isNight ? "text-white" : "text-zinc-900"}`}>{carbonIntensity.toFixed(2)} kgCO2e/栋</p>
                </div>
                <div className={`rounded-lg border p-3 ${isNight ? "border-slate-600/35 bg-slate-900/55" : "border-zinc-200 bg-zinc-50"}`}>
                  <p className={isNight ? "text-slate-400" : "text-zinc-600"}>覆盖率</p>
                  <p className={`mt-1 text-xl font-bold ${isNight ? "text-white" : "text-zinc-900"}`}>{availableSnapshots.length}/{buildingCatalog.length}</p>
                </div>
                <div className={`rounded-lg border p-3 ${isNight ? "border-slate-600/35 bg-slate-900/55" : "border-zinc-200 bg-zinc-50"}`}>
                  <p className={isNight ? "text-slate-400" : "text-zinc-600"}>高耗能分区</p>
                  <p className={`mt-1 text-xl font-bold ${isNight ? "text-white" : "text-zinc-900"}`}>{zoneMap[audit.maxZone] || audit.maxZone}</p>
                </div>
              </div>
            </div>

            <div
              className={`rounded-2xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ${isNight
                  ? "border bg-slate-950/75 backdrop-blur " +
                    (audit.status === "pass"
                      ? "border-emerald-500/45 ring-1 ring-emerald-500/20"
                      : audit.status === "fail"
                        ? "border-red-500/55 ring-1 ring-red-500/25"
                        : "border-amber-500/40 ring-1 ring-amber-500/15")
                  : "border bg-white/90 backdrop-blur " +
                    (audit.status === "pass"
                      ? "border-emerald-400"
                      : audit.status === "fail"
                        ? "border-red-400"
                        : "border-amber-300")
                }`}
            >
              <div className={`flex gap-3 ${isNight ? "text-slate-100" : "text-zinc-900"}`}>
                <CarbonEfficiencyMedal grade={carbonGrade} night={isNight} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold">合规审查结果</h2>
                    {audit.status === "pass" ? (
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${isNight ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}
                      >
                        绿色建筑达标（示意）
                      </span>
                    ) : audit.status === "fail" ? (
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${isNight ? "border-red-400/60 bg-red-500/15 text-red-300" : "border-red-300 bg-red-50 text-red-800"}`}
                      >
                        需整改 · 红灯预警
                      </span>
                    ) : (
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${isNight ? "border-amber-400/50 bg-amber-500/15 text-amber-200" : "border-amber-300 bg-amber-50 text-amber-900"}`}
                      >
                        预警观察
                      </span>
                    )}
                  </div>
                  <p className={`mt-2 text-xs ${isNight ? "text-slate-400" : "text-zinc-600"}`}>
                    碳效等级 {carbonGrade} 级 · 对标 GB 55015 静态审计逻辑（演示）
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className={`rounded-lg border p-3 ${isNight ? "border-slate-600/35 bg-slate-900/55" : "border-zinc-200 bg-zinc-50"}`}>
                  <p className={isNight ? "text-slate-400" : "text-zinc-600"}>状态</p>
                  <p className={`mt-1 text-xl font-bold ${isNight ? "text-white" : "text-zinc-900"}`}>{statusMap[audit.status] || audit.status}</p>
                </div>
                <div className={`rounded-lg border p-3 ${isNight ? "border-slate-600/35 bg-slate-900/55" : "border-zinc-200 bg-zinc-50"}`}>
                  <p className={isNight ? "text-slate-400" : "text-zinc-600"}>风险</p>
                  <p className={`mt-1 text-xl font-bold ${isNight ? "text-white" : "text-zinc-900"}`}>{riskMap[audit.risk] || audit.risk}</p>
                </div>
                <div className={`rounded-lg border p-3 ${isNight ? "border-slate-600/35 bg-slate-900/55" : "border-zinc-200 bg-zinc-50"}`}>
                  <p className={isNight ? "text-slate-400" : "text-zinc-600"}>评分</p>
                  <p className={`mt-1 text-xl font-bold ${isNight ? "text-white" : "text-zinc-900"}`}>{audit.score}</p>
                </div>
                <div className={`rounded-lg border p-3 ${isNight ? "border-slate-600/35 bg-slate-900/55" : "border-zinc-200 bg-zinc-50"}`}>
                  <p className={isNight ? "text-slate-400" : "text-zinc-600"}>对象</p>
                  <p className={`mt-1 text-lg font-bold ${isNight ? "text-white" : "text-zinc-900"}`}>{primaryMeta?.buildingId || "全局"}</p>
                </div>
              </div>
              <div className={`mt-3 rounded-lg border p-3 text-sm ${isNight ? "border-slate-600/35 bg-slate-900/55 text-slate-300" : "border-zinc-200 bg-zinc-50 text-zinc-700"}`}>
                <p className={`font-medium ${isNight ? "text-slate-100" : "text-zinc-900"}`}>条款结论</p>
                <p className="mt-1">{audit.clause}</p>
              </div>
            </div>

            <div className={`rounded-2xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ${isNight
                ? "border border-slate-600/35 bg-slate-950/75 backdrop-blur"
                : "border border-zinc-300 bg-white/90 backdrop-blur"
              }`}>
              <h2 className={`text-base font-semibold ${isNight ? "text-slate-100" : "text-zinc-900"}`}>合规雷达图</h2>
              <ComplianceRadar metrics={radarMetrics} />
              <div className={`mt-2 grid grid-cols-2 gap-2 text-xs ${isNight ? "text-slate-300" : "text-zinc-700"}`}>
                {radarMetrics.map((m) => (
                  <div key={m.label} className={`rounded border px-2 py-1 ${isNight ? "border-slate-600/35 bg-slate-900/55" : "border-zinc-200 bg-zinc-50"}`}>
                    {m.label}: {m.value.toFixed(1)}
                  </div>
                ))}
              </div>
            </div>

            <div className={`rounded-2xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ${isNight
                ? "border border-slate-600/35 bg-slate-950/75 backdrop-blur"
                : "border border-zinc-300 bg-white/90 backdrop-blur"
              }`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className={`text-base font-semibold ${isNight ? "text-slate-100" : "text-zinc-900"}`}>AI 调优建议</h2>
                <button
                  type="button"
                  disabled={!primarySnapshot}
                  onClick={openPrimaryAiDiagnosis}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${isNight
                      ? "border border-cyan-500/40 bg-cyan-950/60 text-cyan-100 hover:bg-cyan-950/90"
                      : "border border-cyan-600 bg-cyan-50 text-cyan-900 hover:bg-cyan-100"
                    }`}
                >
                  一键 AI 诊断
                </button>
              </div>
              <div className={`mt-3 rounded-lg border p-3 text-sm ${isNight ? "border-slate-600/35 bg-slate-900/55" : "border-zinc-200 bg-zinc-50"}`}>
                <p className={isNight ? "text-slate-400" : "text-zinc-600"}>关注对象</p>
                <p className={`mt-1 font-medium ${isNight ? "text-slate-100" : "text-zinc-900"}`}>
                  {primaryMeta ? `${primaryMeta.buildingId} · ${TYPE_LABEL[primaryMeta.buildingType] || primaryMeta.buildingType}` : "暂无重点建筑"}
                </p>
                <p className={`mt-3 ${isNight ? "text-slate-400" : "text-zinc-600"}`}>优化前后对比</p>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <div className={`rounded border px-2 py-2 ${isNight ? "border-slate-600/35 bg-slate-950/80" : "border-zinc-200 bg-zinc-100"}`}>
                    <p className={`text-xs ${isNight ? "text-slate-400" : "text-zinc-600"}`}>优化前</p>
                    <p className={`text-sm font-semibold ${isNight ? "text-slate-100" : "text-zinc-900"}`}>{beforeCarbonKg.toFixed(2)} kgCO2e</p>
                  </div>
                  <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-2">
                    <p className="text-xs text-emerald-700">优化后（估算）</p>
                    <p className="text-sm font-semibold text-emerald-800">{afterCarbonKg.toFixed(2)} kgCO2e</p>
                  </div>
                </div>

                <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs text-emerald-800">
                  预计可减排：{audit.estimatedReductionKg.toFixed(2)} kgCO2e（{audit.totalPotentialPct.toFixed(1)}%）
                </div>

                <p className={`mt-3 ${isNight ? "text-slate-400" : "text-zinc-600"}`}>建议优先级</p>
                <div className="mt-1 space-y-2 text-slate-300">
                  {audit.advice.map((tip) => (
                    <div key={tip.title} className={`rounded border px-2 py-2 ${isNight ? "border-slate-600/35 bg-slate-950/80" : "border-zinc-200 bg-zinc-100"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm font-medium ${isNight ? "text-slate-100" : "text-zinc-900"}`}>{tip.title}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tip.priority === "high"
                              ? "bg-red-100 text-red-700"
                              : tip.priority === "medium"
                                ? "bg-amber-100 text-amber-500"
                                : "bg-slate-100 text-slate-500"
                            }`}
                        >
                          {priorityMap[tip.priority] || tip.priority}
                        </span>
                      </div>
                      <p className={`mt-1 text-xs ${isNight ? "text-slate-400" : "text-zinc-600"}`}>降幅 {tip.expectedReductionPct}% · 成本 {costMap[tip.costLevel] || tip.costLevel}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={`rounded-2xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ${isNight
                ? "border border-slate-600/35 bg-slate-950/75 backdrop-blur"
                : "border border-zinc-300 bg-white/90 backdrop-blur"
              }`}>
              <h2 className={`text-base font-semibold ${isNight ? "text-slate-100" : "text-zinc-900"}`}>场景操作</h2>
              <p className={`mt-2 text-sm leading-relaxed ${isNight ? "text-slate-400" : "text-zinc-600"}`}>
                在 3D 画面中点击建筑后，左侧会弹出详情卡片；点击彩色分区可指定诊断侧重。需要大模型分析时，请在卡片内点击「问 AI」。
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
