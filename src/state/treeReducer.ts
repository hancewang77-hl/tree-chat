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

const MAX_HISTORY = 50;

function makeRootNode(): MindNode {
  return {
    id: "root",
    kind: "root",
    prompt: "思考的起点",
    response: "这是你思维之树的根。从这里开始，提出一个问题，AI 会帮助你展开枝叶。每一个节点都可以继续生长出新的分支。试着在下方输入你的第一个问题，让这棵树开始生长吧。",
    children: [],
    parentId: null,
    timestamp: Date.now(),
    offsetX: 0,
    offsetY: 0,
    layer: 0,
    nutrientRefs: [],
  };
}

function createProject(name: string): Project {
  const id = crypto.randomUUID();
  const rootNode = makeRootNode();
  rootNode.prompt = name;
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

function normalizeNode(node: MindNode, rootNodeId: string): MindNode {
  const kind =
    node.kind ??
    (node.id === rootNodeId || node.parentId === null
      ? "root"
      : node.response.trim().length === 0
        ? "leaf"
        : "branch");
  return {
    ...node,
    kind,
    nutrientRefs: node.nutrientRefs ?? [],
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

function createHistoryEntry({
  state,
  label,
  primaryNodeId,
  affectedNodeIds,
  patch,
}: {
  state: TreeState;
  label: string;
  primaryNodeId: string;
  affectedNodeIds: string[];
  patch: HistoryPatch;
}): HistoryEntry {
  return {
    id: `history-${crypto.randomUUID()}`,
    projectId: state.activeProjectId,
    label,
    timestamp: Date.now(),
    primaryNodeId,
    affectedNodeIds: Array.from(new Set(affectedNodeIds)),
    patch,
  };
}

function pushHistory(state: TreeState, entry: HistoryEntry): TreeState {
  const past = [...state.history.past, entry].slice(-MAX_HISTORY);
  return { ...state, history: { past, future: [] } };
}

function getActiveProject(state: TreeState): Project | undefined {
  return state.projects[state.activeProjectId];
}

function getActiveNodes(state: TreeState): NodesMap {
  return getActiveProject(state)?.nodes ?? {};
}

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

function collectSubtreeIds(nodes: NodesMap, nodeId: string): Set<string> {
  const ids = new Set<string>([nodeId]);
  const node = nodes[nodeId];
  if (node) {
    for (const childId of node.children) {
      for (const id of collectSubtreeIds(nodes, childId)) {
        ids.add(id);
      }
    }
  }
  return ids;
}

function resolveBranchParent(nodes: NodesMap, parentId: string): string {
  const parent = nodes[parentId];
  if (parent?.kind === "leaf" && parent.parentId) {
    return parent.parentId;
  }
  return parentId;
}

function updateActiveProject(state: TreeState, updater: (project: Project) => Project): TreeState {
  const project = getActiveProject(state);
  if (!project) return state;
  return {
    ...state,
    projects: {
      ...state.projects,
      [state.activeProjectId]: updater(project),
    },
  };
}

function persist(next: TreeState): TreeState {
  saveWorkspace(next);
  return next;
}

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

function resolveNodePatchValue(
  current: MindNode | undefined,
  before: MindNode | null,
  after: MindNode | null,
  direction: "undo" | "redo",
): MindNode | null {
  const target = direction === "undo" ? before : after;
  const source = direction === "undo" ? after : before;
  if (!target || !source || !current) return target;

  const targetAdds = target.children.filter((id) => !source.children.includes(id));
  const targetRemoves = source.children.filter((id) => !target.children.includes(id));
  const mergedChildren = current.children.filter((id) => !targetRemoves.includes(id));
  for (const id of targetAdds) {
    if (!mergedChildren.includes(id)) mergedChildren.push(id);
  }

  return { ...target, children: mergedChildren };
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

function latestPastIndexForNode(state: TreeState, nodeId: string) {
  for (let index = state.history.past.length - 1; index >= 0; index--) {
    if (state.history.past[index].affectedNodeIds.includes(nodeId)) return index;
  }
  return -1;
}

function firstFutureIndexForNode(state: TreeState, nodeId: string) {
  return state.history.future.findIndex((entry) => entry.affectedNodeIds.includes(nodeId));
}

export function treeReducer(state: TreeState, action: TreeAction): TreeState {
  switch (action.type) {
    case "HYDRATE": {
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

    case "BRANCH": {
      const project = getActiveProject(state);
      if (!project) return state;
      const parentId = resolveBranchParent(project.nodes, action.parentId);
      const parent = project.nodes[parentId];
      if (!parent) return state;

      const newNodeId = `node-${crypto.randomUUID()}`;
      const nutrientRefs = action.nutrientRefs ?? project.activeNutrientIds;
      const newNode: MindNode = {
        id: newNodeId,
        kind: "branch",
        prompt: action.prompt,
        response: action.response,
        children: [],
        parentId,
        timestamp: Date.now(),
        offsetX: 0,
        offsetY: 0,
        layer: state.selectedLayer,
        nutrientRefs,
      };
      const updatedParent = { ...parent, children: [...parent.children, newNodeId] };

      let next = updateActiveProject(state, (activeProject) => {
        const nodes = {
          ...activeProject.nodes,
          [parentId]: updatedParent,
          [newNodeId]: newNode,
        };
        return { ...activeProject, nodes, updatedAt: Date.now() };
      });

      next = { ...next, selectedNodeId: newNodeId };
      const entry = createHistoryEntry({
        state,
        label: `Branch · ${action.prompt.slice(0, 32)}`,
        primaryNodeId: newNodeId,
        affectedNodeIds: [parentId, newNodeId, action.parentId],
        patch: {
          nodeChanges: [
            { nodeId: parentId, before: parent, after: updatedParent },
            { nodeId: newNodeId, before: null, after: newNode },
          ],
        },
      });
      return persist(pushHistory(next, entry));
    }

    case "LEAF": {
      const project = getActiveProject(state);
      if (!project) return state;
      const parentId = resolveBranchParent(project.nodes, action.parentId);
      const parent = project.nodes[parentId];
      if (!parent) return state;

      const newNodeId = `note-${crypto.randomUUID()}`;
      const newNode: MindNode = {
        id: newNodeId,
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
      };
      const updatedParent = { ...parent, children: [...parent.children, newNodeId] };

      let next = updateActiveProject(state, (activeProject) => {
        const nodes = {
          ...activeProject.nodes,
          [parentId]: updatedParent,
          [newNodeId]: newNode,
        };
        return { ...activeProject, nodes, updatedAt: Date.now() };
      });

      next = { ...next, selectedNodeId: newNodeId };
      const entry = createHistoryEntry({
        state,
        label: `Leaf · ${action.content.slice(0, 32)}`,
        primaryNodeId: newNodeId,
        affectedNodeIds: [parentId, newNodeId, action.parentId],
        patch: {
          nodeChanges: [
            { nodeId: parentId, before: parent, after: updatedParent },
            { nodeId: newNodeId, before: null, after: newNode },
          ],
        },
      });
      return persist(pushHistory(next, entry));
    }

    case "GRAFT_START": {
      return { ...state, toolMode: "graft", graftSourceId: action.nodeId };
    }

    case "GRAFT_CONFIRM": {
      const sourceId = state.graftSourceId;
      if (!sourceId || sourceId === action.newParentId) {
        return { ...state, toolMode: "view", graftSourceId: null };
      }

      // Check: new parent must not be a descendant of source
      const nodes = getActiveNodes(state);
      const subtreeIds = collectSubtreeIds(nodes, sourceId);
      if (subtreeIds.has(action.newParentId)) {
        return { ...state, toolMode: "view", graftSourceId: null };
      }

      const sourceBefore = nodes[sourceId];
      const oldParentBefore = sourceBefore?.parentId ? nodes[sourceBefore.parentId] : null;
      const newParentBefore = nodes[action.newParentId];
      if (!sourceBefore || !newParentBefore) {
        return { ...state, toolMode: "view", graftSourceId: null };
      }

      let sourceAfter: MindNode | null = null;
      let oldParentAfter: MindNode | null = null;
      let newParentAfter: MindNode | null = null;

      let next = updateActiveProject(state, (project) => {
        const nodes = { ...project.nodes };
        const source = nodes[sourceId];
        const oldParent = source?.parentId ? nodes[source.parentId] : null;
        const newParent = nodes[action.newParentId];

        if (!source || !newParent) return project;

        // Remove from old parent
        if (oldParent) {
          oldParentAfter = {
            ...oldParent,
            children: oldParent.children.filter((id) => id !== sourceId),
          };
          nodes[oldParent.id] = oldParentAfter;
        }

        // Add to new parent
        newParentAfter = {
          ...newParent,
          children: [...newParent.children, sourceId],
        };
        nodes[newParent.id] = newParentAfter;

        // Update source's parent
        sourceAfter = {
          ...source,
          parentId: action.newParentId,
          layer: newParent.layer,
        };
        nodes[sourceId] = sourceAfter;

        return { ...project, nodes, updatedAt: Date.now() };
      });

      next = { ...next, toolMode: "view", graftSourceId: null };
      const nodeChanges = [
        oldParentBefore && oldParentAfter
          ? { nodeId: oldParentBefore.id, before: oldParentBefore, after: oldParentAfter }
          : null,
        { nodeId: newParentBefore.id, before: newParentBefore, after: newParentAfter ?? newParentBefore },
        { nodeId: sourceBefore.id, before: sourceBefore, after: sourceAfter ?? sourceBefore },
      ].filter((change): change is NonNullable<typeof change> => change !== null);
      const entry = createHistoryEntry({
        state,
        label: `Graft · ${sourceBefore.prompt.slice(0, 32)}`,
        primaryNodeId: sourceId,
        affectedNodeIds: [sourceId, oldParentBefore?.id ?? "", action.newParentId].filter(Boolean),
        patch: { nodeChanges },
      });
      return persist(pushHistory(next, entry));
    }

    case "GRAFT_CANCEL": {
      return { ...state, toolMode: "view", graftSourceId: null };
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
        next = { ...next, toolMode: "view", graftSourceId: null };
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
      const is3D = !state.is3DMode;
      if (is3D) {
        return { ...state, is3DMode: true };
      }
      return { ...state, is3DMode: false };
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
      const next = updateActiveProject(state, (project) => {
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
