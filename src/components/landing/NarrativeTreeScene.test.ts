import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { CANOPY_CLUSTERS, CANOPY_LEAFLETS, TREE_SEGMENTS } from "./treeGeometry";

const landingPage = readFileSync(resolve(process.cwd(), "src/components/landing/LandingPage.tsx"), "utf8");
const scene = readFileSync(resolve(process.cwd(), "src/components/landing/NarrativeTreeScene.tsx"), "utf8");

describe("demand-rendered tree scene contract", () => {
  test("renders only when landing scroll progress requests a frame", () => {
    expect(scene).toContain('frameloop="demand"');
    expect(scene).toContain("dpr={[1, 1.25]}");
    expect(scene).toContain("requestRenderRef");
    expect(scene).toContain("requestRenderRef.current = requestRender");
    expect(scene).toContain("invalidate()");
    expect(landingPage).toContain("const requestTreeRenderRef = useRef<(() => void) | null>(null)");
    expect(landingPage).toContain("requestRenderRef={requestTreeRenderRef}");
    expect(landingPage).toMatch(
      /treeProgressRef\.current = treeScrollState\.progress;\s*requestTreeRenderRef\.current\?\.\(\);/,
    );
  });

  test("applies sampled camera keys directly without an idle animation loop", () => {
    expect(scene).toContain("camera.position.copy(sampledPosition.current)");
    expect(scene).toContain("camera.lookAt(sampledTarget.current)");
    expect(scene).toContain("const cameraProgress = reducedMotion ? progress : liveProgress;");
    expect(scene).not.toContain("Math.round(liveProgress");
    expect(scene).not.toContain("frameloop={active");
    expect(scene).not.toMatch(/<Canvas[\s\S]*?\s+shadows(?:\s|\/>)/);
    expect(scene).not.toContain("castShadow");
    expect(scene).not.toContain("receiveShadow");
    expect(scene).not.toContain("shadow-mapSize");
    expect(scene).not.toContain("shadow-bias");
    expect(scene).not.toContain("Math.sin(elapsed");
    expect(scene).not.toContain("updateMatrixWorld");
    expect(scene).not.toContain("currentPosition");
    expect(scene).not.toContain("currentTarget");
  });
});

