import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { TreeProvider } from "@/src/state/TreeContext";
import type { Project, TreeState } from "@/src/types/tree";
import { testProject } from "@/src/test/fixtures/tree";

/**
 * Seeds localStorage so TreeProvider hydrates a known workspace on mount,
 * then renders `ui` inside the real provider. Because hydration runs in a
 * mount effect, the first committed render is the empty state; tests should
 * assert after the effect flushes (findBy*, or a state-dependent query).
 */
export function seedWorkspace(
  projects: Project[],
  extra: Partial<Pick<TreeState, "selectedNodeId" | "selectedLayer" | "planeNames" | "activeProjectId">> = {},
) {
  const projectMap: Record<string, Project> = {};
  for (const p of projects) projectMap[p.id] = p;
  const activeProjectId = extra.activeProjectId ?? projects[0]?.id ?? "project";
  const workspace = {
    schemaVersion: 2,
    projects: projectMap,
    activeProjectId,
    selectedNodeId: extra.selectedNodeId ?? projectMap[activeProjectId]?.rootNodeId ?? "root",
    selectedLayer: extra.selectedLayer ?? 0,
    planeNames: extra.planeNames ?? { 0: "根节点层" },
  };
  localStorage.setItem("tree-chat-projects", JSON.stringify(workspace));
}

export function renderWithTree(ui: ReactElement) {
  return render(<TreeProvider>{ui}</TreeProvider>);
}

/** Convenience: a single-project workspace seeded and rendered. */
export function renderWithProject(
  ui: ReactElement,
  project: Project = testProject(),
  extra?: Parameters<typeof seedWorkspace>[1],
) {
  seedWorkspace([project], extra);
  return renderWithTree(ui);
}
