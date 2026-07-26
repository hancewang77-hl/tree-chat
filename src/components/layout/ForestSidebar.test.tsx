import { describe, expect, test, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForestSidebar } from "./ForestSidebar";
import { renderWithTree, seedWorkspace } from "@/src/test/harness/renderWithTree";
import { testNode, testProject } from "@/src/test/fixtures/tree";
import type { Project } from "@/src/types/tree";

function readWorkspace(): { projects: Record<string, Project>; activeProjectId?: string } {
  return JSON.parse(localStorage.getItem("tree-chat-projects") ?? "{}");
}

/** The clickable row (role=button) that contains the given project name. */
function projectRow(name: string): HTMLElement {
  const row = screen.getByText(name).closest('[role="button"]');
  if (!(row instanceof HTMLElement)) throw new Error(`project row "${name}" not found`);
  return row;
}

/** Raw inline style — the active row is painted with the sage accent. */
function rowStyle(row: HTMLElement): string {
  return row.getAttribute("style") ?? "";
}

describe("ForestSidebar", () => {
  test("lists every project and marks the active one, with node/layer counts", async () => {
    const p1 = testProject({ id: "p1", name: "森林一" });
    const p2 = testProject({
      id: "p2",
      name: "森林二",
      rootNodeId: "r2",
      nodes: {
        r2: testNode({ id: "r2", kind: "root", children: ["c2"] }),
        c2: testNode({ id: "c2", parentId: "r2", layer: 2 }),
      },
    });
    seedWorkspace([p1, p2], { activeProjectId: "p2" });
    renderWithTree(<ForestSidebar />);

    expect(await screen.findByText("森林一")).toBeInTheDocument();
    expect(screen.getByText("森林二")).toBeInTheDocument();
    // Count badge in the header.
    expect(screen.getByText("2")).toBeInTheDocument();
    // p2 has 2 nodes and a max layer of 2.
    expect(screen.getByText("2 节点")).toBeInTheDocument();
    expect(screen.getByText("z = 2 层")).toBeInTheDocument();

    // Active row gets the sage highlight; the inactive one does not.
    expect(rowStyle(projectRow("森林二"))).toContain("var(--accent-sage)");
    expect(rowStyle(projectRow("森林一"))).not.toContain("var(--accent-sage)");
  });

  test("clicking a project switches the active project", async () => {
    const user = userEvent.setup();
    const p1 = testProject({ id: "p1", name: "森林一" });
    const p2 = testProject({ id: "p2", name: "森林二" });
    seedWorkspace([p1, p2], { activeProjectId: "p1" });
    renderWithTree(<ForestSidebar />);

    await screen.findByText("森林二");
    await user.click(projectRow("森林二"));

    // The highlight moves and SWITCH_PROJECT persists activeProjectId = p2.
    expect(rowStyle(projectRow("森林二"))).toContain("var(--accent-sage)");
    expect(rowStyle(projectRow("森林一"))).not.toContain("var(--accent-sage)");
    await waitFor(() => {
      expect(readWorkspace().activeProjectId).toBe("p2");
    });
  });

  test("Seed prompts for a name and creates a new active project", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("  新树  ");
    seedWorkspace([testProject({ id: "p1", name: "森林一" })]);
    renderWithTree(<ForestSidebar />);

    await screen.findByText("森林一");
    await user.click(screen.getByRole("button", { name: /Seed/ }));

    // Default name suggestion counts existing projects (1 project -> 探索 2).
    expect(promptSpy).toHaveBeenCalledWith("为新项目命名（森林中的一棵新树）", "探索 2");
    // The trimmed name renders and the new project is highlighted as active.
    expect(await screen.findByText("新树")).toBeInTheDocument();
    expect(rowStyle(projectRow("新树"))).toContain("var(--accent-sage)");
    const names = Object.values(readWorkspace().projects).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(["森林一", "新树"]));
  });

  test("cancelling the Seed prompt creates nothing", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "prompt").mockReturnValue(null);
    seedWorkspace([testProject({ id: "p1", name: "森林一" })]);
    renderWithTree(<ForestSidebar />);

    await screen.findByText("森林一");
    await user.click(screen.getByRole("button", { name: /Seed/ }));

    expect(Object.keys(readWorkspace().projects)).toEqual(["p1"]);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  test("context menu rename prompts with the current name and renames", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("森林一·改");
    seedWorkspace([
      testProject({ id: "p1", name: "森林一" }),
      testProject({ id: "p2", name: "森林二" }),
    ]);
    renderWithTree(<ForestSidebar />);

    await screen.findByText("森林一");
    // The only button inside the row before the menu opens is the "more" trigger.
    await user.click(within(projectRow("森林一")).getByRole("button"));
    await user.click(screen.getByRole("button", { name: "重命名" }));

    expect(promptSpy).toHaveBeenCalledWith("重命名项目", "森林一");
    expect(await screen.findByText("森林一·改")).toBeInTheDocument();
    expect(screen.queryByText("森林一")).not.toBeInTheDocument();
    expect(readWorkspace().projects.p1.name).toBe("森林一·改");
  });

  test("context menu delete removes the project after confirm", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    seedWorkspace(
      [testProject({ id: "p1", name: "森林一" }), testProject({ id: "p2", name: "森林二" })],
      { activeProjectId: "p1" },
    );
    renderWithTree(<ForestSidebar />);

    await screen.findByText("森林二");
    await user.click(within(projectRow("森林二")).getByRole("button"));
    await user.click(screen.getByRole("button", { name: "删除" }));

    expect(confirmSpy).toHaveBeenCalledWith("确定要删除项目「森林二」吗？此操作不可撤销。");
    expect(screen.queryByText("森林二")).not.toBeInTheDocument();
    expect(Object.keys(readWorkspace().projects)).toEqual(["p1"]);
  });

  test("dismissing the delete confirm keeps the project", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    seedWorkspace([
      testProject({ id: "p1", name: "森林一" }),
      testProject({ id: "p2", name: "森林二" }),
    ]);
    renderWithTree(<ForestSidebar />);

    await screen.findByText("森林二");
    await user.click(within(projectRow("森林二")).getByRole("button"));
    await user.click(screen.getByRole("button", { name: "删除" }));

    expect(screen.getByText("森林二")).toBeInTheDocument();
    expect(Object.keys(readWorkspace().projects)).toEqual(["p1", "p2"]);
  });

  test("dragging the resize handle changes the width, clamped to 180-400px", async () => {
    seedWorkspace([testProject({ id: "p1", name: "森林一" })]);
    const { container } = renderWithTree(<ForestSidebar />);
    await screen.findByText("森林一");

    const aside = screen.getByRole("complementary");
    const handle = container.querySelector(".cursor-col-resize");
    if (!(handle instanceof HTMLElement)) throw new Error("resize handle not found");

    expect(aside).toHaveStyle({ width: "220px" });

    fireEvent.mouseDown(handle);
    fireEvent.mouseMove(window, { clientX: 320 });
    expect(aside).toHaveStyle({ width: "320px" });

    // Below the minimum clamps to 180.
    fireEvent.mouseMove(window, { clientX: 40 });
    expect(aside).toHaveStyle({ width: "180px" });

    // Beyond the maximum clamps to 400.
    fireEvent.mouseMove(window, { clientX: 900 });
    expect(aside).toHaveStyle({ width: "400px" });
  });

  test("mouseup ends the resize drag", async () => {
    seedWorkspace([testProject({ id: "p1", name: "森林一" })]);
    const { container } = renderWithTree(<ForestSidebar />);
    await screen.findByText("森林一");

    const aside = screen.getByRole("complementary");
    const handle = container.querySelector(".cursor-col-resize");
    if (!(handle instanceof HTMLElement)) throw new Error("resize handle not found");

    fireEvent.mouseDown(handle);
    fireEvent.mouseMove(window, { clientX: 300 });
    expect(aside).toHaveStyle({ width: "300px" });

    fireEvent.mouseUp(window);
    fireEvent.mouseMove(window, { clientX: 250 });
    expect(aside).toHaveStyle({ width: "300px" });
  });
});
