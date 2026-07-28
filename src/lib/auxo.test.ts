import { describe, expect, test } from "vitest";
import {
  AUXO_MAX_NODES,
  AuxoValidationError,
  compileAuxoInput,
  extractAuxoSourceUnits,
  parseAuxoPlan,
  validateAuxoPlan,
  validateAuxoRequest,
} from "./auxo";
import type { AuxoRequest, NutrientItem, Project } from "@/src/types/tree";

function nutrient(overrides: Partial<NutrientItem> = {}): NutrientItem {
  const extractedText = overrides.extractedText ?? "# 资料\n\n第一题：求 1 + 1。\n\n第二题：证明结论。";
  return {
    id: "nutrient-1",
    name: "exam.md",
    mimeType: "text/markdown",
    size: extractedText.length,
    kind: "text",
    createdAt: 1,
    extractionStatus: "ready",
    extractedText,
    excerpt: extractedText.slice(0, 80),
    extractedCharCount: extractedText.length,
    ...overrides,
  };
}

function project(items: NutrientItem[] = [], rootTask: string = "整理并完成这份试卷"): Project {
  return {
    id: "project",
    name: "试卷任务",
    rootNodeId: "root",
    nodes: {
      root: {
        id: "root",
        kind: "root",
        prompt: rootTask,
        response: "",
        children: [],
        parentId: null,
        timestamp: 1,
        layer: 0,
        status: "complete",
        contextState: "valid",
      },
    },
    nutrients: Object.fromEntries(items.map((item) => [item.id, item])),
    activeNutrientIds: items.map((item) => item.id),
    createdAt: 1,
    updatedAt: 1,
  };
}

function request(): AuxoRequest {
  const text = "# 数学\n\n第一题：求 1 + 1。\n\n第二题：证明结论。";
  const first = "第一题：求 1 + 1。";
  const second = "第二题：证明结论。";
  return {
    rootTask: "整理并完成这份试卷",
    nutrientChunks: [
      {
        nutrientId: "nutrient-1",
        nutrientName: "exam.md",
        chunkId: "chunk-001",
        offset: 0,
        text,
      },
    ],
    sourceUnits: [
      {
        unitId: "source-001",
        kind: "nutrient",
        nutrientId: "nutrient-1",
        nutrientName: "exam.md",
        text: first,
        offset: text.indexOf(first),
        order: 1,
      },
      {
        unitId: "source-002",
        kind: "nutrient",
        nutrientId: "nutrient-1",
        nutrientName: "exam.md",
        text: second,
        offset: text.indexOf(second),
        order: 2,
      },
    ],
  };
}

function derivedRequest(): AuxoRequest {
  return { rootTask: "制定发布计划", nutrientChunks: [], sourceUnits: [] };
}

function validRawPlan() {
  return {
    version: 1,
    nodes: [
      {
        planId: "math",
        parentPlanId: "root",
        nodeRole: "task-group",
        title: "数学题",
        order: 1,
        sourceUnitId: null,
      },
      {
        planId: "q1",
        parentPlanId: "math",
        nodeRole: "task",
        title: "第一题",
        order: 2,
        sourceUnitId: "source-001",
      },
      {
        planId: "q2",
        parentPlanId: "math",
        nodeRole: "task",
        title: "第二题",
        order: 3,
        sourceUnitId: "source-002",
      },
    ],
  };
}

