import type { Vector3Tuple } from "three";

export type Point3 = Vector3Tuple;

export type TreeSegmentRole = "trunk" | "primary" | "secondary" | "twig" | "root";

export type TreeSegmentSpec = {
  id: string;
  parentId: string | null;
  role: TreeSegmentRole;
  points: Point3[];
  radii: number[];
  azimuth: number;
};

export type CanopyClusterSpec = {
  id: string;
  position: Point3;
  scale: Point3;
  rotation: Point3;
  color: string;
  layer: "inner" | "middle" | "edge";
};

export type LeafletSpec = {
  id: string;
  position: Point3;
  scale: Point3;
  rotation: Point3;
  color: string;
  layer: "inner" | "middle" | "edge";
};

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
// Keep the canopy in a restrained woodland palette. The first two values are
// reserved for shaded interior foliage; the lighter values are used sparingly
// on the outer leaf tips so the crown reads as one volume instead of a handful
// of bright spheres.
const LEAF_COLORS = ["#315f37", "#407842", "#588d49", "#739f50", "#8eaf5b", "#a8c274"];
const LEAFLET_COLORS = ["#4f8b47", "#679d50", "#80ad5a", "#9abb68"];

function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function range(random: () => number, min: number, max: number) {
  return min + (max - min) * random();
}

function lerpPoint(a: Point3, b: Point3, amount: number): Point3 {
  return [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ];
}

function pointAlongPolyline(points: Point3[], amount: number): Point3 {
  if (points.length === 1) return points[0];
  const scaled = Math.max(0, Math.min(1, amount)) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  return lerpPoint(points[index], points[index + 1], scaled - index);
}

function makeRadialBranch(
  start: Point3,
  azimuth: number,
  length: number,
  rise: number,
  bend: number,
  random: () => number,
  droop = 0,
): Point3[] {
  const radial: Point3 = [Math.cos(azimuth), 0, Math.sin(azimuth)];
  const tangent: Point3 = [-Math.sin(azimuth), 0, Math.cos(azimuth)];
  const points: Point3[] = [start];
  const steps = 4;

  for (let index = 1; index <= steps; index += 1) {
    const amount = index / steps;
    const lateral = Math.sin(amount * Math.PI) * bend;
    points.push([
      start[0] + radial[0] * length * amount + tangent[0] * lateral,
      // A mature branch lifts away from the bole before settling toward the
      // broad, low crown. The terminal droop keeps the silhouette umbrella-
      // shaped instead of turning it into a narrow, conifer-like spike.
      start[1] + rise * amount - droop * Math.pow(amount, 1.7)
        + Math.sin(amount * Math.PI * 1.4) * range(random, -0.16, 0.16),
      start[2] + radial[2] * length * amount + tangent[2] * lateral,
    ]);
  }

  return points;
}

