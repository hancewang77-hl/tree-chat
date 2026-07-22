export type ContextState = "valid" | "missing" | "stale";

export type NodeRole = "answer" | "task-group" | "task";

export type AuxoNutrientChunk = {
  nutrientId: string;
  nutrientName: string;
  chunkId: string;
  offset: number;
  text: string;
};

export type AuxoRequest = {
  rootTask: string;
  nutrientChunks: AuxoNutrientChunk[];
  sourceUnits: AuxoSourceUnit[];
};

export type AuxoSourceReference =
  | {
      kind: "root";
      unitId: string;
      exactQuote: string;
      offset: number;
      order: number;
    }
  | {
      kind: "nutrient";
      unitId: string;
      nutrientId: string;
      nutrientName: string;
      exactQuote: string;
      offset: number;
      order: number;
    };

export type AuxoSourceUnit =
  | {
      unitId: string;
      kind: "root";
      text: string;
      offset: number;
      order: number;
    }
  | {
      unitId: string;
      kind: "nutrient";
      nutrientId: string;
      nutrientName: string;
      text: string;
      offset: number;
      order: number;
    };

export type AuxoPlanNode = {
  planId: string;
  parentPlanId: "root" | string;
  nodeRole: "task-group" | "task";
  title: string;
  order: number;
  sourceUnitId?: string;
  source?: AuxoSourceReference;
};

export type AuxoPlan = {
  version: 1;
  generatedAt: number;
  model: string;
  nodes: AuxoPlanNode[];
};

export type AuxoGenerationManifest = {
  version: 1;
  generationId: string;
  generatedAt: number;
  model: string;
  rootNodeId: string;
  nodeCount: number;
  inputFingerprint: string;
  nutrientChunks: Array<{
    nutrientId: string;
    nutrientName: string;
    chunkId: string;
  }>;
};

export type SemanticCard = {
  version: 1;
  generatedAt: number;
  model: string;
  facts: string[];
  constraints: string[];
  assumptions: string[];
  decisions: string[];
  rejected: string[];
  openQuestions: string[];
};

export type ContextManifest = {
  compilerVersion: 1;
  compiledAt: number;
  model: string;
  selectedNodeId: string;
  parentNodeId: string;
  includedNodeIds: string[];
  excludedNodeIds: Array<{
    nodeId: string;
    reason: "leaf" | "missing" | "stale" | "failed" | "incomplete" | "duplicate" | "budget";
  }>;
  nutrientChunks: Array<{
    nutrientId: string;
    nutrientName: string;
    chunkId: string;
  }>;
  warnings: string[];
};

export type MindNode = {
  id: string;
  kind: "root" | "branch" | "leaf";
  prompt: string;
  response: string;
  status?: "complete" | "streaming" | "stopped" | "failed";
  error?: string;
  children: string[];
  parentId: string | null;
  timestamp: number;
  offsetX?: number;
  offsetY?: number;
  layer: number;
  nutrientRefs?: string[];
  contextState: ContextState;
  semanticCard?: SemanticCard;
  contextManifest?: ContextManifest;
  includeInContext?: boolean;
  nodeRole?: NodeRole;
  taskDescription?: string;
  auxoGenerationId?: string;
  auxoSource?: AuxoSourceReference;
  auxoManifest?: AuxoGenerationManifest;
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
  nodeUndoable?: boolean;
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
  | {
      type: "BRANCH";
      prompt: string;
      response: string;
      parentId: string;
      nutrientRefs?: string[];
      contextManifest?: ContextManifest;
    }
  | {
      type: "STREAM_BRANCH_START";
      projectId: string;
      nodeId: string;
      prompt: string;
      parentId: string;
      nutrientRefs?: string[];
      contextManifest: ContextManifest;
    }
  | {
      type: "STREAM_BRANCH_UPDATE";
      projectId: string;
      nodeId: string;
      response: string;
    }
  | {
      type: "STREAM_BRANCH_FINISH";
      projectId: string;
      nodeId: string;
      status: "complete" | "stopped";
    }
  | {
      type: "STREAM_BRANCH_FAIL";
      projectId: string;
      nodeId: string;
      error: string;
    }
  | {
      type: "SET_NODE_SEMANTICS";
      projectId: string;
      nodeId: string;
      expectedParentId: string;
      semanticCard: SemanticCard;
    }
  | { type: "LEAF"; content: string; parentId: string }
  | { type: "TOGGLE_LEAF_CONTEXT"; nodeId: string }
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
  | {
      type: "APPLY_AUXO_PLAN";
      projectId: string;
      rootNodeId: string;
      generationId: string;
      inputFingerprint: string;
      nutrientRefs: string[];
      plan: AuxoPlan;
    }
  | { type: "ADD_NUTRIENTS"; projectId: string; nutrients: NutrientItem[] }
  | { type: "REMOVE_NUTRIENT"; nutrientId: string }
  | { type: "TOGGLE_NUTRIENT_ACTIVE"; nutrientId: string };