describe("Auxo input compiler", () => {
  test("sends every enabled ready Nutrient chunk and records a stable fingerprint", () => {
    const first = nutrient({ id: "a", name: "a.md", extractedText: "A 资料" });
    const second = nutrient({ id: "b", name: "b.md", extractedText: "B 资料" });
    const input = compileAuxoInput(project([first, second]));

    expect(input.nutrientRefs).toEqual(["a", "b"]);
    expect(input.request.nutrientChunks.map((chunk) => chunk.nutrientId)).toEqual(["a", "b"]);
    expect(input.request.nutrientChunks.map((chunk) => chunk.text).join("\n")).toContain("A 资料");
    expect(input.request.nutrientChunks.map((chunk) => chunk.text).join("\n")).toContain("B 资料");
    expect(input.request.sourceUnits).toEqual([]);
    expect(compileAuxoInput(project([first, second])).inputFingerprint).toBe(input.inputFingerprint);
  });

  test("extracts exact numbered questions before chunking, including a cross-chunk question", () => {
    const longQuestion = `第一题：${"请完整分析给定条件。".repeat(220)}`;
    const secondQuestion = "第二题：给出最终证明。";
    const source = `# 模拟试卷\n\n## 一、计算题\n\n${longQuestion}\n\n${secondQuestion}`;
    const input = compileAuxoInput(project([nutrient({ extractedText: source })]));

    expect(longQuestion.length).toBeGreaterThan(1_600);
    expect(input.request.nutrientChunks.length).toBeGreaterThan(1);
    expect(input.request.sourceUnits.map((unit) => unit.text)).toEqual([
      longQuestion,
      secondQuestion,
    ]);
    expect(input.request.sourceUnits.map((unit) => unit.unitId)).toEqual([
      "source-001",
      "source-002",
    ]);
    const plan = validateAuxoPlan({
      version: 1,
      nodes: [
        {
          planId: "q1",
          parentPlanId: "root",
          nodeRole: "task",
          title: "第一题",
          order: 1,
          sourceUnitId: "source-001",
        },
        {
          planId: "q2",
          parentPlanId: "root",
          nodeRole: "task",
          title: "第二题",
          order: 2,
          sourceUnitId: "source-002",
        },
      ],
    }, input.request, { generatedAt: 1, model: "test" });
    expect(plan.nodes[0].source?.exactQuote).toBe(longQuestion);
  });

  test("treats generic exam headings as boundaries rather than atomic questions", () => {
    const source = "# 试卷\n\n一、选择题\n\n1. 选择甲。\n\n2. 选择乙。\n\n二、填空题\n\n3. 填写丙。";
    const units = extractAuxoSourceUnits(source, { kind: "root" });

    expect(units.map((unit) => unit.text)).toEqual([
      "1. 选择甲。",
      "2. 选择乙。",
      "3. 填写丙。",
    ]);
  });

  test("detects Turndown-escaped bold numbered questions (docx pipeline output)", () => {
    // mammoth+turndown render "1. 题目" as "**1\. 题目**" — the escaped dot and
    // bold wrapper must not hide the question from source-unit extraction.
    const source = [
      "# 一、填空题",
      "",
      "**1\\. 在定点数和浮点数中，（）表示范围更大。**",
      "",
      "|  |",
      "| --- |",
      "",
      "**2\\. 将100100右移1位，结果是（）。**",
    ].join("\n");
    const units = extractAuxoSourceUnits(source, { kind: "root" });

    expect(units.map((unit) => unit.text.split("\n")[0])).toEqual([
      "**1\\. 在定点数和浮点数中，（）表示范围更大。**",
      "**2\\. 将100100右移1位，结果是（）。**",
    ]);
  });

  test("treats 名词解释/设计题 section headings as boundaries, not whole-section questions", () => {
    const source = [
      "# 二、名词解释",
      "",
      "**1\\. I/O端口**",
      "",
      "**2\\. 存储周期**",
      "",
      "# 五、设计题",
      "",
      "**1\\. 分析指令JMP @A，写出全部微操作。**",
    ].join("\n");
    const units = extractAuxoSourceUnits(source, { kind: "root" });

    expect(units.map((unit) => unit.text)).toEqual([
      "**1\\. I/O端口**",
      "**2\\. 存储周期**",
      "**1\\. 分析指令JMP @A，写出全部微操作。**",
    ]);
  });

  test("escaped numbered headings and bullets stay document structure, not questions", () => {
    // Turndown output for docx chapter headings and notes: "# 1\. 概述",
    // "- 1\. 备注". These must not become source units (lecture notes would
    // otherwise be swallowed whole and hard-fail budgets).
    const source = [
      "# 1\\. 概述",
      "",
      "这里是讲义正文，不是题目。",
      "",
      "- 1\\. 备注一",
      "- 2\\. 备注二",
      "",
      "# 2\\. 方法",
      "",
      "更多正文。",
    ].join("\n");
    expect(extractAuxoSourceUnits(source, { kind: "root" })).toEqual([]);
  });

  test("line-leading LaTeX inline math \\(1\\) is not a parenthetical question marker", () => {
    const source = "\\(1\\)式代入\\(2\\)式得 x=3。\n\n\\(2\\) \\(y=2x\\)";
    expect(extractAuxoSourceUnits(source, { kind: "root" })).toEqual([]);
  });

  test("bare section words after Arabic markers remain real tasks", () => {
    // "2. 作文" / "3. 翻译（第五课）" are tasks in a homework list; only
    // Chinese-numeral or heading markers ("二、作文") demote bare labels.
    const source = "1\\. 完成练习册第 3 题。\n\n2\\. 作文\n\n（1）不少于 600 字\n\n（2）题目自拟";
    const units = extractAuxoSourceUnits(source, { kind: "root" });
    expect(units.map((unit) => unit.text.split("\n")[0])).toEqual([
      "1\\. 完成练习册第 3 题。",
      "2\\. 作文",
    ]);

    const homework = extractAuxoSourceUnits(
      "1. 判断（2＋3＝6）\n2. 判断（地球是行星）\n3. 翻译（第五课）",
      { kind: "root" },
    );
    expect(homework.map((unit) => unit.text)).toEqual([
      "1. 判断（2＋3＝6）",
      "2. 判断（地球是行星）",
      "3. 翻译（第五课）",
    ]);

    const sections = extractAuxoSourceUnits(
      "一、作文\n\n1. 以《春》为题写一篇作文。\n\n二、翻译\n\n2. 翻译第五课全文。",
      { kind: "root" },
    );
    expect(sections.map((unit) => unit.text)).toEqual([
      "1. 以《春》为题写一篇作文。",
      "2. 翻译第五课全文。",
    ]);
  });

  test("numbered lines inside an answer-key section are not questions", () => {
    const source = [
      "# 一、选择题",
      "",
      "**1\\. 下列哪个是寄存器？**",
      "",
      "**2\\. 下列哪个是总线？**",
      "",
      "# 参考答案",
      "",
      "1\\. B",
      "",
      "2\\. A",
    ].join("\n");
    const units = extractAuxoSourceUnits(source, { kind: "root" });
    expect(units.map((unit) => unit.text)).toEqual([
      "**1\\. 下列哪个是寄存器？**",
      "**2\\. 下列哪个是总线？**",
    ]);

    const inline = extractAuxoSourceUnits(
      "1. 真题一。\n\n六、参考答案\n\n1. 答案甲。\n2. 答案乙。",
      { kind: "root" },
    );
    expect(inline.map((unit) => unit.text)).toEqual(["1. 真题一。"]);
  });

  test("trailing blank answer-space table rows are trimmed from unit text", () => {
    const blankRows = Array.from({ length: 900 }, () => "|  |\n| --- |").join("\n");
    const source = `**1\\. 设计一个 8 位加法器。**\n\n${blankRows}`;
    const units = extractAuxoSourceUnits(source, { kind: "root" });
    expect(units).toHaveLength(1);
    expect(units[0].text).toBe("**1\\. 设计一个 8 位加法器。**");

    const withData = extractAuxoSourceUnits(
      "1. 读下表回答。\n\n| A | 0 0 0 1 |\n| --- | --- |\n|  |  |",
      { kind: "root" },
    );
    expect(withData[0].text).toBe("1. 读下表回答。\n\n| A | 0 0 0 1 |");
  });

  test("uses parenthetical numbering only when no top-level numbering is present", () => {
    const standalone = extractAuxoSourceUnits(
      "（一）完成甲。\n\n（二）完成乙。",
      { kind: "root" },
    );
    expect(standalone.map((unit) => unit.text)).toEqual(["（一）完成甲。", "（二）完成乙。"]);

    const halfWidth = extractAuxoSourceUnits(
      "1）完成甲。\n\n2）完成乙。",
      { kind: "root" },
    );
    expect(halfWidth.map((unit) => unit.text)).toEqual(["1）完成甲。", "2）完成乙。"]);

    const nested = extractAuxoSourceUnits(
      "1. 阅读材料。\n（1）回答甲。\n（2）回答乙。\n\n2. 完成下一题。",
      { kind: "root" },
    );
    expect(nested.map((unit) => unit.text)).toEqual([
      "1. 阅读材料。\n（1）回答甲。\n（2）回答乙。",
      "2. 完成下一题。",
    ]);

    const mixedSections = extractAuxoSourceUnits(
      "1. 完成第一部分。\n\n## 第二部分\n\n（一）完成甲。\n\n（二）完成乙。",
      { kind: "root" },
    );
    expect(mixedSections.map((unit) => unit.text)).toEqual([
      "1. 完成第一部分。",
      "（一）完成甲。",
      "（二）完成乙。",
    ]);
  });

  test("does not mistake numbered lines inside fenced code for exam questions", () => {
    const units = extractAuxoSourceUnits(
      "```text\n1. 这是代码示例，不是题目。\n```\n\n第一题：完成真实任务。",
      { kind: "root" },
    );

    expect(units.map((unit) => unit.text)).toEqual(["第一题：完成真实任务。"]);
  });

  test("rejects non-ready enabled Nutrients instead of silently omitting them", () => {
    const failed = nutrient({ extractionStatus: "failed" });
    expect(() => compileAuxoInput(project([failed]))).toThrowError(AuxoValidationError);
    expect(() => compileAuxoInput(project([failed]))).toThrow("尚未成功转换为 Markdown");
  });

  test("rejects all input when the complete Nutrient set exceeds the budget", () => {
    const oversized = nutrient({ extractedText: "资料".repeat(26_000) });
    expect(() => compileAuxoInput(project([oversized]))).toThrow("超过 Auxo");
  });

  test("rejects forty-one detected questions instead of silently truncating them", () => {
    const questions = Array.from({ length: 41 }, (_, index) => `${index + 1}. 任务 ${index + 1}`).join("\n");
    expect(() => compileAuxoInput(project([nutrient({ extractedText: questions })])))
      .toThrow("检测到 41 个明确题目");
  });

  test("validates exact root source offsets", () => {
    const valid = {
      rootTask: "1. 保持原文",
      nutrientChunks: [],
      sourceUnits: [
        {
          unitId: "source-001",
          kind: "root",
          text: "1. 保持原文",
          offset: 0,
          order: 1,
        },
      ],
    };
    expect(validateAuxoRequest(valid).sourceUnits).toHaveLength(1);
    expect(() => validateAuxoRequest({
      ...valid,
      sourceUnits: [{ ...valid.sourceUnits[0], offset: 1 }],
    })).toThrow("未逐字出现在根任务");
  });

  test("reconstructs lossless Nutrient chunks and rejects forged source text or gaps", () => {
    const valid = request();
    expect(validateAuxoRequest(valid).sourceUnits).toHaveLength(2);

    expect(() => validateAuxoRequest({
      ...valid,
      sourceUnits: [
        { ...valid.sourceUnits[0], text: "第一题：伪造内容。" },
        valid.sourceUnits[1],
      ],
    })).toThrow("未逐字出现在指定 Nutrient");

    expect(() => validateAuxoRequest({
      ...valid,
      nutrientChunks: [{ ...valid.nutrientChunks[0], offset: 1 }],
    })).toThrow("连续无损切片");
  });
});

