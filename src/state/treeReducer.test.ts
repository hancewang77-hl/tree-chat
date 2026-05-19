import { describe, expect, test } from "vitest";
import { treeReducer } from "./treeReducer";
import type { MindNode, NutrientItem, TreeState } from "@/src/types/tree";

function node(overrides: Partial<MindNode>): MindNode {
  return {
    id: "root",
    prompt: "Root",
    response: "Root response",
    children: [],
    parentId: null,
    timestamp: 1,
    offsetX: 0,
    offsetY: 0,
    layer: 0,
    kind: "root",
    ...overrides,
  };
}

function baseState(): TreeState {
  return {
    projects: {
      project: {
        id: "project",
        name: "Project",
        rootNodeId: "root",
        nodes: {
          root: node({ id: "root", kind: "root" }),
        },
        nutrients: {},
        activeNutrientIds: [],
        createdAt: 1,
        updatedAt: 1,
      },
    },
    activeProjectId: "project",
    selectedNodeId: "root",
    selectedLayer: 0,
    is3DMode: false,
    toolMode: "view",
    movingNodeId: null,
    pendingNodeLayer: null,
    graftSourceId: null,
    zoom2D: 105,
    zoom3D: 1,
    planeNames: { 0: "根节点层" },
    isCanopyOpen: false,
    isRingsOpen: false,
    ringsMode: "global",
    ringsFocusNodeId: null,
    history: { past: [], future: [] },
  };
}

function projectNodes(state: TreeState) {
  return state.projects[state.activeProjectId].nodes;
}

function findNodeByPrompt(state: TreeState, prompt: string) {
  return Object.values(projectNodes(state)).find((candidate) => candidate.prompt === prompt);
}

describe("treeReducer product functions", () => {
  test("node rings undo only removes the latest history entry related to that node", () => {
    let state = baseState();

    state = treeReducer(state, {
      type: "BRANCH",
      prompt: "A",
      response: "Answer A",
      parentId: "root",
    });
    const nodeA = findNodeByPrompt(state, "A");
    expect(nodeA).toBeDefined();

    state = treeReducer(state, {
      type: "BRANCH",
      prompt: "B",
      response: "Answer B",
      parentId: "root",
    });
    const nodeB = findNodeByPrompt(state, "B");
    expect(nodeB).toBeDefined();

    state = treeReducer(state, { type: "UNDO_NODE", nodeId: nodeA!.id });

    expect(projectNodes(state)[nodeA!.id]).toBeUndefined();
    expect(projectNodes(state)[nodeB!.id]).toBeDefined();
    expect(projectNodes(state).root.children).not.toContain(nodeA!.id);
    expect(projectNodes(state).root.children).toContain(nodeB!.id);
  });

  test("leaf notes stay attached to their parent while later branches grow from that parent", () => {
    let state = baseState();
    state = treeReducer(state, { type: "LEAF", content: "A local observation", parentId: "root" });

    const leaf = findNodeByPrompt(state, "A local observation");
    expect(leaf?.kind).toBe("leaf");

    state = treeReducer(
      { ...state, selectedNodeId: leaf!.id },
      {
        type: "BRANCH",
        prompt: "Follow up from the note",
        response: "Answer",
        parentId: leaf!.id,
      },
    );

    const branch = findNodeByPrompt(state, "Follow up from the note");
    expect(branch?.kind).toBe("branch");
    expect(branch?.parentId).toBe("root");
    expect(projectNodes(state).root.children).toContain(leaf!.id);
    expect(projectNodes(state).root.children).toContain(branch!.id);
  });

  test("project nutrients become active context and new branches record their nutrient refs", () => {
    const nutrient: NutrientItem = {
      id: "nutrient-1",
      name: "market-notes.md",
      mimeType: "text/markdown",
      size: 128,
      kind: "text",
      createdAt: 2,
      extractionStatus: "ready",
      extractedText: "The market is moving toward persistent AI workspaces.",
      excerpt: "The market is moving toward persistent AI workspaces.",
      extractedCharCount: 57,
    };

    let state = treeReducer(baseState(), { type: "ADD_NUTRIENTS", nutrients: [nutrient] });

    expect(state.projects.project.activeNutrientIds).toEqual(["nutrient-1"]);

    state = treeReducer(state, {
      type: "BRANCH",
      prompt: "What should we build?",
      response: "A persistent workspace.",
      parentId: "root",
    });

    const branch = findNodeByPrompt(state, "What should we build?");
    expect(branch?.nutrientRefs).toEqual(["nutrient-1"]);
  });
});
