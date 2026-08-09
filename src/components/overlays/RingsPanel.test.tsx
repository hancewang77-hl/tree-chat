import { describe, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HistoryEntry, TreeAction, TreeState } from "@/src/types/tree";
import { TreeProvider } from "@/src/state/TreeContext";
import { testNode, testProject, testTreeState } from "@/src/test/fixtures/tree";
import { RingsPanel } from "./RingsPanel";

// Rings history is session-only (HYDRATE always resets it), so seeding
// localStorage cannot produce history entries. This harness swaps the real
// TreeProvider for one that feeds a fixture TreeState through the real
// treeReducer, and records every dispatched action for assertions.
const harness = vi.hoisted(() => ({
  initial: undefined as TreeState | undefined,
  dispatched: [] as TreeAction[],
}));

vi.mock("@/src/state/TreeContext", async () => {
  const React = await import("react");
  const { treeReducer } = await import("@/src/state/treeReducer");
  type Store = { state: TreeState; dispatch: (action: TreeAction) => void };
  const HarnessContext = React.createContext<Store | null>(null);

  function TreeProvider({ children }: { children?: ReactNode }) {
    const [state, rawDispatch] = React.useReducer(
      treeReducer,
      harness.initial as TreeState,
    );
    const dispatch = React.useCallback(
      (action: TreeAction) => {
        harness.dispatched.push(action);
        rawDispatch(action);
      },
      [rawDispatch],
    );
    const value = React.useMemo(() => ({ state, dispatch }), [state, dispatch]);
    return React.createElement(HarnessContext.Provider, { value }, children);
  }

  function useTree(): Store {
    const store = React.useContext(HarnessContext);
    if (!store) throw new Error("test harness: TreeProvider missing");
    return store;
  }
  function useTreeState() {
    return useTree().state;
  }
  function useTreeDispatch() {
    return useTree().dispatch;
  }

  return { TreeProvider, useTree, useTreeState, useTreeDispatch };
});

let entrySeq = 0;
function historyEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  entrySeq += 1;
  return {
    id: `entry-${entrySeq}`,
    projectId: "project",
    label: `历史操作 ${entrySeq}`,
    timestamp: entrySeq,
    primaryNodeId: "root",
    affectedNodeIds: ["root"],
    patch: {},
    ...overrides,
  };
}

function ringsProject() {
  const root = testNode({
    id: "root",
    kind: "root",
    prompt: "根节点",
    children: ["child-a", "other-node"],
  });
  const childA = testNode({ id: "child-a", prompt: "聚焦卡片提问", parentId: "root", layer: 1 });
  const other = testNode({ id: "other-node", prompt: "其他卡片", parentId: "root", layer: 1 });
  return testProject({ nodes: { root, "child-a": childA, "other-node": other } });
}

function ringsState(overrides: Partial<TreeState> = {}): TreeState {
  const project = ringsProject();
  return testTreeState({
    projects: { [project.id]: project },
    isRingsOpen: true,
    ...overrides,
  });
}

function renderRings(state: TreeState) {
  harness.initial = state;
  harness.dispatched.length = 0;
  return render(
    <TreeProvider>
      <RingsPanel />
    </TreeProvider>,
  );
}