describe("Auxo constrained plan", () => {
  test("parses fenced JSON and rebuilds exact source text from a stable unit ID", () => {
    const raw = `\`\`\`json\n${JSON.stringify(validRawPlan())}\n\`\`\``;
    const plan = parseAuxoPlan(raw, request(), { generatedAt: 123, model: "deepseek-chat" });

    expect(plan.nodes).toHaveLength(3);
    expect(plan.nodes[1].source).toMatchObject({
      kind: "nutrient",
      unitId: "source-001",
      nutrientName: "exam.md",
      exactQuote: "第一题：求 1 + 1。",
      order: 1,
    });
    expect(plan.generatedAt).toBe(123);
  });

  test("rejects omitted, duplicated, and unknown source units", () => {
    const omitted = validRawPlan();
    omitted.nodes.pop();
    expect(() => validateAuxoPlan(omitted, request(), { generatedAt: 1, model: "test" }))
      .toThrow("遗漏了 1 个明确题目");

    const duplicated = validRawPlan();
    duplicated.nodes[2].sourceUnitId = "source-001";
    expect(() => validateAuxoPlan(duplicated, request(), { generatedAt: 1, model: "test" }))
      .toThrow("题目单元 source-001");

    const unknown = validRawPlan();
    unknown.nodes[1].sourceUnitId = "source-999";
    expect(() => validateAuxoPlan(unknown, request(), { generatedAt: 1, model: "test" }))
      .toThrow("不存在的题目单元 source-999");
  });

  test("rejects source tasks whose plan order reverses the original order", () => {
    const raw = validRawPlan();
    raw.nodes[1].sourceUnitId = "source-002";
    raw.nodes[2].sourceUnitId = "source-001";
    expect(() => validateAuxoPlan(raw, request(), { generatedAt: 1, model: "test" }))
      .toThrow("改变了明确题目");
  });

  test("rejects an order that is not the tree preorder used by Harvest", () => {
    const raw = {
      version: 1,
      nodes: [
        { planId: "a", parentPlanId: "root", nodeRole: "task-group", title: "A", order: 1 },
        { planId: "b", parentPlanId: "root", nodeRole: "task-group", title: "B", order: 2 },
        {
          planId: "b-task",
          parentPlanId: "b",
          nodeRole: "task",
          title: "B1",
          order: 3,
          sourceUnitId: "source-001",
        },
        {
          planId: "a-task",
          parentPlanId: "a",
          nodeRole: "task",
          title: "A1",
          order: 4,
          sourceUnitId: "source-002",
        },
      ],
    };
    expect(() => validateAuxoPlan(raw, request(), { generatedAt: 1, model: "test" }))
      .toThrow("深度优先前序");
  });

  test("rejects missing parents, incomplete order, and answer-like extra fields", () => {
    const missingParent = validRawPlan();
    missingParent.nodes[1].parentPlanId = "missing";
    expect(() => validateAuxoPlan(missingParent, request(), { generatedAt: 1, model: "test" }))
      .toThrow("父节点 missing 不存在");

    const badOrder = validRawPlan();
    badOrder.nodes[2].order = 4;
    expect(() => validateAuxoPlan(badOrder, request(), { generatedAt: 1, model: "test" }))
      .toThrow("顺序编号无效");

    const withDescription = validRawPlan() as ReturnType<typeof validRawPlan> & {
      nodes: Array<ReturnType<typeof validRawPlan>["nodes"][number] & { description?: string }>;
    };
    withDescription.nodes[1].description = "答案是 2";
    expect(() => validateAuxoPlan(withDescription, request(), { generatedAt: 1, model: "test" }))
      .toThrow("不允许的字段 description");
  });

  test("accepts exactly four layers and forty nodes, then rejects either overflow", () => {
    const depthFour = {
      version: 1,
      nodes: [
        { planId: "g1", parentPlanId: "root", nodeRole: "task-group", title: "组 1", order: 1 },
        { planId: "g2", parentPlanId: "g1", nodeRole: "task-group", title: "组 2", order: 2 },
        { planId: "g3", parentPlanId: "g2", nodeRole: "task-group", title: "组 3", order: 3 },
        { planId: "task", parentPlanId: "g3", nodeRole: "task", title: "最终任务", order: 4 },
      ],
    };
    expect(validateAuxoPlan(depthFour, derivedRequest(), { generatedAt: 1, model: "test" }).nodes)
      .toHaveLength(4);

    const tooDeep = {
      version: 1,
      nodes: [
        ...depthFour.nodes.slice(0, 3),
        { planId: "g4", parentPlanId: "g3", nodeRole: "task-group", title: "组 4", order: 4 },
        { planId: "task", parentPlanId: "g4", nodeRole: "task", title: "最终任务", order: 5 },
      ],
    };
    expect(() => validateAuxoPlan(tooDeep, derivedRequest(), { generatedAt: 1, model: "test" }))
      .toThrow("超过 4 层上限");

    const forty = {
      version: 1,
      nodes: Array.from({ length: AUXO_MAX_NODES }, (_, index) => ({
        planId: `task-${index + 1}`,
        parentPlanId: "root",
        nodeRole: "task",
        title: `任务 ${index + 1}`,
        order: index + 1,
      })),
    };
    expect(validateAuxoPlan(forty, derivedRequest(), { generatedAt: 1, model: "test" }).nodes)
      .toHaveLength(AUXO_MAX_NODES);

    const tooMany = {
      ...forty,
      nodes: [
        ...forty.nodes,
        {
          planId: `task-${AUXO_MAX_NODES + 1}`,
          parentPlanId: "root",
          nodeRole: "task",
          title: `任务 ${AUXO_MAX_NODES + 1}`,
          order: AUXO_MAX_NODES + 1,
        },
      ],
    };
    expect(() => validateAuxoPlan(tooMany, derivedRequest(), { generatedAt: 1, model: "test" }))
      .toThrow(`超过 ${AUXO_MAX_NODES} 个上限`);
  });
});
