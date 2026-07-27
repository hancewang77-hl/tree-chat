import { describe, expect, test } from "vitest";
import { treeReducer } from "./treeReducer";
import type { MindNode, NutrientItem, SemanticCard, TreeState } from "@/src/types/tree";

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
    status: "complete",
    contextState: "valid",
    ...overrides,
  };
}

function manifest(parentNodeId: string = "root") {
  return {
    compilerVersion: 1 as const,
    compiledAt: 1,
    model: "deepseek-chat",
    selectedNodeId: parentNodeId,
    parentNodeId,
    includedNodeIds: ["root"],
    excludedNodeIds: [],
    nutrientChunks: [],
    warnings: [],
  };
}

function semanticCard(fact: string): SemanticCard {
  return {
    version: 1,
    generatedAt: 1,
    model: "deepseek-chat",
    facts: [fact],
    constraints: [],
    assumptions: [],
    decisions: [],
    rejected: [],
    openQuestions: [],
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

function graftState(): TreeState {
  const state = baseState();
  state.projects.project.nodes = {
    root: node({ id: "root", children: ["a", "c", "leaf"] }),
    a: node({
      id: "a",
      kind: "branch",
      prompt: "A",
      response: "Answer A",
      parentId: "root",
      children: ["b"],
      contextState: "valid",
      semanticCard: semanticCard("Fact A"),
      nutrientRefs: ["nutrient-a"],
    }),
    b: node({
      id: "b",
      kind: "branch",
      prompt: "B",
      response: "Answer B",
      parentId: "a",
      contextState: "valid",
      semanticCard: semanticCard("Fact B"),
    }),
    c: node({
      id: "c",
      kind: "branch",
      prompt: "C",
      response: "Answer C",
      parentId: "root",
      contextState: "valid",
      semanticCard: semanticCard("Fact C"),
    }),
    leaf: node({
      id: "leaf",
      kind: "leaf",
      prompt: "Leaf",
      response: "",
      parentId: "root",
      contextState: "missing",
      semanticCard: undefined,
      includeInContext: false,
    }),
  };
  return state;
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
    state = treeReducer(state, {
      type: "LEAF",
      name: "A local observation",
      content: "Detailed observation body",
      parentId: "root",
    });

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

  test("each node accepts at most three leaf notes", () => {
    let state = baseState();
    for (let i = 0; i < 3; i += 1) {
      state = treeReducer(state, {
        type: "LEAF",
        name: `Leaf ${i + 1}`,
        content: `Body ${i + 1}`,
        parentId: "root",
      });
    }

    const rootChildren = projectNodes(state).root.children;
    expect(rootChildren.filter((id) => projectNodes(state)[id]?.kind === "leaf")).toHaveLength(3);

    state = treeReducer(state, {
      type: "LEAF",
      name: "Leaf 4",
      content: "Should not attach",
      parentId: "root",
    });
    expect(
      rootChildren.filter((id) => projectNodes(state)[id]?.kind === "leaf"),
    ).toHaveLength(3);
    expect(findNodeByPrompt(state, "Leaf 4")).toBeUndefined();
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

  test("streaming branch starts selected before any response arrives", () => {
    const state = treeReducer(baseState(), {
      type: "STREAM_BRANCH_START",
      projectId: "project",
      nodeId: "node-stream",
      prompt: "Stream this answer",
      parentId: "root",
      nutrientRefs: [],
      contextManifest: manifest(),
    });

    const streamNode = projectNodes(state)["node-stream"];
    expect(streamNode?.prompt).toBe("Stream this answer");
    expect(streamNode?.response).toBe("");
    expect(streamNode?.status).toBe("streaming");
    expect(streamNode?.contextState).toBe("missing");
    expect(streamNode?.contextManifest).toEqual(manifest());
    expect(streamNode?.parentId).toBe("root");
    expect(projectNodes(state).root.children).toContain("node-stream");
    expect(state.selectedNodeId).toBe("node-stream");
    expect(state.history.past).toHaveLength(0);
  });

  test("streaming branch updates response without creating token-level history entries", () => {
    let state = treeReducer(baseState(), {
      type: "STREAM_BRANCH_START",
      projectId: "project",
      nodeId: "node-stream",
      prompt: "Stream this answer",
      parentId: "root",
      nutrientRefs: [],
      contextManifest: manifest(),
    });

    state = treeReducer(state, {
      type: "STREAM_BRANCH_UPDATE",
      projectId: "project",
      nodeId: "node-stream",
      response: "第一段",
    });

    state = treeReducer(state, {
      type: "STREAM_BRANCH_UPDATE",
      projectId: "project",
      nodeId: "node-stream",
      response: "第一段，第二段",
    });

    expect(projectNodes(state)["node-stream"].response).toBe("第一段，第二段");
    expect(projectNodes(state)["node-stream"].status).toBe("streaming");
    expect(state.history.past).toHaveLength(0);
  });

  test("finishing a streaming branch creates one undoable history entry with the final response", () => {
    let state = treeReducer(baseState(), {
      type: "STREAM_BRANCH_START",
      projectId: "project",
      nodeId: "node-stream",
      prompt: "Stream this answer",
      parentId: "root",
      nutrientRefs: [],
      contextManifest: manifest(),
    });
    state = treeReducer(state, {
      type: "STREAM_BRANCH_UPDATE",
      projectId: "project",
      nodeId: "node-stream",
      response: "最终回答",
    });
    state = treeReducer(state, {
      type: "STREAM_BRANCH_FINISH",
      projectId: "project",
      nodeId: "node-stream",
      status: "complete",
    });

    expect(projectNodes(state)["node-stream"].status).toBe("complete");
    expect(state.history.past).toHaveLength(1);

    state = treeReducer(state, { type: "UNDO_NODE", nodeId: "node-stream" });
    expect(projectNodes(state)["node-stream"]).toBeUndefined();
    expect(projectNodes(state).root.children).not.toContain("node-stream");

    state = treeReducer(state, { type: "REDO_NODE", nodeId: "node-stream" });
    expect(projectNodes(state)["node-stream"].response).toBe("最终回答");
    expect(projectNodes(state)["node-stream"].status).toBe("complete");
    expect(projectNodes(state).root.children).toContain("node-stream");
  });

  test("语义整理不新增 Rings 记录，Undo/Redo 仍保留语义卡片", () => {
    let state = treeReducer(baseState(), {
      type: "STREAM_BRANCH_START",
      projectId: "project",
      nodeId: "node-stream",
      prompt: "Stream this answer",
      parentId: "root",
      nutrientRefs: [],
      contextManifest: manifest(),
    });
    state = treeReducer(state, {
      type: "STREAM_BRANCH_UPDATE",
      projectId: "project",
      nodeId: "node-stream",
      response: "最终回答",
    });
    state = treeReducer(state, {
      type: "STREAM_BRANCH_FINISH",
      projectId: "project",
      nodeId: "node-stream",
      status: "complete",
    });
    state = treeReducer(state, {
      type: "SET_NODE_SEMANTICS",
      projectId: "project",
      nodeId: "node-stream",
      expectedParentId: "root",
      semanticCard: semanticCard("整理后事实"),
    });

    expect(projectNodes(state)["node-stream"].contextState).toBe("valid");
    expect(projectNodes(state)["node-stream"].semanticCard?.facts).toEqual(["整理后事实"]);
    expect(state.history.past).toHaveLength(1);

    state = treeReducer(state, { type: "UNDO_NODE", nodeId: "node-stream" });
    expect(projectNodes(state)["node-stream"]).toBeUndefined();
    state = treeReducer(state, { type: "REDO_NODE", nodeId: "node-stream" });
    expect(projectNodes(state)["node-stream"].contextState).toBe("valid");
    expect(projectNodes(state)["node-stream"].semanticCard?.facts).toEqual(["整理后事实"]);
  });

  test("无效或空语义卡片不会把节点误标为 valid", () => {
    const state = graftState();
    state.projects.project.nodes.a = {
      ...state.projects.project.nodes.a,
      contextState: "missing",
      semanticCard: undefined,
    };
    const emptyCard = {
      ...semanticCard("占位"),
      facts: [],
    };

    const next = treeReducer(state, {
      type: "SET_NODE_SEMANTICS",
      projectId: "project",
      nodeId: "a",
      expectedParentId: "root",
      semanticCard: emptyCard,
    });

    expect(next).toBe(state);
    expect(projectNodes(next).a.contextState).toBe("missing");
  });

  test("异步语义整理结果不会被后续 Graft Undo/Redo 的旧快照覆盖", () => {
    const initial = graftState();
    initial.projects.project.nodes.a = {
      ...initial.projects.project.nodes.a,
      contextState: "missing",
      semanticCard: undefined,
    };

    let state = treeReducer(initial, { type: "GRAFT_START", nodeId: "a" });
    state = treeReducer(state, { type: "GRAFT_CONFIRM", newParentId: "c" });
    state = treeReducer(state, { type: "UNDO_NODE", nodeId: "a" });
    state = treeReducer(state, {
      type: "SET_NODE_SEMANTICS",
      projectId: "project",
      nodeId: "a",
      expectedParentId: "root",
      semanticCard: semanticCard("重试后事实"),
    });

    expect(projectNodes(state).a.contextState).toBe("valid");
    state = treeReducer(state, { type: "REDO_NODE", nodeId: "a" });
    expect(projectNodes(state).a.contextState).toBe("stale");
    state = treeReducer(state, { type: "UNDO_NODE", nodeId: "a" });
    expect(projectNodes(state).a.contextState).toBe("valid");
    expect(projectNodes(state).a.semanticCard?.facts).toEqual(["重试后事实"]);
  });

  test("Leaf 上下文开关在节点 Undo/Redo 后仍保持", () => {
    let state = treeReducer(baseState(), {
      type: "LEAF",
      name: "显式上下文笔记",
      content: "笔记正文",
      parentId: "root",
    });
    const leaf = findNodeByPrompt(state, "显式上下文笔记")!;
    state = treeReducer(state, { type: "TOGGLE_LEAF_CONTEXT", nodeId: leaf.id });

    expect(projectNodes(state)[leaf.id].includeInContext).toBe(true);
    state = treeReducer(state, { type: "UNDO_NODE", nodeId: leaf.id });
    expect(projectNodes(state)[leaf.id]).toBeUndefined();
    state = treeReducer(state, { type: "REDO_NODE", nodeId: leaf.id });
    expect(projectNodes(state)[leaf.id].includeInContext).toBe(true);
  });

  test("Graft 原子移动结构并将整个 AI 子树标记为 stale", () => {
    const before = graftState();
    const originalA = before.projects.project.nodes.a;
    const originalB = before.projects.project.nodes.b;
    let state = treeReducer(before, { type: "GRAFT_START", nodeId: "a" });
    state = treeReducer(state, { type: "GRAFT_CONFIRM", newParentId: "c" });
    const nodes = projectNodes(state);

    expect(nodes.root.children).toEqual(["c", "leaf"]);
    expect(nodes.c.children).toEqual(["a"]);
    expect(nodes.a.parentId).toBe("c");
    expect(nodes.a.contextState).toBe("stale");
    expect(nodes.b.contextState).toBe("stale");
    expect(nodes.root.contextState).toBe("valid");
    expect(nodes.c.contextState).toBe("valid");
    expect(nodes.a.prompt).toBe(originalA.prompt);
    expect(nodes.a.response).toBe(originalA.response);
    expect(nodes.a.semanticCard).toEqual(originalA.semanticCard);
    expect(nodes.a.nutrientRefs).toEqual(originalA.nutrientRefs);
    expect(nodes.b.response).toBe(originalB.response);
    expect(state.history.past).toHaveLength(1);
    expect(state.history.past[0].affectedNodeIds).toEqual(
      expect.arrayContaining(["root", "c", "a", "b"]),
    );

    state = treeReducer(state, { type: "UNDO_NODE", nodeId: "b" });
    expect(projectNodes(state).root.children).toEqual(["a", "c", "leaf"]);
    expect(projectNodes(state).a.parentId).toBe("root");
    expect(projectNodes(state).a.contextState).toBe("valid");
    expect(projectNodes(state).b.contextState).toBe("valid");

    state = treeReducer(state, { type: "REDO_NODE", nodeId: "b" });
    expect(projectNodes(state).a.parentId).toBe("c");
    expect(projectNodes(state).a.contextState).toBe("stale");
    expect(projectNodes(state).b.contextState).toBe("stale");
  });

  test("Graft 拒绝根节点、当前父节点、后代和 Leaf 目标，不写入历史", () => {
    const attempts = [
      { source: "root", target: "c" },
      { source: "a", target: "root" },
      { source: "a", target: "b" },
      { source: "a", target: "leaf" },
    ];

    for (const attempt of attempts) {
      const before = graftState();
      const beforeNodes = JSON.stringify(projectNodes(before));
      let state = treeReducer(before, { type: "GRAFT_START", nodeId: attempt.source });
      state = treeReducer(state, { type: "GRAFT_CONFIRM", newParentId: attempt.target });

      expect(JSON.stringify(projectNodes(state))).toBe(beforeNodes);
      expect(state.history.past).toHaveLength(0);
      expect(state.toolMode).toBe("view");
      expect(state.graftSourceId).toBeNull();
    }
  });

  test("Graft 拒绝涉及流式节点的移动，避免历史恢复出未完成节点", () => {
    const scenarios = [
      { streamingNodeId: "a", source: "a", target: "c" },
      { streamingNodeId: "b", source: "a", target: "c" },
      { streamingNodeId: "c", source: "a", target: "c" },
      { streamingNodeId: "root", source: "a", target: "c" },
    ];

    for (const scenario of scenarios) {
      const before = graftState();
      before.projects.project.nodes[scenario.streamingNodeId] = {
        ...before.projects.project.nodes[scenario.streamingNodeId],
        status: "streaming",
      };
      const beforeNodes = JSON.stringify(projectNodes(before));

      let state = treeReducer(before, { type: "GRAFT_START", nodeId: scenario.source });
      state = treeReducer(state, { type: "GRAFT_CONFIRM", newParentId: scenario.target });

      expect(JSON.stringify(projectNodes(state))).toBe(beforeNodes);
      expect(state.history.past).toHaveLength(0);
      expect(state.toolMode).toBe("view");
      expect(state.graftSourceId).toBeNull();
    }
  });
});
