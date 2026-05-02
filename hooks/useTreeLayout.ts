import { useMemo } from "react";
import { hierarchy, tree } from "d3-hierarchy";
import type {
  HierarchyPointNode,
  HierarchyPointLink,
} from "d3-hierarchy";

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
export const LAYER_SPACING = 4.2;
export const X_SPACING = 4.6;
export const Y_SPACING = 2.4;

export function getContextPath(nodes: NodesMap, nodeId: string): MindNode[] {
  const path: MindNode[] = [];
  let currentId: string | null = nodeId;

  while (currentId && nodes[currentId]) {
    path.unshift(nodes[currentId]);
    currentId = nodes[currentId].parentId;
  }

  return path;
}

export function getVisibleIdsForPlane(nodes: NodesMap, layer: number) {
  const ids = new Set<string>();
  const planeIds = Object.values(nodes)
    .filter((node) => node.layer === layer)
    .map((node) => node.id);

  if (planeIds.length === 0) {
    ids.add("root");
    return ids;
  }

  for (const id of planeIds) {
    let current: string | null = id;
    while (current && nodes[current]) {
      ids.add(current);
      current = nodes[current].parentId;
    }
  }

  return ids;
}

type TreeLayoutInput = {
  nodes: NodesMap;
  selectedNodeId: string;
  selectedLayer: number;
  is3DMode: boolean;
  movingNodeId: string | null;
  pendingNodeLayer: number | null;
};

export function useTreeLayout({
  nodes,
  selectedNodeId,
  selectedLayer,
  is3DMode,
  movingNodeId,
  pendingNodeLayer,
}: TreeLayoutInput) {
  const visibleIds = useMemo(
    () => (is3DMode ? null : new Set(Object.keys(nodes))),
    [is3DMode, nodes],
  );

  const fullTreeLayout = useMemo(() => {
    function buildHierarchy(id: string): HierarchyNodeData | null {
      const node = nodes[id];
      if (!node) return null;
      const hierarchyChildren = node.children
        .map((childId) => buildHierarchy(childId))
        .filter((c): c is HierarchyNodeData => c !== null);
      return { ...node, children: hierarchyChildren } as HierarchyNodeData;
    }

    const rootHierarchy = buildHierarchy("root");
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
  }, [nodes]);

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

  const currentPath = useMemo(
    () => getContextPath(nodes, selectedNodeId),
    [nodes, selectedNodeId],
  );

  const currentPathIds = useMemo(
    () => new Set(currentPath.map((n) => n.id)),
    [currentPath],
  );

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

  const layerBoundsMap = useMemo(() => {
    const map = new Map<
      number,
      { width: number; height: number; centerX: number; centerY: number }
    >();

    const allLayers = Object.values(nodes).map((n) => n.layer);
    const minLayer = Math.min(...allLayers, selectedLayer, 0);
    const maxLayer = Math.max(...allLayers, selectedLayer, 0);

    for (let layer = minLayer - 2; layer <= maxLayer + 2; layer++) {
      const layerNodes = fullTreeLayout.descendants.filter(
        (n) => n.data.layer === layer,
      );

      if (layerNodes.length === 0) {
        map.set(layer, {
          width: 8,
          height: 4.8,
          centerX: 2.5,
          centerY: -1.2,
        });
        continue;
      }

      const minX = Math.min(
        ...layerNodes.map((n) => n.y + (n.data.offsetX ?? 0) / 100),
      );
      const minY = Math.min(
        ...layerNodes.map((n) => -n.x - (n.data.offsetY ?? 0) / 100),
      );
      const maxX = Math.max(
        ...layerNodes.map((n) => n.y + (n.data.offsetX ?? 0) / 100 + NODE_W),
      );
      const maxY = Math.max(
        ...layerNodes.map((n) => -n.x - (n.data.offsetY ?? 0) / 100 + NODE_H),
      );

      const paddingX = 1;
      const paddingY = 0.8;

      const left = minX - paddingX;
      const right = maxX + paddingX;
      const bottom = minY - paddingY;
      const top = maxY + paddingY;

      map.set(layer, {
        width: right - left,
        height: top - bottom,
        centerX: (left + right) / 2,
        centerY: (bottom + top) / 2,
      });
    }

    return map;
  }, [fullTreeLayout.descendants, nodes, selectedLayer]);

  const allLayers = Object.values(nodes).map((n) => n.layer);
  const minLayer = Math.min(...allLayers, selectedLayer, 0);
  const maxLayer = Math.max(...allLayers, selectedLayer, 0);

  return {
    visibleIds,
    fullTreeLayout,
    renderedNodes,
    renderedLinks,
    currentPath,
    currentPathIds,
    effectiveLayer,
    globalPlaneBounds,
    layerBoundsMap,
    allLayers,
    minLayer,
    maxLayer,
  };
}
