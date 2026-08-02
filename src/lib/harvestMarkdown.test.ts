import { describe, expect, test } from "vitest";
import {
  HARVEST_NODE_NAME_MAX_CHARS,
  HARVEST_UNTITLED_NODE_NAME,
  assignNodeNames,
  buildHarvestMarkdown,
  sanitizeNodeName,
} from "./harvestMarkdown";
import { testNode, testProject } from "@/src/test/fixtures/tree";
import type { Project } from "@/src/types/tree";

describe("sanitizeNodeName", () => {
  test("collapses whitespace and newlines", () => {
    expect(sanitizeNodeName("  a\n\tb  c  ")).toBe("a b c");
  });

  test("replaces marker-breaking sequences", () => {
    expect(sanitizeNodeName("结论-->下一步")).toBe("结论→下一步");
    expect(sanitizeNodeName("左|右")).toBe("左-右");
    expect(sanitizeNodeName("a-->b|c")).toBe("a→b-c");
  });

  test("truncates on code points, not UTF-16 units", () => {
    // 31 code points of "字" → 30 + ellipsis. A naive .slice would also work
    // here; the emoji case below is the real surrogate-pair guard.
    const long = "字".repeat(HARVEST_NODE_NAME_MAX_CHARS + 1);
    const result = sanitizeNodeName(long);
    expect(Array.from(result.replace(/…$/, "")).length).toBe(
      HARVEST_NODE_NAME_MAX_CHARS,
    );
    expect(result.endsWith("…")).toBe(true);

    // One emoji is one code point but two UTF-16 units; truncating mid-pair
    // would leave a lone surrogate. Cap at 2 code points → 2 emojis + ellipsis.
    const emojis = "🌳🍂🌲🍀🌸";
    const truncated = sanitizeNodeName(emojis);
    // 5 > nothing special under default 30 — force a tiny budget by crafting
    // a string whose code-point length exceeds the constant.
    const many = "🌳".repeat(HARVEST_NODE_NAME_MAX_CHARS + 5);
    const safe = sanitizeNodeName(many);
    expect(safe.includes("�")).toBe(false);
    expect(Array.from(safe.replace(/…$/, "")).length).toBe(
      HARVEST_NODE_NAME_MAX_CHARS,
    );
    expect(truncated.startsWith("🌳")).toBe(true);
  });

  test("falls back when the seed is empty or whitespace-only", () => {
    expect(sanitizeNodeName("")).toBe(HARVEST_UNTITLED_NODE_NAME);
    expect(sanitizeNodeName("   \n\t  ")).toBe(HARVEST_UNTITLED_NODE_NAME);
  });
});

