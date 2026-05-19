import { describe, expect, test } from "vitest";
import { getLeafAttachments, getTrunkChildIds } from "./useTreeLayout";
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
});
