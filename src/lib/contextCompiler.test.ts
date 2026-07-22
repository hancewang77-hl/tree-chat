import { describe, expect, test } from "vitest";
import { compileContext } from "./contextCompiler";
import type { MindNode, NutrientItem, Project, SemanticCard } from "@/src/types/tree";

function card(value: string, generatedAt: number = 1): SemanticCard {
  return {
    version: 1,
    generatedAt,
    model: "deepseek-chat",
    facts: [value],
    constraints: [],
    assumptions: [],
    decisions: [],
    rejected: [],
    openQuestions: [],
  };
}

function node(overrides: Partial<MindNode>): MindNode {
  return {
    id: "root",
    kind: "root",
    prompt: "根任务",
    response: "这是界面引导语，不应进入模型。",
    status: "complete",
    children: [],
    parentId: null,
    timestamp: 1,
    layer: 0,
    contextState: "valid",
    semanticCard: card("根任务"),
    ...overrides,
  };
}

function project(nodes: Record<string, MindNode>, nutrients: NutrientItem[] = []): Project {
  return {
    id: "project",
    name: "Project",
    rootNodeId: "root",
    nodes,
    nutrients: Object.fromEntries(nutrients.map((item) => [item.id, item])),
    activeNutrientIds: nutrients.map((item) => item.id),
    createdAt: 1,
    updatedAt: 1,
  };
}

function compile(tree: Project, selectedNodeId: string, prompt: string = "请继续分析") {
  return compileContext({
    project: tree,
    selectedNodeId,
    prompt,
    model: "deepseek-chat",
    compiledAt: 123,
  });
}

