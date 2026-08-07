"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Component, memo, type ReactNode, useMemo, useRef, useSyncExternalStore } from "react";

type Point3 = [number, number, number];

type BranchSpec = { from: Point3; to: Point3; radius: number };

const BRANCH_PAIRS: BranchSpec[] = [
  { from: [0, 0, 0], to: [0, 2.8, 0], radius: 0.38 },
  { from: [0, 2.2, 0], to: [-1.65, 4.1, 0.15], radius: 0.2 },
  { from: [0, 2.55, 0], to: [1.7, 4.25, -0.1], radius: 0.2 },
  { from: [0, 3.5, 0], to: [-0.85, 5.55, 0.12], radius: 0.14 },
  { from: [0, 3.7, 0], to: [0.9, 5.85, -0.08], radius: 0.14 },
  { from: [-1.65, 4.1, 0.15], to: [-2.7, 5.35, 0.12], radius: 0.11 },
  { from: [1.7, 4.25, -0.1], to: [2.85, 5.25, -0.05], radius: 0.11 },
  { from: [-0.85, 5.55, 0.12], to: [-1.35, 6.75, 0.15], radius: 0.08 },
  { from: [0.9, 5.85, -0.08], to: [1.35, 6.9, -0.02], radius: 0.08 },
];

const ROOTS: Array<{ from: Point3; to: Point3 }> = [
  { from: [0, 0, 0], to: [-1.55, -0.65, 0.2] },
  { from: [0, 0, 0], to: [1.7, -0.52, -0.1] },
  { from: [0, 0, 0], to: [-0.45, -0.82, 1.05] },
  { from: [0, 0, 0], to: [0.45, -0.7, -1.1] },
];

const CANOPY_DESKTOP: Array<{ position: Point3; scale: number; color: string }> = [
  { position: [-2.55, 5.45, 0.1], scale: 1.05, color: "#7f9f62" },
  { position: [2.55, 5.35, -0.05], scale: 1.1, color: "#a8be78" },
  { position: [-1.1, 6.55, 0.15], scale: 1.0, color: "#a8be78" },
  { position: [1.2, 6.6, -0.05], scale: 1.02, color: "#7f9f62" },
  { position: [0, 7.25, 0.05], scale: 1.22, color: "#a8be78" },
];

const CANOPY_MOBILE: Array<{ position: Point3; scale: number; color: string }> = [
  { position: [-2.3, 5.65, 0.1], scale: 0.82, color: "#7f9f62" },
  { position: [2.35, 5.6, -0.05], scale: 0.9, color: "#a8be78" },
  { position: [0, 6.8, 0.05], scale: 1.05, color: "#7f9f62" },
];

const CAMERA_KEYS: Array<{ progress: number; position: Point3; target: Point3 }> = [
  { progress: 0, position: [0, 1.8, 11], target: [0, 2, 0] },
  { progress: 0.25, position: [3.7, 4.4, 6.2], target: [2.1, 4.3, 0] },
  { progress: 0.5, position: [-4.6, 2.1, 6.5], target: [0, 2.3, 0] },
  { progress: 0.75, position: [3.2, -1.6, 5.3], target: [0, -1.2, 0] },
  { progress: 1, position: [0, 7.4, 9.2], target: [0, 4.8, 0] },
];

let webglSnapshot: boolean | undefined;

function getWebglSupport() {
  if (webglSnapshot !== undefined) return webglSnapshot;
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }
  try {
    const probe = document.createElement("canvas");
    webglSnapshot = Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
  } catch {
    webglSnapshot = false;
  }
  return webglSnapshot;
}

function subscribeToWebgl() {
  return () => undefined;
}

function sampleKeyframes(progress: number) {
  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  const rightIndex = Math.min(
    CAMERA_KEYS.length - 1,
    Math.max(1, CAMERA_KEYS.findIndex((key) => key.progress >= clamped)),
  );
  const left = CAMERA_KEYS[rightIndex - 1];
  const right = CAMERA_KEYS[rightIndex];
  const local = (clamped - left.progress) / (right.progress - left.progress || 1);
  const eased = THREE.MathUtils.smoothstep(local, 0, 1);
  return {
    position: new THREE.Vector3().lerpVectors(
      new THREE.Vector3(...left.position),
      new THREE.Vector3(...right.position),
      eased,
    ),
    target: new THREE.Vector3().lerpVectors(
      new THREE.Vector3(...left.target),
      new THREE.Vector3(...right.target),
      eased,
    ),
  };
}

function Branch({
  from,
  to,
  radius,
  color,
  roughness = 0.84,
}: {
  from: Point3;
  to: Point3;
  radius: number;
  color: string;
  roughness?: number;
}) {
  const geometry = useMemo(() => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const length = direction.length();
    const tube = new THREE.CylinderGeometry(radius * 0.78, radius, length, 8, 1);
    tube.translate(0, length / 2, 0);
    return { geometry: tube, start, direction };
  }, [from, to, radius]);

  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), geometry.direction.clone().normalize());
    return q;
  }, [geometry.direction]);

  return (
    <mesh
      geometry={geometry.geometry}
      position={geometry.start}
      quaternion={quaternion}
      castShadow
    >
      <meshStandardMaterial color={color} roughness={roughness} metalness={0.04} />
    </mesh>
  );
}