describe("mature broadleaf tree geometry contract", () => {
  test("forms one connected, acyclic hierarchy with trunk, primary, secondary, twig and root levels", () => {
    const ids = new Set(TREE_SEGMENTS.map((segment) => segment.id));
    expect(ids.size).toBe(TREE_SEGMENTS.length);
    expect(TREE_SEGMENTS.filter((segment) => segment.parentId === null)).toHaveLength(1);

    const children = new Map<string, string[]>();
    TREE_SEGMENTS.forEach((segment) => {
      expect(segment.points.length).toBeGreaterThanOrEqual(4);
      expect(segment.points.length).toBe(segment.radii.length);
      segment.points.flat().forEach((value) => expect(Number.isFinite(value)).toBe(true));
      segment.radii.forEach((radius) => expect(radius).toBeGreaterThan(0));
      if (segment.parentId) {
        expect(ids.has(segment.parentId)).toBe(true);
        const list = children.get(segment.parentId) ?? [];
        list.push(segment.id);
        children.set(segment.parentId, list);
      }
    });

    const root = TREE_SEGMENTS.find((segment) => segment.parentId === null);
    expect(root?.id).toBe("trunk");
    const visited = new Set<string>();
    const queue = ["trunk"];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      expect(visited.has(current)).toBe(false);
      visited.add(current);
      queue.push(...(children.get(current) ?? []));
    }
    expect(visited.size).toBe(TREE_SEGMENTS.length);

    expect(TREE_SEGMENTS.filter((segment) => segment.role === "primary")).toHaveLength(12);
    expect(TREE_SEGMENTS.filter((segment) => segment.role === "secondary").length).toBeGreaterThanOrEqual(24);
    expect(TREE_SEGMENTS.filter((segment) => segment.role === "twig").length).toBeGreaterThanOrEqual(24);
    expect(TREE_SEGMENTS.filter((segment) => segment.role === "root")).toHaveLength(10);
  });

  test("primary branches cover the full 360-degree radial canopy", () => {
    const primary = TREE_SEGMENTS
      .filter((segment) => segment.role === "primary")
      .map((segment) => (segment.azimuth + Math.PI * 2) % (Math.PI * 2))
      .sort((a, b) => a - b);
    const gaps = primary.map((angle, index) => {
      const next = primary[(index + 1) % primary.length] + (index === primary.length - 1 ? Math.PI * 2 : 0);
      return next - angle;
    });
    expect(primary.length).toBeGreaterThanOrEqual(8);
    expect(Math.max(...gaps)).toBeLessThan(Math.PI / 2);

    const branchPoints = TREE_SEGMENTS
      .filter((segment) => segment.role === "primary" || segment.role === "secondary")
      .flatMap((segment) => segment.points);
    const xValues = branchPoints.map(([x]) => x);
    const zValues = branchPoints.map(([, , z]) => z);
    expect(Math.max(...zValues) - Math.min(...zValues)).toBeGreaterThan(4);
    expect(xValues.some((value) => value > 0)).toBe(true);
    expect(xValues.some((value) => value < 0)).toBe(true);
    expect(zValues.some((value) => value > 0)).toBe(true);
    expect(zValues.some((value) => value < 0)).toBe(true);
  });

  test("has a broad, low, near-circular canopy made of layered clusters", () => {
    expect(CANOPY_CLUSTERS.length).toBeGreaterThanOrEqual(100);
    const xValues = CANOPY_CLUSTERS.map((cluster) => cluster.position[0]);
    const zValues = CANOPY_CLUSTERS.map((cluster) => cluster.position[2]);
    const xExtent = Math.max(...xValues) - Math.min(...xValues);
    const zExtent = Math.max(...zValues) - Math.min(...zValues);
    expect(xExtent / zExtent).toBeGreaterThan(0.7);
    expect(xExtent / zExtent).toBeLessThan(1.3);

    const radialBuckets = new Set(
      CANOPY_CLUSTERS.map((cluster) => {
        const angle = Math.atan2(cluster.position[2], cluster.position[0]);
        return Math.floor((((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * 8);
      }),
    );
    expect(radialBuckets.size).toBe(8);
    expect(new Set(CANOPY_CLUSTERS.map((cluster) => cluster.layer))).toEqual(new Set(["inner", "middle", "edge"]));
    expect(CANOPY_CLUSTERS.some((cluster) => cluster.position[1] > 8)).toBe(true);
    expect(CANOPY_CLUSTERS.some((cluster) => cluster.position[1] < 5.8)).toBe(true);

    expect(CANOPY_LEAFLETS.length).toBeGreaterThan(350);
    expect(CANOPY_LEAFLETS.length).toBeLessThan(700);
    CANOPY_LEAFLETS.forEach((leaflet) => {
      leaflet.scale.forEach((value) => expect(value).toBeGreaterThan(0));
      leaflet.position.forEach((value) => expect(Number.isFinite(value)).toBe(true));
    });
  });

  test("tapers the trunk and preserves a clear exposed lower bole", () => {
    const trunk = TREE_SEGMENTS.find((segment) => segment.role === "trunk");
    expect(trunk).toBeDefined();
    expect(trunk?.points.length).toBeGreaterThanOrEqual(5);
    expect(trunk?.radii[0]).toBeGreaterThan(trunk?.radii.at(-1) ?? 0);
    expect(trunk?.points.at(-1)?.[1]).toBeGreaterThan(4.5);
    expect(Math.max(...CANOPY_CLUSTERS.map((cluster) => cluster.position[1]))).toBeGreaterThan(
      trunk?.points.at(-1)?.[1] ?? 0,
    );
  });
});
