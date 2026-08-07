"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  Component,
  memo,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  CANOPY_CLUSTERS,
  CANOPY_LEAFLETS,
  TREE_SEGMENTS,
  type TreeSegmentSpec,
} from "./treeGeometry";

type Point3 = [number, number, number];

export const CAMERA_KEYS: Array<{ progress: number; position: Point3; target: Point3 }> = [
  // Page 4: complete establishing view. The tree is wider than it is tall,
  // while its exposed lower trunk remains readable in the 1920×1080 frame.
  { progress: 0, position: [0, 2.2, 16], target: [0, 2.35, 0] },
  // Page 5: inspect a mature primary branch from above and to the side.
  { progress: 0.25, position: [7.4, 8.6, 7.1], target: [2.65, 5.75, 0.25] },
  // Page 6: move down to the bole while keeping the trunk on the right side.
  { progress: 0.5, position: [-7.8, 4.1, 7.6], target: [0.25, 2.15, 0] },
  // Page 7: settle close to the root flare and the radial surface roots.
  { progress: 0.75, position: [6.6, 1.6, 7.6], target: [0, -0.35, 0] },
  // Page 8: near-orthographic top view of the circular canopy footprint.
  { progress: 1, position: [0, 18, 1.8], target: [0, 4.65, 0] },
];

const CAMERA_KEY_VECTORS = CAMERA_KEYS.map((key) => ({
  progress: key.progress,
  position: new THREE.Vector3(...key.position),
  target: new THREE.Vector3(...key.target),
}));

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

function sampleKeyframes(progress: number, position: THREE.Vector3, target: THREE.Vector3) {
  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  const rightIndex = Math.min(
    CAMERA_KEY_VECTORS.length - 1,
    Math.max(1, CAMERA_KEY_VECTORS.findIndex((key) => key.progress >= clamped)),
  );
  const left = CAMERA_KEY_VECTORS[rightIndex - 1];
  const right = CAMERA_KEY_VECTORS[rightIndex];
  const local = (clamped - left.progress) / (right.progress - left.progress || 1);
  const eased = THREE.MathUtils.smoothstep(local, 0, 1);
  position.lerpVectors(left.position, right.position, eased);
  target.lerpVectors(left.target, right.target, eased);
}

function radiusAt(radii: number[], amount: number) {
  if (radii.length === 1) return radii[0];
  const scaled = THREE.MathUtils.clamp(amount, 0, 1) * (radii.length - 1);
  const index = Math.min(radii.length - 2, Math.floor(scaled));
  return THREE.MathUtils.lerp(radii[index], radii[index + 1], scaled - index);
}

