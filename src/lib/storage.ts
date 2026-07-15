import type { Project, TreeState } from "@/src/types/tree";

const STORAGE_KEY = "tree-chat-projects";
export const CURRENT_WORKSPACE_SCHEMA_VERSION = 2;

export type StoredWorkspace = {
  schemaVersion?: number;
  projects: Record<string, Project>;
  activeProjectId?: string;
  selectedNodeId?: string;
  selectedLayer?: number;
  planeNames?: Record<number, string>;
};

export function loadWorkspace(): StoredWorkspace {
  if (typeof window === "undefined") return { projects: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { projects: {} };
    const parsed = JSON.parse(raw) as unknown;

    if (
      parsed &&
      typeof parsed === "object" &&
      "projects" in parsed &&
      typeof parsed.projects === "object" &&
      parsed.projects !== null
    ) {
      return parsed as StoredWorkspace;
    }

    if (parsed && typeof parsed === "object") {
      return { projects: parsed as Record<string, Project> };
    }

    return { projects: {} };
  } catch {
    return { projects: {} };
  }
}

export function saveWorkspace(state: TreeState) {
  if (typeof window === "undefined") return;
  try {
    const workspace: StoredWorkspace = {
      schemaVersion: CURRENT_WORKSPACE_SCHEMA_VERSION,
      projects: state.projects,
      activeProjectId: state.activeProjectId,
      selectedNodeId: state.selectedNodeId,
      selectedLayer: state.selectedLayer,
      planeNames: state.planeNames,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  } catch {
    // storage full or unavailable — silently ignore
  }
}
