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

  test("2D/3D button toggles the view mode label", async () => {
    const user = userEvent.setup();
    renderWithTree(<AppHeader />);

    // Hydrated view state always starts in 2D.
    const toggle = screen.getByTitle("切换至 3D");
    expect(toggle).toHaveTextContent("2D");

    await user.click(toggle);
    expect(screen.getByTitle("切换至 2D")).toHaveTextContent("3D");

    await user.click(screen.getByTitle("切换至 2D"));
    expect(screen.getByTitle("切换至 3D")).toHaveTextContent("2D");
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
});
