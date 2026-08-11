import { describe, expect, test, vi } from "vitest";
import {
  prepareTreeChatAction,
  submitTreeChatAction,
} from "@/src/product/productAction";
import type { MindNode, TreeAction, TreeState } from "@/src/types/tree";

function node(overrides: Partial<MindNode>): MindNode {
  return {
    id: "root",
    kind: "root",
    prompt: "Root task",
    response: "",
    status: "complete",
    children: [],
    parentId: null,
    timestamp: 1,
    layer: 0,
    contextState: "valid",
    ...overrides,
  };
}

function treeState(): TreeState {
  return {
    projects: {
      project: {
        id: "project",
        name: "Project",
        rootNodeId: "root",
        nodes: {
          root: node({ children: ["branch-a", "branch-b"] }),
          "branch-a": node({
            id: "branch-a",
            kind: "branch",
            prompt: "Explore A",
            response: "ALPHA_CONTEXT",
            parentId: "root",
            timestamp: 2,
            layer: 1,
          }),
          "branch-b": node({
            id: "branch-b",
            kind: "branch",
            prompt: "Explore B",
            response: "BETA_SIBLING",
            parentId: "root",
            timestamp: 3,
            layer: 1,
          }),
        },
        nutrients: {},
        activeNutrientIds: [],
        createdAt: 1,
        updatedAt: 1,
      },
    },
    activeProjectId: "project",
    selectedNodeId: "branch-a",
    selectedLayer: 1,
    is3DMode: false,
    toolMode: "view",
    movingNodeId: null,
    pendingNodeLayer: null,
    graftSourceId: null,
    zoom2D: 100,
    zoom3D: 1,
    planeNames: {},
    isCanopyOpen: false,
    isRingsOpen: false,
    ringsMode: "global",
    ringsFocusNodeId: null,
    history: { past: [], future: [] },
  };
}

describe("TreeChat product action", () => {
  test("prepares a branch-local Runtime request from the selected path", () => {
    const prepared = prepareTreeChatAction({
      treeState: treeState(),
      prompt: "Continue A",
      model: "deepseek-chat",
      nodeId: "branch-a-child",
      compiledAt: 123,
    });
    const payload = JSON.stringify(prepared.compiled.messages);

    expect(prepared.parentNodeId).toBe("branch-a");
    expect(prepared.topology).toEqual({
      rootNodeId: "root",
      ancestorNodeIds: ["root", "branch-a", "branch-a-child"],
      topBranchId: "branch-a",
    });
    expect(prepared.runtimeRequest.messages).toEqual(prepared.compiled.messages);
    expect(payload).toContain("ALPHA_CONTEXT");
    expect(payload).not.toContain("BETA_SIBLING");
  });

  test("dispatches streaming and completion actions around the Runtime transport", async () => {
    const actions: TreeAction[] = [];
    const result = await submitTreeChatAction({
      treeState: treeState(),
      prompt: "Continue A",
      model: "deepseek-chat",
      nodeId: "branch-a-child",
      compiledAt: 123,
      dispatch: (action) => actions.push(action),
      sendChat: async ({ onText }) => {
        onText("partial");
        return "complete answer";
      },
    });

    expect(result.status).toBe("complete");
    expect(actions.map((action) => action.type)).toEqual([
      "STREAM_BRANCH_START",
      "STREAM_BRANCH_UPDATE",
      "STREAM_BRANCH_FINISH",
    ]);
  });

  test("records provider failures on the branch before rethrowing", async () => {
    const actions: TreeAction[] = [];
    await expect(submitTreeChatAction({
      treeState: treeState(),
      prompt: "Continue A",
      model: "deepseek-chat",
      nodeId: "branch-a-child",
      dispatch: (action) => actions.push(action),
      sendChat: vi.fn().mockRejectedValue(new Error("provider failed")),
    })).rejects.toThrow("provider failed");

    expect(actions.at(-1)).toMatchObject({
      type: "STREAM_BRANCH_FAIL",
      nodeId: "branch-a-child",
      error: "provider failed",
    });
  });

  test("maps AbortError to a stopped branch without rethrowing", async () => {
    const actions: TreeAction[] = [];
    const result = await submitTreeChatAction({
      treeState: treeState(),
      prompt: "Continue A",
      model: "deepseek-chat",
      nodeId: "branch-a-child",
      dispatch: (action) => actions.push(action),
      sendChat: vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError")),
    });

    expect(result.status).toBe("stopped");
    expect(actions.at(-1)).toMatchObject({
      type: "STREAM_BRANCH_FINISH",
      nodeId: "branch-a-child",
      status: "stopped",
    });
  });
});