function LeafCluster({ position, scale, color }: { position: Point3; scale: number; color: string }) {
  return (
    <mesh position={position} scale={scale} castShadow>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color={color} roughness={0.9} flatShading />
    </mesh>
  );
}

function TreeModel({
  groupRef,
  mobile,
}: {
  groupRef: { current: THREE.Group | null };
  mobile: boolean;
}) {
  const bark = "#5c3828";
  const barkLight = "#81553a";
  const canopy = mobile ? CANOPY_MOBILE : CANOPY_DESKTOP;

  return (
    <group ref={groupRef} position={[0, -1.9, 0]}>
      {BRANCH_PAIRS.map((branch, index) => (
        <Branch key={`branch-${index}`} {...branch} color={index < 2 ? bark : barkLight} />
      ))}
      {ROOTS.map((root, index) => (
        <Branch key={`root-${index}`} from={root.from} to={root.to} radius={0.19} color={bark} />
      ))}
      {canopy.map((cluster, index) => (
        <LeafCluster key={`canopy-${index}`} {...cluster} />
      ))}
      <mesh position={[0, -0.02, 0]} scale={[1.1, 0.24, 0.72]} receiveShadow>
        <sphereGeometry args={[1, mobile ? 12 : 20, mobile ? 8 : 12]} />
        <meshStandardMaterial color="#745238" roughness={1} />
      </mesh>
    </group>
  );
}

const MemoizedTreeModel = memo(TreeModel);

function SceneRig({ progress, reducedMotion, mobile }: { progress: number; reducedMotion: boolean; mobile: boolean }) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const currentTarget = useRef(new THREE.Vector3(0, 2, 0));
  const currentPosition = useRef(new THREE.Vector3(0, 1.8, 11));

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (group && !reducedMotion) {
      group.rotation.z = Math.sin(performance.now() * 0.00035) * 0.012;
      group.rotation.x = Math.sin(performance.now() * 0.00022) * 0.008;
      group.position.y = -1.9 + Math.sin(performance.now() * 0.00045) * 0.018;
      group.updateMatrixWorld();
      if (delta > 0.04) group.rotation.z *= 0.98;
    }
    const next = sampleKeyframes(progress);
    const factor = reducedMotion ? 1 : 1 - Math.pow(0.0001, delta);
    currentPosition.current.lerp(next.position, factor);
    currentTarget.current.lerp(next.target, factor);
    camera.position.copy(currentPosition.current);
    camera.lookAt(currentTarget.current);
    camera.updateProjectionMatrix();
  });

  return <MemoizedTreeModel groupRef={groupRef} mobile={mobile} />;
}

function StaticTreeFallback() {
  return <div className="landing-tree-webgl-fallback" role="img" aria-label="Tree Chat 树状思考场景的静态预览" />;
}

class WebGLBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export function NarrativeTreeScene({
  progress,
  reducedMotion,
  mobile,
  active,
}: {
  progress: number;
  reducedMotion: boolean;
  mobile: boolean;
  active: boolean;
}) {
  const webglSupported = useSyncExternalStore(subscribeToWebgl, getWebglSupport, () => false);

  return (
    <div className="landing-tree-canvas">
      <div className="landing-sky-glow" aria-hidden="true" />
      <div className="landing-cloud landing-cloud--one" aria-hidden="true" />
      <div className="landing-cloud landing-cloud--two" aria-hidden="true" />
      {webglSupported ? (
        <WebGLBoundary fallback={<StaticTreeFallback />}>
          <Canvas
            aria-hidden="true"
            dpr={mobile ? [1, 1.15] : [1, 1.6]}
            frameloop={active && !reducedMotion ? "always" : "demand"}
            gl={{ antialias: !mobile, alpha: true, powerPreference: "high-performance" }}
            camera={{ position: [0, 1.8, 11], fov: mobile ? 45 : 40, near: 0.1, far: 100 }}
            fallback={<StaticTreeFallback />}
          >
            <ambientLight intensity={1.2} color="#d9e9d1" />
            <hemisphereLight intensity={1.3} color="#d5efff" groundColor="#273d2b" />
            <directionalLight position={[-5, 9, 5]} intensity={3.2} color="#fff0c8" castShadow={!mobile} />
            <pointLight position={[3, 3, 3]} intensity={2.5} color="#d5edbf" />
            <SceneRig progress={progress} reducedMotion={reducedMotion} mobile={mobile} />
          </Canvas>
        </WebGLBoundary>
      ) : <StaticTreeFallback />}
    </div>
  );
}
