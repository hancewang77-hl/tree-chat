import type {
  HistoryEntry,
  HistoryPatch,
  TreeState,
  TreeAction,
  Project,
  MindNode,
  NodesMap,
} from "@/src/types/tree";
import { loadWorkspace, saveWorkspace } from "@/src/lib/storage";
import {
  createRootSemanticCard,
  isUsableSemanticCard,
} from "@/src/lib/semanticCard";
import { compileAuxoInput, validateAuxoPlan } from "@/src/lib/auxo";

const MAX_HISTORY = 50;

// ---------------------------------------------------------------------------
// Node / project construction & normalization
// ---------------------------------------------------------------------------

function makeRootNode(prompt: string): MindNode {
  const timestamp = Date.now();
  return {
    id: "root",
    kind: "root",
    prompt,
    response: "这是你思维之树的根。从这里开始，提出一个问题，AI 会帮助你展开枝叶。每一个节点都可以继续生长出新的分支。试着在下方输入你的第一个问题，让这棵树开始生长吧。",
    children: [],
    parentId: null,
    timestamp,
    offsetX: 0,
    offsetY: 0,
    layer: 0,
    nutrientRefs: [],
    status: "complete",
    contextState: "valid",
    semanticCard: createRootSemanticCard(prompt, timestamp),
  };
}

