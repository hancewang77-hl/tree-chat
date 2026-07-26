// ---------------------------------------------------------------------------
// Shared node vocabulary
// ---------------------------------------------------------------------------

/**
 * Whether a node's semantic card may be compiled into model context:
 * "valid" — usable card (or immutable source: root / Auxo tasks);
 * "missing" — no usable card yet (extraction pending, failed, or leaf note);
 * "stale" — card predates a topology change (graft) and is excluded.
 */
export type ContextState = "valid" | "missing" | "stale";

/**
 * Branch-only role: "answer" for AI answers, "task"/"task-group" for
 * Auxo-generated immutable task nodes.
 */
export type NodeRole = "answer" | "task-group" | "task";

// ---------------------------------------------------------------------------
// Auxo planning — request input, provenance, plan, applied manifest
// ---------------------------------------------------------------------------

/** One contiguous lossless slice of a nutrient's Markdown, with its offset. */
export type AuxoNutrientChunk = {
  nutrientId: string;
  nutrientName: string;
  chunkId: string;
  offset: number;
  text: string;
};

/** Compiled Auxo input: root task + enabled nutrient chunks + source units. */
export type AuxoRequest = {
  rootTask: string;
  nutrientChunks: AuxoNutrientChunk[];
  sourceUnits: AuxoSourceUnit[];
};

/** Provenance of a plan node: the exact quote it was derived from. */
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

/** A numbered question extracted from the root task or a nutrient. */
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

/** One planned node; parentPlanId "root" attaches under the tree root. */
export type AuxoPlanNode = {
  planId: string;
  parentPlanId: "root" | string;
  nodeRole: "task-group" | "task";
  title: string;
  order: number;
  sourceUnitId?: string;
  source?: AuxoSourceReference;
};

/** Validated planner output, applied atomically by APPLY_AUXO_PLAN. */
export type AuxoPlan = {
  version: 1;
  generatedAt: number;
  model: string;
  nodes: AuxoPlanNode[];
};

/**
 * Record of an applied Auxo generation, stored on the root node only. The
 * inputFingerprint ties the generation to the exact compiled input it was
 * planned against.
 */
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

// ---------------------------------------------------------------------------
// Derived context data — semantic cards & compiled-context manifests
// ---------------------------------------------------------------------------

/**
 * Compact structured summary of a completed answer. Subsequent requests send
 * valid cards instead of replaying full responses. Derived data: updating a
 * card records no Rings entry, but its latest value is synchronized into
 * existing history snapshots (see treeReducer).
 */
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

/**
 * Audit record of what the context compiler included/excluded when the node's
 * prompt was sent. Stored on the node for inspection; never sent to the model.
 */
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

// ---------------------------------------------------------------------------
// Nodes & projects (persisted with the workspace)
// ---------------------------------------------------------------------------

/**
 * A single tree node. Every field is persisted with its project; on load,
 * legacy nodes are normalized (status "streaming" becomes "stopped", missing
 * semantic fields are filled in — see treeReducer's normalizeNode).
 */
export type MindNode = {
  id: string;
  kind: "root" | "branch" | "leaf";
  /** User question (branch), note text (leaf), or project task (root). */
  prompt: string;
  /** Full AI answer — source of truth for display/export. Empty for leaves. */
  response: string;
  status?: "complete" | "streaming" | "stopped" | "failed";
  error?: string;
  children: string[];
  parentId: string | null;
  timestamp: number;
  /** Manual drag offsets applied on top of the D3 layout position. */
  offsetX?: number;
  offsetY?: number;
  layer: number;
  /** Nutrient IDs enabled when this node was created (generation snapshot). */
  nutrientRefs?: string[];
  contextState: ContextState;
  semanticCard?: SemanticCard;
  contextManifest?: ContextManifest;
  /** Leaf only. Notes are excluded from compiled context unless enabled. */
  includeInContext?: boolean;
  /** Branch only; absent means "answer" for legacy nodes. */
  nodeRole?: NodeRole;
  /** Auxo task/task-group only. */
  taskDescription?: string;
  auxoGenerationId?: string;
  auxoSource?: AuxoSourceReference;
  /** Root only: manifest of the Auxo generation applied to this tree. */
  auxoManifest?: AuxoGenerationManifest;
};

export type NodesMap = Record<string, MindNode>;

/**
 * A user-provided local file converted to Markdown in the browser. Extracted
 * text is persisted with the project; original binaries live in IndexedDB
 * under blobKey.
 */
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

// ---------------------------------------------------------------------------
// Rings history (session-only — never persisted)
// ---------------------------------------------------------------------------

/** Full before/after snapshots of one node; null marks creation/deletion. */
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
  /** Every node this entry touched; drives node-scoped Rings lookup. */
  affectedNodeIds: string[];
  /** false marks an atomic batch (Auxo) that blocks node-level undo/redo. */
  nodeUndoable?: boolean;
  patch: HistoryPatch;
};

// ---------------------------------------------------------------------------
// Workspace state & actions
// ---------------------------------------------------------------------------

/**
 * Full runtime state. Only projects, activeProjectId, selectedNodeId,
 * selectedLayer and planeNames are persisted (see src/lib/storage.ts); every
 * other field — including history — is view/session state that resets on
 * reload.
 */
export type TreeState = {
  projects: Record<string, Project>;
  activeProjectId: string;
  selectedNodeId: string;
  selectedLayer: number;
  is3DMode: boolean;
  toolMode: ToolMode;
  /** Node armed for a cross-layer move (layerMove tool mode). */
  movingNodeId: string | null;
  /** Move target: tracks the viewed layer while a move is armed. */
  pendingNodeLayer: number | null;
  /** First click of the two-click graft flow. */
  graftSourceId: string | null;
  zoom2D: number;
  zoom3D: number;
  planeNames: Record<number, string>;
  isCanopyOpen: boolean;
  isRingsOpen: boolean;
  ringsMode: "global" | "node";
  ringsFocusNodeId: string | null;
  /** Max 50 entries; capped in treeReducer. */
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
  | { type: "LAYER_MOVE_START"; nodeId: string }
  | { type: "LAYER_MOVE_CONFIRM" }
  | { type: "LAYER_MOVE_CANCEL" }
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
