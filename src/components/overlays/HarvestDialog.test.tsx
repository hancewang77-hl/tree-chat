import { beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TreeProvider } from "@/src/state/TreeContext";
import { testNode, testProject } from "@/src/test/fixtures/tree";
import type { Project } from "@/src/types/tree";
import { HarvestDialog } from "./HarvestDialog";

const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:mock-url");
const revokeObjectURL = vi.fn();
let anchorClick: MockInstance<() => void>;

beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  // jsdom does not implement blob URLs; install capturing mocks.
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: revokeObjectURL,
  });
  // The export anchor is clicked programmatically; intercept to avoid jsdom
  // navigation and to capture the anchor (mock.contexts holds `this`).
  anchorClick = vi
    .spyOn(HTMLElement.prototype, "click")
    .mockImplementation(() => {});
});

/**
 * root("根问题") ── a("子问题A", Auxo task with 规划) ── a1("孙问题")
 *              └─ b("子问题B")
 * Depth-first order must be root, a, a1, b (a1 before b).
 */
function harvestProject(): Project {
  const root = testNode({
    id: "root",
    kind: "root",
    prompt: "根问题",
    response: "根回答",
    children: ["a", "b"],
    parentId: null,
    layer: 0,
  });
  const a = testNode({
    id: "a",
    prompt: "子问题A",
    response: "答A行1\n答A行2",
    children: ["a1"],
    parentId: "root",
    layer: 1,
    nodeRole: "task",
    taskDescription: "规划行1\n规划行2",
  });
  const a1 = testNode({
    id: "a1",
    prompt: "孙问题",
    response: "孙回答",
    children: [],
    parentId: "a",
    layer: 2,
  });
  const b = testNode({
    id: "b",
    prompt: "子问题B",
    response: "答B",
    children: [],
    parentId: "root",
    layer: 1,
  });
  return testProject({
    id: "p1",
    name: "测试项目",
    rootNodeId: "root",
    nodes: { root, a, a1, b },
  });
}

function seedWorkspace(project: Project) {
  localStorage.setItem(
    "tree-chat-projects",
    JSON.stringify({
      schemaVersion: 2,
      projects: { [project.id]: project },
      activeProjectId: project.id,
      selectedNodeId: project.rootNodeId,
      selectedLayer: 0,
      planeNames: { 0: "根节点层" },
    }),
  );
}

function renderDialog(onClose: () => void, isOpen = true) {
  return render(
    <TreeProvider>
      <HarvestDialog isOpen={isOpen} onClose={onClose} />
    </TreeProvider>,
  );
}

describe("HarvestDialog", () => {
  test("renders nothing while closed", () => {
    seedWorkspace(harvestProject());
    renderDialog(vi.fn(), false);
    expect(screen.queryByText("收获 · Harvest")).not.toBeInTheDocument();
  });

  test("renders nothing without an active project", () => {
    renderDialog(vi.fn());
    expect(screen.queryByText("收获 · Harvest")).not.toBeInTheDocument();
  });

  test("shows the active project name when open", async () => {
    seedWorkspace(harvestProject());
    renderDialog(vi.fn());
    expect(
      await screen.findByRole("heading", { name: "收获 · Harvest" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/导出当前项目/)).toHaveTextContent("测试项目");
  });

  test("Markdown export walks depth-first with indented bullets, Auxo blockquote and responses", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    seedWorkspace(harvestProject());
    renderDialog(onClose);

    await user.click(
      await screen.findByRole("button", { name: "导出 Markdown" }),
    );

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe("text/markdown");

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
    expect(await blob.text()).toBe(expected);

    expect(anchorClick).toHaveBeenCalledTimes(1);
    const anchor = anchorClick.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.tagName).toBe("A");
    expect(anchor.download).toBe("测试项目.md");
    expect(anchor.href).toBe("blob:mock-url");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("JSON export serializes the full project", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    seedWorkspace(harvestProject());
    renderDialog(onClose);

    await user.click(await screen.findByRole("button", { name: "导出 JSON" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe("application/json");

    const text = await blob.text();
    // Pretty-printed with a 2-space indent.
    expect(text.startsWith('{\n  "id": "p1"')).toBe(true);

    const parsed = JSON.parse(text) as Project;
    expect(parsed.id).toBe("p1");
    expect(parsed.name).toBe("测试项目");
    expect(parsed.rootNodeId).toBe("root");
    expect(Object.keys(parsed.nodes).sort()).toEqual(["a", "a1", "b", "root"]);
    expect(parsed.nodes.root).toMatchObject({
      prompt: "根问题",
      response: "根回答",
      children: ["a", "b"],
    });
    expect(parsed.nodes.a).toMatchObject({
      prompt: "子问题A",
      response: "答A行1\n答A行2",
      taskDescription: "规划行1\n规划行2",
      children: ["a1"],
    });
    expect(parsed.nutrients).toEqual({});
    expect(parsed.activeNutrientIds).toEqual([]);

    const anchor = anchorClick.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("测试项目.json");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("取消 closes without exporting", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    seedWorkspace(harvestProject());
    renderDialog(onClose);

    await user.click(await screen.findByRole("button", { name: "取消" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(anchorClick).not.toHaveBeenCalled();
  });
});
