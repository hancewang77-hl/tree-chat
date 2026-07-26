import { describe, expect, test } from "vitest";
import { treeReducer } from "./treeReducer";
import { compileAuxoInput } from "@/src/lib/auxo";
import type { AuxoPlan, MindNode, NutrientItem, SemanticCard, TreeState } from "@/src/types/tree";

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

    let state = treeReducer(baseState(), {
      type: "ADD_NUTRIENTS",
      projectId: "project",
      nutrients: [nutrient],
    });

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

  test("async nutrient results stay with the project where ingestion started", () => {
    const initial = baseState();
    initial.projects.other = {
      ...initial.projects.project,
      id: "other",
      name: "Other",
      nutrients: {},
      activeNutrientIds: [],
    };
    initial.activeProjectId = "other";
    const nutrient: NutrientItem = {
      id: "nutrient-delayed",
      name: "source.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 128,
      kind: "document",
      createdAt: 2,
      extractionStatus: "ready",
      extractedText: "# Delayed result",
      excerpt: "Delayed result",
      extractedCharCount: 16,
    };

    const state = treeReducer(initial, {
      type: "ADD_NUTRIENTS",
      projectId: "project",
      nutrients: [nutrient],
    });

    expect(state.projects.project.nutrients["nutrient-delayed"]).toEqual(nutrient);
    expect(state.projects.other.nutrients["nutrient-delayed"]).toBeUndefined();
    expect(state.activeProjectId).toBe("other");
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
      content: "显式上下文笔记",
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

  test("Auxo 原子写入有序任务树，并通过一次全局 Undo/Redo 撤销与恢复", () => {
    const initial = baseState();
    initial.projects.project.nodes.root.prompt = "1. Root";
    const input = compileAuxoInput(initial.projects.project);
    const plan: AuxoPlan = {
      version: 1,
      generatedAt: 100,
      model: "deepseek-chat",
      nodes: [
        {
          planId: "group",
          parentPlanId: "root",
          nodeRole: "task-group",
          title: "准备阶段",
          order: 1,
        },
        {
          planId: "task-1",
          parentPlanId: "group",
          nodeRole: "task",
          title: "读取根任务",
          order: 2,
          sourceUnitId: "source-001",
        },
        {
          planId: "task-2",
          parentPlanId: "group",
          nodeRole: "task",
          title: "列出交付物",
          order: 3,
        },
      ],
    };

    let state = treeReducer(initial, {
      type: "APPLY_AUXO_PLAN",
      projectId: "project",
      rootNodeId: "root",
      generationId: "auxo-run-1",
      inputFingerprint: input.inputFingerprint,
      nutrientRefs: input.nutrientRefs,
      plan,
    });

    const root = projectNodes(state).root;
    const group = projectNodes(state)[root.children[0]];
    const tasks = group.children.map((id) => projectNodes(state)[id]);
    expect(Object.keys(projectNodes(state))).toHaveLength(4);
    expect(group.nodeRole).toBe("task-group");
    expect(group.contextState).toBe("valid");
    expect(group.response).toBe("");
    expect(tasks.map((task) => task.prompt)).toEqual(["1. Root", "列出交付物"]);
    expect(tasks.map((task) => task.nodeRole)).toEqual(["task", "task"]);
    expect(group.taskDescription).toBe("Auxo 任务组 · 共 2 项子任务，按顺序完成。");
    expect(tasks.map((task) => task.taskDescription)).toEqual([
      "读取根任务",
      "Auxo 补充任务 · 由整体目标推导，不对应单一原文题目。",
    ]);
    expect(tasks.every((task) => task.auxoGenerationId === "auxo-run-1")).toBe(true);
    expect(root.auxoManifest).toMatchObject({
      generationId: "auxo-run-1",
      nodeCount: 3,
      nutrientChunks: [],
    });
    expect(state.history.past).toHaveLength(1);
    expect(state.history.past[0].nodeUndoable).toBe(false);
    expect(state.history.past[0].label).toContain("Auxo");

    const generatedIds = [group.id, ...group.children];
    state = treeReducer(state, { type: "UNDO" });
    expect(projectNodes(state).root.children).toEqual([]);
    expect(projectNodes(state).root.auxoManifest).toBeUndefined();
    for (const id of generatedIds) expect(projectNodes(state)[id]).toBeUndefined();

    state = treeReducer(state, { type: "REDO" });
    expect(projectNodes(state).root.children).toEqual([group.id]);
    expect(projectNodes(state)[group.id].children).toEqual(group.children);
    for (const id of generatedIds) expect(projectNodes(state)[id]).toBeDefined();
  });

  test("Auxo 批次不允许节点级非顺序撤销，避免遗留孤儿节点", () => {
    const initial = baseState();
    const input = compileAuxoInput(initial.projects.project);
    const plan: AuxoPlan = {
      version: 1,
      generatedAt: 100,
      model: "deepseek-chat",
      nodes: [
        {
          planId: "task",
          parentPlanId: "root",
          nodeRole: "task",
          title: "执行任务",
          order: 1,
        },
      ],
    };
    let state = treeReducer(initial, {
      type: "APPLY_AUXO_PLAN",
      projectId: "project",
      rootNodeId: "root",
      generationId: "auxo-run-safe",
      inputFingerprint: input.inputFingerprint,
      nutrientRefs: [],
      plan,
    });
    const taskId = projectNodes(state).root.children[0];
    const before = JSON.stringify(projectNodes(state));

    state = treeReducer(state, { type: "UNDO_NODE", nodeId: taskId });
    expect(JSON.stringify(projectNodes(state))).toBe(before);
    expect(state.history.past).toHaveLength(1);
  });

  test("Auxo 批次是节点 Rings 的历史屏障，不会越过它撤销更早操作", () => {
    let state = baseState();
    state = treeReducer(state, {
      type: "BRANCH",
      prompt: "临时分支",
      response: "临时回答",
      parentId: "root",
    });
    const temporaryId = projectNodes(state).root.children[0];
    state = treeReducer(state, { type: "PRUNE", nodeId: temporaryId });
    const input = compileAuxoInput(state.projects.project);
    const plan: AuxoPlan = {
      version: 1,
      generatedAt: 100,
      model: "deepseek-v4-flash",
      nodes: [{
        planId: "task",
        parentPlanId: "root",
        nodeRole: "task",
        title: "执行任务",
        order: 1,
      }],
    };
    state = treeReducer(state, {
      type: "APPLY_AUXO_PLAN",
      projectId: "project",
      rootNodeId: "root",
      generationId: "auxo-run-barrier",
      inputFingerprint: input.inputFingerprint,
      nutrientRefs: [],
      plan,
    });
    const beforeNodeUndo = state;

    state = treeReducer(state, { type: "UNDO_NODE", nodeId: "root" });

    expect(state).toBe(beforeNodeUndo);
    expect(projectNodes(state).root.children).toHaveLength(1);
    expect(state.history.past).toHaveLength(3);
  });

  test("Auxo 在输入指纹变化或根节点已有内容时保持零写入", () => {
    const initial = baseState();
    const input = compileAuxoInput(initial.projects.project);
    const plan: AuxoPlan = {
      version: 1,
      generatedAt: 100,
      model: "deepseek-chat",
      nodes: [
        {
          planId: "task",
          parentPlanId: "root",
          nodeRole: "task",
          title: "执行任务",
          order: 1,
        },
      ],
    };
    const action = {
      type: "APPLY_AUXO_PLAN" as const,
      projectId: "project",
      rootNodeId: "root",
      generationId: "auxo-run-stale",
      inputFingerprint: "stale-fingerprint",
      nutrientRefs: [] as string[],
      plan,
    };

    const stale = treeReducer(initial, action);
    expect(stale).toBe(initial);

    const withChild = baseState();
    withChild.projects.project.nodes.root.children = ["existing"];
    withChild.projects.project.nodes.existing = node({
      id: "existing",
      kind: "branch",
      nodeRole: "answer",
      parentId: "root",
    });
    const blocked = treeReducer(withChild, {
      ...action,
      inputFingerprint: input.inputFingerprint,
    });
    expect(blocked).toBe(withChild);
  });
});
