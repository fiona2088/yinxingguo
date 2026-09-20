import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, Html, OrbitControls, PerspectiveCamera, RoundedBox, Text } from "@react-three/drei";
import * as THREE from "three";
import { BuildingKind, BuildingMetric } from "../../features/visualization3d/types";

const ENERGY_LINE = "#38bdf8";
const ENERGY_CORE = "#fbbf24";

type Scene3DProps = {
    buildings: BuildingMetric[];
    autoRotate: boolean;
    onBuildingClick: (buildingId: string) => void;
};

const BEVEL = 0.07;
const BEVEL_SM = 0.045;

function getBuildingKind(b: BuildingMetric): BuildingKind {
    return b.buildingType ?? "office";
}

function getBuildingHeight(b: BuildingMetric): number {
    const kind = getBuildingKind(b);
    const base = (b.electricity / 100) * 2.0 + 0.45;
    const maxH: Record<BuildingKind, number> = {
        energy: 2.15,
        office: 5.4,
        commercial: 2.35,
        residential: 3.15,
        school: 2.65,
        hospital: 3.6,
        factory: 2.55,
    };
    return THREE.MathUtils.clamp(base, 0.65, maxH[kind]);
}

function energyCoreWorldY(): number {
    return 2.85;
}

function pbrProps(color: string, metalness: number, roughness: number, emissiveIntensity: number) {
    return { color, metalness, roughness, emissive: color, emissiveIntensity } as const;
}

function OfficeMesh({ height, accent }: { height: number; accent: string }) {
    const w = 0.64;
    const d = 0.64;
    return (
        <group>
            <RoundedBox args={[w, height, d]} radius={BEVEL} smoothness={2} castShadow position={[0, height / 2, 0]}>
                <meshStandardMaterial {...pbrProps(accent, 0.82, 0.18, 0.12)} />
            </RoundedBox>
            {[-0.16, 0, 0.16].map((ox, i) => (
                <mesh key={i} position={[ox, height * 0.48, d / 2 + 0.012]} castShadow>
                    <boxGeometry args={[0.035, height * 0.72, 0.012]} />
                    <meshStandardMaterial color="#38bdf8" metalness={0.92} roughness={0.1} emissive="#0ea5e9" emissiveIntensity={0.4} />
                </mesh>
            ))}
        </group>
    );
}

function ResidentialMesh({ height, bodyColor }: { height: number; bodyColor: string }) {
    const w = 0.68;
    const d = 0.62;
    const y0 = height / 2;
    return (
        <group>
            <RoundedBox args={[w, height, d]} radius={BEVEL} smoothness={2} castShadow position={[0, y0, 0]}>
                <meshStandardMaterial {...pbrProps(bodyColor, 0.35, 0.55, 0.08)} />
            </RoundedBox>
            {[0.25, 0.55, 0.82].map((ty, i) => (
                <RoundedBox key={i} args={[0.52, 0.07, 0.12]} radius={BEVEL_SM} smoothness={2} castShadow position={[0.08, ty * height, d / 2 + 0.05]}>
                    <meshStandardMaterial color="#92400e" metalness={0.2} roughness={0.65} />
                </RoundedBox>
            ))}
            <mesh position={[-w / 2 - 0.02, height * 0.62, 0.12]} castShadow>
                <boxGeometry args={[0.08, 0.1, 0.08]} />
                <meshStandardMaterial color="#e2e8f0" metalness={0.55} roughness={0.35} />
            </mesh>
            <mesh position={[w / 2 + 0.02, height * 0.42, -0.1]} castShadow>
                <boxGeometry args={[0.08, 0.09, 0.08]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.4} />
            </mesh>
            <RoundedBox args={[w + 0.04, 0.09, d + 0.04]} radius={BEVEL_SM} smoothness={2} castShadow position={[0, height + 0.04, 0]}>
                <meshStandardMaterial color="#78716c" metalness={0.25} roughness={0.6} />
            </RoundedBox>
            <mesh position={[0.18, height * 0.35, d / 2 + 0.014]}>
                <planeGeometry args={[0.36, 0.22]} />
                <meshStandardMaterial color="#1e293b" metalness={0.15} roughness={0.5} emissive="#334155" emissiveIntensity={0.15} />
            </mesh>
        </group>
    );
}