function createTaperedBranchGeometry(segment: TreeSegmentSpec) {
  const curve = new THREE.CatmullRomCurve3(
    segment.points.map((point) => new THREE.Vector3(...point)),
    false,
    "centripetal",
    0.5,
  );
  const tubularSegments = segment.role === "trunk" ? 24 : segment.role === "primary" ? 12 : segment.role === "root" ? 9 : segment.role === "secondary" ? 8 : 6;
  const radialSegments = segment.role === "trunk" ? 14 : segment.role === "primary" ? 10 : segment.role === "root" ? 9 : 7;
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let ring = 0; ring <= tubularSegments; ring += 1) {
    const amount = ring / tubularSegments;
    const center = curve.getPointAt(amount);
    const normal = frames.normals[ring];
    const binormal = frames.binormals[ring];
    const radius = radiusAt(segment.radii, amount);

    for (let side = 0; side <= radialSegments; side += 1) {
      const angle = (side / radialSegments) * Math.PI * 2;
      const radial = normal.clone().multiplyScalar(Math.cos(angle)).add(
        binormal.clone().multiplyScalar(Math.sin(angle)),
      ).normalize();
      const point = center.clone().addScaledVector(radial, radius);
      vertices.push(point.x, point.y, point.z);
      uvs.push(side / radialSegments, amount);
    }
  }

  // Close both ends. Branch collars remain hidden inside their parent tube,
  // while the cap on each twig keeps the close Page 5 view from exposing a
  // hollow cut surface.
  const startCap = vertices.length / 3;
  const startPoint = segment.points[0];
  vertices.push(startPoint[0], startPoint[1], startPoint[2]);
  uvs.push(0.5, 0);
  const endCap = vertices.length / 3;
  const endPoint = segment.points.at(-1) ?? startPoint;
  vertices.push(endPoint[0], endPoint[1], endPoint[2]);
  uvs.push(0.5, 1);

  for (let ring = 0; ring < tubularSegments; ring += 1) {
    for (let side = 0; side < radialSegments; side += 1) {
      const row = radialSegments + 1;
      const a = ring * row + side;
      const b = (ring + 1) * row + side;
      const c = (ring + 1) * row + side + 1;
      const d = ring * row + side + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const startRow = radialSegments + 1;
  const endRow = tubularSegments * startRow;
  for (let side = 0; side < radialSegments; side += 1) {
    const nextSide = side + 1;
    indices.push(startCap, nextSide, side);
    indices.push(endCap, endRow + side, endRow + nextSide);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createCanopyBlobGeometry() {
  // A subdivided icosphere keeps the cluster silhouette organic from every
  // angle. It avoids the obvious lat/long seams of a UV sphere while still
  // being cheap enough to instance hundreds of times.
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const position = geometry.getAttribute("position");
  const vertex = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const direction = vertex.clone().normalize();
    const broadLobe = Math.sin(direction.x * 4.2 + direction.z * 1.7 + direction.y * 2.1) * 0.055;
    const fineLobe = Math.sin(direction.z * 8.5 - direction.x * 3.4 + direction.y * 5.7) * 0.028;
    const underside = direction.y < -0.15 ? -0.025 * Math.abs(direction.y) : 0;
    vertex.multiplyScalar(1 + broadLobe + fineLobe + underside);
    vertex.y *= 0.92;
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function createLeafletGeometry() {
  // A small folded leaf mesh gives close branch views an actual leaf profile
  // (midrib ridge + pointed tip) instead of a repeated low-poly diamond. The
  // mesh is double-sided so foliage remains readable from all camera angles.
  const vertices = new Float32Array([
    -0.9, 0, 0,
    -0.28, 0.54, 0.08,
    0.38, 0.42, 0.06,
    0.9, 0, 0,
    0.38, -0.42, 0.06,
    -0.28, -0.54, 0.08,
    0, 0, 0.2,
  ]);
  const indices = [
    0, 1, 6, 1, 2, 6, 2, 3, 6,
    3, 4, 6, 4, 5, 6, 5, 0, 6,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createRootFlareGeometry() {
  // The root collar is deliberately irregular: a perfect UV sphere reads as
  // a decorative blob, while broad lobes blend the bole into the radial roots
  // like the buttress flare of a mature street tree.
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const position = geometry.getAttribute("position");
  const vertex = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const azimuth = Math.atan2(vertex.z, vertex.x);
    const lobe = 1 + Math.sin(azimuth * 5.0 + vertex.y * 2.1) * 0.11
      + Math.sin(azimuth * 9.0 - vertex.y * 1.7) * 0.045;
    vertex.x *= lobe;
    vertex.z *= lobe;
    vertex.y *= 0.86;
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function createBarkTexture() {
  const width = 96;
  const height = 192;
  const data = new Uint8Array(width * height * 4);
  const random = (() => {
    let state = 0x5c3828;
    return () => {
      state = Math.imul(state ^ (state >>> 15), 1 | state);
      state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
      return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
    };
  })();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const verticalGrain = Math.sin(x * 0.34 + Math.sin(y * 0.035) * 2.1);
      const fineGrain = Math.sin(x * 0.92 + y * 0.07) * 0.35;
      const fissure = Math.pow(Math.abs(Math.sin(x * 0.115 + y * 0.018)), 11) * 54;
      const value = THREE.MathUtils.clamp(164 + verticalGrain * 26 + fineGrain * 16 - fissure + (random() - 0.5) * 14, 58, 228);
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.2, 4.2);
  texture.needsUpdate = true;
  return texture;
}

function mergeBranchGeometries(segments: TreeSegmentSpec[]) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  segments.forEach((segment) => {
    const geometry = createTaperedBranchGeometry(segment);
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    const index = geometry.getIndex();
    positions.push(...Array.from(position.array as ArrayLike<number>));
    normals.push(...Array.from(normal.array as ArrayLike<number>));
    uvs.push(...Array.from(uv.array as ArrayLike<number>));
    if (index) indices.push(...Array.from(index.array as ArrayLike<number>, (value) => value + vertexOffset));
    vertexOffset += position.count;
    geometry.dispose();
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function MergedBranchMesh({
  segments,
  barkTexture,
  color,
  castShadow,
  receiveShadow = true,
}: {
  segments: TreeSegmentSpec[];
  barkTexture: THREE.Texture;
  color: string;
  castShadow: boolean;
  receiveShadow?: boolean;
}) {
  const geometry = useMemo(() => mergeBranchGeometries(segments), [segments]);

  return (
    <mesh geometry={geometry} castShadow={castShadow} receiveShadow={receiveShadow}>
      <meshStandardMaterial
        color={color}
        map={barkTexture}
        bumpMap={barkTexture}
        bumpScale={color === "#66452f" ? 0.18 : color === "#805738" ? 0.11 : 0.075}
        roughness={0.94}
        emissive="#5a341f"
        emissiveIntensity={0.16}
        metalness={0}
      />
    </mesh>
  );
}

type FoliageTransform = {
  position: Point3;
  scale: Point3;
  rotation: Point3;
  color?: string;
};

function InstancedFoliage({
  instances,
  geometry,
  material,
}: {
  instances: FoliageTransform[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Euler();

    instances.forEach((instance, index) => {
      position.set(...instance.position);
      scale.set(...instance.scale);
      rotation.set(...instance.rotation);
      quaternion.setFromEuler(rotation);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      if (instance.color) mesh.setColorAt(index, new THREE.Color(instance.color));
    });
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [instances]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, instances.length]}
      castShadow={false}
      receiveShadow={false}
      // VolumetricCanopy shares the blob geometry across three layer meshes;
      // leave disposal to its single owner instead of letting R3F dispose the
      // shared resource once per instance.
      dispose={null}
    />
  );
}

const CANOPY_LAYERS = ["inner", "middle", "edge"] as const;

function VolumetricCanopy() {
  const geometry = useMemo(() => createCanopyBlobGeometry(), []);
  const leafletGeometry = useMemo(() => createLeafletGeometry(), []);
  const clustersByLayer = useMemo(() => ({
    inner: CANOPY_CLUSTERS.filter((cluster) => cluster.layer === "inner"),
    middle: CANOPY_CLUSTERS.filter((cluster) => cluster.layer === "middle"),
    edge: CANOPY_CLUSTERS.filter((cluster) => cluster.layer === "edge"),
  }), []);
  const layerMaterials = useMemo(() => ({
    inner: new THREE.MeshStandardMaterial({
      // Instance colors carry the deterministic botanical palette; white
      // keeps them from being multiplied into an unintentionally near-black
      // result by a second layer tint.
      color: "#ffffff",
      vertexColors: true,
      roughness: 0.94,
      metalness: 0,
      emissive: "#315f37",
      emissiveIntensity: 0.14,
    }),
    middle: new THREE.MeshStandardMaterial({
      color: "#ffffff",
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
      emissive: "#42753b",
      emissiveIntensity: 0.14,
    }),
    edge: new THREE.MeshStandardMaterial({
      color: "#ffffff",
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
      emissive: "#5a8a46",
      emissiveIntensity: 0.14,
    }),
  }), []);
  const leafletMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#ffffff",
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.84,
    metalness: 0,
    emissive: "#5b8b47",
    emissiveIntensity: 0.14,
  }), []);

  useEffect(() => () => {
    geometry.dispose();
    leafletGeometry.dispose();
    CANOPY_LAYERS.forEach((layer) => layerMaterials[layer].dispose());
    leafletMaterial.dispose();
  }, [geometry, layerMaterials, leafletGeometry, leafletMaterial]);

  return (
    <group>
      {CANOPY_LAYERS.map((layer) => (
        <InstancedFoliage
          key={layer}
          instances={clustersByLayer[layer]}
          geometry={geometry}
          material={layerMaterials[layer]}
        />
      ))}
      <InstancedFoliage
        instances={CANOPY_LEAFLETS}
        geometry={leafletGeometry}
        material={leafletMaterial}
      />
    </group>
  );
}

function TreeModel({ groupRef }: { groupRef: { current: THREE.Group | null } }) {
  const barkTexture = useMemo(() => createBarkTexture(), []);
  const rootFlareGeometry = useMemo(() => createRootFlareGeometry(), []);
  const trunkAndRoots = useMemo(
    () => TREE_SEGMENTS.filter((segment) => segment.role === "trunk" || segment.role === "root"),
    [],
  );
  const primaryBranches = useMemo(
    () => TREE_SEGMENTS.filter((segment) => segment.role === "primary"),
    [],
  );
  const fineBranches = useMemo(
    () => TREE_SEGMENTS.filter((segment) => segment.role === "secondary" || segment.role === "twig"),
    [],
  );

  useEffect(() => () => {
    barkTexture.dispose();
    rootFlareGeometry.dispose();
  }, [barkTexture, rootFlareGeometry]);

  return (
    <group ref={groupRef} position={[0, -2.05, 0]}>
      <MergedBranchMesh segments={trunkAndRoots} barkTexture={barkTexture} color="#66452f" castShadow receiveShadow={false} />
      <MergedBranchMesh segments={primaryBranches} barkTexture={barkTexture} color="#805738" castShadow receiveShadow={false} />
      <MergedBranchMesh segments={fineBranches} barkTexture={barkTexture} color="#916745" castShadow={false} receiveShadow={false} />
      <VolumetricCanopy />
      <mesh geometry={rootFlareGeometry} position={[0, -0.02, 0]} scale={[1.3, 0.55, 1.3]} castShadow receiveShadow={false} dispose={null}>
        <meshStandardMaterial
          color="#66452f"
          map={barkTexture}
          bumpMap={barkTexture}
          bumpScale={0.18}
          roughness={0.98}
          emissive="#5a341f"
          emissiveIntensity={0.16}
        />
      </mesh>
    </group>
  );
}

const MemoizedTreeModel = memo(TreeModel);

function SceneRig({ progress, progressRef, reducedMotion }: { progress: number; progressRef?: { current: number }; reducedMotion: boolean }) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const currentTarget = useRef(new THREE.Vector3(0, 2.35, 0));
  const currentPosition = useRef(new THREE.Vector3(0, 2.2, 16));
  const nextTarget = useRef(new THREE.Vector3());
  const nextPosition = useRef(new THREE.Vector3());

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    const elapsed = clock.getElapsedTime();
    if (group && !reducedMotion) {
      group.rotation.z = Math.sin(elapsed * 0.34) * 0.008;
      group.rotation.x = Math.sin(elapsed * 0.22) * 0.005;
      group.position.y = -2.05 + Math.sin(elapsed * 0.42) * 0.012;
      group.updateMatrixWorld();
      if (delta > 0.04) group.rotation.z *= 0.98;
    }

    sampleKeyframes(progressRef?.current ?? progress, nextPosition.current, nextTarget.current);
    const factor = reducedMotion ? 1 : 1 - Math.pow(0.00005, delta);
    currentPosition.current.lerp(nextPosition.current, factor);
    currentTarget.current.lerp(nextTarget.current, factor);
    camera.position.copy(currentPosition.current);
    camera.lookAt(currentTarget.current);
  });

  return <MemoizedTreeModel groupRef={groupRef} />;
}

function StaticTreeFallback() {
  return (
    <div className="landing-tree-webgl-fallback" role="img" aria-label="Tree Chat 成熟阔叶树场景的静态预览">
      <span className="landing-tree-webgl-fallback__canopy" aria-hidden="true" />
      <span className="landing-tree-webgl-fallback__trunk" aria-hidden="true" />
      <span className="landing-tree-webgl-fallback__roots" aria-hidden="true" />
    </div>
  );
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
  progressRef,
  reducedMotion,
  active,
}: {
  progress: number;
  progressRef?: { current: number };
  reducedMotion: boolean;
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
            dpr={[1, 1.5]}
            frameloop={active && !reducedMotion ? "always" : "demand"}
            shadows
            gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
            camera={{ position: [0, 2.2, 16], fov: 40, near: 0.1, far: 100 }}
            fallback={<StaticTreeFallback />}
          >
            <fog attach="fog" args={["#285e4d", 19, 44]} />
            <ambientLight intensity={0.98} color="#e3efd8" />
            <hemisphereLight intensity={1.28} color="#dff3ff" groundColor="#2b4a31" />
            <directionalLight
              position={[-7, 11, 7]}
              intensity={2.6}
              color="#fff0c8"
              castShadow
              shadow-mapSize={[1024, 1024]}
              shadow-bias={-0.0002}
            />
            <pointLight position={[4, 5, 5]} intensity={1.15} color="#d5edbf" />
            <pointLight
              position={[0, 8, 14]}
              intensity={3.8}
              color="#edf4d7"
              distance={40}
              decay={1}
            />
            <SceneRig progress={progress} progressRef={progressRef} reducedMotion={reducedMotion} />
          </Canvas>
        </WebGLBoundary>
      ) : <StaticTreeFallback />}
    </div>
  );
}