function createProject(name: string): Project {
  const id = crypto.randomUUID();
  const rootNode = makeRootNode(name);
  return {
    id,
    name,
    rootNodeId: rootNode.id,
    nodes: { [rootNode.id]: rootNode },
    nutrients: {},
    activeNutrientIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Fills in every semantic field a legacy (pre-schema-v2) node may lack while
 * preserving unknown extra fields. Invariants enforced here:
 * - a node stored mid-stream reloads as "stopped", never "streaming";
 * - Auxo task / task-group nodes are always context-"valid" (immutable source);
 * - a non-root node without a usable semantic card is "missing" unless it was
 *   explicitly marked "stale";
 * - includeInContext exists only on leaf nodes and defaults to false.
 */
function normalizeNode(node: MindNode, rootNodeId: string): MindNode {
  const prompt = typeof node.prompt === "string" ? node.prompt : "";
  const response = typeof node.response === "string" ? node.response : "";
  const timestamp = typeof node.timestamp === "number" ? node.timestamp : Date.now();
  const kind =
    node.kind ??
    (node.id === rootNodeId || node.parentId === null
      ? "root"
      : response.trim().length === 0
        ? "leaf"
        : "branch");
  const status = node.status === "streaming" ? "stopped" : (node.status ?? "complete");
  const nodeRole =
    kind === "branch" &&
    (node.nodeRole === "task" || node.nodeRole === "task-group" || node.nodeRole === "answer")
      ? node.nodeRole
      : kind === "branch"
        ? "answer"
        : undefined;
  const isAuxoTask = nodeRole === "task" || nodeRole === "task-group";
  const semanticCard = isUsableSemanticCard(node.semanticCard)
    ? node.semanticCard
    : kind === "root"
      ? createRootSemanticCard(prompt, timestamp)
      : undefined;
  const contextState =
    kind === "root"
      ? "valid"
      : isAuxoTask
        ? "valid"
      : node.contextState === "stale"
        ? "stale"
        : node.contextState === "missing"
          ? "missing"
          : semanticCard
            ? "valid"
            : "missing";
  return {
    ...node,
    prompt,
    response,
    timestamp,
    kind,
    children: Array.isArray(node.children)
      ? node.children.filter((childId): childId is string => typeof childId === "string")
      : [],
    nutrientRefs: node.nutrientRefs ?? [],
    status,
    nodeRole,
    taskDescription:
      isAuxoTask && typeof node.taskDescription === "string"
        ? node.taskDescription.trim()
        : undefined,
    contextState,
    semanticCard,
    includeInContext: kind === "leaf" ? Boolean(node.includeInContext) : undefined,
  };
}

function normalizeProject(project: Project): Project {
  const rootNodeId = project.rootNodeId ?? "root";
  const nodes = Object.fromEntries(
    Object.entries(project.nodes ?? {}).map(([id, node]) => [
      id,
      normalizeNode(node, rootNodeId),
    ]),
  ) as NodesMap;

  return {
    ...project,
    rootNodeId,
    nodes,
    nutrients: project.nutrients ?? {},
    activeNutrientIds: project.activeNutrientIds ?? [],
  };
}

function normalizeProjects(projects: Record<string, Project>): Record<string, Project> {
  return Object.fromEntries(
    Object.entries(projects).map(([id, project]) => [id, normalizeProject(project)]),
  );
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const EMPTY_STATE: TreeState = {
  projects: {},
  activeProjectId: "",
  selectedNodeId: "",
  selectedLayer: 0,
  is3DMode: false,
  toolMode: "view",
  movingNodeId: null,
  pendingNodeLayer: null,
  graftSourceId: null,
  zoom2D: 105,
  zoom3D: 1,
  planeNames: { 0: "根节点层" },
  isCanopyOpen: false,
  isRingsOpen: false,
  ringsMode: "global",
  ringsFocusNodeId: null,
  history: { past: [], future: [] },
};

export function initialState(): TreeState {
  return EMPTY_STATE;
}

/**
 * Loads and normalizes the persisted workspace. Only projects, selection and
 * plane names survive a reload; every view field (3D mode, zoom, open panels)
 * and the Rings history always restart from their defaults.
 */
export function loadInitialState(): TreeState {
  const workspace = loadWorkspace();
  const projects = normalizeProjects(workspace.projects);
  const projectIds = Object.keys(projects);

  if (projectIds.length > 0) {
    const activeProjectId =
      workspace.activeProjectId && projects[workspace.activeProjectId]
        ? workspace.activeProjectId
        : projectIds[0];
    const project = projects[activeProjectId];
    const selectedNodeId =
      workspace.selectedNodeId && project.nodes[workspace.selectedNodeId]
        ? workspace.selectedNodeId
        : project.rootNodeId;
    return {
      projects,
      activeProjectId,
      selectedNodeId,
      selectedLayer: workspace.selectedLayer ?? project.nodes[selectedNodeId]?.layer ?? 0,
      is3DMode: false,
      toolMode: "view",
      movingNodeId: null,
      pendingNodeLayer: null,
      graftSourceId: null,
      zoom2D: 105,
      zoom3D: 1,
      planeNames: workspace.planeNames ?? { 0: "根节点层" },
      isCanopyOpen: false,
      isRingsOpen: false,
      ringsMode: "global",
      ringsFocusNodeId: null,
      history: { past: [], future: [] },
    };
  }

  return EMPTY_STATE;
}

// ---------------------------------------------------------------------------
// State access & update helpers
// ---------------------------------------------------------------------------

function getActiveProject(state: TreeState): Project | undefined {
  return state.projects[state.activeProjectId];
}

function getActiveNodes(state: TreeState): NodesMap {
  return getActiveProject(state)?.nodes ?? {};
}

function updateProjectById(
  state: TreeState,
  projectId: string,
  updater: (project: Project) => Project,
): TreeState {
  const project = state.projects[projectId];
  if (!project) return state;
  return {
    ...state,
    projects: {
      ...state.projects,
      [projectId]: updater(project),
    },
  };
}

function updateActiveProject(state: TreeState, updater: (project: Project) => Project): TreeState {
  return updateProjectById(state, state.activeProjectId, updater);
}

/**
 * Replaces one node in a project and bumps the project's updatedAt. Callers
 * must have verified the project (and usually the node) exists.
 */
function replaceProjectNode(state: TreeState, projectId: string, node: MindNode): TreeState {
  return updateProjectById(state, projectId, (project) => ({
    ...project,
    nodes: { ...project.nodes, [node.id]: node },
    updatedAt: Date.now(),
  }));
}

function collectSubtreeIds(nodes: NodesMap, nodeId: string): Set<string> {
  const ids = new Set<string>();
  const pending = [nodeId];
  while (pending.length > 0) {
    const currentId = pending.pop();
    if (!currentId || ids.has(currentId)) continue;
    ids.add(currentId);
    const current = nodes[currentId];
    if (current) pending.push(...current.children);
  }
  return ids;
}

/**
 * New branches/leaves never attach under a leaf: a leaf parent resolves to its
 * own parent, so notes stay siblings of the answers that follow them.
 */
function resolveBranchParent(nodes: NodesMap, parentId: string): string {
  const parent = nodes[parentId];
  if (parent?.kind === "leaf" && parent.parentId) {
    return parent.parentId;
  }
  return parentId;
}

/** Leaves graft mode without touching the tree (used by every rejected graft). */
function exitGraftMode(state: TreeState): TreeState {
  return { ...state, toolMode: "view", graftSourceId: null };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Deliberate in-reducer side effect: synchronously mirrors the committed state
 * to localStorage. Every case whose outcome must survive a reload wraps its
 * return value in persist(); pure view-state cases (zoom, panels, graft mode)
 * intentionally do not. Keeping the write inside the reducer means storage can
 * never lag behind a committed transition.
 */
function persist(next: TreeState): TreeState {
  saveWorkspace(next);
  return next;
}

// ---------------------------------------------------------------------------
// Rings history — recording
// ---------------------------------------------------------------------------

function createHistoryEntry({
  state,
  projectId,
  label,
  primaryNodeId,
  affectedNodeIds,
  nodeUndoable,
  patch,
}: {
  state: TreeState;
  projectId?: string;
  label: string;
  primaryNodeId: string;
  affectedNodeIds: string[];
  nodeUndoable?: boolean;
  patch: HistoryPatch;
}): HistoryEntry {
  return {
    id: `history-${crypto.randomUUID()}`,
    projectId: projectId ?? state.activeProjectId,
    label,
    timestamp: Date.now(),
    primaryNodeId,
    affectedNodeIds: Array.from(new Set(affectedNodeIds)),
    nodeUndoable,
    patch,
  };
}

/** Appends an entry (capped at MAX_HISTORY) and clears the redo future. */
function pushHistory(state: TreeState, entry: HistoryEntry): TreeState {
  const past = [...state.history.past, entry].slice(-MAX_HISTORY);
  return { ...state, history: { past, future: [] } };
}

/**
 * Finds the past entry that recorded nodeId's creation (before === null).
 * STREAM_BRANCH_FINISH/FAIL use this so a stream that settles again after its
 * creation was already recorded does not record a second creation entry.
 */
function latestCreationHistoryForNode(state: TreeState, projectId: string, nodeId: string) {
  return state.history.past.find(
    (entry) =>
      entry.projectId === projectId &&
      entry.primaryNodeId === nodeId &&
      entry.patch.nodeChanges?.some(
        (change) => change.nodeId === nodeId && change.before === null,
      ),
  );
}

/**
 * Shared commit for BRANCH and LEAF: attaches newNode under parent, selects
 * it, and records one entry whose patch (parent before/after plus
 * before === null for the new node) lets a single undo remove both the node
 * and its edge. requestedParentId is the pre-resolveBranchParent id; it is
 * kept in affectedNodeIds so node Rings on the originally clicked node still
 * reaches this entry.
 */
function commitNewChild(
  state: TreeState,
  {
    parent,
    newNode,
    requestedParentId,
    label,
  }: { parent: MindNode; newNode: MindNode; requestedParentId: string; label: string },
): TreeState {
  const updatedParent = { ...parent, children: [...parent.children, newNode.id] };

  let next = updateActiveProject(state, (activeProject) => ({
    ...activeProject,
    nodes: {
      ...activeProject.nodes,
      [parent.id]: updatedParent,
      [newNode.id]: newNode,
    },
    updatedAt: Date.now(),
  }));
  next = { ...next, selectedNodeId: newNode.id };

  const entry = createHistoryEntry({
    state,
    label,
    primaryNodeId: newNode.id,
    affectedNodeIds: [parent.id, newNode.id, requestedParentId],
    patch: {
      nodeChanges: [
        { nodeId: parent.id, before: parent, after: updatedParent },
        { nodeId: newNode.id, before: null, after: newNode },
      ],
    },
  });
  return persist(pushHistory(next, entry));
}

/**
 * Shared settle step for STREAM_BRANCH_FINISH / STREAM_BRANCH_FAIL. Streaming
 * emits no token-level history, so settling fabricates the single creation
 * entry for the whole streamed branch — a parent snapshot without the child
 * plus before === null for the node — letting one node undo remove prompt,
 * response and edge together. Skipped when a creation entry already exists
 * for the node (e.g. settling again after undo/redo).
 */
function settleStreamedBranch(
  state: TreeState,
  projectId: string,
  parent: MindNode,
  nodeAfter: MindNode,
  label: string,
): TreeState {
  const next = replaceProjectNode(state, projectId, nodeAfter);

  if (latestCreationHistoryForNode(next, projectId, nodeAfter.id)) {
    return persist(next);
  }

  const parentBefore: MindNode = {
    ...parent,
    children: parent.children.filter((id) => id !== nodeAfter.id),
  };
  const entry = createHistoryEntry({
    state,
    projectId,
    label,
    primaryNodeId: nodeAfter.id,
    affectedNodeIds: [parent.id, nodeAfter.id],
    patch: {
      nodeChanges: [
        { nodeId: parent.id, before: parentBefore, after: parent },
        { nodeId: nodeAfter.id, before: null, after: nodeAfter },
      ],
    },
  });
  return persist(pushHistory(next, entry));
}

/**
 * Applies the same rewrite to past AND future entries. Snapshot
 * synchronization must cover both directions, otherwise undo or redo could
 * resurrect a pre-rewrite version of a node.
 */
function rewriteHistorySnapshots(
  state: TreeState,
  rewrite: (entries: HistoryEntry[]) => HistoryEntry[],
): TreeState {
  return {
    ...state,
    history: {
      past: rewrite(state.history.past),
      future: rewrite(state.history.future),
    },
  };
}

/**
 * Synchronizes a freshly extracted semantic card into every history snapshot
 * of the node — past AND future — so undo/redo can never resurrect a pre-card
 * version. Semantic cards are derived data: SET_NODE_SEMANTICS records no
 * Rings entry, so existing snapshots must be rewritten in place. Snapshots
 * taken under a different parentId (pre-graft topology) are left untouched,
 * and a "stale" snapshot keeps its stale marker.
 */
function updateNodeSemanticSnapshots(
  entries: HistoryEntry[],
  projectId: string,
  nodeId: string,
  node: MindNode,
): HistoryEntry[] {
  return entries.map((entry) => {
    if (entry.projectId !== projectId || !entry.patch.nodeChanges) return entry;
    let changed = false;
    const nodeChanges = entry.patch.nodeChanges.map((change) => {
      if (change.nodeId !== nodeId) return change;
      const syncSnapshot = (snapshot: MindNode | null): MindNode | null => {
        if (!snapshot || snapshot.parentId !== node.parentId) return snapshot;
        return {
          ...snapshot,
          semanticCard: node.semanticCard,
          contextState: snapshot.contextState === "stale" ? "stale" : "valid",
        };
      };
      const before = syncSnapshot(change.before);
      const after = syncSnapshot(change.after);
      if (before === change.before && after === change.after) return change;
      changed = true;
      return { ...change, before, after };
    });
    if (!changed) return entry;
    return {
      ...entry,
      patch: { ...entry.patch, nodeChanges },
    };
  });
}

/**
 * Mirrors the latest includeInContext flag into every past AND future snapshot
 * of a leaf node, so node undo/redo cannot silently flip a note back into (or
 * out of) the compiled context. Like semantic cards, the toggle itself records
 * no Rings entry.
 */
function updateLeafContextSnapshots(
  entries: HistoryEntry[],
  projectId: string,
  nodeId: string,
  includeInContext: boolean,
): HistoryEntry[] {
  return entries.map((entry) => {
    if (entry.projectId !== projectId || !entry.patch.nodeChanges) return entry;
    let changed = false;
    const nodeChanges = entry.patch.nodeChanges.map((change) => {
      if (change.nodeId !== nodeId) return change;
      const syncSnapshot = (snapshot: MindNode | null): MindNode | null => {
        if (!snapshot || snapshot.kind !== "leaf") return snapshot;
        changed = true;
        return { ...snapshot, includeInContext };
      };
      return {
        ...change,
        before: syncSnapshot(change.before),
        after: syncSnapshot(change.after),
      };
    });
    if (!changed) return entry;
    return { ...entry, patch: { ...entry.patch, nodeChanges } };
  });
}

// ---------------------------------------------------------------------------
// Rings history — undo/redo application
// ---------------------------------------------------------------------------

/**
 * Applies one entry in the given direction. Restored projects/nodes are
 * re-normalized, and the selection is kept valid: if the selected node
 * disappears it falls back to the entry's primary node, then to the root.
 */
function applyPatch(state: TreeState, entry: HistoryEntry, direction: "undo" | "redo"): TreeState {
  const next: TreeState = {
    ...state,
    projects: { ...state.projects },
  };

  for (const change of entry.patch.projectChanges ?? []) {
    const value = direction === "undo" ? change.before : change.after;
    if (value) {
      next.projects[change.projectId] = normalizeProject(value);
    } else {
      delete next.projects[change.projectId];
    }
  }

  const project = next.projects[entry.projectId];
  if (project && entry.patch.nodeChanges?.length) {
    const nodes = { ...project.nodes };
    for (const change of entry.patch.nodeChanges) {
      const value = resolveNodePatchValue(nodes[change.nodeId], change.before, change.after, direction);
      if (value) {
        nodes[change.nodeId] = normalizeNode(value, project.rootNodeId);
      } else {
        delete nodes[change.nodeId];
      }
    }
    next.projects[entry.projectId] = {
      ...project,
      nodes,
      updatedAt: Date.now(),
    };
  }

  const activeProject = next.projects[next.activeProjectId];
  if (!activeProject) {
    const fallbackId = Object.keys(next.projects)[0] ?? "";
    next.activeProjectId = fallbackId;
    next.selectedNodeId = fallbackId ? next.projects[fallbackId].rootNodeId : "";
    next.selectedLayer = 0;
    return next;
  }

  if (!activeProject.nodes[next.selectedNodeId]) {
    const primaryNode = activeProject.nodes[entry.primaryNodeId];
    next.selectedNodeId = primaryNode?.id ?? activeProject.rootNodeId;
    next.selectedLayer = activeProject.nodes[next.selectedNodeId]?.layer ?? 0;
  }

  return next;
}

/**
 * Direction-aware value for a single node change. `children` is delta-merged
 * (see mergeTargetChildren) instead of overwritten, so an out-of-order node
 * undo does not erase sibling edges created after the entry was recorded.
 * Creation/deletion changes (one side missing) use the raw snapshot as-is.
 */
function resolveNodePatchValue(
  current: MindNode | undefined,
  before: MindNode | null,
  after: MindNode | null,
  direction: "undo" | "redo",
): MindNode | null {
  const target = direction === "undo" ? before : after;
  const source = direction === "undo" ? after : before;
  if (!target || !source || !current) return target;

  const mergedChildren = mergeTargetChildren(current.children, source.children, target.children);

  return { ...target, children: mergedChildren };
}

/**
 * Delta-merges a recorded children patch onto the *current* children array.
 *
 * Node-level Rings can apply history entries out of order, so the current
 * array may already contain edges added (or lack edges removed) by later,
 * unrelated work. Overwriting with the recorded target would destroy that
 * work; instead only the entry's own delta (target vs. source) is replayed:
 * edges the entry removed are dropped, edges it added are re-inserted — next
 * to a recorded sibling when one still exists, appended otherwise — and every
 * unrelated edge is left exactly where it is.
 */
function mergeTargetChildren(
  currentChildren: string[],
  sourceChildren: string[],
  targetChildren: string[],
): string[] {
  const targetAdds = targetChildren.filter((id) => !sourceChildren.includes(id));
  const targetRemoves = sourceChildren.filter((id) => !targetChildren.includes(id));
  const merged = currentChildren.filter(
    (id) => !targetRemoves.includes(id) && !targetAdds.includes(id),
  );

  for (const id of targetAdds) {
    const targetIndex = targetChildren.indexOf(id);
    const nextSibling = targetChildren
      .slice(targetIndex + 1)
      .find((candidateId) => merged.includes(candidateId));
    if (nextSibling) {
      merged.splice(merged.indexOf(nextSibling), 0, id);
      continue;
    }

    const previousSibling = targetChildren
      .slice(0, targetIndex)
      .reverse()
      .find((candidateId) => merged.includes(candidateId));
    if (previousSibling) {
      merged.splice(merged.lastIndexOf(previousSibling) + 1, 0, id);
    } else {
      merged.push(id);
    }
  }

  return merged;
}

function undoAtIndex(state: TreeState, index: number): TreeState {
  if (index < 0 || index >= state.history.past.length) return state;
  const entry = state.history.past[index];
  const past = state.history.past.filter((_, candidateIndex) => candidateIndex !== index);
  const next = applyPatch(state, entry, "undo");
  return persist({
    ...next,
    history: {
      past,
      future: [entry, ...state.history.future],
    },
  });
}

function redoAtIndex(state: TreeState, index: number): TreeState {
  if (index < 0 || index >= state.history.future.length) return state;
  const entry = state.history.future[index];
  const future = state.history.future.filter((_, candidateIndex) => candidateIndex !== index);
  const next = applyPatch(state, entry, "redo");
  return persist({
    ...next,
    history: {
      past: [...state.history.past, entry].slice(-MAX_HISTORY),
      future,
    },
  });
}

/**
 * Index of the newest past entry affecting nodeId, or -1. An entry with
 * nodeUndoable === false (an atomic Auxo batch) is a hard barrier: node-level
 * Rings may neither undo the batch itself nor reach through it to older
 * entries, otherwise a partial undo could leave orphan task nodes.
 */
function latestPastIndexForNode(state: TreeState, nodeId: string) {
  for (let index = state.history.past.length - 1; index >= 0; index--) {
    const entry = state.history.past[index];
    if (
      entry.projectId !== state.activeProjectId ||
      !entry.affectedNodeIds.includes(nodeId)
    ) continue;
    if (entry.nodeUndoable === false) return -1;
    return index;
  }
  return -1;
}

/**
 * Index of the oldest future entry affecting nodeId, or -1. Applies the same
 * nodeUndoable === false barrier as latestPastIndexForNode, in the redo
 * direction.
 */
function firstFutureIndexForNode(state: TreeState, nodeId: string) {
  for (let index = 0; index < state.history.future.length; index++) {
    const entry = state.history.future[index];
    if (
      entry.projectId !== state.activeProjectId ||
      !entry.affectedNodeIds.includes(nodeId)
    ) continue;
    if (entry.nodeUndoable === false) return -1;
    return index;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function treeReducer(state: TreeState, action: TreeAction): TreeState {
  switch (action.type) {
    case "HYDRATE": {
      // Rings history is session-only: hydration always starts empty.
      return { ...action.state, history: { past: [], future: [] } };
    }

    case "SEED": {
      const project = createProject(action.name);
      const next = {
        ...state,
        projects: { ...state.projects, [project.id]: project },
        activeProjectId: project.id,
        selectedNodeId: project.rootNodeId,
        selectedLayer: 0,
        planeNames: { 0: "根节点层" },
      };
      const entry = createHistoryEntry({
        state,
        label: `Seed · ${project.name}`,
        primaryNodeId: project.rootNodeId,
        affectedNodeIds: [project.rootNodeId],
        patch: {
          projectChanges: [{ projectId: project.id, before: null, after: project }],
        },
      });
      return persist(pushHistory(next, entry));
    }

    case "APPLY_AUXO_PLAN": {
      // Auxo only writes onto a pristine root: no children yet and no node
      // from a previous generation anywhere in the project.
      const project = state.projects[action.projectId];
      const root = project?.nodes[action.rootNodeId];
      if (
        !project ||
        project.rootNodeId !== action.rootNodeId ||
        !root ||
        root.kind !== "root" ||
        root.children.length > 0 ||
        Object.values(project.nodes).some((node) => Boolean(node.auxoGenerationId))
      ) {
        return state;
      }

      // The plan is re-validated against the freshly compiled input; any
      // validation failure or fingerprint drift produces zero writes.
      let currentInput: ReturnType<typeof compileAuxoInput>;
      let validatedPlan: typeof action.plan;
      try {
        currentInput = compileAuxoInput(project);
        validatedPlan = validateAuxoPlan(action.plan, currentInput.request, {
          generatedAt: action.plan.generatedAt,
          model: action.plan.model,
        });
      } catch {
        return state;
      }
      if (
        currentInput.inputFingerprint !== action.inputFingerprint ||
        currentInput.nutrientRefs.length !== action.nutrientRefs.length ||
        currentInput.nutrientRefs.some((id, index) => id !== action.nutrientRefs[index])
      ) {
        return state;
      }

      const orderedPlan = [...validatedPlan.nodes].sort((a, b) => a.order - b.order);
      const idByPlanId = new Map<string, string>();
      const reservedIds = new Set(Object.keys(project.nodes));
      for (const planNode of orderedPlan) {
        let nodeId = `auxo-${crypto.randomUUID()}`;
        while (reservedIds.has(nodeId)) nodeId = `auxo-${crypto.randomUUID()}`;
        reservedIds.add(nodeId);
        idByPlanId.set(planNode.planId, nodeId);
      }

      const childCountByPlanId = new Map<string, number>();
      for (const planNode of orderedPlan) {
        childCountByPlanId.set(
          planNode.parentPlanId,
          (childCountByPlanId.get(planNode.parentPlanId) ?? 0) + 1,
        );
      }

      const generatedNodes: NodesMap = {};
      for (const planNode of orderedPlan) {
        const nodeId = idByPlanId.get(planNode.planId)!;
        const parentId =
          planNode.parentPlanId === "root"
            ? root.id
            : idByPlanId.get(planNode.parentPlanId);
        if (!parentId) return state;
        const prompt = planNode.source?.exactQuote ?? planNode.title;
        const taskDescription =
          planNode.nodeRole === "task-group"
            ? `Auxo 任务组 · 共 ${childCountByPlanId.get(planNode.planId) ?? 0} 项子任务，按顺序完成。`
            : planNode.source
              ? planNode.title
              : "Auxo 补充任务 · 由整体目标推导，不对应单一原文题目。";
        generatedNodes[nodeId] = {
          id: nodeId,
          kind: "branch",
          nodeRole: planNode.nodeRole,
          prompt,
          response: "",
          taskDescription,
          children: [],
          parentId,
          timestamp: validatedPlan.generatedAt + planNode.order,
          offsetX: 0,
          offsetY: 0,
          layer: root.layer,
          nutrientRefs: [...action.nutrientRefs],
          status: "complete",
          contextState: "valid",
          auxoGenerationId: action.generationId,
          auxoSource: planNode.source,
        };
      }

      const rootChildren: string[] = [];
      for (const planNode of orderedPlan) {
        const nodeId = idByPlanId.get(planNode.planId)!;
        if (planNode.parentPlanId === "root") {
          rootChildren.push(nodeId);
        } else {
          const parentId = idByPlanId.get(planNode.parentPlanId)!;
          generatedNodes[parentId] = {
            ...generatedNodes[parentId],
            children: [...generatedNodes[parentId].children, nodeId],
          };
        }
      }

      const rootAfter: MindNode = {
        ...root,
        children: [...root.children, ...rootChildren],
        auxoManifest: {
          version: 1,
          generationId: action.generationId,
          generatedAt: validatedPlan.generatedAt,
          model: validatedPlan.model,
          rootNodeId: root.id,
          nodeCount: orderedPlan.length,
          inputFingerprint: action.inputFingerprint,
          nutrientChunks: currentInput.request.nutrientChunks.map((chunk) => ({
            nutrientId: chunk.nutrientId,
            nutrientName: chunk.nutrientName,
            chunkId: chunk.chunkId,
          })),
        },
      };
      const nodesAfter = {
        ...project.nodes,
        [root.id]: rootAfter,
        ...generatedNodes,
      };
      let next: TreeState = {
        ...state,
        projects: {
          ...state.projects,
          [project.id]: { ...project, nodes: nodesAfter, updatedAt: Date.now() },
        },
      };
      if (state.activeProjectId === project.id && rootChildren[0]) {
        next = {
          ...next,
          selectedNodeId: rootChildren[0],
          selectedLayer: root.layer,
        };
      }

      // One atomic entry for the whole batch. nodeUndoable: false makes it a
      // node-Rings barrier (see latestPastIndexForNode): only global
      // Undo/Redo may revert an Auxo generation, so a partial undo can never
      // orphan task nodes.
      const generatedList = Object.values(generatedNodes);
      const entry = createHistoryEntry({
        state,
        projectId: project.id,
        label: `Auxo · ${generatedList.length} 个待执行任务`,
        primaryNodeId: root.id,
        affectedNodeIds: [root.id, ...generatedList.map((node) => node.id)],
        nodeUndoable: false,
        patch: {
          nodeChanges: [
            { nodeId: root.id, before: root, after: rootAfter },
            ...generatedList.map((node) => ({ nodeId: node.id, before: null, after: node })),
          ],
        },
      });
      return persist(pushHistory(next, entry));
    }

    case "BRANCH": {
      const project = getActiveProject(state);
      if (!project) return state;
      const parentId = resolveBranchParent(project.nodes, action.parentId);
      const parent = project.nodes[parentId];
      if (!parent) return state;

      const newNode: MindNode = {
        id: `node-${crypto.randomUUID()}`,
        kind: "branch",
        nodeRole: "answer",
        prompt: action.prompt,
        response: action.response,
        children: [],
        parentId,
        timestamp: Date.now(),
        offsetX: 0,
        offsetY: 0,
        layer: state.selectedLayer,
        nutrientRefs: action.nutrientRefs ?? project.activeNutrientIds,
        status: "complete",
        contextState: "missing",
        contextManifest: action.contextManifest,
      };
      return commitNewChild(state, {
        parent,
        newNode,
        requestedParentId: action.parentId,
        label: `Branch · ${action.prompt.slice(0, 32)}`,
      });
    }

    case "STREAM_BRANCH_START": {
      // No history entry yet — the single creation entry is fabricated when
      // the stream settles (see settleStreamedBranch).
      const project = state.projects[action.projectId];
      if (!project || project.nodes[action.nodeId]) return state;

      const parentId = resolveBranchParent(project.nodes, action.parentId);
      const parent = project.nodes[parentId];
      if (!parent) return state;

      const nutrientRefs = action.nutrientRefs ?? project.activeNutrientIds;
      const newNode: MindNode = {
        id: action.nodeId,
        kind: "branch",
        nodeRole: "answer",
        prompt: action.prompt,
        response: "",
        children: [],
        parentId,
        timestamp: Date.now(),
        offsetX: 0,
        offsetY: 0,
        layer: state.selectedLayer,
        nutrientRefs,
        status: "streaming",
        contextState: "missing",
        contextManifest: action.contextManifest,
      };
      const updatedParent = {
        ...parent,
        children: parent.children.includes(action.nodeId)
          ? parent.children
          : [...parent.children, action.nodeId],
      };

      const next = updateProjectById(state, action.projectId, (activeProject) => {
        const nodes = {
          ...activeProject.nodes,
          [parentId]: updatedParent,
          [action.nodeId]: newNode,
        };
        return { ...activeProject, nodes, updatedAt: Date.now() };
      });

      if (next.activeProjectId !== action.projectId) return persist(next);
      return persist({
        ...next,
        selectedNodeId: action.nodeId,
      });
    }

    case "STREAM_BRANCH_UPDATE": {
      return updateProjectById(state, action.projectId, (project) => {
        const node = project.nodes[action.nodeId];
        if (!node) return project;
        return {
          ...project,
          nodes: {
            ...project.nodes,
            [action.nodeId]: {
              ...node,
              response: action.response,
              status: "streaming",
              error: undefined,
            },
          },
          updatedAt: Date.now(),
        };
      });
    }

    case "STREAM_BRANCH_FINISH": {
      const project = state.projects[action.projectId];
      const node = project?.nodes[action.nodeId];
      const parent = node?.parentId ? project?.nodes[node.parentId] : null;
      if (!project || !node || !parent) return state;

      const nodeAfter: MindNode = {
        ...node,
        status: action.status,
        error: undefined,
      };
      return settleStreamedBranch(
        state,
        action.projectId,
        parent,
        nodeAfter,
        `${action.status === "stopped" ? "Stopped" : "Branch"} · ${node.prompt.slice(0, 32)}`,
      );
    }

    case "STREAM_BRANCH_FAIL": {
      const project = state.projects[action.projectId];
      const node = project?.nodes[action.nodeId];
      const parent = node?.parentId ? project?.nodes[node.parentId] : null;
      if (!project || !node || !parent) return state;

      const nodeAfter: MindNode = {
        ...node,
        status: "failed",
        error: action.error,
      };
      return settleStreamedBranch(
        state,
        action.projectId,
        parent,
        nodeAfter,
        `Failed branch · ${node.prompt.slice(0, 32)}`,
      );
    }

    case "SET_NODE_SEMANTICS": {
      // expectedParentId guards against a graft that landed while the
      // extraction request was in flight: a card computed for the old
      // topology must not mark the moved node "valid".
      const project = state.projects[action.projectId];
      const node = project?.nodes[action.nodeId];
      if (
        !project ||
        !node ||
        node.kind !== "branch" ||
        (node.nodeRole ?? "answer") !== "answer" ||
        node.status !== "complete" ||
        node.contextState === "stale" ||
        node.parentId !== action.expectedParentId ||
        !isUsableSemanticCard(action.semanticCard)
      ) {
        return state;
      }

      const nodeAfter: MindNode = {
        ...node,
        semanticCard: action.semanticCard,
        contextState: "valid",
      };
      const next = replaceProjectNode(state, action.projectId, nodeAfter);

      return persist(
        rewriteHistorySnapshots(next, (entries) =>
          updateNodeSemanticSnapshots(entries, action.projectId, action.nodeId, nodeAfter),
        ),
      );
    }

    case "LEAF": {
      const project = getActiveProject(state);
      if (!project) return state;
      const parentId = resolveBranchParent(project.nodes, action.parentId);
      const parent = project.nodes[parentId];
      if (!parent) return state;

      const newNode: MindNode = {
        id: `note-${crypto.randomUUID()}`,
        kind: "leaf",
        prompt: action.content,
        response: "",
        children: [],
        parentId,
        timestamp: Date.now(),
        offsetX: 0,
        offsetY: 0,
        layer: state.selectedLayer,
        nutrientRefs: [],
        status: "complete",
        contextState: "missing",
        includeInContext: false,
      };
      return commitNewChild(state, {
        parent,
        newNode,
        requestedParentId: action.parentId,
        label: `Leaf · ${action.content.slice(0, 32)}`,
      });
    }

    case "TOGGLE_LEAF_CONTEXT": {
      const project = getActiveProject(state);
      const node = project?.nodes[action.nodeId];
      if (!project || !node || node.kind !== "leaf") return state;

      const includeInContext = !node.includeInContext;
      const next = replaceProjectNode(state, state.activeProjectId, {
        ...node,
        includeInContext,
      });
      return persist(
        rewriteHistorySnapshots(next, (entries) =>
          updateLeafContextSnapshots(entries, state.activeProjectId, action.nodeId, includeInContext),
        ),
      );
    }

    case "GRAFT_START": {
      return { ...state, toolMode: "graft", graftSourceId: action.nodeId };
    }

    case "GRAFT_CONFIRM": {
      const sourceId = state.graftSourceId;
      if (!sourceId || sourceId === action.newParentId) {
        return exitGraftMode(state);
      }

      const project = getActiveProject(state);
      const nodes = getActiveNodes(state);
      const sourceBefore = nodes[sourceId];
      const newParentBefore = nodes[action.newParentId];
      if (
        !project ||
        !sourceBefore ||
        !newParentBefore ||
        sourceId === project.rootNodeId ||
        sourceBefore.kind === "root" ||
        newParentBefore.kind === "leaf" ||
        sourceBefore.parentId === action.newParentId
      ) {
        return exitGraftMode(state);
      }

      const subtreeIds = collectSubtreeIds(nodes, sourceId);
      if (subtreeIds.has(action.newParentId)) {
        return exitGraftMode(state);
      }

      // Grafts never touch a streaming node: a history snapshot of an
      // unfinished node could otherwise be restored later.
      const oldParentBefore = sourceBefore?.parentId ? nodes[sourceBefore.parentId] : null;
      const touchesStreamingNode =
        newParentBefore.status === "streaming" ||
        oldParentBefore?.status === "streaming" ||
        Array.from(subtreeIds).some((nodeId) => nodes[nodeId]?.status === "streaming");
      if (touchesStreamingNode) {
        return exitGraftMode(state);
      }

      const updatedNodes = { ...nodes };
      const nodeChanges: NonNullable<HistoryPatch["nodeChanges"]> = [];

      if (oldParentBefore) {
        const oldParentAfter: MindNode = {
          ...oldParentBefore,
          children: oldParentBefore.children.filter((id) => id !== sourceId),
        };
        updatedNodes[oldParentBefore.id] = oldParentAfter;
        nodeChanges.push({
          nodeId: oldParentBefore.id,
          before: oldParentBefore,
          after: oldParentAfter,
        });
      }

      const newParentAfter: MindNode = {
        ...newParentBefore,
        children: newParentBefore.children.includes(sourceId)
          ? newParentBefore.children
          : [...newParentBefore.children, sourceId],
      };
      updatedNodes[newParentBefore.id] = newParentAfter;
      nodeChanges.push({
        nodeId: newParentBefore.id,
        before: newParentBefore,
        after: newParentAfter,
      });

      // Prompts and responses move untouched; only answer semantics in the
      // moved subtree become "stale" (immutable Auxo task source stays valid).
      for (const nodeId of subtreeIds) {
        const before = nodes[nodeId];
        if (!before) continue;
        let after = before;
        if (
          before.kind === "branch" &&
          (before.nodeRole ?? "answer") === "answer" &&
          before.contextState !== "stale"
        ) {
          after = { ...after, contextState: "stale" };
        }
        if (nodeId === sourceId) {
          after = {
            ...after,
            parentId: action.newParentId,
            layer: newParentBefore.layer,
          };
        }
        if (after === before) continue;
        updatedNodes[nodeId] = after;
        nodeChanges.push({ nodeId, before, after });
      }

      const next: TreeState = {
        ...state,
        projects: {
          ...state.projects,
          [state.activeProjectId]: {
            ...project,
            nodes: updatedNodes,
            updatedAt: Date.now(),
          },
        },
        toolMode: "view",
        graftSourceId: null,
      };
      const entry = createHistoryEntry({
        state,
        label: `Graft · ${sourceBefore.prompt.slice(0, 32)}`,
        primaryNodeId: sourceId,
        affectedNodeIds: nodeChanges.map((change) => change.nodeId),
        patch: { nodeChanges },
      });
      return persist(pushHistory(next, entry));
    }

    case "GRAFT_CANCEL": {
      return exitGraftMode(state);
    }

    case "PRUNE": {
      const nodes = getActiveNodes(state);
      if (action.nodeId === "root" || action.nodeId === getActiveProject(state)?.rootNodeId) return state;

      const subtreeIds = collectSubtreeIds(nodes, action.nodeId);
      const project = getActiveProject(state);
      const prunedNode = nodes[action.nodeId];
      const parentBefore = prunedNode?.parentId ? nodes[prunedNode.parentId] : null;
      const deletedNodes = Array.from(subtreeIds)
        .map((id) => nodes[id])
        .filter((node): node is MindNode => Boolean(node));
      let parentAfter: MindNode | null = null;

      let next = updateActiveProject(state, (project) => {
        const updatedNodes = { ...project.nodes };
        const node = updatedNodes[action.nodeId];
        if (node?.parentId && updatedNodes[node.parentId]) {
          parentAfter = {
            ...updatedNodes[node.parentId],
            children: updatedNodes[node.parentId].children.filter((id) => id !== action.nodeId),
          };
          updatedNodes[node.parentId] = parentAfter;
        }
        for (const id of subtreeIds) {
          delete updatedNodes[id];
        }
        return { ...project, nodes: updatedNodes, updatedAt: Date.now() };
      });

      // Select parent if selected node was pruned
      if (subtreeIds.has(next.selectedNodeId) || next.selectedNodeId === action.nodeId) {
        next = { ...next, selectedNodeId: prunedNode?.parentId ?? getActiveProject(next)?.rootNodeId ?? "root" };
      }

      // Cancel active graft if source was pruned
      if (next.graftSourceId && subtreeIds.has(next.graftSourceId)) {
        next = exitGraftMode(next);
      }

      const nodeChanges = [
        parentBefore && parentAfter
          ? { nodeId: parentBefore.id, before: parentBefore, after: parentAfter }
          : null,
        ...deletedNodes.map((deleted) => ({ nodeId: deleted.id, before: deleted, after: null })),
      ].filter((change): change is NonNullable<typeof change> => change !== null);
      const entry = createHistoryEntry({
        state,
        label: `Prune · ${prunedNode?.prompt.slice(0, 32) ?? "node"}`,
        primaryNodeId: prunedNode?.parentId ?? project?.rootNodeId ?? "root",
        affectedNodeIds: [
          ...(parentBefore ? [parentBefore.id] : []),
          ...deletedNodes.map((deleted) => deleted.id),
        ],
        patch: { nodeChanges },
      });
      return persist(pushHistory(next, entry));
    }

    case "SUNLIGHT": {
      const project = getActiveProject(state);
      const node = project?.nodes[action.nodeId];
      if (!node) return state;
      return persist({
        ...state,
        selectedNodeId: action.nodeId,
        selectedLayer: node.layer,
      });
    }

    case "SELECT_NODE": {
      return persist({ ...state, selectedNodeId: action.nodeId });
    }

    case "SET_LAYER": {
      return persist({ ...state, selectedLayer: action.layer });
    }

    case "TOGGLE_3D": {
      return { ...state, is3DMode: !state.is3DMode };
    }

    case "TOGGLE_CANOPY": {
      return { ...state, isCanopyOpen: !state.isCanopyOpen };
    }

    case "TOGGLE_RINGS": {
      return {
        ...state,
        isRingsOpen: !state.isRingsOpen,
        ringsMode: "global",
        ringsFocusNodeId: null,
      };
    }

    case "OPEN_GLOBAL_RINGS": {
      return { ...state, isRingsOpen: true, ringsMode: "global", ringsFocusNodeId: null };
    }

    case "OPEN_NODE_RINGS": {
      return {
        ...state,
        isRingsOpen: true,
        ringsMode: "node",
        ringsFocusNodeId: action.nodeId,
      };
    }

    case "CLOSE_RINGS": {
      return { ...state, isRingsOpen: false, ringsMode: "global", ringsFocusNodeId: null };
    }

    case "SWITCH_PROJECT": {
      const project = state.projects[action.projectId];
      if (!project) return state;
      return persist({
        ...state,
        activeProjectId: action.projectId,
        selectedNodeId: project.rootNodeId,
        selectedLayer: 0,
      });
    }

    case "UNDO": {
      return undoAtIndex(state, state.history.past.length - 1);
    }

    case "REDO": {
      return redoAtIndex(state, 0);
    }

    case "UNDO_NODE": {
      return undoAtIndex(state, latestPastIndexForNode(state, action.nodeId));
    }

    case "REDO_NODE": {
      return redoAtIndex(state, firstFutureIndexForNode(state, action.nodeId));
    }

    case "SET_ZOOM": {
      return {
        ...state,
        zoom2D: action.zoom2D ?? state.zoom2D,
        zoom3D: action.zoom3D ?? state.zoom3D,
      };
    }

    case "RENAME_PLANE": {
      const next = { ...state, planeNames: { ...state.planeNames } };
      if (action.name) {
        next.planeNames[action.layer] = action.name;
      } else {
        delete next.planeNames[action.layer];
      }
      return persist(next);
    }

    case "RENAME_PROJECT": {
      const project = state.projects[action.projectId];
      if (!project || !action.name.trim()) return state;
      const next = {
        ...state,
        projects: {
          ...state.projects,
          [action.projectId]: { ...project, name: action.name.trim(), updatedAt: Date.now() },
        },
      };
      return persist(next);
    }

    case "DELETE_PROJECT": {
      if (Object.keys(state.projects).length <= 1) return state;
      const deletedProject = state.projects[action.projectId];
      const next = { ...state };
      const remaining = { ...next.projects };
      delete remaining[action.projectId];
      const newActiveId = action.projectId === next.activeProjectId
        ? Object.keys(remaining)[0]
        : next.activeProjectId;
      const target = remaining[newActiveId];
      next.projects = remaining;
      next.activeProjectId = newActiveId;
      if (target) {
        next.selectedNodeId = target.rootNodeId;
        next.selectedLayer = 0;
      }
      const entry = createHistoryEntry({
        state,
        label: `Delete project · ${deletedProject?.name ?? action.projectId}`,
        primaryNodeId: target?.rootNodeId ?? "",
        affectedNodeIds: deletedProject ? Object.keys(deletedProject.nodes) : [],
        patch: {
          projectChanges: [
            { projectId: action.projectId, before: deletedProject ?? null, after: null },
          ],
        },
      });
      return persist(pushHistory(next, entry));
    }

    case "SET_NODE_OFFSET": {
      const project = getActiveProject(state);
      const before = project?.nodes[action.nodeId];
      const next = updateActiveProject(state, (project) => {
        const nodes = { ...project.nodes };
        const node = nodes[action.nodeId];
        if (node) {
          nodes[action.nodeId] = { ...node, offsetX: action.offsetX, offsetY: action.offsetY };
        }
        return { ...project, nodes };
      });
      const after = getActiveProject(next)?.nodes[action.nodeId];
      if (!before || !after) return persist(next);
      const entry = createHistoryEntry({
        state,
        label: `Move · ${before.prompt.slice(0, 32)}`,
        primaryNodeId: action.nodeId,
        affectedNodeIds: [action.nodeId],
        patch: {
          nodeChanges: [{ nodeId: action.nodeId, before, after }],
        },
      });
      return persist(pushHistory(next, entry));
    }

    case "ADD_NUTRIENTS": {
      if (action.nutrients.length === 0) return state;
      const next = updateProjectById(state, action.projectId, (project) => {
        const nutrients = { ...project.nutrients };
        const active = new Set(project.activeNutrientIds);
        for (const nutrient of action.nutrients) {
          nutrients[nutrient.id] = nutrient;
          if (nutrient.extractionStatus === "ready") {
            active.add(nutrient.id);
          }
        }
        return {
          ...project,
          nutrients,
          activeNutrientIds: Array.from(active),
          updatedAt: Date.now(),
        };
      });
      return persist(next);
    }

    case "REMOVE_NUTRIENT": {
      const next = updateActiveProject(state, (project) => {
        const nutrients = { ...project.nutrients };
        delete nutrients[action.nutrientId];
        return {
          ...project,
          nutrients,
          activeNutrientIds: project.activeNutrientIds.filter((id) => id !== action.nutrientId),
          updatedAt: Date.now(),
        };
      });
      return persist(next);
    }

    case "TOGGLE_NUTRIENT_ACTIVE": {
      const next = updateActiveProject(state, (project) => {
        const nutrient = project.nutrients[action.nutrientId];
        if (!nutrient || nutrient.extractionStatus !== "ready") return project;
        const active = new Set(project.activeNutrientIds);
        if (active.has(action.nutrientId)) {
          active.delete(action.nutrientId);
        } else {
          active.add(action.nutrientId);
        }
        return { ...project, activeNutrientIds: Array.from(active), updatedAt: Date.now() };
      });
      return persist(next);
    }

    default:
      return state;
  }
}