describe("RingsPanel", () => {
  test("renders nothing while Rings is closed", () => {
    renderRings(ringsState({ isRingsOpen: false }));
    expect(screen.queryByText("Rings · 年轮")).toBeNull();
  });

  test("global mode lists past entries newest-first with undo/redo counts", () => {
    const past = [
      historyEntry({ label: "第一步 · Leaf" }),
      historyEntry({ label: "第二步 · Prune" }),
    ];
    const future = [historyEntry({ label: "未来一步" })];
    renderRings(ringsState({ history: { past, future } }));

    expect(screen.getByText("Rings · 年轮")).toBeInTheDocument();
    expect(screen.getByText("2 步可撤销 · 1 步可重做")).toBeInTheDocument();
    const labels = screen.getAllByText(/第[一二]步 · /).map((el) => el.textContent);
    expect(labels).toEqual(["第二步 · Prune", "第一步 · Leaf"]);
    // The timeline only shows the undoable past, never the redo future.
    expect(screen.queryByText("未来一步")).toBeNull();
  });

  test("Undo and Redo dispatch global UNDO/REDO and update the counts", async () => {
    const user = userEvent.setup();
    const past = [historyEntry({ label: "过去操作" })];
    const future = [historyEntry({ label: "未来操作" })];
    renderRings(ringsState({ history: { past, future } }));

    await user.click(screen.getByRole("button", { name: /Undo/ }));
    expect(harness.dispatched).toContainEqual({ type: "UNDO" });
    expect(screen.getByText("0 步可撤销 · 2 步可重做")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Redo/ }));
    expect(harness.dispatched).toContainEqual({ type: "REDO" });
    expect(screen.getByText("1 步可撤销 · 1 步可重做")).toBeInTheDocument();
  });

  test("disables Undo/Redo and shows the empty message without history", () => {
    renderRings(ringsState());
    expect(screen.getByRole("button", { name: /Undo/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Redo/ })).toBeDisabled();
    expect(screen.getByText("暂无操作历史")).toBeInTheDocument();
    expect(screen.getByText("0 步可撤销 · 0 步可重做")).toBeInTheDocument();
  });

  test("node mode lists only the focus node's entries and stops at a barrier", () => {
    const past = [
      historyEntry({ label: "屏障前的旧操作", affectedNodeIds: ["child-a"] }),
      historyEntry({ label: "Auxo 批量", affectedNodeIds: ["child-a"], nodeUndoable: false }),
      historyEntry({ label: "别的项目", projectId: "other-project", affectedNodeIds: ["child-a"] }),
      historyEntry({ label: "触及焦点 · 新", affectedNodeIds: ["child-a", "root"] }),
      historyEntry({ label: "无关节点操作", affectedNodeIds: ["other-node"] }),
    ];
    renderRings(
      ringsState({
        ringsMode: "node",
        ringsFocusNodeId: "child-a",
        history: { past, future: [] },
      }),
    );

    expect(screen.getByText("Node Rings · 节点年轮")).toBeInTheDocument();
    expect(screen.getByText("当前卡片")).toBeInTheDocument();
    expect(screen.getByText("聚焦卡片提问")).toBeInTheDocument();

    expect(screen.getByText("触及焦点 · 新")).toBeInTheDocument();
    // Entries not touching the focus node are skipped (without breaking) …
    expect(screen.queryByText("无关节点操作")).toBeNull();
    expect(screen.queryByText("别的项目")).toBeNull();
    // … but a nodeUndoable:false batch is a hard barrier: neither the batch
    // itself nor anything older than it is reachable.
    expect(screen.queryByText("Auxo 批量")).toBeNull();
    expect(screen.queryByText("屏障前的旧操作")).toBeNull();
    expect(screen.getByText("1 步可撤销 · 0 步可重做")).toBeInTheDocument();
  });

  test("a barrier in the future blocks node-mode redo", () => {
    const future = [
      historyEntry({ label: "Auxo 批量", affectedNodeIds: ["child-a"], nodeUndoable: false }),
      historyEntry({ label: "屏障后的未来操作", affectedNodeIds: ["child-a"] }),
    ];
    renderRings(
      ringsState({
        ringsMode: "node",
        ringsFocusNodeId: "child-a",
        history: { past: [], future },
      }),
    );

    expect(screen.getByRole("button", { name: /Redo/ })).toBeDisabled();
    expect(screen.getByText("0 步可撤销 · 0 步可重做")).toBeInTheDocument();
  });

  test("node mode Undo/Redo dispatch UNDO_NODE/REDO_NODE for the focus node", async () => {
    const user = userEvent.setup();
    const past = [historyEntry({ label: "节点过去", affectedNodeIds: ["child-a"] })];
    const future = [historyEntry({ label: "节点未来", affectedNodeIds: ["child-a"] })];
    renderRings(
      ringsState({
        ringsMode: "node",
        ringsFocusNodeId: "child-a",
        history: { past, future },
      }),
    );

    await user.click(screen.getByRole("button", { name: /Undo/ }));
    expect(harness.dispatched).toContainEqual({ type: "UNDO_NODE", nodeId: "child-a" });

    await user.click(screen.getByRole("button", { name: /Redo/ }));
    expect(harness.dispatched).toContainEqual({ type: "REDO_NODE", nodeId: "child-a" });
  });

  test("关闭 dispatches CLOSE_RINGS and hides the panel", async () => {
    const user = userEvent.setup();
    renderRings(ringsState());

    await user.click(screen.getByRole("button", { name: "关闭" }));

    expect(harness.dispatched).toContainEqual({ type: "CLOSE_RINGS" });
    expect(screen.queryByText("Rings · 年轮")).toBeNull();
  });
});
