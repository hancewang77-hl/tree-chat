export type MindNode = {
  id: string;
  prompt: string;
  response: string;
  children: string[];
  parentId: string | null;
  timestamp: number;
  offsetX?: number;
  offsetY?: number;
  layer: number;
};

export type NodesMap = Record<string, MindNode>;

export type ToolMode = "view" | "node" | "layerMove" | "graft";

export type Project = {
  id: string;
  name: string;
  rootNodeId: string;
  nodes: NodesMap;
  createdAt: number;
  updatedAt: number;
};

export type Snapshot = {
  projects: Record<string, Project>;
  activeProjectId: string;
};

export type TreeState = {
  projects: Record<string, Project>;
  activeProjectId: string;
  selectedNodeId: string;
  selectedLayer: number;
  is3DMode: boolean;
  toolMode: ToolMode;
  movingNodeId: string | null;
  pendingNodeLayer: number | null;
  graftSourceId: string | null;
  zoom2D: number;
  zoom3D: number;
  planeNames: Record<number, string>;
  isCanopyOpen: boolean;
  isRingsOpen: boolean;
  history: { past: Snapshot[]; future: Snapshot[] };
};

export type TreeAction =
  | { type: "HYDRATE"; state: TreeState }
  | { type: "SEED"; name: string }
  | { type: "BRANCH"; prompt: string; response: string; parentId: string }
  | { type: "LEAF"; content: string; parentId: string }
  | { type: "GRAFT_START"; nodeId: string }
  | { type: "GRAFT_CONFIRM"; newParentId: string }
  | { type: "GRAFT_CANCEL" }
  | { type: "PRUNE"; nodeId: string }
  | { type: "SUNLIGHT"; nodeId: string }
  | { type: "SELECT_NODE"; nodeId: string }
  | { type: "SET_LAYER"; layer: number }
  | { type: "TOGGLE_3D" }
  | { type: "TOGGLE_CANOPY" }
  | { type: "TOGGLE_RINGS" }
  | { type: "SWITCH_PROJECT"; projectId: string }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "SET_ZOOM"; zoom2D?: number; zoom3D?: number }
  | { type: "RENAME_PLANE"; layer: number; name: string }
  | { type: "SET_NODE_OFFSET"; nodeId: string; offsetX: number; offsetY: number }
  | { type: "RENAME_PROJECT"; projectId: string; name: string }
  | { type: "DELETE_PROJECT"; projectId: string };
