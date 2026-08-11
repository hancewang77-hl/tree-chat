import { describe, expect, test } from "vitest";
import {
  MAX_LEAVES_PER_NODE,
  canAttachLeaf,
  computeLeafWorldPosition,
  countLeafChildren,
  getContextPath,
  getLeafAttachments,
  getTrunkChildIds,
} from "./useTreeLayout";
import type { MindNode, NodesMap } from "@/src/types/tree";

function branchNode(
  id: string,
  parentId: string | null,
  children: string[] = [],
): MindNode {
  return {
    id,
    prompt: id,
    response: `${id} response`,
    children,
    parentId,
    timestamp: 1,
    layer: 0,
    kind: parentId === null ? "root" : "branch",
    contextState: parentId === null ? "valid" : "missing",
  };
}

function buildLinearTree(depth: number): { nodes: NodesMap; targetId: string } {
  if (!Number.isInteger(depth) || depth < 1) {
    throw new Error("depth must be a positive integer");
  }

  const linearNodes: NodesMap = {};
  for (let index = 0; index < depth; index++) {
    const id = index === 0 ? "root" : `node-${index}`;
    const parentId = index === 0 ? null : index === 1 ? "root" : `node-${index - 1}`;
    const childId = index + 1 < depth ? `node-${index + 1}` : undefined;
    linearNodes[id] = branchNode(id, parentId, childId ? [childId] : []);
  }

  return {
    nodes: linearNodes,
    targetId: depth === 1 ? "root" : `node-${depth - 1}`,
  };
}

const nodes: NodesMap = {
  root: {
    id: "root",
    prompt: "Root",
    response: "Root response",
    children: ["branch-1", "leaf-1"],
    parentId: null,
    timestamp: 1,
    layer: 0,
    kind: "root",
    contextState: "valid",
  },
  "branch-1": {
    id: "branch-1",
    prompt: "Branch",
    response: "Answer",
    children: [],
    parentId: "root",
    timestamp: 2,
    layer: 0,
    kind: "branch",
    contextState: "missing",
  },
  "leaf-1": {
    id: "leaf-1",
    prompt: "Leaf note",
    response: "",
    children: [],
    parentId: "root",
    timestamp: 3,
    layer: 0,
    kind: "leaf",
    contextState: "missing",
  },
};

describe("tree layout leaf treatment", () => {
  test("leaf notes do not participate in trunk children", () => {
    expect(getTrunkChildIds(nodes, "root")).toEqual(["branch-1"]);
  });

  test("leaf notes are exposed as parent-attached leaves", () => {
    expect(getLeafAttachments(nodes, "root")).toEqual([
      {
        node: nodes["leaf-1"],
        parentId: "root",
        index: 0,
        total: 1,
      },
    ]);
  });

  test("leaf slots share one row below the parent", () => {
    const parentX = 10;
    const parentY = 4;
    const first = computeLeafWorldPosition(parentX, parentY, 0, 3);
    const second = computeLeafWorldPosition(parentX, parentY, 1, 3);
    const third = computeLeafWorldPosition(parentX, parentY, 2, 3);

    expect(first.y).toBe(second.y);
    expect(second.y).toBe(third.y);
    expect(first.x).toBeLessThan(second.x);
    expect(second.x).toBeLessThan(third.x);
    expect(first.y).toBeGreaterThan(parentY);
  });

  test("leaf count respects the per-node maximum", () => {
    expect(countLeafChildren(nodes, "root")).toBe(1);
    expect(canAttachLeaf(nodes, "root")).toBe(true);
    expect(MAX_LEAVES_PER_NODE).toBe(3);
  });
});

describe("getContextPath", () => {
  test("returns the root as a one-node path", () => {
    const rootOnly = { root: branchNode("root", null) };

    expect(getContextPath(rootOnly, "root").map((node) => node.id)).toEqual(["root"]);
  });

  test("returns a deep path in strict root-to-current order", () => {
    const deepNodes: NodesMap = {
      root: branchNode("root", null, ["A"]),
      A: branchNode("A", "root", ["A1"]),
      A1: branchNode("A1", "A", ["A11"]),
      A11: branchNode("A11", "A1"),
    };

    expect(getContextPath(deepNodes, "A11").map((node) => node.id)).toEqual([
      "root",
      "A",
      "A1",
      "A11",
    ]);
  });

  test("never includes a sibling branch", () => {
    const siblingNodes: NodesMap = {
      root: branchNode("root", null, ["A", "B"]),
      A: branchNode("A", "root", ["A1"]),
      A1: branchNode("A1", "A"),
      B: branchNode("B", "root"),
    };

    const ids = getContextPath(siblingNodes, "A1").map((node) => node.id);
    expect(ids).toEqual(["root", "A", "A1"]);
    expect(ids).not.toContain("B");
  });

  test("throws a clear error when a parent node is missing", () => {
    const brokenNodes = {
      child: branchNode("child", "missing-parent"),
    };

    expect(() => getContextPath(brokenNodes, "child")).toThrowError(
      "Context path parent node not found: missing-parent",
    );
  });

  test("detects a parent cycle", () => {
    const cyclicNodes: NodesMap = {
      A: branchNode("A", "B"),
      B: branchNode("B", "A"),
    };

    expect(() => getContextPath(cyclicNodes, "A")).toThrowError(
      "Context path cycle detected: A -> B -> A",
    );
  });

  test("throws a clear error when the requested node is missing", () => {
    expect(() => getContextPath({}, "missing-node")).toThrowError(
      "Context path node not found: missing-node",
    );
  });

  test("retrieves paths at depths 10, 100, and 1000", () => {
    const measurements: Record<number, number> = {};

    for (const depth of [10, 100, 1000]) {
      const tree = buildLinearTree(depth);
      const startedAt = performance.now();
      const path = getContextPath(tree.nodes, tree.targetId);
      measurements[depth] = performance.now() - startedAt;

      expect(path).toHaveLength(depth);
      expect(path[0]?.id).toBe("root");
      expect(path.at(-1)?.id).toBe(tree.targetId);
    }

    console.info("getContextPath single-run measurements (ms)", measurements);
  });
});
