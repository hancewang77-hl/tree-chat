import { afterEach, describe, expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InspectorSidebar } from "./InspectorSidebar";
import { renderWithTree, seedWorkspace } from "@/src/test/harness/renderWithTree";
import { testNode, testProject, testSemanticCard } from "@/src/test/fixtures/tree";
import type { MindNode, Project } from "@/src/types/tree";

function readWorkspace(): { projects: Record<string, Project> } {
  return JSON.parse(localStorage.getItem("tree-chat-projects") ?? "{}");
}

/**
 * A small tree: root -> branch child, root -> leaf. Returns the fixture nodes
 * so tests can pass them as the currentPath prop (in the app the path is
 * derived from the same state).
 */
function buildTree({
  child: childOverrides = {},
  leaf: leafOverrides = {},
}: {
  child?: Partial<MindNode>;
  leaf?: Partial<MindNode>;
} = {}) {
  const root = testNode({
    id: "root",
    kind: "root",
    prompt: "根任务",
    response: "根回答",
    children: ["child", "leaf"],
    layer: 0,
  });
  const child = testNode({
    id: "child",
    parentId: "root",
    prompt: "子问题",
    response: "这是 **重点** 回答",
    layer: 1,
    ...childOverrides,
  });
  const leaf = testNode({
    id: "leaf",
    kind: "leaf",
    parentId: "root",
    prompt: "随手笔记",
    layer: 0,
    ...leafOverrides,
  });
  const project = testProject({
    id: "p1",
    name: "探索一",
    rootNodeId: "root",
    nodes: { root, child, leaf },
  });
  return { project, root, child, leaf };
}

function renderInspector({
  selectedNodeId,
  currentPath,
  project,
  onRetrySemantics = vi.fn(),
  structuringNodeIds = new Set<string>(),
}: {
  selectedNodeId: string;
  currentPath: MindNode[];
  project: Project;
  onRetrySemantics?: (nodeId: string) => void;
  structuringNodeIds?: ReadonlySet<string>;
}) {
  seedWorkspace([project], { selectedNodeId });
  return renderWithTree(
    <InspectorSidebar
      currentPath={currentPath}
      onRetrySemantics={onRetrySemantics}
      structuringNodeIds={structuringNodeIds}
    />,
  );
}

afterEach(() => {
  // Some tests shadow document.body.clientWidth for the resize math.
  delete (document.body as { clientWidth?: number }).clientWidth;
});

