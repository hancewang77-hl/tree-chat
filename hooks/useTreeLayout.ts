import { useMemo } from "react";
import { hierarchy, tree } from "d3-hierarchy";
import type {
  HierarchyPointNode,
  HierarchyPointLink,
} from "d3-hierarchy";
import type { MindNode, NodesMap } from "@/src/types/tree";

export type { MindNode, NodesMap };

type HierarchyNodeData = MindNode & {
  children: HierarchyNodeData[];
};

type SettledNode = HierarchyPointNode<HierarchyNodeData> & {
  x: number;
  y: number;
};
type SettledLink = HierarchyPointLink<HierarchyNodeData> & {
  source: SettledNode;
  target: SettledNode;
};

export const NODE_W = 3.4;
export const NODE_H = 1.75;
export const LEAF_W = 1.9;
export const LEAF_H = 0.78;
export const LAYER_SPACING = 4.2;
export const X_SPACING = 4.6;
export const Y_SPACING = 2.4;

export function getContextPath(nodes: NodesMap, nodeId: string): MindNode[] {
  const path: MindNode[] = [];
  const seen = new Set<string>();
  let currentId: string | null = nodeId;

  // The visited guard stops a cyclic parentId chain (e.g. corrupt persisted
  // state where a → b → a) from looping forever.
  while (currentId && nodes[currentId] && !seen.has(currentId)) {
    seen.add(currentId);
    path.unshift(nodes[currentId]);
    currentId = nodes[currentId].parentId;
  }

  return path;
}

type TreeLayoutInput = {
  nodes: NodesMap;
  selectedNodeId: string;
  selectedLayer: number;
  is3DMode: boolean;
  movingNodeId: string | null;
  pendingNodeLayer: number | null;
  rootNodeId?: string;
};

export type LeafAttachment = {
  node: MindNode;
  parentId: string;
  index: number;
  total: number;
};

export type PositionedLeafAttachment = LeafAttachment & {
  parentPoint: SettledNode;
};

export function getTrunkChildIds(nodes: NodesMap, nodeId: string): string[] {
  const node = nodes[nodeId];
  if (!node) return [];
  return node.children.filter((childId) => nodes[childId]?.kind !== "leaf");
}

export function getLeafAttachments(nodes: NodesMap, parentId: string): LeafAttachment[] {
  const leafNodes = (nodes[parentId]?.children ?? [])
    .map((childId) => nodes[childId])
    .filter((node): node is MindNode => node?.kind === "leaf");

  return leafNodes.map((node, index) => ({
    node,
    parentId,
    index,
    total: leafNodes.length,
  }));
}

export function useTreeLayout({
  nodes,
  selectedNodeId,
  selectedLayer,
  is3DMode,
  movingNodeId,
  pendingNodeLayer,
  rootNodeId = "root",
}: TreeLayoutInput) {
  const visibleIds = useMemo(
    () => (is3DMode ? null : new Set(Object.keys(nodes))),
    [is3DMode, nodes],
  );

  const fullTreeLayout = useMemo(() => {
    // `seen` prevents unbounded recursion if corrupt persisted state contains a
    // children cycle (a lists b, b lists a); a revisited id is skipped.
    const seen = new Set<string>();
    function buildHierarchy(id: string): HierarchyNodeData | null {
      const node = nodes[id];
      if (!node || seen.has(id)) return null;
      seen.add(id);
      const hierarchyChildren = getTrunkChildIds(nodes, id)
        .map((childId) => buildHierarchy(childId))
        .filter((c): c is HierarchyNodeData => c !== null);
      return { ...node, children: hierarchyChildren } as HierarchyNodeData;
    }

    const rootHierarchy = buildHierarchy(rootNodeId);
    if (!rootHierarchy) {
      return {
        descendants: [] as HierarchyPointNode<HierarchyNodeData>[],
        links: [] as HierarchyPointLink<HierarchyNodeData>[],
      };
    }

    const rootD3 = hierarchy(rootHierarchy);
    const treeLayout = tree<HierarchyNodeData>()
      .nodeSize([Y_SPACING, X_SPACING]);
    treeLayout(rootD3);

    return {
      descendants: rootD3.descendants() as SettledNode[],
      links: rootD3.links() as SettledLink[],
    };
  }, [nodes, rootNodeId]);

  const renderedNodes = useMemo(() => {
    return fullTreeLayout.descendants.filter((d) =>
      is3DMode ? true : visibleIds?.has(d.data.id),
    );
  }, [fullTreeLayout.descendants, is3DMode, visibleIds]);

  const renderedLinks = useMemo(() => {
    return fullTreeLayout.links.filter((l) =>
      is3DMode
        ? true
        : visibleIds?.has(l.source.data.id) &&
          visibleIds?.has(l.target.data.id),
    );
  }, [fullTreeLayout.links, is3DMode, visibleIds]);

  const renderedLeafAttachments = useMemo(() => {
    return renderedNodes.flatMap((parentPoint) =>
      getLeafAttachments(nodes, parentPoint.data.id).map((attachment) => ({
        ...attachment,
        parentPoint: parentPoint as SettledNode,
      })),
    );
  }, [nodes, renderedNodes]);

  const currentPathIds = useMemo(() => {
    const path = getContextPath(nodes, selectedNodeId);
    return new Set(path.map((n) => n.id));
  }, [nodes, selectedNodeId]);

  function effectiveLayer(node: MindNode) {
    if (movingNodeId === node.id && pendingNodeLayer !== null) {
      return pendingNodeLayer;
    }
    return node.layer;
  }

  const globalPlaneBounds = useMemo(() => {
    if (fullTreeLayout.descendants.length === 0) {
      return { width: 18, height: 11, centerX: 8, centerY: -2 };
    }

    const nodeRects = fullTreeLayout.descendants.map((node) => {
      const x = node.y + (node.data.offsetX ?? 0) / 100;
      const y = -node.x - (node.data.offsetY ?? 0) / 100;

      return {
        left: x - NODE_W / 2,
        right: x + NODE_W / 2,
        top: y + NODE_H / 2,
        bottom: y - NODE_H / 2,
      };
    });

    let left = Math.min(...nodeRects.map((r) => r.left));
    let right = Math.max(...nodeRects.map((r) => r.right));
    let top = Math.max(...nodeRects.map((r) => r.top));
    let bottom = Math.min(...nodeRects.map((r) => r.bottom));

    const paddingX = 0.3;
    const paddingY = 0.6;

    left -= paddingX;
    right += paddingX;
    top += paddingY;
    bottom -= paddingY;

    let width = right - left;
    let height = top - bottom;

    const targetAspect = 1.7;
    const currentAspect = width / height;

    if (currentAspect > targetAspect) {
      const desiredHeight = width / targetAspect;
      const extra = (desiredHeight - height) / 2;
      top += extra;
      bottom -= extra;
      height = desiredHeight;
    } else {
      const desiredWidth = height * targetAspect;
      const extra = (desiredWidth - width) / 2;
      left -= extra;
      right += extra;
      width = desiredWidth;
    }

    return {
      width,
      height,
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2,
    };
  }, [fullTreeLayout.descendants]);

  const allLayers = Object.values(nodes).map((n) => n.layer);
  const minLayer = Math.min(...allLayers, selectedLayer, 0);
  const maxLayer = Math.max(...allLayers, selectedLayer, 0);

  return {
    renderedNodes,
    renderedLinks,
    renderedLeafAttachments,
    currentPathIds,
    effectiveLayer,
    globalPlaneBounds,
    minLayer,
    maxLayer,
  };
}