function SchoolMesh({ height, bodyColor }: { height: number; bodyColor: string }) {
    const w = 0.82;
    const d = 0.58;
    return (
        <group>
            <RoundedBox args={[w, height, d]} radius={BEVEL} smoothness={2} castShadow position={[0, height / 2, 0]}>
                <meshStandardMaterial {...pbrProps(bodyColor, 0.28, 0.52, 0.06)} />
            </RoundedBox>
            {[-0.28, 0, 0.28].map((ox, i) => (
                <mesh key={i} position={[ox, height * 0.45, d / 2 + 0.012]}>
                    <planeGeometry args={[0.2, 0.36]} />
                    <meshStandardMaterial color="#1e293b" metalness={0.12} roughness={0.45} emissive="#475569" emissiveIntensity={0.12} />
                </mesh>
            ))}
        </group>
    );
}

function CommercialMesh({ height, bodyColor }: { height: number; bodyColor: string }) {
    const w = 0.78;
    const d = 0.7;
    const h = Math.min(height, 2.1);
    return (
        <group>
            <RoundedBox args={[w, h, d]} radius={BEVEL} smoothness={2} castShadow position={[0, h / 2, 0]}>
                <meshStandardMaterial {...pbrProps(bodyColor, 0.42, 0.38, 0.1)} />
            </RoundedBox>
            <mesh position={[0, h * 0.35, d / 2 + 0.015]}>
                <planeGeometry args={[0.62, h * 0.55]} />
                <meshStandardMaterial
                    color="#67e8f9"
                    metalness={0.65}
                    roughness={0.2}
                    emissive="#22d3ee"
                    emissiveIntensity={0.55}
                    transparent
                    opacity={0.92}
                />
            </mesh>
            <RoundedBox args={[w * 0.55, 0.06, 0.16]} radius={BEVEL_SM} smoothness={2} castShadow position={[0, 0.42, d / 2 + 0.09]}>
                <meshStandardMaterial color="#0f766e" metalness={0.35} roughness={0.5} />
            </RoundedBox>
            <RoundedBox args={[0.22, 0.14, 0.12]} radius={BEVEL_SM} smoothness={2} castShadow position={[0, 0.07, d / 2 + 0.08]}>
                <meshStandardMaterial color="#134e4a" metalness={0.3} roughness={0.55} emissive="#115e59" emissiveIntensity={0.08} />
            </RoundedBox>
        </group>
    );
}

function HospitalMesh({ height }: { height: number }) {
    const w = 0.72;
    const d = 0.68;
    const wall = "#e2e8f0";
    return (
        <group>
            <RoundedBox args={[w, height, d]} radius={BEVEL} smoothness={2} castShadow position={[0, height / 2, 0]}>
                <meshStandardMaterial color={wall} metalness={0.18} roughness={0.48} emissive="#f1f5f9" emissiveIntensity={0.04} />
            </RoundedBox>
            {Array.from({ length: 12 }, (_, i) => {
                const row = Math.floor(i / 4);
                const col = i % 4;
                return (
                    <mesh key={`${row}-${col}`} position={[-0.22 + col * 0.15, 0.35 + row * 0.28, d / 2 + 0.012]}>
                        <planeGeometry args={[0.1, 0.14]} />
                        <meshStandardMaterial color="#334155" metalness={0.2} roughness={0.42} emissive="#475569" emissiveIntensity={0.18} />
                    </mesh>
                );
            })}
        </group>
    );
}

