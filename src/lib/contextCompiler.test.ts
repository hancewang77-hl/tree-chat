import { describe, expect, test } from "vitest";
import { compileContext } from "./contextCompiler";
import type { ContextTransfer, MindNode, NutrientItem, Project, SemanticCard } from "@/src/types/tree";
import preV2RequestPayload from "./__fixtures__/pre-v2-request-payload.json";

function card(value: string, generatedAt = 1): SemanticCard {
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
    prompt: "ROOT: common = ROOT_VALUE",
    response: "Root UI guidance must not enter the model payload.",
    status: "complete",
    children: [],
    parentId: null,
    timestamp: 1,
    layer: 0,
    contextState: "valid",
    ...overrides,
  };
}

function project(
  nodes: Record<string, MindNode>,
  options: {
    globalContext?: string;
    nutrients?: NutrientItem[];
    contextTransfers?: ContextTransfer[];
  } = {},
): Project {
  const nutrients = options.nutrients ?? [];
  return {
    id: "project",
    name: "Project",
    globalContext: options.globalContext ?? "",
    contextTransfers: options.contextTransfers ?? [],
    rootNodeId: "root",
    nodes,
    nutrients: Object.fromEntries(nutrients.map((item) => [item.id, item])),
    activeNutrientIds: nutrients.map((item) => item.id),
    createdAt: 1,
    updatedAt: 1,
  };
}

function compile(
  tree: Project,
  selectedNodeId: string,
  prompt = "Current user message",
) {
  return compileContext({
    project: tree,
    selectedNodeId,
    prompt,
    model: "deepseek-chat",
    compiledAt: 123,
  });
}

function payloadText(result: ReturnType<typeof compileContext>): string {
  return JSON.stringify(result.messages);
}

