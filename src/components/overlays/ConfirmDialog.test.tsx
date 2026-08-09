import { describe, expect, test, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Project } from "@/src/types/tree";
import { useTreeState } from "@/src/state/TreeContext";
import { renderWithProject } from "@/src/test/harness/renderWithTree";
import { testNode, testProject } from "@/src/test/fixtures/tree";
import { LayerNameDialog } from "../LayerNameDialog";
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

function ConfirmDialogHost() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open confirmation</button>
      {isOpen && (
        <ConfirmDialog
          title="Confirm removal"
          message="This action can be undone."
          confirmLabel="Remove"
          onConfirm={() => setIsOpen(false)}
          onCancel={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

function StackedDialogHost() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [layerOpen, setLayerOpen] = useState(false);

  return (
    <>
      <button onClick={() => setConfirmOpen(true)}>Open modal stack</button>
      {confirmOpen && (
        <ConfirmDialog
          title="First dialog"
          message="Open a nested dialog from here."
          confirmLabel="Open nested dialog"
          onConfirm={() => setLayerOpen(true)}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
      <LayerNameDialog
        isOpen={layerOpen}
        selectedLayer={2}
        planeNameInput="Branches"
        onInputChange={() => undefined}
        onConfirm={() => setLayerOpen(false)}
        onCancel={() => setLayerOpen(false)}
      />
    </>
  );
}

describe("ConfirmDialog", () => {
  test("renders title, message and action labels", () => {
    renderDialog();
    const dialog = screen.getByRole("alertdialog", { name: "修剪分支 · Prune" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("确定要删除这个节点吗？");
    expect(screen.getByText("修剪分支 · Prune")).toBeInTheDocument();
    expect(screen.getByText("确定要删除这个节点吗？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认删除" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toHaveFocus();
  });

  test("Escape cancels the destructive action", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();

    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
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
    const { onConfirm, onCancel } = renderDialog();

    // The panel stops propagation, so clicks inside never cancel.
    await user.click(screen.getByText("修剪分支 · Prune"));
    expect(onCancel).not.toHaveBeenCalled();

    const backdrop = screen.getByRole("alertdialog").parentElement as HTMLElement;
    await user.click(backdrop);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("portals a fixed full-application backdrop to document.body", () => {
    renderDialog();

    const backdrop = screen.getByRole("alertdialog").parentElement;
    expect(backdrop).toHaveClass("fixed", "inset-0");
    expect(backdrop?.parentElement).toBe(document.body);
  });

  test("makes the body background inert only while the dialog is open", async () => {
    const user = userEvent.setup();
    const view = render(<ConfirmDialogHost />);
    const opener = screen.getByRole("button", { name: "Open confirmation" });

    expect(view.container).not.toHaveAttribute("inert");
    await user.click(opener);
    expect(view.container).toHaveAttribute("inert");
    expect(view.container).toHaveAttribute("aria-hidden", "true");

    await user.keyboard("{Escape}");
    expect(view.container).not.toHaveAttribute("inert");
    expect(view.container).not.toHaveAttribute("aria-hidden");
  });

  test("Escape closes only the topmost dialog and restores each opener", async () => {
    const user = userEvent.setup();
    render(<StackedDialogHost />);
    const outerOpener = screen.getByRole("button", { name: "Open modal stack" });

    await user.click(outerOpener);
    const nestedOpener = screen.getByRole("button", { name: "Open nested dialog" });
    await user.click(nestedOpener);
    expect(screen.getByRole("dialog", { name: "命名当前平面" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "命名当前平面" })).toBeNull();
    expect(screen.getByRole("alertdialog", { name: "First dialog" })).toBeInTheDocument();
    expect(nestedOpener).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog", { name: "First dialog" })).toBeNull();
    expect(outerOpener).toHaveFocus();
  });

  test("Tab and Shift+Tab keep focus inside the alert dialog", async () => {
    const user = userEvent.setup();
    renderDialog();

    const dialog = screen.getByRole("alertdialog");
    const [cancelButton, confirmButton] = within(dialog).getAllByRole("button");

    expect(cancelButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirmButton).toHaveFocus();

    await user.tab();
    expect(cancelButton).toHaveFocus();
  });

  test("Escape closes the alert dialog and restores focus to its opener", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialogHost />);
    const opener = screen.getByRole("button", { name: "Open confirmation" });

    await user.click(opener);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(opener).toHaveFocus();
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