function FactoryMesh({ height, bodyColor }: { height: number; bodyColor: string }) {
    const w = 0.95;
    const d = 0.72;
    const h = height;
    return (
        <group>
            <RoundedBox args={[w, h, d]} radius={BEVEL} smoothness={2} castShadow position={[0, h / 2, 0]}>
                <meshStandardMaterial {...pbrProps(bodyColor, 0.55, 0.48, 0.05)} />
            </RoundedBox>
            <mesh position={[-0.32, h + 0.55, -0.15]} castShadow rotation={[0, 0, 0]}>
                <cylinderGeometry args={[0.09, 0.11, 1.1, 8]} />
                <meshStandardMaterial color="#b91c1c" metalness={0.45} roughness={0.42} emissive="#7f1d1d" emissiveIntensity={0.12} />
            </mesh>
            <mesh position={[0.35, h + 0.4, 0.1]} castShadow>
                <cylinderGeometry args={[0.07, 0.09, 0.85, 8]} />
                <meshStandardMaterial color="#991b1b" metalness={0.5} roughness={0.4} emissive="#450a0a" emissiveIntensity={0.1} />
            </mesh>
            <mesh position={[-w / 2 - 0.02, h * 0.55, 0.1]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.04, 0.04, 0.55, 6]} />
                <meshStandardMaterial color="#78716c" metalness={0.7} roughness={0.35} />
            </mesh>
            <mesh position={[w / 2 + 0.04, h * 0.4, -0.15]} rotation={[Math.PI / 3, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.035, 0.035, 0.4, 6]} />
                <meshStandardMaterial color="#57534e" metalness={0.65} roughness={0.38} />
            </mesh>
        </group>
    );
}

function EnergyCenterMesh() {
    const ringRef = useRef<THREE.Mesh>(null);
    const haloRef = useRef<THREE.Group>(null);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        if (ringRef.current) {
            ringRef.current.rotation.y = t * 0.55;
        }
        if (haloRef.current) {
            haloRef.current.rotation.y = -t * 0.35;
            const s = 1 + Math.sin(t * 2) * 0.04;
            haloRef.current.scale.set(s, s, s);
        }
    });

    return (
        <group>
            <RoundedBox args={[1.35, 0.35, 1.35]} radius={0.1} smoothness={2} castShadow position={[0, 0.175, 0]}>
                <meshStandardMaterial color="#0c4a6e" metalness={0.75} roughness={0.28} emissive="#0369a1" emissiveIntensity={0.35} />
            </RoundedBox>
            <RoundedBox args={[0.72, 1.25, 0.72]} radius={0.08} smoothness={2} castShadow position={[0, 0.95, 0]}>
                <meshStandardMaterial color="#164e63" metalness={0.8} roughness={0.22} emissive="#22d3ee" emissiveIntensity={0.28} />
            </RoundedBox>
            <mesh ref={ringRef} position={[0, 1.85, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.42, 0.045, 8, 28]} />
                <meshStandardMaterial color={ENERGY_CORE} emissive={ENERGY_CORE} emissiveIntensity={1.1} metalness={0.4} roughness={0.25} />
            </mesh>
            <group ref={haloRef} position={[0, 1.85, 0]}>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.55, 0.62, 32]} />
                    <meshBasicMaterial color={ENERGY_LINE} transparent opacity={0.45} side={THREE.DoubleSide} />
                </mesh>
            </group>
            <mesh position={[0, 2.35, 0]}>
                <octahedronGeometry args={[0.14, 0]} />
                <meshStandardMaterial color={ENERGY_CORE} emissive={ENERGY_CORE} emissiveIntensity={1.2} metalness={0.5} roughness={0.2} />
            </mesh>
            {[
                [0.72, 0.55, 0.72],
                [-0.72, 0.55, -0.72],
                [0.72, 0.55, -0.72],
                [-0.72, 0.55, 0.72],
            ].map((p, i) => (
                <mesh key={i} position={p as [number, number, number]}>
                    <boxGeometry args={[0.12, 0.35, 0.12]} />
                    <meshStandardMaterial color="#0891b2" metalness={0.85} roughness={0.2} emissive="#06b6d4" emissiveIntensity={0.5} />
                </mesh>
            ))}
        </group>
    );
}