function createTreeSegments() {
  const random = createRandom(0x71c7a5);
  const segments: TreeSegmentSpec[] = [];

  const trunkPoints: Point3[] = [
    [0, 0, 0],
    [0.14, 0.74, 0.05],
    [0.08, 1.62, 0.12],
    [-0.12, 2.62, -0.08],
    [0.11, 3.63, 0.06],
    [0.04, 4.52, -0.04],
    [0, 5.28, 0],
  ];

  segments.push({
    id: "trunk",
    parentId: null,
    role: "trunk",
    azimuth: 0,
    points: trunkPoints,
    radii: [0.86, 0.78, 0.68, 0.58, 0.46, 0.35, 0.25],
  });

  const primaryTips: Array<{ id: string; points: Point3[]; azimuth: number }> = [];
  const primaryCount = 12;
  for (let index = 0; index < primaryCount; index += 1) {
    const azimuth = (index / primaryCount) * TAU + range(random, -0.08, 0.08);
    // Spread branch collars over the upper bole instead of starting every
    // spoke at one random point. Sampling the actual trunk polyline keeps the
    // radial hierarchy visibly attached in close Page 5/6 views.
    const trunkAmount = 0.62 + (index % 5) * 0.065 + range(random, -0.018, 0.018);
    const trunkAnchor = pointAlongPolyline(trunkPoints, trunkAmount);
    const radialOffset = 0.035 + trunkAmount * 0.05;
    const start: Point3 = [
      trunkAnchor[0] + Math.cos(azimuth) * radialOffset,
      trunkAnchor[1],
      trunkAnchor[2] + Math.sin(azimuth) * radialOffset,
    ];
    const id = `primary-${String(index + 1).padStart(2, "0")}`;
    const points = makeRadialBranch(
      start,
      azimuth,
      range(random, 2.65, 3.65),
      range(random, 1.15, 1.85),
      range(random, -0.36, 0.36),
      random,
      range(random, 0.06, 0.36),
    );
    segments.push({
      id,
      parentId: "trunk",
      role: "primary",
      azimuth,
      points,
      radii: [0.3, 0.24, 0.16, 0.1, 0.045],
    });
    primaryTips.push({ id, points, azimuth });
  }

  const secondaryTips: Array<{ id: string; points: Point3[]; azimuth: number }> = [];
  primaryTips.forEach((primary, primaryIndex) => {
    const secondaryCount = primaryIndex % 3 === 0 ? 3 : 2;
    for (let index = 0; index < secondaryCount; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const azimuth = primary.azimuth + side * range(random, 0.34, 0.78) + range(random, -0.12, 0.12);
      const start = pointAlongPolyline(primary.points, 0.35 + index * 0.2);
      const id = `secondary-${String(primaryIndex + 1).padStart(2, "0")}-${index + 1}`;
      const points = makeRadialBranch(
        start,
        azimuth,
        range(random, 1.15, 2.05),
        range(random, 0.35, 0.95),
        range(random, -0.22, 0.22),
        random,
        range(random, 0.02, 0.18),
      );
      segments.push({
        id,
        parentId: primary.id,
        role: "secondary",
        azimuth,
        points,
        radii: [0.14, 0.105, 0.075, 0.045, 0.025],
      });
      secondaryTips.push({ id, points, azimuth });
    }
  });

  secondaryTips.forEach((secondary, secondaryIndex) => {
    const twigCount = secondaryIndex % 3 === 0 ? 2 : 1;
    for (let index = 0; index < twigCount; index += 1) {
      const azimuth = secondary.azimuth + (index === 0 ? -1 : 1) * range(random, 0.42, 0.9);
      const start = pointAlongPolyline(secondary.points, 0.42 + index * 0.22);
      const id = `twig-${String(secondaryIndex + 1).padStart(2, "0")}-${index + 1}`;
      segments.push({
        id,
        parentId: secondary.id,
        role: "twig",
        azimuth,
        points: makeRadialBranch(
          start,
          azimuth,
          range(random, 0.62, 1.12),
          range(random, 0.16, 0.48),
          range(random, -0.12, 0.12),
          random,
          range(random, 0.01, 0.08),
        ),
        radii: [0.052, 0.038, 0.026, 0.016, 0.009],
      });
    }
  });

  const rootCount = 10;
  for (let index = 0; index < rootCount; index += 1) {
    const azimuth = (index / rootCount) * TAU + range(random, -0.12, 0.12);
    // Start each surface root on its own buttress collar so the radial
    // pattern remains legible in the low Page 7 camera instead of collapsing
    // into ten overlapping tubes at the exact origin.
    const collarRadius = range(random, 0.16, 0.3);
    const start: Point3 = [
      Math.cos(azimuth) * collarRadius,
      range(random, -0.02, 0.02),
      Math.sin(azimuth) * collarRadius,
    ];
    segments.push({
      id: `root-${String(index + 1).padStart(2, "0")}`,
      parentId: "trunk",
      role: "root",
      azimuth,
      points: makeRadialBranch(
        start,
        azimuth,
        range(random, 1.5, 2.55),
        range(random, -0.58, -0.3),
        range(random, -0.18, 0.18),
        random,
      ),
      radii: [0.25, 0.18, 0.11, 0.055, 0.018],
    });
  }

  return segments;
}

export const TREE_SEGMENTS = createTreeSegments();

