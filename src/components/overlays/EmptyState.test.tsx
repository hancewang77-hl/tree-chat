import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TreeProvider, useTreeState } from "@/src/state/TreeContext";
import type { StoredWorkspace } from "@/src/lib/storage";
import { EmptyState } from "./EmptyState";

/** Makes the SEED result observable: shows the active project name, if any. */
function ActiveProjectProbe() {
  const state = useTreeState();
  const active = state.projects[state.activeProjectId];
  return <div data-testid="active-project">{active ? active.name : "(none)"}</div>;
}

function renderEmptyState() {
  return render(
    <TreeProvider>
      <EmptyState />
      <ActiveProjectProbe />
    </TreeProvider>,
  );
}

function stubPrompt(result: string | null) {
  const promptMock = vi.fn<(message?: string, defaultValue?: string) => string | null>(
    () => result,
  );
  vi.stubGlobal("prompt", promptMock);
  return promptMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EmptyState", () => {
  test("renders the onboarding copy", () => {
    renderEmptyState();

    expect(
      screen.getByRole("heading", { level: 1, name: "智构树语" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/一棵树从一个种子开始/)).toBeInTheDocument();
    expect(
      screen.getByText("也可以从左侧森林面板导入已有项目"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Seed · 播种" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("active-project")).toHaveTextContent("(none)");
  });

  test("Seed button prompts for a name and seeds a project with the trimmed name", async () => {
    const user = userEvent.setup();
    const promptMock = stubPrompt("  我的第一棵树  ");
    renderEmptyState();

    await user.click(screen.getByRole("button", { name: "Seed · 播种" }));

    expect(promptMock).toHaveBeenCalledWith("为你的第一棵树命名", "我的思维之树");
    expect(screen.getByTestId("active-project")).toHaveTextContent("我的第一棵树");

    // SEED persists the new workspace.
    const workspace = JSON.parse(
      localStorage.getItem("tree-chat-projects") ?? "{}",
    ) as StoredWorkspace;
    const project = workspace.projects[workspace.activeProjectId ?? ""];
    expect(project.name).toBe("我的第一棵树");
  });

  test("cancelling the prompt seeds nothing", async () => {
    const user = userEvent.setup();
    stubPrompt(null);
    renderEmptyState();

    await user.click(screen.getByRole("button", { name: "Seed · 播种" }));

    expect(screen.getByTestId("active-project")).toHaveTextContent("(none)");
    expect(localStorage.getItem("tree-chat-projects")).toBeNull();
  });

  test("a whitespace-only name seeds nothing", async () => {
    const user = userEvent.setup();
    stubPrompt("   ");
    renderEmptyState();

    await user.click(screen.getByRole("button", { name: "Seed · 播种" }));

    expect(screen.getByTestId("active-project")).toHaveTextContent("(none)");
    expect(localStorage.getItem("tree-chat-projects")).toBeNull();
  });
});