describe("Context Compiler v4", () => {
  test("querying B includes root and B but excludes sibling A", () => {
    const tree = branchIsolationTree();
    const result = compile(tree, "B", "Continue from B");
    const payload = payloadText(result);

    expect(payload).toContain("ROOT_VALUE");
    expect(payload).toContain("BETA_294");
    expect(payload).not.toContain("ALPHA_731");
    expect(result.manifest.includedNodeIds).toEqual(["root", "B"]);
    expect(result.manifest.compilerVersion).toBe(4);
  });

  test("querying A1 includes root and A branch but excludes sibling B", () => {
    const tree = branchIsolationTree();
    const result = compile(tree, "A1", "Continue from A1");
    const payload = payloadText(result);

    expect(payload).toContain("ROOT_VALUE");
    expect(payload).toContain("ALPHA_731");
    expect(payload).not.toContain("BETA_294");
    expect(result.manifest.includedNodeIds).toEqual(["root", "A", "A1"]);
  });

  test("sends raw ancestor user/assistant content in root-to-current order", () => {
    const tree = branchIsolationTree();
    const result = compile(tree, "A1", "FINAL_QUESTION");
    const conversation = result.messages.slice(1).map(({ role, content }) => ({ role, content }));

    expect(conversation).toEqual([
      { role: "user", content: "PROJECT_GLOBAL_VALUE" },
      { role: "user", content: "ROOT: common = ROOT_VALUE" },
      { role: "user", content: "A question" },
      { role: "assistant", content: "secret = ALPHA_731" },
      { role: "user", content: "A1 question" },
      { role: "assistant", content: "A1 answer" },
      { role: "user", content: "FINAL_QUESTION" },
    ].map((message, index) =>
      index === 0
        ? { ...message, content: `[Project Global Context]\n${message.content}` }
        : message,
    ));
  });

  test("does not depend on semantic cards or contextState summaries", () => {
    const tree = branchIsolationTree();
    tree.nodes.A.contextState = "stale";
    tree.nodes.A.semanticCard = undefined;

    const payload = payloadText(compile(tree, "A1"));
    expect(payload).toContain("ALPHA_731");
  });

  test("keeps Leaf notes isolated unless explicitly included", () => {
    const leaf = node({
      id: "leaf",
      kind: "leaf",
      prompt: "PRIVATE_LEAF_NOTE",
      response: "Leaf detail",
      parentId: "root",
      contextState: "missing",
      includeInContext: false,
    });
    const nodes = {
      root: node({ id: "root", children: ["leaf"] }),
      leaf,
    };

    const isolated = compile(project(nodes), "leaf");
    expect(payloadText(isolated)).not.toContain("PRIVATE_LEAF_NOTE");

    const included = compile(project({ ...nodes, leaf: { ...leaf, includeInContext: true } }), "leaf");
    expect(payloadText(included)).toContain("PRIVATE_LEAF_NOTE");
  });

  test("keeps relevant active project nutrients in the actual payload", () => {
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
    const tree = project({ root: node({ id: "root" }) }, { nutrients: [nutrient] });
    const result = compile(tree, "root", "量子纠缠的关键是什么？");

    expect(payloadText(result)).toContain("量子纠缠是当前问题的关键资料");
    expect(result.manifest.nutrientChunks).toEqual([
      { nutrientId: "material", nutrientName: "research.md", chunkId: "chunk-002" },
    ]);
  });

  test("reports safe development debug metadata without payload content", () => {
    const result = compile(branchIsolationTree(), "B");

    expect(result.debug).toEqual({
      nodeId: "B",
      ancestorNodeIds: ["root", "B"],
      contextMessageCount: result.messages.length,
      estimatedInputTokens: expect.any(Number),
    });
    expect(result.debug.estimatedInputTokens).toBeGreaterThan(0);
    expect(JSON.stringify(result.debug)).not.toContain("BETA_294");
  });

  test("throws for malformed parent chains instead of sending partial context", () => {
    const broken = node({
      id: "broken",
      kind: "branch",
      prompt: "Broken node",
      parentId: "missing-parent",
    });

    expect(() => compile(project({ root: node({ id: "root" }), broken }), "broken")).toThrow(
      "Context path parent node not found: missing-parent",
    );
  });

  test("10 branches × 20 nodes has a zero percent CrossBranchLeakRate", () => {
    const branchCount = 10;
    const nodesPerBranch = 20;
    const syntheticNodes: Record<string, MindNode> = {
      root: node({
        id: "root",
        children: Array.from({ length: branchCount }, (_, index) => `branch-${index}-node-0`),
      }),
    };
    const leafIds: string[] = [];

    for (let branch = 0; branch < branchCount; branch++) {
      for (let index = 0; index < nodesPerBranch; index++) {
        const id = `branch-${branch}-node-${index}`;
        const parentId = index === 0 ? "root" : `branch-${branch}-node-${index - 1}`;
        const childId = index + 1 < nodesPerBranch
          ? `branch-${branch}-node-${index + 1}`
          : undefined;
        syntheticNodes[id] = node({
          id,
          kind: "branch",
          prompt: `BRANCH_${branch}_NODE_${index}_USER`,
          response: `BRANCH_${branch}_NODE_${index}_ASSISTANT`,
          parentId,
          children: childId ? [childId] : [],
          contextState: "missing",
          semanticCard: undefined,
        });
        if (!childId) leafIds.push(id);
      }
    }

    const tree = project(syntheticNodes);
    let leakedContexts = 0;
    for (let branch = 0; branch < branchCount; branch++) {
      const payload = payloadText(compile(tree, leafIds[branch], `QUERY_BRANCH_${branch}`));
      const containsForeignBranch = Array.from(
        { length: branchCount },
        (_, foreignBranch) => foreignBranch,
      ).some(
        (foreignBranch) =>
          foreignBranch !== branch && payload.includes(`BRANCH_${foreignBranch}_`),
      );
      if (containsForeignBranch) leakedContexts++;
    }

    const crossBranchLeakRate = leakedContexts / leafIds.length;
    expect(crossBranchLeakRate).toBe(0);
  });

  test("retains the verified pre-v2 production request fixture", () => {
    expect(preV2RequestPayload.model).toBe("deepseek-chat");
    expect(preV2RequestPayload.stream).toBe(true);
    expect(JSON.stringify(preV2RequestPayload.messages)).toContain("有效父路径语义");
  });

  test("Quote is visible only to its target and removal leaves no payload residue", () => {
    const tree = branchIsolationTree();
    const quote: ContextTransfer = {
      id: "quote-a-to-b",
      sourceNodeId: "A",
      targetNodeId: "B",
      transferType: "quote",
      createdAt: 456,
    };
    tree.contextTransfers = [quote];

    const quotedB = compile(tree, "B", "Use the quote");
    expect(payloadText(quotedB)).toContain("ALPHA_731");
    expect(quotedB.manifest.contextTransfers).toEqual([quote]);

    const unaffectedC = compile(tree, "C", "Stay local");
    expect(unaffectedC.manifest.contextTransfers).toEqual([]);
    expect(payloadText(unaffectedC)).not.toContain("quote-a-to-b");
    expect(payloadText(unaffectedC)).not.toContain("ALPHA_731");

    tree.contextTransfers = [];
    const removedQuoteB = compile(tree, "B", "Quote removed");
    expect(payloadText(removedQuoteB)).not.toContain("ALPHA_731");
    expect(removedQuoteB.manifest.contextTransfers).toEqual([]);
  });

  test("Pin is project-wide while Merge uses selected node content only at its target", () => {
    const tree = branchIsolationTree();
    tree.contextTransfers = [
      {
        id: "pin-a",
        sourceNodeId: "A",
        targetNodeId: "root",
        transferType: "pin",
        createdAt: 1,
      },
      {
        id: "merge-b-to-a1",
        sourceNodeId: "B",
        targetNodeId: "A1",
        transferType: "merge",
        createdAt: 2,
      },
    ];

    const atA1 = payloadText(compile(tree, "A1"));
    expect(atA1).toContain("ALPHA_731");
    expect(atA1).toContain("BETA_294");
    expect(atA1).toContain("merge-b-to-a1");

    const atB = payloadText(compile(tree, "B"));
    expect(atB).toContain("ALPHA_731");
    expect(atB).not.toContain("merge-b-to-a1");
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
    const content = result.messages.map((message) => message.content).join("\n");

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

    const content = result.messages.map((message) => message.content).join("\n");
    expect(content).toContain("终点标记");
    expect(content).toContain(exactQuestion);
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

    const tree = project(nodes, { nutrients: [nutrient] });
    tree.activeNutrientIds = [];
    const result = compile(tree, "task", "开始执行");

    const content = result.messages.map((message) => message.content).join("\n");
    expect(content).toContain("共同样本值为 3、5、8");
    expect(result.manifest.nutrientChunks.some((chunk) => chunk.nutrientId === nutrient.id)).toBe(true);
  });
});

function branchIsolationTree(): Project {
  return project(
    {
      root: node({ id: "root", children: ["A", "B", "C"] }),
      A: node({
        id: "A",
        kind: "branch",
        prompt: "A question",
        response: "secret = ALPHA_731",
        parentId: "root",
        children: ["A1"],
        contextState: "valid",
      }),
      A1: node({
        id: "A1",
        kind: "branch",
        prompt: "A1 question",
        response: "A1 answer",
        parentId: "A",
        contextState: "valid",
      }),
      B: node({
        id: "B",
        kind: "branch",
        prompt: "B question",
        response: "secret = BETA_294",
        parentId: "root",
        contextState: "valid",
      }),
      C: node({
        id: "C",
        kind: "branch",
        prompt: "C question",
        response: "C branch answer",
        parentId: "root",
        contextState: "valid",
      }),
    },
    { globalContext: "PROJECT_GLOBAL_VALUE" },
  );
}