describe("InspectorSidebar", () => {
  test("renders the selected node's prompt and its markdown response as HTML", async () => {
    const { project, root, child } = buildTree();
    renderInspector({ selectedNodeId: "child", currentPath: [root, child], project });

    expect(
      await screen.findByRole("heading", { level: 3, name: "子问题" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Branch · 回答")).toBeInTheDocument();

    // **重点** is rendered as a <strong> inside the markdown HTML container.
    const bold = screen.getByText("重点");
    expect(bold.tagName).toBe("STRONG");
    expect(bold.closest(".response-content")).not.toBeNull();
  });

  test("shows the semantic card fields when the card is valid", async () => {
    const { project, root, child } = buildTree({
      child: {
        contextState: "valid",
        semanticCard: { ...testSemanticCard("光合作用需要光照"), decisions: ["选定方案B"] },
      },
    });
    renderInspector({ selectedNodeId: "child", currentPath: [root, child], project });

    expect(await screen.findByText("查看语义卡片")).toBeInTheDocument();
    expect(screen.getByText("光合作用需要光照")).toBeInTheDocument();
    expect(screen.getByText("选定方案B")).toBeInTheDocument();
    expect(screen.getByText("事实")).toBeInTheDocument();
    expect(screen.getByText("决定")).toBeInTheDocument();
    // Empty categories are hidden.
    expect(screen.queryByText("约束")).not.toBeInTheDocument();
    expect(screen.queryByText("开放问题")).not.toBeInTheDocument();
  });

  test("offers a retry button when semantics are missing and calls onRetrySemantics", async () => {
    const user = userEvent.setup();
    const onRetrySemantics = vi.fn();
    const { project, root, child } = buildTree({
      child: { contextState: "missing", semanticCard: undefined },
    });
    renderInspector({
      selectedNodeId: "child",
      currentPath: [root, child],
      project,
      onRetrySemantics,
    });

    const retry = await screen.findByRole("button", { name: "重试语义整理" });
    await user.click(retry);

    expect(onRetrySemantics).toHaveBeenCalledTimes(1);
    expect(onRetrySemantics).toHaveBeenCalledWith("child");
  });

  test("disables the retry button and relabels while structuring", async () => {
    const { project, root, child } = buildTree({
      child: { contextState: "missing", semanticCard: undefined },
    });
    renderInspector({
      selectedNodeId: "child",
      currentPath: [root, child],
      project,
      structuringNodeIds: new Set(["child"]),
    });

    const retry = await screen.findByRole("button", { name: "正在整理" });
    expect(retry).toBeDisabled();
    expect(screen.getByText("整理中")).toBeInTheDocument();
  });

  test("leaf node shows an include-in-context toggle that flips the stored flag", async () => {
    const user = userEvent.setup();
    const { project, root, leaf } = buildTree();
    renderInspector({ selectedNodeId: "leaf", currentPath: [root, leaf], project });

    // Isolated by default.
    expect(await screen.findByText("默认只保存与展示，不影响 AI 推理。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "作为上下文" }));

    // TOGGLE_LEAF_CONTEXT flips the flag: label + description change and persist.
    expect(await screen.findByRole("button", { name: "已纳入" })).toBeInTheDocument();
    expect(screen.getByText("该笔记会作为用户给定信息加入所在路径。")).toBeInTheDocument();
    expect(readWorkspace().projects.p1.nodes.leaf.includeInContext).toBe(true);

    // Toggling again returns to the isolated default.
    await user.click(screen.getByRole("button", { name: "已纳入" }));
    expect(await screen.findByRole("button", { name: "作为上下文" })).toBeInTheDocument();
    expect(readWorkspace().projects.p1.nodes.leaf.includeInContext).toBe(false);
  });

  test("dragging the resize handle changes the width, clamped to 300-640px", async () => {
    // The right-side sidebar derives its width from the window edge.
    Object.defineProperty(document.body, "clientWidth", { value: 1000, configurable: true });
    const { project, root, child } = buildTree();
    const { container } = renderInspector({
      selectedNodeId: "child",
      currentPath: [root, child],
      project,
    });
    await screen.findByRole("heading", { level: 3, name: "子问题" });

    const aside = screen.getByRole("complementary");
    const handle = container.querySelector(".cursor-col-resize");
    if (!(handle instanceof HTMLElement)) throw new Error("resize handle not found");

    expect(aside).toHaveStyle({ width: "340px" });

    fireEvent.mouseDown(handle);
    fireEvent.mouseMove(window, { clientX: 600 });
    expect(aside).toHaveStyle({ width: "400px" });

    // Dragging far left would exceed the maximum: clamps to 640.
    fireEvent.mouseMove(window, { clientX: 100 });
    expect(aside).toHaveStyle({ width: "640px" });

    // Dragging to the window edge clamps to the 300 minimum.
    fireEvent.mouseMove(window, { clientX: 980 });
    expect(aside).toHaveStyle({ width: "300px" });

    // mouseup ends the drag.
    fireEvent.mouseUp(window);
    fireEvent.mouseMove(window, { clientX: 600 });
    expect(aside).toHaveStyle({ width: "300px" });
  });

  test("prune opens a confirm dialog outside the aside and prunes on confirm", async () => {
    const user = userEvent.setup();
    const { project, root, child } = buildTree();
    renderInspector({ selectedNodeId: "child", currentPath: [root, child], project });
    const aside = screen.getByRole("complementary");

    await user.click(await screen.findByRole("button", { name: "修剪" }));

    const title = screen.getByText("修剪分支 · Prune");
    expect(screen.getByText(/确定要删除「子问题」/)).toBeInTheDocument();
    // The overlay must cover the whole app, not just the sidebar column.
    expect(aside.contains(title)).toBe(false);

    await user.click(screen.getByRole("button", { name: "确认删除" }));

    expect(screen.queryByText("修剪分支 · Prune")).not.toBeInTheDocument();
    // The subtree is gone and selection falls back to the protected root,
    // which offers no prune action.
    expect(readWorkspace().projects.p1.nodes).not.toHaveProperty("child");
    expect(screen.queryByRole("button", { name: "修剪" })).not.toBeInTheDocument();
  });

  test("cancelling the prune dialog keeps the node", async () => {
    const user = userEvent.setup();
    const { project, root, child } = buildTree();
    renderInspector({ selectedNodeId: "child", currentPath: [root, child], project });

    await user.click(await screen.findByRole("button", { name: "修剪" }));
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByText("修剪分支 · Prune")).not.toBeInTheDocument();
    expect(readWorkspace().projects.p1.nodes).toHaveProperty("child");
  });

  test("the root node offers no prune action", async () => {
    const { project, root } = buildTree();
    renderInspector({ selectedNodeId: "root", currentPath: [root], project });

    await screen.findByRole("heading", { level: 3, name: "根任务" });
    expect(screen.getByRole("button", { name: "聚焦" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "修剪" })).not.toBeInTheDocument();
  });

  test("branch and leaf action buttons broadcast composer events", async () => {
    const user = userEvent.setup();
    const modeSpy = vi.fn();
    const focusSpy = vi.fn();
    window.addEventListener("composer-mode", modeSpy);
    window.addEventListener("composer-focus", focusSpy);
    try {
      const { project, root, child } = buildTree();
      renderInspector({ selectedNodeId: "child", currentPath: [root, child], project });

      await user.click(await screen.findByRole("button", { name: "叶片" }));
      expect(modeSpy).toHaveBeenCalledTimes(1);
      expect((modeSpy.mock.calls[0][0] as CustomEvent).detail).toBe("note");
      expect(focusSpy).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole("button", { name: "分支" }));
      expect((modeSpy.mock.calls[1][0] as CustomEvent).detail).toBe("ai");
      expect(focusSpy).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener("composer-mode", modeSpy);
      window.removeEventListener("composer-focus", focusSpy);
    }
  });
});
