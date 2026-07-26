import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Project } from "@/src/types/tree";
import { useTreeState } from "@/src/state/TreeContext";
import { renderWithProject } from "@/src/test/harness/renderWithTree";
import { testNode, testProject } from "@/src/test/fixtures/tree";
import { ConfirmDialog, usePruneConfirm } from "./ConfirmDialog";

function renderDialog() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <ConfirmDialog
      title="修剪分支 · Prune"
      message="确定要删除这个节点吗？"
      confirmLabel="确认删除"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel, view };
}

describe("ConfirmDialog", () => {
  test("renders title, message and action labels", () => {
    renderDialog();
    expect(screen.getByText("修剪分支 · Prune")).toBeInTheDocument();
    expect(screen.getByText("确定要删除这个节点吗？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认删除" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
  });

  test("the confirm button fires onConfirm only", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();

    await user.click(screen.getByRole("button", { name: "确认删除" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  test("the cancel button fires onCancel only", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();

    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("clicking the backdrop cancels; clicking inside the panel does not", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel, view } = renderDialog();

    // The panel stops propagation, so clicks inside never cancel.
    await user.click(screen.getByText("修剪分支 · Prune"));
    expect(onCancel).not.toHaveBeenCalled();

    const backdrop = view.container.firstElementChild as HTMLElement;
    await user.click(backdrop);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

/**
 * Host that wires usePruneConfirm exactly like TreeToolbar/InspectorSidebar:
 * selection comes from tree state, and the returned dialog is rendered inline.
 * The probe outputs make the PRUNE dispatch observable.
 */
function PruneHost() {
  const state = useTreeState();
  const project = state.projects[state.activeProjectId];
  const selectedNode = project?.nodes[state.selectedNodeId];
  const { requestPrune, pruneConfirmDialog } = usePruneConfirm({
    selectedNode,
    isRoot: Boolean(project && selectedNode && selectedNode.id === project.rootNodeId),
  });
  if (!project) return null;
  return (
    <div>
      <button onClick={requestPrune}>发起修剪</button>
      <output data-testid="node-ids">{Object.keys(project.nodes).sort().join(",")}</output>
      <output data-testid="selected-node">{state.selectedNodeId}</output>
      {pruneConfirmDialog}
    </div>
  );
}

function pruneProject(): Project {
  const root = testNode({ id: "root", kind: "root", prompt: "根任务", children: ["branch-1"] });
  const branch1 = testNode({
    id: "branch-1",
    prompt: "第一个分支问题",
    parentId: "root",
    layer: 1,
    children: ["leaf-1", "branch-2"],
  });
  const leaf1 = testNode({ id: "leaf-1", kind: "leaf", prompt: "叶子笔记", parentId: "branch-1", layer: 1 });
  const branch2 = testNode({ id: "branch-2", prompt: "次级分支", parentId: "branch-1", layer: 2 });
  return testProject({ nodes: { root, "branch-1": branch1, "leaf-1": leaf1, "branch-2": branch2 } });
}

describe("usePruneConfirm", () => {
  test("requestPrune is a no-op when the root node is selected", async () => {
    const user = userEvent.setup();
    renderWithProject(<PruneHost />, pruneProject(), { selectedNodeId: "root" });

    await user.click(await screen.findByRole("button", { name: "发起修剪" }));

    expect(screen.queryByText("修剪分支 · Prune")).toBeNull();
  });

  test("dialog message includes prompt and child count; confirm prunes the subtree", async () => {
    const user = userEvent.setup();
    renderWithProject(<PruneHost />, pruneProject(), { selectedNodeId: "branch-1" });
    const trigger = await screen.findByRole("button", { name: "发起修剪" });
    expect(screen.getByTestId("node-ids")).toHaveTextContent("branch-1,branch-2,leaf-1,root");

    await user.click(trigger);
    expect(screen.getByText("修剪分支 · Prune")).toBeInTheDocument();
    expect(
      screen.getByText("确定要删除「第一个分支问题」及其 2 个子节点吗？此操作可通过 Rings 撤销。"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(screen.queryByText("修剪分支 · Prune")).toBeNull();
    });
    // PRUNE removed the node plus its whole subtree and fell back to the parent.
    expect(screen.getByTestId("node-ids")).toHaveTextContent(/^root$/);
    expect(screen.getByTestId("selected-node")).toHaveTextContent(/^root$/);
  });

  test("a node without children omits the child count in the message", async () => {
    const user = userEvent.setup();
    renderWithProject(<PruneHost />, pruneProject(), { selectedNodeId: "branch-2" });

    await user.click(await screen.findByRole("button", { name: "发起修剪" }));

    expect(
      screen.getByText("确定要删除「次级分支」吗？此操作可通过 Rings 撤销。"),
    ).toBeInTheDocument();
  });

  test("cancel closes the dialog without pruning", async () => {
    const user = userEvent.setup();
    renderWithProject(<PruneHost />, pruneProject(), { selectedNodeId: "branch-1" });

    await user.click(await screen.findByRole("button", { name: "发起修剪" }));
    await user.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => {
      expect(screen.queryByText("修剪分支 · Prune")).toBeNull();
    });
    expect(screen.getByTestId("node-ids")).toHaveTextContent("branch-1,branch-2,leaf-1,root");
  });
});