function BuildingBody({ building }: { building: BuildingMetric }) {
    const kind = getBuildingKind(building);
    const h = getBuildingHeight(building);

    switch (kind) {
        case "energy":
            return <EnergyCenterMesh />;
        case "office":
            return <OfficeMesh height={h} accent={building.color} />;
        case "residential":
            return <ResidentialMesh height={h} bodyColor={building.color} />;
        case "school":
            return <SchoolMesh height={h} bodyColor={building.color} />;
        case "commercial":
            return <CommercialMesh height={h} bodyColor={building.color} />;
        case "hospital":
            return <HospitalMesh height={h} />;
        case "factory":
            return <FactoryMesh height={h} bodyColor={building.color} />;
        default:
            return <OfficeMesh height={h} accent={building.color} />;
    }
}

function BuildingNode({ building, onClick }: { building: BuildingMetric; onClick: () => void }) {
    const meshRef = useRef<THREE.Group>(null);
    const kind = getBuildingKind(building);
    const height = getBuildingHeight(building);
    const labelY = kind === "energy" ? 2.95 : height + 0.55;

    useFrame((state) => {
        if (meshRef.current && kind !== "energy") {
            meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.28 + building.position[0]) * 0.025;
        }
    });

    return (
        <group
            ref={meshRef}
            position={building.position}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
        >
            <BuildingBody building={building} />

            {kind !== "energy" && (
                <Float speed={2.1} rotationIntensity={0.25} floatIntensity={0.35}>
                    <mesh position={[0, height * 0.85, 0]}>
                        <sphereGeometry args={[0.11, 12, 12]} />
                        <meshStandardMaterial color={ENERGY_CORE} emissive={ENERGY_CORE} emissiveIntensity={0.85} />
                    </mesh>
                </Float>
            )}

            <Text position={[0, -0.28, 0.75]} fontSize={0.16} color="#e2e8f0" anchorX="center" anchorY="middle" outlineWidth={0.018} outlineColor="#020617">
                {building.name}
            </Text>

            <Html position={[0, labelY, 0]} center>
                <div className="rounded border border-cyan-400/30 bg-slate-950/85 px-2 py-1 text-[10px] font-semibold leading-tight text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.2)] backdrop-blur">
                    <div className="text-slate-400">{building.id}</div>
                    <div className="text-amber-200">{building.electricity.toFixed(1)} kW</div>
                </div>
            </Html>
        </group>
    );
}

function EnergyFlowLines({ buildings }: { buildings: BuildingMetric[] }) {
    const targets = useMemo(() => buildings.filter((b) => getBuildingKind(b) !== "energy"), [buildings]);

    const curves = useMemo(() => {
        const powerCore = new THREE.Vector3(0, energyCoreWorldY(), 0);
        return targets.map((building, index) => {
            const h = getBuildingHeight(building);
            const end = new THREE.Vector3(building.position[0], building.position[1] + h * 0.82, building.position[2]);
            const mid = new THREE.Vector3().lerpVectors(powerCore, end, 0.48);
            mid.y += 0.45 + Math.sin(index * 1.1) * 0.25;
            const points = new THREE.QuadraticBezierCurve3(powerCore, mid, end).getPoints(36);
            return new Float32Array(points.flatMap((point) => [point.x, point.y, point.z]));
        });
    }, [targets]);

    return (
        <group>
            {curves.map((buffer, index) => (
                <line key={`energy-flow-${targets[index].id}`}>
                    <bufferGeometry>
                        <bufferAttribute attach="attributes-position" count={buffer.length / 3} array={buffer} itemSize={3} />
                    </bufferGeometry>
                    <lineBasicMaterial color={ENERGY_LINE} transparent opacity={0.5} />
                </line>
            ))}
        </group>
    );
}

