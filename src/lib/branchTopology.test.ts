import { describe, expect, test } from "vitest";
import {
  getBranchTopology,
  getBranchTopologyForChild,
} from "./branchTopology";
import type { MindNode, NodesMap } from "@/src/types/tree";

function node(
  id: string,
  parentId: string | null,
  children: string[] = [],
): MindNode {
  return {
    id,
    kind: parentId === null ? "root" : "branch",
    prompt: id,
    response: "",
    children,
    parentId,
    timestamp: 1,
    layer: 0,
    contextState: "valid",
  };
}

const nodes: NodesMap = {
  root: node("root", null, ["Physics", "Coding"]),
  Physics: node("Physics", "root", ["P1"]),
  P1: node("P1", "Physics", ["P2"]),
  P2: node("P2", "P1"),
  Coding: node("Coding", "root", ["C1"]),
  C1: node("C1", "Coding"),
};

describe("branch topology provenance", () => {
  test("derives the root child from the real parent chain", () => {
    expect(getBranchTopology(nodes, "root", "P2")).toEqual({
      rootNodeId: "root",
      ancestorNodeIds: ["root", "Physics", "P1", "P2"],
      topBranchId: "Physics",
    });
    expect(getBranchTopology(nodes, "root", "C1").topBranchId).toBe("Coding");
  });

  test("uses a newly created root child as its own top branch", () => {
    expect(
      getBranchTopologyForChild(nodes, "root", "root", "NewBranch"),
    ).toEqual({
      rootNodeId: "root",
      ancestorNodeIds: ["root", "NewBranch"],
      topBranchId: "NewBranch",
    });
  });

  test("keeps a new descendant on its parent's top branch", () => {
    expect(
      getBranchTopologyForChild(nodes, "root", "P2", "P3"),
    ).toEqual({
      rootNodeId: "root",
      ancestorNodeIds: ["root", "Physics", "P1", "P2", "P3"],
      topBranchId: "Physics",
    });
  });

  test("rejects root-only and malformed topology", () => {
    expect(() => getBranchTopology(nodes, "root", "root")).toThrow(
      "Root node has no top-level branch",
    );
    expect(() => getBranchTopology(nodes, "wrong-root", "P2")).toThrow(
      "must start at project root",
    );
  });
});
