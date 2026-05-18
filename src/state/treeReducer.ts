import type { TreeState, TreeAction, Project, MindNode, Snapshot, NodesMap } from "@/src/types/tree";
import { loadWorkspace, saveWorkspace } from "@/src/lib/storage";

const MAX_HISTORY = 50;

function makeRootNode(): MindNode {
  return {
    id: "root",
    prompt: "思考的起点",
    response: "这是你思维之树的根。从这里开始，提出一个问题，AI 会帮助你展开枝叶。每一个节点都可以继续生长出新的分支。试着在下方输入你的第一个问题，让这棵树开始生长吧。",
    children: [],
    parentId: null,
    timestamp: Date.now(),
    offsetX: 0,
    offsetY: 0,
    layer: 0,
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
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function takeSnapshot(state: TreeState): Snapshot {
  return {
    projects: state.projects,
    activeProjectId: state.activeProjectId,
  };
}

function pushSnapshot(state: TreeState): TreeState {
  const snap = takeSnapshot(state);
  const past = [...state.history.past, snap].slice(-MAX_HISTORY);
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
  history: { past: [], future: [] },
};

export function initialState(): TreeState {
  return EMPTY_STATE;
}

export function loadInitialState(): TreeState {
  const workspace = loadWorkspace();
  const projects = workspace.projects;
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

export function treeReducer(state: TreeState, action: TreeAction): TreeState {
  switch (action.type) {
    case "HYDRATE": {
      return { ...action.state, history: { past: [], future: [] } };
    }

    case "SEED": {
      let next = pushSnapshot(state);
      const project = createProject(action.name);
      next = {
        ...next,
        projects: { ...next.projects, [project.id]: project },
        activeProjectId: project.id,
        selectedNodeId: project.rootNodeId,
        selectedLayer: 0,
        planeNames: { 0: "根节点层" },
      };
      return persist(next);
    }

    case "BRANCH": {
      let next = pushSnapshot(state);
      const newNodeId = `node-${crypto.randomUUID()}`;
      const newNode: MindNode = {
        id: newNodeId,
        prompt: action.prompt,
        response: action.response,
        children: [],
        parentId: action.parentId,
        timestamp: Date.now(),
        offsetX: 0,
        offsetY: 0,
        layer: state.selectedLayer,
      };

      next = updateActiveProject(next, (project) => {
        const nodes = { ...project.nodes, [newNodeId]: newNode };
        const parent = nodes[action.parentId];
        if (parent) {
          nodes[action.parentId] = { ...parent, children: [...parent.children, newNodeId] };
        }
        return { ...project, nodes, updatedAt: Date.now() };
      });

      next = { ...next, selectedNodeId: newNodeId };
      return persist(next);
    }

    case "LEAF": {
      let next = pushSnapshot(state);
      const newNodeId = `note-${crypto.randomUUID()}`;
      const newNode: MindNode = {
        id: newNodeId,
        prompt: action.content,
        response: "",
        children: [],
        parentId: action.parentId,
        timestamp: Date.now(),
        offsetX: 0,
        offsetY: 0,
        layer: state.selectedLayer,
      };

      next = updateActiveProject(next, (project) => {
        const nodes = { ...project.nodes, [newNodeId]: newNode };
        const parent = nodes[action.parentId];
        if (parent) {
          nodes[action.parentId] = { ...parent, children: [...parent.children, newNodeId] };
        }
        return { ...project, nodes, updatedAt: Date.now() };
      });

      next = { ...next, selectedNodeId: newNodeId };
      return persist(next);
    }

    case "GRAFT_START": {
      return { ...state, toolMode: "graft", graftSourceId: action.nodeId };
    }

    case "GRAFT_CONFIRM": {
      const sourceId = state.graftSourceId;
      if (!sourceId || sourceId === action.newParentId) {
        return { ...state, toolMode: "view", graftSourceId: null };
      }

      let next = pushSnapshot(state);

      // Check: new parent must not be a descendant of source
      const nodes = getActiveNodes(next);
      const subtreeIds = collectSubtreeIds(nodes, sourceId);
      if (subtreeIds.has(action.newParentId)) {
        return { ...state, toolMode: "view", graftSourceId: null };
      }

      next = updateActiveProject(next, (project) => {
        const nodes = { ...project.nodes };
        const source = nodes[sourceId];
        const oldParent = source?.parentId ? nodes[source.parentId] : null;
        const newParent = nodes[action.newParentId];

        if (!source || !newParent) return project;

        // Remove from old parent
        if (oldParent) {
          nodes[oldParent.id] = {
            ...oldParent,
            children: oldParent.children.filter((id) => id !== sourceId),
          };
        }

        // Add to new parent
        nodes[newParent.id] = {
          ...newParent,
          children: [...newParent.children, sourceId],
        };

        // Update source's parent
        nodes[sourceId] = {
          ...source,
          parentId: action.newParentId,
          layer: newParent.layer,
        };

        return { ...project, nodes, updatedAt: Date.now() };
      });

      next = { ...next, toolMode: "view", graftSourceId: null };
      return persist(next);
    }

    case "GRAFT_CANCEL": {
      return { ...state, toolMode: "view", graftSourceId: null };
    }

    case "PRUNE": {
      const nodes = getActiveNodes(state);
      if (action.nodeId === "root" || action.nodeId === getActiveProject(state)?.rootNodeId) return state;

      let next = pushSnapshot(state);
      const subtreeIds = collectSubtreeIds(nodes, action.nodeId);

      next = updateActiveProject(next, (project) => {
        const updatedNodes = { ...project.nodes };
        const node = updatedNodes[action.nodeId];
        if (node?.parentId && updatedNodes[node.parentId]) {
          updatedNodes[node.parentId] = {
            ...updatedNodes[node.parentId],
            children: updatedNodes[node.parentId].children.filter((id) => id !== action.nodeId),
          };
        }
        for (const id of subtreeIds) {
          delete updatedNodes[id];
        }
        return { ...project, nodes: updatedNodes, updatedAt: Date.now() };
      });

      // Select parent if selected node was pruned
      if (subtreeIds.has(next.selectedNodeId) || next.selectedNodeId === action.nodeId) {
        const prunedNode = nodes[action.nodeId];
        next = { ...next, selectedNodeId: prunedNode?.parentId ?? getActiveProject(next)?.rootNodeId ?? "root" };
      }

      // Cancel active graft if source was pruned
      if (next.graftSourceId && subtreeIds.has(next.graftSourceId)) {
        next = { ...next, toolMode: "view", graftSourceId: null };
      }

      return persist(next);
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
      return { ...state, isRingsOpen: !state.isRingsOpen };
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
      if (state.history.past.length === 0) return state;
      const past = [...state.history.past];
      const snap = past.pop()!;
      const next: TreeState = {
        ...state,
        projects: snap.projects,
        activeProjectId: snap.activeProjectId,
        history: {
          past,
          future: [takeSnapshot(state), ...state.history.future],
        },
      };
      const project = next.projects[next.activeProjectId];
      if (project) {
        next.selectedNodeId = project.rootNodeId;
      }
      return persist(next);
    }

    case "REDO": {
      if (state.history.future.length === 0) return state;
      const future = [...state.history.future];
      const snap = future.shift()!;
      const next: TreeState = {
        ...state,
        projects: snap.projects,
        activeProjectId: snap.activeProjectId,
        history: {
          past: [...state.history.past, takeSnapshot(state)],
          future,
        },
      };
      return persist(next);
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
      const next = pushSnapshot(state);
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
      return persist(next);
    }

    case "SET_NODE_OFFSET": {
      const next = updateActiveProject(state, (project) => {
        const nodes = { ...project.nodes };
        const node = nodes[action.nodeId];
        if (node) {
          nodes[action.nodeId] = { ...node, offsetX: action.offsetX, offsetY: action.offsetY };
        }
        return { ...project, nodes };
      });
      return persist(next);
    }

    default:
      return state;
  }
}
