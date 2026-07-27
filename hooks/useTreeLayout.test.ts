import { describe, expect, test } from "vitest";
import {
  MAX_LEAVES_PER_NODE,
  canAttachLeaf,
  computeLeafWorldPosition,
  countLeafChildren,
  getLeafAttachments,
  getTrunkChildIds,
} from "./useTreeLayout";
import type { NodesMap } from "@/src/types/tree";

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
