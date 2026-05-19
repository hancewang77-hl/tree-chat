export type MindNode = {
  id: string;
  kind: "root" | "branch" | "leaf";
  prompt: string;
  response: string;
  children: string[];
  parentId: string | null;
  timestamp: number;
  offsetX?: number;
  offsetY?: number;
  layer: number;
  nutrientRefs?: string[];
};

export type NodesMap = Record<string, MindNode>;

export type NutrientItem = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "text" | "document" | "image" | "unknown";
  createdAt: number;
  extractionStatus: "ready" | "unsupported" | "failed" | "extracting";
  extractedText: string;
  excerpt: string;
  extractedCharCount: number;
  blobKey?: string;
};

export type ToolMode = "view" | "node" | "layerMove" | "graft";

export type Project = {
  id: string;
  name: string;
  rootNodeId: string;
  nodes: NodesMap;
  nutrients: Record<string, NutrientItem>;
  activeNutrientIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type NodeHistoryChange = {
  nodeId: string;
  before: MindNode | null;
  after: MindNode | null;
};

export type ProjectHistoryChange = {
  projectId: string;
  before: Project | null;
  after: Project | null;
};

export type HistoryPatch = {
  nodeChanges?: NodeHistoryChange[];
  projectChanges?: ProjectHistoryChange[];
};

export type HistoryEntry = {
  id: string;
  projectId: string;
  label: string;
  timestamp: number;
  primaryNodeId: string;
  affectedNodeIds: string[];
  patch: HistoryPatch;
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
  ringsMode: "global" | "node";
  ringsFocusNodeId: string | null;
  history: { past: HistoryEntry[]; future: HistoryEntry[] };
};

export type TreeAction =
  | { type: "HYDRATE"; state: TreeState }
  | { type: "SEED"; name: string }
  | { type: "BRANCH"; prompt: string; response: string; parentId: string; nutrientRefs?: string[] }
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
  | { type: "OPEN_GLOBAL_RINGS" }
  | { type: "OPEN_NODE_RINGS"; nodeId: string }
  | { type: "CLOSE_RINGS" }
  | { type: "SWITCH_PROJECT"; projectId: string }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "UNDO_NODE"; nodeId: string }
  | { type: "REDO_NODE"; nodeId: string }
  | { type: "SET_ZOOM"; zoom2D?: number; zoom3D?: number }
  | { type: "RENAME_PLANE"; layer: number; name: string }
  | { type: "SET_NODE_OFFSET"; nodeId: string; offsetX: number; offsetY: number }
  | { type: "RENAME_PROJECT"; projectId: string; name: string }
  | { type: "DELETE_PROJECT"; projectId: string }
  | { type: "ADD_NUTRIENTS"; nutrients: NutrientItem[] }
  | { type: "REMOVE_NUTRIENT"; nutrientId: string }
  | { type: "TOGGLE_NUTRIENT_ACTIVE"; nutrientId: string };
