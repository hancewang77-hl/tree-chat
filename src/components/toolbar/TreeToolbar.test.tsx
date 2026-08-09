import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TreeProvider, useTreeState } from "@/src/state/TreeContext";
import { testNode, testProject } from "@/src/test/fixtures/tree";
import type { Project } from "@/src/types/tree";
import { TreeToolbar } from "./TreeToolbar";

/**
 * Seeds localStorage so the real TreeProvider hydrates a known workspace on
 * mount (schema v2). Hydration runs in a mount effect, which RTL's render()
 * flushes inside act, so post-render queries already see the hydrated UI.
 */
function seedWorkspace(project: Project, selectedNodeId: string, selectedLayer = 0) {
  localStorage.setItem(
    "tree-chat-projects",
    JSON.stringify({
      schemaVersion: 2,
      projects: { [project.id]: project },
      activeProjectId: project.id,
      selectedNodeId,
      selectedLayer,
      planeNames: { 0: "根节点层" },
    }),
  );
}

/** root → branch-1 → leaf-1 */
function branchProject(): Project {
  const root = testNode({
    id: "root",
    kind: "root",
    prompt: "根任务",
    parentId: null,
    children: ["branch-1"],
    layer: 0,
  });
  const branch = testNode({
    id: "branch-1",
    kind: "branch",
    prompt: "分支问题",
    parentId: "root",
    children: ["leaf-1"],
    layer: 1,
  });
  const leaf = testNode({
    id: "leaf-1",
    kind: "leaf",
    prompt: "叶片笔记",
    parentId: "branch-1",
    children: [],
    layer: 1,
  });
  return testProject({
    id: "p1",
    rootNodeId: "root",
    nodes: { root, "branch-1": branch, "leaf-1": leaf },
  });
}

/** A root with no children — the only state where Auxo is usable. */
function pristineRootProject(): Project {
  const root = testNode({
    id: "root",
    kind: "root",
    prompt: "根任务",
    parentId: null,
    children: [],
    layer: 0,
  });
  return testProject({ id: "p1", rootNodeId: "root", nodes: { root } });
}

/** Exposes reducer state as data attributes so tests can assert what a click changed. */
function StateProbe() {
  const state = useTreeState();
  const project = state.projects[state.activeProjectId];
  return (
    <div
      data-testid="state-probe"
      data-toolmode={state.toolMode}
      data-is3d={String(state.is3DMode)}
      data-moving={state.movingNodeId ?? "none"}
      data-graft-source={state.graftSourceId ?? "none"}
      data-selected={state.selectedNodeId}
      data-node-ids={Object.keys(project?.nodes ?? {}).sort().join("|")}
    />
  );
}

function renderToolbar({ isAuxoGenerating = false }: { isAuxoGenerating?: boolean } = {}) {
  const onOpenAuxo = vi.fn();
  render(
    <TreeProvider>
      <StateProbe />
      <TreeToolbar onOpenAuxo={onOpenAuxo} isAuxoGenerating={isAuxoGenerating} />
    </TreeProvider>,
  );
  return { onOpenAuxo, probe: () => screen.getByTestId("state-probe") };
}

