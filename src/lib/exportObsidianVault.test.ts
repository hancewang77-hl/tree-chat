import { describe, expect, test } from "vitest";
import { buildObsidianVaultExport, sanitizeObsidianName } from "./exportObsidianVault";
import { ROOT_ONBOARDING_RESPONSE } from "./rootNodeContent";
import type { Project } from "@/src/types/tree";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "测试项目",
    rootNodeId: "root",
    nodes: {
      root: {
        id: "root",
        kind: "root",
        prompt: "机器学习漫谈",
        response: "我们来系统聊聊机器学习。",
        children: ["branch", "leaf"],
        parentId: null,
        timestamp: 1,
        layer: 0,
        contextState: "valid",
      },
      branch: {
        id: "branch",
        kind: "branch",
        prompt: "监督学习",
        response: "给模型带标签的数据。",
        children: ["child"],
        parentId: "root",
        timestamp: 2,
        layer: 1,
        contextState: "valid",
      },
      child: {
        id: "child",
        kind: "branch",
        prompt: "线性回归",
        response: "最小化均方误差。",
        children: [],
        parentId: "branch",
        timestamp: 3,
        layer: 2,
        contextState: "valid",
      },
      leaf: {
        id: "leaf",
        kind: "leaf",
        prompt: "备忘",
        response: "叶片正文内容。",
        children: [],
        parentId: "root",
        timestamp: 4,
        layer: 1,
        contextState: "valid",
      },
    },
    nutrients: {},
    activeNutrientIds: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("sanitizeObsidianName", () => {
  test("替换非法字符并处理空白", () => {
    expect(sanitizeObsidianName('问:什么?')).toBe("问-什么-");
    expect(sanitizeObsidianName("   ")).toBe("未命名");
  });
});

describe("buildObsidianVaultExport", () => {
  test("生成多 md 双链结构", () => {
    const plan = buildObsidianVaultExport(makeProject());

    expect(plan.folderName).toBe("机器学习漫谈");
    expect(plan.files).toHaveLength(4);

    const root = plan.files.find((file) => file.nodeName === "机器学习漫谈")!;
    expect(root.content).toContain("# 机器学习漫谈");
    expect(root.content).toContain("我们来系统聊聊机器学习。");
    expect(root.content).toContain("⬇ 子节点: [[监督学习]] · [[备忘]]");
    expect(root.content).not.toContain("⬆ 父节点");

    const branch = plan.files.find((file) => file.nodeName === "监督学习")!;
    expect(branch.content).toContain("⬆ 父节点: [[机器学习漫谈]]");
    expect(branch.content).toContain("⬇ 子节点: [[线性回归]]");

    const leaf = plan.files.find((file) => file.nodeName === "备忘")!;
    expect(leaf.content).toContain("叶片正文内容。");
    expect(leaf.content).toContain("⬆ 父节点: [[机器学习漫谈]]");
  });

  test("重复 prompt 会自动去重显示名", () => {
    const project = makeProject({
      nodes: {
        root: {
          id: "root",
          kind: "root",
          prompt: "主题",
          response: "根正文",
          children: ["a", "b"],
          parentId: null,
          timestamp: 1,
          layer: 0,
          contextState: "valid",
        },
        a: {
          id: "a",
          kind: "branch",
          prompt: "同名",
          response: "A",
          children: [],
          parentId: "root",
          timestamp: 2,
          layer: 1,
          contextState: "valid",
        },
        b: {
          id: "b",
          kind: "branch",
          prompt: "同名",
          response: "B",
          children: [],
          parentId: "root",
          timestamp: 3,
          layer: 1,
          contextState: "valid",
        },
      },
    });

    const plan = buildObsidianVaultExport(project);
    const names = plan.files.map((file) => file.nodeName).sort();
    expect(names).toEqual(["主题", "同名", "同名 2"]);
    expect(plan.notes.some((note) => note.includes("重名"))).toBe(true);
  });

  test("根节点默认引导语不会写入 Obsidian 正文", () => {
    const project = makeProject({
      nodes: {
        root: {
          id: "root",
          kind: "root",
          prompt: "我的思维之树",
          response: ROOT_ONBOARDING_RESPONSE,
          children: ["branch"],
          parentId: null,
          timestamp: 1,
          layer: 0,
          contextState: "valid",
        },
        branch: {
          id: "branch",
          kind: "branch",
          prompt: "第一个问题",
          response: "这是 AI 回答。",
          children: [],
          parentId: "root",
          timestamp: 2,
          layer: 1,
          contextState: "valid",
        },
      },
    });

    const plan = buildObsidianVaultExport(project);
    const root = plan.files.find((file) => file.nodeName === "我的思维之树")!;
    expect(root.content).toContain("# 我的思维之树");
    expect(root.content).not.toContain("这是你思维之树的根");
    expect(root.content).not.toContain("试着在下方输入");
    expect(root.content).toContain("⬇ 子节点: [[第一个问题]]");

    const branch = plan.files.find((file) => file.nodeName === "第一个问题")!;
    expect(branch.content).toContain("这是 AI 回答。");
  });

  test("孤立节点不会出现在导出中", () => {
    const project = makeProject({
      nodes: {
        ...makeProject().nodes,
        orphan: {
          id: "orphan",
          kind: "branch",
          prompt: "孤儿",
          response: "不应导出",
          children: [],
          parentId: null,
          timestamp: 99,
          layer: 9,
          contextState: "valid",
        },
      },
    });

    const plan = buildObsidianVaultExport(project);
    expect(plan.files.some((file) => file.nodeName === "孤儿")).toBe(false);
  });
});
