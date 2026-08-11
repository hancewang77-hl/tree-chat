import { afterEach, describe, expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppHeader } from "./AppHeader";
import { renderWithTree, seedWorkspace } from "@/src/test/harness/renderWithTree";
import { testProject } from "@/src/test/fixtures/tree";

/** Raw inline style — active toolbar buttons are painted with the sage accent. */
function styleOf(el: HTMLElement): string {
  return el.getAttribute("style") ?? "";
}

afterEach(() => {
  // ThemeToggle mutates the shared <html> element; keep tests isolated.
  document.documentElement.removeAttribute("data-theme");
});

describe("AppHeader", () => {
  test("renders the app title and the active project name", async () => {
    seedWorkspace([testProject({ id: "p1", name: "晨间探索" })]);
    renderWithTree(<AppHeader />);

    expect(screen.getByText("智构树语")).toBeInTheDocument();
    expect(await screen.findByText("晨间探索")).toBeInTheDocument();
  });

  test("omits the project name when no project exists", () => {
    renderWithTree(<AppHeader />);

    expect(screen.getByText("智构树语")).toBeInTheDocument();
    expect(screen.queryByText("晨间探索")).not.toBeInTheDocument();
  });

  test("search button fires a search-toggle window event", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    window.addEventListener("search-toggle", spy);
    try {
      renderWithTree(<AppHeader />);

      await user.click(screen.getByRole("button", { name: /搜索节点/ }));

      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("search-toggle", spy);
    }
  });

  test("keeps the workbench on the product's 2D tree view", () => {
    renderWithTree(<AppHeader />);
    expect(screen.queryByRole("button", { name: "3D 模式" })).not.toBeInTheDocument();
  });

  test("Canopy button toggles its active highlight", async () => {
    const user = userEvent.setup();
    renderWithTree(<AppHeader />);

    const canopy = screen.getByTitle("树冠 — 全局视图");
    expect(styleOf(canopy)).toContain("var(--accent-olive-soft)");
    expect(styleOf(canopy)).not.toContain("var(--accent-sage)");

    await user.click(canopy);
    expect(styleOf(canopy)).toContain("var(--accent-sage)");

    await user.click(canopy);
    expect(styleOf(canopy)).not.toContain("var(--accent-sage)");
  });

  test("Rings button opens the global rings panel state", async () => {
    const user = userEvent.setup();
    renderWithTree(<AppHeader />);

    const rings = screen.getByTitle("年轮 — 操作历史");
    expect(styleOf(rings)).not.toContain("var(--accent-sage)");

    await user.click(rings);
    expect(styleOf(rings)).toContain("var(--accent-sage)");

    // OPEN_GLOBAL_RINGS opens (it does not toggle): a second click keeps it open.
    await user.click(rings);
    expect(styleOf(rings)).toContain("var(--accent-sage)");
  });

  test("theme toggle flips data-theme on <html> and persists to localStorage", async () => {
    const user = userEvent.setup();
    renderWithTree(<AppHeader />);

    expect(document.documentElement).not.toHaveAttribute("data-theme");

    await user.click(screen.getByTitle("深色模式"));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem("theme")).toBe("dark");

    // The button relabels for the return trip and undoes the dark theme.
    await user.click(screen.getByTitle("浅色模式"));
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(localStorage.getItem("theme")).toBe("light");
  });

  test("icon controls expose names and toggle state to assistive technology", async () => {
    const user = userEvent.setup();
    renderWithTree(<AppHeader />);

    const canopy = screen.getByRole("button", { name: "树冠 — 全局视图" });
    const rings = screen.getByRole("button", { name: "年轮 — 操作历史" });

    expect(canopy).toHaveAttribute("aria-pressed", "false");
    expect(rings).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "收获 — 导出项目" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "帮助 — 功能指南" })).toBeInTheDocument();
    const darkMode = screen.getByRole("button", { name: "深色模式" });
    expect(darkMode).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(darkMode);
    expect(screen.getByRole("button", { name: "深色模式" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(canopy);
    expect(canopy).toHaveAttribute("aria-pressed", "true");
  });
});
