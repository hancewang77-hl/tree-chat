import { describe, expect, test } from "vitest";
import { act, useEffect, useState } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MindNode, Project } from "@/src/types/tree";
import { useTreeState } from "@/src/state/TreeContext";
import { SearchPalette } from "./SearchPalette";
import { renderWithProject } from "@/src/test/harness/renderWithTree";
import { testNode, testProject } from "@/src/test/fixtures/tree";
import { ConfirmDialog } from "./ConfirmDialog";

/** Renders the current selection so SUNLIGHT side effects are observable. */
function SelectionProbe() {
  const state = useTreeState();
  return (
    <output data-testid="selection">
      {state.selectedNodeId}:{state.selectedLayer}
    </output>
  );
}

function searchProject(): Project {
  const root = testNode({
    id: "root",
    kind: "root",
    prompt: "根问题：期权定价",
    response: "从这里开始",
    children: ["a", "b", "c", "d"],
  });
  // "SOIL" appears uppercase in a.response, lowercase in b.response and
  // mixed-case in c.taskDescription — one lowercase query must find all three.
  const a = testNode({
    id: "a",
    prompt: "布莱克斯科尔斯模型推导",
    response: "偏微分方程 SOIL 解",
    parentId: "root",
    layer: 1,
  });
  const b = testNode({
    id: "b",
    prompt: "蒙特卡洛模拟",
    response: "随机路径采样 soil 场景",
    parentId: "root",
    layer: 2,
  });
  const c = testNode({
    id: "c",
    kind: "branch",
    nodeRole: "task",
    prompt: "任务：数据准备",
    response: "",
    taskDescription: "收集 Soil 湿度数据",
    parentId: "root",
    layer: 3,
  });
  const d = testNode({
    id: "d",
    prompt: "无关节点",
    response: "没有关键词",
    parentId: "root",
    layer: 1,
  });
  return testProject({ nodes: { root, a, b, c, d } });
}

function toggleSearch() {
  act(() => {
    window.dispatchEvent(new CustomEvent("search-toggle"));
  });
}

function SearchHost() {
  return (
    <>
      <button onClick={toggleSearch}>Open search</button>
      <SearchPalette />
    </>
  );
}

function SearchBlockedByConfirmHost() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <button onClick={() => setConfirmOpen(true)}>Open blocking confirmation</button>
      <SearchPalette />
      {confirmOpen && (
        <ConfirmDialog
          title="Blocking confirmation"
          message="Search must stay closed."
          confirmLabel="Continue"
          onConfirm={() => setConfirmOpen(false)}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </>
  );
}

