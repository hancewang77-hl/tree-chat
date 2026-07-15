import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  loadWorkspace,
  saveWorkspace,
} from "./storage";
import { loadInitialState } from "@/src/state/treeReducer";

const STORAGE_KEY = "tree-chat-projects";
let values: Map<string, string>;

beforeEach(() => {
  values = new Map<string, string>();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("workspace schema migration", () => {
  test("旧项目在加载时无损补齐节点语义字段，且不主动覆写存储", () => {
    const legacy = JSON.stringify({
      projects: {
        project: {
          id: "project",
          name: "Legacy project",
          rootNodeId: "root",
          nodes: {
            root: {
              id: "root",
              prompt: "老项目根任务",
              response: "原始根回答",
              children: ["branch", "leaf"],
              parentId: null,
              timestamp: 1,
              layer: 0,
            },
            branch: {
              id: "branch",
              prompt: "老问题",
              response: "老完整回答",
              children: [],
              parentId: "root",
              timestamp: 2,
              layer: 0,
              status: "streaming",
              customLegacyField: "preserve-me",
            },
            leaf: {
              id: "leaf",
              prompt: "老笔记",
              response: "",
              children: [],
              parentId: "root",
              timestamp: 3,
              layer: 0,
            },
          },
          createdAt: 1,
          updatedAt: 1,
        },
      },
      activeProjectId: "project",
      selectedNodeId: "branch",
    });
    values.set(STORAGE_KEY, legacy);

    const state = loadInitialState();
    const nodes = state.projects.project.nodes;

    expect(nodes.root.kind).toBe("root");
    expect(nodes.root.contextState).toBe("valid");
    expect(nodes.root.semanticCard?.openQuestions).toEqual(["老项目根任务"]);
    expect(nodes.branch.kind).toBe("branch");
    expect(nodes.branch.response).toBe("老完整回答");
    expect(nodes.branch.contextState).toBe("missing");
    expect(nodes.branch.status).toBe("stopped");
    expect((nodes.branch as unknown as { customLegacyField: string }).customLegacyField).toBe("preserve-me");
    expect(nodes.leaf.kind).toBe("leaf");
    expect(nodes.leaf.includeInContext).toBe(false);
    expect(state.selectedNodeId).toBe("branch");
    expect(values.get(STORAGE_KEY)).toBe(legacy);
  });

  test("保存时写入 schemaVersion，不持久化 Rings 历史", () => {
    values.set(STORAGE_KEY, JSON.stringify({ projects: {} }));
    const state = loadInitialState();

    saveWorkspace(state);

    const stored = JSON.parse(values.get(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    expect(stored.schemaVersion).toBe(CURRENT_WORKSPACE_SCHEMA_VERSION);
    expect(stored.projects).toEqual({});
    expect(stored).not.toHaveProperty("history");
  });

  test("仍兼容最早的裸 projects 存储结构", () => {
    values.set(
      STORAGE_KEY,
      JSON.stringify({
        project: {
          id: "project",
          name: "Bare",
          rootNodeId: "root",
          nodes: {},
          nutrients: {},
          activeNutrientIds: [],
          createdAt: 1,
          updatedAt: 1,
        },
      }),
    );

    expect(Object.keys(loadWorkspace().projects)).toEqual(["project"]);
  });
});