describe("assignNodeNames", () => {
  test("names the root from project.name and others from prompt", () => {
    const root = testNode({
      id: "root",
      kind: "root",
      prompt: "根问题",
      children: ["a"],
      parentId: null,
    });
    const a = testNode({
      id: "a",
      prompt: "子问题",
      children: [],
      parentId: "root",
    });
    const project = testProject({
      name: "我的项目",
      rootNodeId: "root",
      nodes: { root, a },
    });

    const names = assignNodeNames(project);
    expect(names.get("root")).toBe("我的项目");
    expect(names.get("a")).toBe("子问题");
  });

  test("prefers taskDescription only for nodeRole=task, not task-group", () => {
    const root = testNode({
      id: "root",
      kind: "root",
      prompt: "根",
      children: ["g", "t"],
      parentId: null,
    });
    const group = testNode({
      id: "g",
      prompt: "第一章",
      children: [],
      parentId: "root",
      nodeRole: "task-group",
      // Boilerplate template written by APPLY_AUXO_PLAN — must NOT be the seed.
      taskDescription: "Auxo 任务组 · 共 3 项子任务，按顺序完成。",
    });
    const task = testNode({
      id: "t",
      prompt: "长题干……",
      children: [],
      parentId: "root",
      nodeRole: "task",
      taskDescription: "完成第 1 题",
    });
    const project = testProject({
      name: "项目",
      rootNodeId: "root",
      nodes: { root, g: group, t: task },
    });

    const names = assignNodeNames(project);
    expect(names.get("g")).toBe("第一章");
    expect(names.get("t")).toBe("完成第 1 题");
  });

  test("dedupes globally across non-sibling subtrees", () => {
    // root ─┬─ a("同名") ── a1("叶子")
    //       └─ b("同名") ── b1("叶子")
    // Both "同名" collide; both "叶子" collide. Order is pre-order: a, a1, b, b1.
    const root = testNode({
      id: "root",
      kind: "root",
      prompt: "根",
      children: ["a", "b"],
      parentId: null,
    });
    const a = testNode({
      id: "a",
      prompt: "同名",
      children: ["a1"],
      parentId: "root",
    });
    const a1 = testNode({
      id: "a1",
      prompt: "叶子",
      children: [],
      parentId: "a",
    });
    const b = testNode({
      id: "b",
      prompt: "同名",
      children: ["b1"],
      parentId: "root",
    });
    const b1 = testNode({
      id: "b1",
      prompt: "叶子",
      children: [],
      parentId: "b",
    });
    const project = testProject({
      name: "根名",
      rootNodeId: "root",
      nodes: { root, a, a1, b, b1 },
    });

    const names = assignNodeNames(project);
    expect(names.get("a")).toBe("同名");
    expect(names.get("b")).toBe("同名 2");
    expect(names.get("a1")).toBe("叶子");
    expect(names.get("b1")).toBe("叶子 2");
  });

  test("two equal-shaped task-groups do not share a boilerplate name", () => {
    const root = testNode({
      id: "root",
      kind: "root",
      prompt: "根",
      children: ["g1", "g2"],
      parentId: null,
    });
    const boilerplate = "Auxo 任务组 · 共 2 项子任务，按顺序完成。";
    const g1 = testNode({
      id: "g1",
      prompt: "选择",
      children: [],
      parentId: "root",
      nodeRole: "task-group",
      taskDescription: boilerplate,
    });
    const g2 = testNode({
      id: "g2",
      prompt: "填空",
      children: [],
      parentId: "root",
      nodeRole: "task-group",
      taskDescription: boilerplate,
    });
    const project = testProject({
      name: "试卷",
      rootNodeId: "root",
      nodes: { root, g1, g2 },
    });

    const names = assignNodeNames(project);
    expect(names.get("g1")).toBe("选择");
    expect(names.get("g2")).toBe("填空");
    // And if prompts also collide, suffix still works:
    const g2b = testNode({ ...g2, prompt: "选择" });
    const collided = testProject({
      name: "试卷",
      rootNodeId: "root",
      nodes: { root, g1, g2: g2b },
    });
    const names2 = assignNodeNames(collided);
    expect(names2.get("g1")).toBe("选择");
    expect(names2.get("g2")).toBe("选择 2");
  });

  test("case-insensitive collision still suffixes", () => {
    const root = testNode({
      id: "root",
      kind: "root",
      prompt: "根",
      children: ["a", "b"],
      parentId: null,
    });
    const a = testNode({ id: "a", prompt: "Foo", children: [], parentId: "root" });
    const b = testNode({ id: "b", prompt: "foo", children: [], parentId: "root" });
    const project = testProject({
      name: "P",
      rootNodeId: "root",
      nodes: { root, a, b },
    });
    const names = assignNodeNames(project);
    expect(names.get("a")).toBe("Foo");
    expect(names.get("b")).toBe("foo 2");
  });
});

describe("buildHarvestMarkdown", () => {
  function fixture(): Project {
    const root = testNode({
      id: "root",
      kind: "root",
      prompt: "根问题",
      response: "根回答",
      children: ["a", "b"],
      parentId: null,
    });
    const a = testNode({
      id: "a",
      prompt: "子问题A",
      response: "答A行1\n答A行2",
      children: ["a1"],
      parentId: "root",
      nodeRole: "task",
      taskDescription: "规划行1\n规划行2",
    });
    const a1 = testNode({
      id: "a1",
      prompt: "孙问题",
      response: "孙回答",
      children: [],
      parentId: "a",
    });
    const b = testNode({
      id: "b",
      prompt: "子问题B",
      response: "答B",
      children: [],
      parentId: "root",
    });
    return testProject({
      id: "p1",
      name: "测试项目",
      rootNodeId: "root",
      nodes: { root, a, a1, b },
    });
  }

  test("emits markers after each node's own content with correct parents", () => {
    const expected = [
      "# 测试项目\n",
      "- **根问题**",
      "  根回答",
      "  <!-- node: 测试项目 -->",
      "",
      "  - **子问题A**",
      "    > Auxo 规划：规划行1\n    > 规划行2",
      "    答A行1\n    答A行2",
      "    <!-- node: 规划行1 规划行2 | parent: 测试项目 -->",
      "",
      "    - **孙问题**",
      "      孙回答",
      "      <!-- node: 孙问题 | parent: 规划行1 规划行2 -->",
      "",
      "  - **子问题B**",
      "    答B",
      "    <!-- node: 子问题B | parent: 测试项目 -->",
      "",
    ].join("\n");

    expect(buildHarvestMarkdown(fixture())).toBe(expected);
  });

  test("threads parent names from traversal, not parentId", () => {
    // Deliberately break parentId on `a` — export must still name 测试项目 as parent.
    const project = fixture();
    project.nodes.a = { ...project.nodes.a, parentId: "no-such-node" };
    const md = buildHarvestMarkdown(project);
    expect(md).toContain("<!-- node: 规划行1 规划行2 | parent: 测试项目 -->");
  });

  test("survives a missing root with just the title header", () => {
    const project = testProject({
      name: "空",
      rootNodeId: "missing",
      nodes: {},
    });
    expect(buildHarvestMarkdown(project)).toBe("# 空\n");
  });

  test("does not mutate the project or its nodes", () => {
    const project = fixture();
    const before = JSON.stringify(project);
    buildHarvestMarkdown(project);
    expect(JSON.stringify(project)).toBe(before);
  });
});