function SearchUnderConfirmHost() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const openConfirm = () => setConfirmOpen(true);
    window.addEventListener("test-open-confirm", openConfirm);
    return () => window.removeEventListener("test-open-confirm", openConfirm);
  }, []);

  return (
    <>
      <SearchPalette />
      {confirmOpen && (
        <ConfirmDialog
          title="Stacked confirmation"
          message="Search remains mounted underneath."
          confirmLabel="Continue"
          onConfirm={() => setConfirmOpen(false)}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </>
  );
}

function openStackedConfirm() {
  act(() => {
    window.dispatchEvent(new CustomEvent("test-open-confirm"));
  });
}

describe("SearchPalette", () => {
  test("is hidden by default and toggles with Ctrl+K / Cmd+K", async () => {
    const user = userEvent.setup();
    renderWithProject(<SearchPalette />, searchProject());

    expect(screen.queryByPlaceholderText("搜索节点...")).toBeNull();

    await user.keyboard("{Control>}k{/Control}");
    expect(await screen.findByPlaceholderText("搜索节点...")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "搜索节点" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    expect(screen.getByText("输入关键词搜索所有节点")).toBeInTheDocument();

    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("搜索节点...")).toBeNull();
    });

    await user.keyboard("{Meta>}k{/Meta}");
    expect(await screen.findByPlaceholderText("搜索节点...")).toBeInTheDocument();
  });

  test("opens and closes via the search-toggle window event", async () => {
    renderWithProject(<SearchPalette />, searchProject());

    toggleSearch();
    expect(await screen.findByPlaceholderText("搜索节点...")).toBeInTheDocument();

    toggleSearch();
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("搜索节点...")).toBeNull();
    });
  });

  test("Escape closes the palette", async () => {
    const user = userEvent.setup();
    renderWithProject(<SearchPalette />, searchProject());

    toggleSearch();
    await screen.findByPlaceholderText("搜索节点...");

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("搜索节点...")).toBeNull();
    });
  });

  test("matches case-insensitively across prompt, response and taskDescription", async () => {
    const user = userEvent.setup();
    renderWithProject(<SearchPalette />, searchProject());

    toggleSearch();
    const input = await screen.findByPlaceholderText("搜索节点...");

    // Lowercase query hits "SOIL" (response), "soil" (response), "Soil" (taskDescription).
    await user.type(input, "soil");
    expect(await screen.findByRole("button", { name: /布莱克斯科尔斯模型推导/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /蒙特卡洛模拟/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /任务：数据准备/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /无关节点/ })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(3);

    // Prompt substring match narrows down to a single node.
    await user.clear(input);
    await user.type(input, "模型");
    await waitFor(() => {
      expect(screen.getAllByRole("button")).toHaveLength(1);
    });
    expect(screen.getByRole("button", { name: /布莱克斯科尔斯模型推导/ })).toBeInTheDocument();
  });

  test("shows an empty-result message for a non-matching query", async () => {
    const user = userEvent.setup();
    renderWithProject(<SearchPalette />, searchProject());

    toggleSearch();
    const input = await screen.findByPlaceholderText("搜索节点...");
    await user.type(input, "不存在的词zzz");

    expect(await screen.findByText("未找到匹配节点")).toBeInTheDocument();
  });

  test("caps the result list at 10 nodes", async () => {
    const user = userEvent.setup();
    const childIds = Array.from({ length: 12 }, (_, i) => `n${i}`);
    const nodes: Record<string, MindNode> = {
      root: testNode({
        id: "root",
        kind: "root",
        prompt: "根",
        response: "无",
        children: childIds,
      }),
    };
    for (const [i, id] of childIds.entries()) {
      nodes[id] = testNode({
        id,
        prompt: `候选主题 ${i}`,
        response: "shared apple keyword",
        parentId: "root",
        layer: 1,
      });
    }
    renderWithProject(<SearchPalette />, testProject({ nodes }));

    toggleSearch();
    const input = await screen.findByPlaceholderText("搜索节点...");
    await user.type(input, "apple");

    expect(screen.getAllByRole("button")).toHaveLength(10);
  });

  test("clicking a result selects the node, jumps to its layer and closes", async () => {
    const user = userEvent.setup();
    renderWithProject(
      <>
        <SearchPalette />
        <SelectionProbe />
      </>,
      searchProject(),
    );
    await waitFor(() => {
      expect(screen.getByTestId("selection")).toHaveTextContent("root:0");
    });

    toggleSearch();
    const input = await screen.findByPlaceholderText("搜索节点...");
    await user.type(input, "蒙特卡洛");
    await user.click(await screen.findByRole("button", { name: /蒙特卡洛模拟/ }));

    // SUNLIGHT selected node b and jumped to its layer (2), then closed.
    expect(screen.getByTestId("selection")).toHaveTextContent("b:2");
    expect(screen.queryByPlaceholderText("搜索节点...")).toBeNull();
  });

  test.each(["Control", "Meta"])(
    "does not open from %s+K while another modal is active",
    async (modifier) => {
      const user = userEvent.setup();
      renderWithProject(<SearchBlockedByConfirmHost />, searchProject());
      await user.click(screen.getByRole("button", { name: "Open blocking confirmation" }));

      await user.keyboard(`{${modifier}>}k{/${modifier}}`);

      expect(screen.getByRole("alertdialog", { name: "Blocking confirmation" })).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "搜索节点" })).toBeNull();
    },
  );

  test("does not open from search-toggle while another modal is active", async () => {
    const user = userEvent.setup();
    renderWithProject(<SearchBlockedByConfirmHost />, searchProject());
    await user.click(screen.getByRole("button", { name: "Open blocking confirmation" }));

    toggleSearch();

    expect(screen.getByRole("alertdialog", { name: "Blocking confirmation" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "搜索节点" })).toBeNull();
  });

  test("search triggers do not close Search while a newer modal is topmost", async () => {
    const user = userEvent.setup();
    renderWithProject(<SearchUnderConfirmHost />, searchProject());
    toggleSearch();
    const searchInput = await screen.findByPlaceholderText("搜索节点...");

    openStackedConfirm();
    expect(screen.getByRole("alertdialog", { name: "Stacked confirmation" })).toBeInTheDocument();

    await user.keyboard("{Control>}k{/Control}");
    expect(searchInput).toBeInTheDocument();

    toggleSearch();
    expect(searchInput).toBeInTheDocument();
  });

  test("Tab and Shift+Tab keep focus inside the search dialog", async () => {
    const user = userEvent.setup();
    renderWithProject(<SearchHost />, searchProject());
    await user.click(screen.getByRole("button", { name: "Open search" }));

    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByRole("textbox");
    await user.type(input, "soil");
    const resultButtons = within(dialog).getAllByRole("button");
    const lastResult = resultButtons.at(-1);
    expect(lastResult).toBeDefined();

    expect(input).toHaveFocus();
    await user.tab({ shift: true });
    expect(lastResult).toHaveFocus();

    await user.tab();
    expect(input).toHaveFocus();
  });

  test("Escape closes search and restores focus to its opener", async () => {
    const user = userEvent.setup();
    renderWithProject(<SearchHost />, searchProject());
    const opener = screen.getByRole("button", { name: "Open search" });

    await user.click(opener);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });
});