describe("Tree-aware Context Compiler", () => {
  test("只编译根任务和 valid 语义卡，不回退拼接完整回答", () => {
    const nodes = {
      root: node({ id: "root", children: ["a", "sibling"] }),
      a: node({
        id: "a",
        kind: "branch",
        prompt: "A 的问题",
        response: "A 的完整长回答，不应被拼接。",
        parentId: "root",
        children: ["b"],
        contextState: "valid",
        semanticCard: card("A 的可用事实"),
      }),
      b: node({
        id: "b",
        kind: "branch",
        prompt: "B 的当前任务",
        response: "B 的旧回答不可回退使用。",
        parentId: "a",
        contextState: "missing",
        semanticCard: undefined,
      }),
      sibling: node({
        id: "sibling",
        kind: "branch",
        prompt: "兄弟节点",
        response: "兄弟回答",
        parentId: "root",
        contextState: "valid",
        semanticCard: card("兄弟事实"),
      }),
    };
    const before = JSON.stringify(nodes);

    const result = compile(project(nodes), "b");
    const content = result.messages.at(-1)?.content ?? "";

    expect(result.messages).toHaveLength(2);
    expect(content).toContain("根任务");
    expect(content).toContain("A 的可用事实");
    expect(content).toContain("B 的当前任务");
    expect(content).not.toContain("A 的完整长回答");
    expect(content).not.toContain("B 的旧回答");
    expect(content).not.toContain("界面引导语");
    expect(content).not.toContain("兄弟事实");
    expect(content.endsWith("请继续分析")).toBe(true);
    expect(result.manifest.includedNodeIds).toEqual(["root", "a"]);
    expect(result.manifest.excludedNodeIds).toContainEqual({ nodeId: "b", reason: "missing" });
    expect(result.manifest.compiledAt).toBe(123);
    expect(JSON.stringify(nodes)).toBe(before);
  });

  test("选中 Leaf 时使用其父节点作为语义锚点，默认隔离且可显式纳入", () => {
    const leaf = node({
      id: "leaf",
      kind: "leaf",
      prompt: "用户手写约束：预算不超过 1000 元",
      response: "",
      parentId: "root",
      contextState: "missing",
      semanticCard: undefined,
      includeInContext: false,
    });
    const nodes = {
      root: node({ id: "root", children: ["leaf"] }),
      leaf,
    };

    const isolated = compile(project(nodes), "leaf");
    expect(isolated.anchorNodeId).toBe("root");
    expect(isolated.messages[1].content).not.toContain("预算不超过");
    expect(isolated.manifest.excludedNodeIds).toContainEqual({ nodeId: "leaf", reason: "leaf" });

    const included = compile(project({ ...nodes, leaf: { ...leaf, includeInContext: true } }), "leaf");
    expect(included.anchorNodeId).toBe("root");
    expect(included.messages[1].content).toContain("预算不超过 1000 元");
    expect(included.manifest.includedNodeIds).toContain("leaf");
  });

  test("旧数据含重复 child 引用时只纳入一次 Leaf", () => {
    const leaf = node({
      id: "leaf",
      kind: "leaf",
      prompt: "唯一笔记内容",
      response: "",
      parentId: "root",
      contextState: "missing",
      semanticCard: undefined,
      includeInContext: true,
    });
    const result = compile(project({
      root: node({ id: "root", children: ["leaf", "leaf"] }),
      leaf,
    }), "root");

    expect(result.messages[1].content.match(/唯一笔记内容/g)).toHaveLength(1);
    expect(result.manifest.includedNodeIds.filter((id) => id === "leaf")).toHaveLength(1);
  });

  test("stale 与未完成节点不进入模型上下文", () => {
    const nodes = {
      root: node({ id: "root", children: ["stale"] }),
      stale: node({
        id: "stale",
        kind: "branch",
        prompt: "嫁接后的任务",
        response: "旧路径回答",
        parentId: "root",
        contextState: "stale",
        semanticCard: card("旧路径事实"),
      }),
    };
    const result = compile(project(nodes), "stale");

    expect(result.messages[1].content).not.toContain("旧路径事实");
    expect(result.messages[1].content).not.toContain("旧路径回答");
    expect(result.manifest.excludedNodeIds).toContainEqual({ nodeId: "stale", reason: "stale" });
  });

  test("按当前问题选取资料后段的相关片段并记录清单", () => {
    const nutrient: NutrientItem = {
      id: "material",
      name: "research.md",
      mimeType: "text/markdown",
      size: 5000,
      kind: "text",
      createdAt: 1,
      extractionStatus: "ready",
      extractedText: `${"unrelated ".repeat(159)}\n\n量子纠缠是当前问题的关键资料。`,
      excerpt: "research",
      extractedCharCount: 5000,
    };
    const tree = project({ root: node({ id: "root" }) }, [nutrient]);

    const result = compile(tree, "root", "量子纠缠的关键是什么？");

    expect(result.messages[1].content).toContain("量子纠缠是当前问题的关键资料");
    expect(result.messages[1].content).not.toContain("unrelated unrelated unrelated");
    expect(result.manifest.nutrientChunks).toEqual([
      { nutrientId: "material", nutrientName: "research.md", chunkId: "chunk-002" },
    ]);
  });

  test("长根任务不会挤掉当前问题的资料检索词", () => {
    const rootTerms = Array.from({ length: 100 }, (_, index) => `rootterm${index}`).join(" ");
    const nutrient: NutrientItem = {
      id: "material",
      name: "long-root.md",
      mimeType: "text/markdown",
      size: 5000,
      kind: "text",
      createdAt: 1,
      extractionStatus: "ready",
      extractedText: `${"rootterm0 ".repeat(159)}\n\n量子纠缠是当前问题的精确资料。`,
      excerpt: "research",
      extractedCharCount: 5000,
    };
    const tree = project({ root: node({ id: "root", prompt: rootTerms }) }, [nutrient]);

    const result = compileContext({
      project: tree,
      selectedNodeId: "root",
      prompt: "量子纠缠如何验证？",
      model: "deepseek-chat",
      compiledAt: 123,
      nutrientBudget: 500,
    });

    expect(result.messages[1].content).toContain("量子纠缠是当前问题的精确资料");
    expect(result.manifest.nutrientChunks[0]?.chunkId).toBe("chunk-002");
  });

  test("损坏的父链会保守停止、排除断链语义并留下警告", () => {
    const broken = node({
      id: "broken",
      kind: "branch",
      prompt: "断链节点",
      parentId: "missing-parent",
      contextState: "valid",
      semanticCard: card("仍可识别的节点事实"),
    });
    const result = compile(project({ root: node({ id: "root" }), broken }), "broken");

    expect(result.manifest.warnings.join(" ")).toContain("父节点不存在");
    expect(result.messages[1].content).not.toContain("仍可识别的节点事实");
    expect(result.messages[1].content).toContain("断链节点");
  });

  test("Auxo 任务原文沿父路径继承，兄弟任务与兄弟答案保持隔离", () => {
    const nodes = {
      root: node({ id: "root", children: ["group"] }),
      group: node({
        id: "group",
        kind: "branch",
        nodeRole: "task-group",
        prompt: "共同材料：以下两题使用同一数据集",
        taskDescription: "先读取共同材料，再分别完成原子任务。",
        response: "",
        parentId: "root",
        children: ["task-a", "task-b"],
        contextState: "valid",
        semanticCard: undefined,
      }),
      "task-a": node({
        id: "task-a",
        kind: "branch",
        nodeRole: "task",
        prompt: "第一题：计算均值。",
        taskDescription: "给出过程并核验。",
        response: "",
        parentId: "group",
        contextState: "valid",
        semanticCard: undefined,
      }),
      "task-b": node({
        id: "task-b",
        kind: "branch",
        nodeRole: "task",
        prompt: "第二题：计算方差。",
        taskDescription: "给出过程并核验。",
        response: "",
        parentId: "group",
        children: ["sibling-answer"],
        contextState: "valid",
        semanticCard: undefined,
      }),
      "sibling-answer": node({
        id: "sibling-answer",
        kind: "branch",
        nodeRole: "answer",
        prompt: "第二题的解法",
        response: "兄弟答案不应进入第一题上下文",
        parentId: "task-b",
        contextState: "valid",
        semanticCard: card("方差答案"),
      }),
    };

    const result = compile(project(nodes), "task-a", "开始执行第一题");
    const content = result.messages[1].content;

    expect(content).toContain("共同材料：以下两题使用同一数据集");
    expect(content).toContain("先读取共同材料，再分别完成原子任务");
    expect(content).toContain("第一题：计算均值。");
    expect(content).toContain("给出过程并核验");
    expect(content).not.toContain("第二题：计算方差");
    expect(content).not.toContain("方差答案");
    expect(content).not.toContain("兄弟答案不应进入第一题上下文");
    expect(result.manifest.includedNodeIds).toEqual(["root", "group", "task-a"]);
  });

  test("长 Auxo 原题作为当前任务时不会按普通节点的 4000 字上限截断", () => {
    const exactQuestion = `第一题：${"甲".repeat(5_000)}终点标记`;
    const nodes = {
      root: node({ id: "root", children: ["task"] }),
      task: node({
        id: "task",
        kind: "branch",
        nodeRole: "task",
        prompt: exactQuestion,
        taskDescription: "Auxo 原题任务 · 保持原文，独立完成并核验。",
        response: "",
        parentId: "root",
        contextState: "valid",
        semanticCard: undefined,
      }),
    };

    const result = compile(project(nodes), "task", "开始执行");

    expect(result.messages[1].content).toContain("终点标记");
    expect(result.messages[1].content).toContain(exactQuestion);
    expect(result.manifest.warnings).not.toContain("当前 Auxo 任务超过输入上限，已在上下文中截断。");
  });

  test("Auxo 任务组标题参与资料检索，使共同材料沿父路径传给原子任务", () => {
    const nutrient: NutrientItem = {
      id: "shared-material",
      name: "dataset.md",
      mimeType: "text/markdown",
      size: 4_000,
      kind: "text",
      createdAt: 1,
      extractionStatus: "ready",
      extractedText: `${"无关前言内容。".repeat(240)}\n\n# 阿尔忒弥斯数据集\n\n共同样本值为 3、5、8。`,
      excerpt: "dataset",
      extractedCharCount: 4_000,
    };
    const nodes = {
      root: node({ id: "root", children: ["group"] }),
      group: node({
        id: "group",
        kind: "branch",
        nodeRole: "task-group",
        prompt: "阿尔忒弥斯数据集",
        taskDescription: "Auxo 任务组 · 按顺序完成其子任务。",
        response: "",
        parentId: "root",
        children: ["task"],
        nutrientRefs: [nutrient.id],
        contextState: "valid",
        semanticCard: undefined,
      }),
      task: node({
        id: "task",
        kind: "branch",
        nodeRole: "task",
        prompt: "第一题：计算均值。",
        taskDescription: "Auxo 原题任务 · 保持原文，独立完成并核验。",
        response: "",
        parentId: "group",
        nutrientRefs: [nutrient.id],
        contextState: "valid",
        semanticCard: undefined,
      }),
    };

    const tree = project(nodes, [nutrient]);
    tree.activeNutrientIds = [];
    const result = compile(tree, "task", "开始执行");

    expect(result.messages[1].content).toContain("共同样本值为 3、5、8");
    expect(result.manifest.nutrientChunks.some((chunk) => chunk.nutrientId === nutrient.id)).toBe(true);
  });
});
