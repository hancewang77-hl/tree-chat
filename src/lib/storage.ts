import type { Project, TreeState } from "@/src/types/tree";

// Single localStorage key for the whole workspace. v1 stored the bare
// projects map; v2 wraps it in StoredWorkspace.
const STORAGE_KEY = "tree-chat-projects";
// Stamped on every save. Loading is shape-based, not version-based: this value
// is written but never read back (see loadWorkspace).
export const CURRENT_WORKSPACE_SCHEMA_VERSION = 2;

/**
 * Persisted subset of TreeState. Rings history and all other view state are
 * deliberately session-only. Node-level defaults for legacy data are filled in
 * by the reducer's normalization on load, never rewritten in storage.
 */
export type StoredWorkspace = {
  schemaVersion?: number;
  projects: Record<string, Project>;
  activeProjectId?: string;
  selectedNodeId?: string;
  selectedLayer?: number;
  planeNames?: Record<number, string>;
};

/**
 * Loads the raw stored workspace. A bare projects map (v1) is wrapped as-is;
 * any parse or shape failure yields an empty workspace — this never throws.
 */
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

/**
 * Persists projects plus lightweight selection/plane view state. Storage
 * failures (quota, unavailable) are swallowed: persistence is best-effort.
 */
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