function CityGround() {
    const roadY = 0.021;
    const roadW = 0.52;
    const span = 12.5;
    const roadColor = "#1e293b";
    const laneColor = "#f8fafc";
    const axes = [-4.6, 0, 4.6];

    const dashNodes = useMemo(() => {
        const list: [number, number, number][] = [];
        const step = 0.42;
        for (const x of axes) {
            for (let z = -span / 2; z < span / 2; z += step * 2) {
                list.push([x, roadY + 0.004, z + step * 0.5]);
            }
        }
        for (const z of axes) {
            for (let x = -span / 2; x < span / 2; x += step * 2) {
                list.push([x + step * 0.5, roadY + 0.004, z]);
            }
        }
        return list;
    }, []);

    return (
        <group>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
                <planeGeometry args={[span + 2.4, span + 2.4]} />
                <meshStandardMaterial color="#070b14" metalness={0.2} roughness={0.92} />
            </mesh>

            {axes.map((x) => (
                <mesh key={`rd-x-${x}`} position={[x, roadY, 0]} receiveShadow>
                    <boxGeometry args={[roadW, 0.028, span]} />
                    <meshStandardMaterial color={roadColor} metalness={0.35} roughness={0.65} />
                </mesh>
            ))}
            {axes.map((z) => (
                <mesh key={`rd-z-${z}`} position={[0, roadY + 0.006, z]} receiveShadow>
                    <boxGeometry args={[span, 0.028, roadW]} />
                    <meshStandardMaterial color={roadColor} metalness={0.35} roughness={0.65} />
                </mesh>
            ))}

            {dashNodes.map((pos, i) => (
                <mesh key={`dash-${i}`} position={pos} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[0.2, 0.08]} />
                    <meshStandardMaterial color={laneColor} metalness={0.1} roughness={0.8} emissive="#94a3b8" emissiveIntensity={0.08} />
                </mesh>
            ))}

            {axes.flatMap((x) =>
                axes.map((z) => (
                    <group key={`cw-${x}-${z}`} position={[x, roadY + 0.008, z]}>
                        {[-0.14, 0, 0.14].map((ox) => (
                            <mesh key={ox} position={[ox, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                                <planeGeometry args={[0.1, 0.45]} />
                                <meshStandardMaterial color="#f1f5f9" metalness={0.05} roughness={0.85} />
                            </mesh>
                        ))}
                        {[-0.14, 0, 0.14].map((oz) => (
                            <mesh key={`z-${oz}`} position={[0, 0, oz]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
                                <planeGeometry args={[0.1, 0.45]} />
                                <meshStandardMaterial color="#f1f5f9" metalness={0.05} roughness={0.85} />
                            </mesh>
                        ))}
                    </group>
                )),
            )}

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]} receiveShadow>
                <ringGeometry args={[1.45, 2.55, 48]} />
                <meshStandardMaterial color="#0ea5e9" metalness={0.4} roughness={0.55} emissive="#0369a1" emissiveIntensity={0.15} transparent opacity={0.55} />
            </mesh>

            {[
                [-4.6, -4.6],
                [4.6, -4.6],
                [4.6, 4.6],
                [-4.6, 4.6],
            ].map(([gx, gz], i) => (
                <mesh key={`grass-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[gx * 0.72, 0.025, gz * 0.72]}>
                    <planeGeometry args={[2.2, 2.2]} />
                    <meshStandardMaterial color="#14532d" metalness={0.05} roughness={0.9} emissive="#166534" emissiveIntensity={0.06} />
                </mesh>
            ))}

            {[
                [-5.1, -2.3],
                [5.05, 2.4],
                [-2.2, 5.0],
                [2.5, -5.05],
                [-5.0, 2.0],
                [4.8, -2.0],
            ].map(([tx, tz], i) => (
                <group key={`tree-${i}`} position={[tx, 0, tz]}>
                    <mesh position={[0, 0.2, 0]} castShadow>
                        <cylinderGeometry args={[0.06, 0.08, 0.4, 6]} />
                        <meshStandardMaterial color="#3f2e1a" roughness={0.9} />
                    </mesh>
                    <mesh position={[0, 0.62, 0]} castShadow>
                        <coneGeometry args={[0.32, 0.85, 6]} />
                        <meshStandardMaterial color="#15803d" roughness={0.75} emissive="#14532d" emissiveIntensity={0.05} />
                    </mesh>
                </group>
            ))}
        </group>
    );
}

function Particles() {
    const pointsRef = useRef<THREE.Points>(null);
    const count = 160;

    const positions = useMemo(() => {
        const result = new Float32Array(count * 3);
        for (let i = 0; i < count; i += 1) {
            result[i * 3] = (Math.random() - 0.5) * 14;
            result[i * 3 + 1] = Math.random() * 7;
            result[i * 3 + 2] = (Math.random() - 0.5) * 14;
        }
        return result;
    }, []);

    useFrame((state) => {
        if (!pointsRef.current) {
            return;
        }
        pointsRef.current.rotation.y = state.clock.elapsedTime * 0.025;
        const buffer = pointsRef.current.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < count; i += 1) {
            const yIdx = i * 3 + 1;
            buffer[yIdx] += 0.0018;
            if (buffer[yIdx] > 7) {
                buffer[yIdx] = 0;
            }
        }
        pointsRef.current.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
            </bufferGeometry>
            <pointsMaterial size={0.028} color={ENERGY_LINE} transparent opacity={0.45} />
        </points>
    );
}

function SceneBackground() {
    const { scene } = useThree();

    useEffect(() => {
        scene.background = new THREE.Color("#030712");
        scene.fog = new THREE.FogExp2("#030712", 0.045);
        return () => {
            scene.fog = null;
        };
    }, [scene]);

    return null;
}

function SceneContent({ buildings, onBuildingClick }: { buildings: BuildingMetric[]; onBuildingClick: (buildingId: string) => void }) {
    return (
        <>
            <ambientLight intensity={0.38} color="#94a3b8" />
            <directionalLight position={[10, 14, 8]} intensity={0.85} castShadow color="#e2e8f0" />
            <directionalLight position={[-8, 6, -4]} intensity={0.35} color="#38bdf8" />
            <pointLight position={[0, energyCoreWorldY(), 0]} intensity={1.4} color={ENERGY_CORE} distance={18} decay={2} />

            <Particles />
            <CityGround />
            <EnergyFlowLines buildings={buildings} />

            {buildings.map((building) => (
                <BuildingNode key={building.id} building={building} onClick={() => onBuildingClick(building.id)} />
            ))}

            <Text position={[0, 3.15, 0]} fontSize={0.24} color={ENERGY_CORE} anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#020617">
                能源中心
            </Text>
        </>
    );
}

export function Scene3D({ buildings, autoRotate, onBuildingClick }: Scene3DProps) {
    const [userInteracted, setUserInteracted] = useState(false);
    const [webglSupported, setWebglSupported] = useState(true);

    useEffect(() => {
        const canvas = document.createElement("canvas");
        const gl =
            canvas.getContext("webgl2") ||
            canvas.getContext("webgl") ||
            canvas.getContext("experimental-webgl");
        setWebglSupported(Boolean(gl));
    }, []);

    if (!webglSupported) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-slate-950 text-center text-slate-200">
                <div className="max-w-md px-6">
                    <p className="text-base font-semibold">当前环境未启用 WebGL</p>
                    <p className="mt-2 text-sm text-slate-400">
                        请在本机浏览器中开启硬件加速，或更换支持 WebGL 的设备后查看 3D 场景。
                    </p>
                </div>
            </div>
        );
    }

    return (
        <Canvas
            className="h-full w-full"
            shadows
            dpr={[1, 1.5]}
            gl={{ antialias: true, powerPreference: "high-performance" }}
            onPointerDown={() => setUserInteracted(true)}
        >
            <SceneBackground />
            <PerspectiveCamera makeDefault position={[11, 7.5, 11]} fov={48} />
            <OrbitControls
                enablePan
                enableZoom
                enableRotate
                autoRotate={autoRotate && !userInteracted}
                autoRotateSpeed={0.45}
                minDistance={7}
                maxDistance={22}
                minPolarAngle={0.35}
                maxPolarAngle={Math.PI / 2.05}
                target={[0, 0.85, 0]}
            />
            <Suspense fallback={null}>
                <SceneContent buildings={buildings} onBuildingClick={onBuildingClick} />
            </Suspense>
        </Canvas>
    );
}