describe("TreeToolbar", () => {
  it("shows an enabled Auxo button on a pristine root and disables node-only tools", async () => {
    const user = userEvent.setup();
    seedWorkspace(pristineRootProject(), "root");
    const { onOpenAuxo } = renderToolbar();

    const auxo = await screen.findByRole("button", { name: "Auxo" });
    expect(auxo).toBeEnabled();
    expect(auxo).toHaveAttribute("title", "Auxo — 从根任务和全部启用资料生成基础任务树");

    // Root selection: graft / layer-move / prune are all protected.
    expect(screen.getByRole("button", { name: "嫁接" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "移层" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "修剪" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "聚焦" })).toBeEnabled();

    await user.click(auxo);
    expect(onOpenAuxo).toHaveBeenCalledTimes(1);
  });

  it("disables Auxo once the root has children", async () => {
    seedWorkspace(branchProject(), "root");
    renderToolbar();

    const auxo = await screen.findByRole("button", { name: "Auxo" });
    expect(auxo).toBeDisabled();
    expect(auxo).toHaveAttribute(
      "title",
      "Auxo 仅用于空白根任务；请新建项目，或先撤销/修剪现有分支",
    );
  });

  it("relabels Auxo to 规划中 and disables it while generating", async () => {
    seedWorkspace(pristineRootProject(), "root");
    renderToolbar({ isAuxoGenerating: true });

    const auxo = await screen.findByRole("button", { name: "规划中" });
    expect(auxo).toBeDisabled();
  });

  it("hides Auxo for a branch selection and enables graft/layer/prune", async () => {
    seedWorkspace(branchProject(), "branch-1", 1);
    renderToolbar();

    expect(await screen.findByRole("button", { name: "嫁接" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Auxo" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移层" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "修剪" })).toBeEnabled();
  });

  it("disables 移层 for a leaf selection while 嫁接 and 修剪 stay enabled", async () => {
    seedWorkspace(branchProject(), "leaf-1", 1);
    renderToolbar();

    expect(await screen.findByRole("button", { name: "移层" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "嫁接" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "修剪" })).toBeEnabled();
  });

  it("分支 and 叶片 broadcast composer-mode + composer-focus CustomEvents", async () => {
    const user = userEvent.setup();
    const modeSpy = vi.fn<(event: Event) => void>();
    const focusSpy = vi.fn<(event: Event) => void>();
    window.addEventListener("composer-mode", modeSpy);
    window.addEventListener("composer-focus", focusSpy);
    try {
      seedWorkspace(branchProject(), "branch-1", 1);
      renderToolbar();

      await user.click(await screen.findByRole("button", { name: "叶片" }));
      expect(modeSpy).toHaveBeenCalledTimes(1);
      expect((modeSpy.mock.calls[0][0] as CustomEvent).detail).toBe("note");
      expect(focusSpy).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole("button", { name: "分支" }));
      expect(modeSpy).toHaveBeenCalledTimes(2);
      expect((modeSpy.mock.calls[1][0] as CustomEvent).detail).toBe("ai");
      expect(focusSpy).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener("composer-mode", modeSpy);
      window.removeEventListener("composer-focus", focusSpy);
    }
  });

  it("marks 叶片 active after it broadcasts note mode (listens to its own event)", async () => {
    const user = userEvent.setup();
    seedWorkspace(branchProject(), "branch-1", 1);
    renderToolbar();

    const leafButton = await screen.findByRole("button", { name: "叶片" });
    const branchButton = screen.getByRole("button", { name: "分支" });
    // Initially the composer is in AI mode, so 分支 carries the active accent.
    expect(branchButton.getAttribute("style")).toContain("background: var(--accent-sage)");
    expect(leafButton.getAttribute("style")).not.toContain("background: var(--accent-sage)");

    await user.click(leafButton);
    expect(leafButton.getAttribute("style")).toContain("background: var(--accent-sage)");
    expect(branchButton.getAttribute("style")).not.toContain("background: var(--accent-sage)");
  });

  it("exposes the tool group name and pressed state without relying on hover tooltips", async () => {
    const user = userEvent.setup();
    seedWorkspace(branchProject(), "branch-1", 1);
    renderToolbar();

    expect(screen.getByRole("group", { name: "树编辑工具" })).toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "树编辑工具" })).not.toBeInTheDocument();
    const branchButton = await screen.findByRole("button", { name: "分支" });
    const leafButton = screen.getByRole("button", { name: "叶片" });

    expect(branchButton).toHaveAttribute("aria-label", "分支");
    expect(branchButton).toHaveAttribute("title", "Branch — AI 生成子节点");
    expect(branchButton).toHaveAttribute("aria-pressed", "true");
    expect(leafButton).toHaveAttribute("aria-pressed", "false");

    await user.click(leafButton);
    expect(branchButton).toHaveAttribute("aria-pressed", "false");
    expect(leafButton).toHaveAttribute("aria-pressed", "true");
  });

  it("graft toggles GRAFT_START/GRAFT_CANCEL and shows the target hint", async () => {
    const user = userEvent.setup();
    seedWorkspace(branchProject(), "branch-1", 1);
    const { probe } = renderToolbar();

    const graft = await screen.findByRole("button", { name: "嫁接" });
    await user.click(graft);
    expect(probe()).toHaveAttribute("data-toolmode", "graft");
    expect(probe()).toHaveAttribute("data-graft-source", "branch-1");
    expect(graft.getAttribute("style")).toContain("background: var(--accent-sage)");
    expect(screen.getByText("点击目标父节点")).toBeInTheDocument();

    await user.click(graft);
    expect(probe()).toHaveAttribute("data-toolmode", "view");
    expect(probe()).toHaveAttribute("data-graft-source", "none");
    expect(screen.queryByText("点击目标父节点")).not.toBeInTheDocument();
  });

  it("移层 arms layer move (auto-switching 2D → 3D) and a second click cancels", async () => {
    const user = userEvent.setup();
    seedWorkspace(branchProject(), "branch-1", 1);
    const { probe } = renderToolbar();

    const move = await screen.findByRole("button", { name: "移层" });
    expect(probe()).toHaveAttribute("data-is3d", "false");

    await user.click(move);
    expect(probe()).toHaveAttribute("data-toolmode", "layerMove");
    expect(probe()).toHaveAttribute("data-moving", "branch-1");
    // Target layers are picked on the 3D glass stack, so arming from 2D flips to 3D.
    expect(probe()).toHaveAttribute("data-is3d", "true");
    expect(move.getAttribute("style")).toContain("background: var(--accent-sage)");
    expect(screen.getByText("滚轮选层，点 ✓ 确认")).toBeInTheDocument();

    await user.click(move);
    expect(probe()).toHaveAttribute("data-toolmode", "view");
    expect(probe()).toHaveAttribute("data-moving", "none");
    expect(screen.queryByText("滚轮选层，点 ✓ 确认")).not.toBeInTheDocument();
    // Cancelling the move keeps the view in 3D (only the tool mode resets).
    expect(probe()).toHaveAttribute("data-is3d", "true");
  });

  it("修剪 opens the shared ConfirmDialog and confirming prunes the subtree", async () => {
    const user = userEvent.setup();
    seedWorkspace(branchProject(), "branch-1", 1);
    const { probe } = renderToolbar();

    await user.click(await screen.findByRole("button", { name: "修剪" }));
    expect(screen.getByRole("heading", { name: "修剪分支 · Prune" })).toBeInTheDocument();
    expect(
      screen.getByText("确定要删除「分支问题」及其 1 个子节点吗？此操作可通过 Rings 撤销。"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(screen.queryByRole("heading", { name: "修剪分支 · Prune" })).not.toBeInTheDocument();
    // branch-1 and its leaf are gone; selection falls back to the parent root.
    expect(probe()).toHaveAttribute("data-node-ids", "root");
    expect(probe()).toHaveAttribute("data-selected", "root");
  });

  it("cancelling the prune dialog keeps the tree intact", async () => {
    const user = userEvent.setup();
    seedWorkspace(branchProject(), "branch-1", 1);
    const { probe } = renderToolbar();

    await user.click(await screen.findByRole("button", { name: "修剪" }));
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("heading", { name: "修剪分支 · Prune" })).not.toBeInTheDocument();
    expect(probe()).toHaveAttribute("data-node-ids", "branch-1|leaf-1|root");
  });
});