function createCanopyClusters() {
  const random = createRandom(0x2e8b57);
  const clusters: CanopyClusterSpec[] = [];
  const canopyRadius = 5.05;
  const canopyBase = 5.16;
  const canopyHeight = 3.12;
  // Smaller, denser volumes avoid the old "five polygon balls" silhouette.
  // The count still stays comfortably below a single instanced draw-call's
  // practical range on the target desktop viewport.
  const clusterCount = 260;

  for (let index = 0; index < clusterCount; index += 1) {
    // Bias the interior toward a denser heart while retaining enough edge
    // samples for a continuous, near-circular silhouette from above.
    const radialRatio = Math.pow(random(), 1.24);
    const azimuth = index * GOLDEN_ANGLE + range(random, -0.12, 0.12);
    const irregularity = 1 + range(random, -0.1, 0.1);
    const radius = canopyRadius * radialRatio * irregularity;
    // A broad, low dome with a slightly lifted inner crown. The edge is kept
    // lower so the 360° footprint remains legible from the Page 8 top view.
    const dome = canopyHeight * (1 - Math.pow(radialRatio, 1.52));
    const edgeSparse = 1 - radialRatio * 0.3;
    const layer = radialRatio < 0.34 ? "inner" : radialRatio < 0.76 ? "middle" : "edge";
    const layerScale = layer === "inner" ? 0.92 : layer === "middle" ? 0.82 : 0.7;
    const layerPalette = layer === "inner"
      ? LEAF_COLORS.slice(0, 3)
      : layer === "middle"
        ? LEAF_COLORS.slice(1, 5)
        : LEAF_COLORS.slice(2);
    const scaleBase = range(random, 0.28, 0.58) * edgeSparse * layerScale;
    clusters.push({
      id: `canopy-${String(index + 1).padStart(3, "0")}`,
      position: [
        Math.cos(azimuth) * radius,
        canopyBase + dome + range(random, -0.32, 0.3) - radialRatio * 0.18,
        Math.sin(azimuth) * radius,
      ],
      scale: [
        scaleBase * range(random, 0.85, 1.25),
        scaleBase * range(random, 0.72, 1.12),
        scaleBase * range(random, 0.85, 1.25),
      ],
      rotation: [range(random, -0.35, 0.35), azimuth + range(random, -0.4, 0.4), range(random, -0.35, 0.35)],
      color: layerPalette[Math.floor(random() * layerPalette.length)],
      layer,
    });
  }

  return clusters;
}

export const CANOPY_CLUSTERS = createCanopyClusters();

function createLeaflets() {
  const random = createRandom(0x4f7942);
  const leaflets: LeafletSpec[] = [];

  // A few pointed leaflets around each volume break up the silhouette and
  // provide a readable scale cue in close branch shots. They are deliberately
  // sparse in the dark inner layer so the canopy still has depth.
  CANOPY_CLUSTERS.forEach((cluster, clusterIndex) => {
    const count = cluster.layer === "inner" ? 1 : cluster.layer === "middle" ? 2 : 3;
    const clusterSeed = clusterIndex * 0.37;
    for (let index = 0; index < count; index += 1) {
      const azimuth = clusterSeed + index * GOLDEN_ANGLE + range(random, -0.24, 0.24);
      const radial = range(random, 0.34, 0.72);
      const vertical = range(random, -0.22, 0.38);
      const layerPalette = cluster.layer === "inner"
        ? LEAFLET_COLORS.slice(0, 2)
        : cluster.layer === "middle"
          ? LEAFLET_COLORS.slice(0, 3)
          : LEAFLET_COLORS.slice(1);
      leaflets.push({
        id: `leaflet-${String(leaflets.length + 1).padStart(4, "0")}`,
        position: [
          cluster.position[0] + Math.cos(azimuth) * cluster.scale[0] * radial,
          cluster.position[1] + vertical * cluster.scale[1],
          cluster.position[2] + Math.sin(azimuth) * cluster.scale[2] * radial,
        ],
        scale: [
          range(random, 0.07, 0.14),
          range(random, 0.16, 0.28),
          range(random, 0.03, 0.07),
        ],
        rotation: [
          range(random, -0.6, 0.6),
          azimuth + range(random, -0.4, 0.4),
          range(random, -0.7, 0.7),
        ],
        color: layerPalette[Math.floor(random() * layerPalette.length)],
        layer: cluster.layer,
      });
    }
  });

  return leaflets;
}

export const CANOPY_LEAFLETS = createLeaflets();

export const TREE_BOUNDS = {
  canopyRadius: 4.85,
  canopyBase: 5.35,
  canopyTop: 8.7,
  trunkBase: 0,
  trunkTop: 5.25,
  rootRadius: 2.55,
} as const;
