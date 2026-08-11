import { getContextPath } from "@/src/lib/contextPath";
import type { NodesMap } from "@/src/types/tree";

export type BranchTopology = {
  rootNodeId: string;
  ancestorNodeIds: string[];
  topBranchId: string;
};

export function getBranchTopology(
  nodes: NodesMap,
  rootNodeId: string,
  nodeId: string,
): BranchTopology {
  const ancestorNodeIds = getContextPath(nodes, nodeId).map((node) => node.id);
  return validateBranchTopology(rootNodeId, nodeId, ancestorNodeIds);
}

export function getBranchTopologyForChild(
  nodes: NodesMap,
  rootNodeId: string,
  parentNodeId: string,
  childNodeId: string,
): BranchTopology {
  if (nodes[childNodeId]) {
    throw new Error(`Branch topology child already exists: ${childNodeId}`);
  }
  const parentPath = getContextPath(nodes, parentNodeId).map((node) => node.id);
  return validateBranchTopology(rootNodeId, childNodeId, [
    ...parentPath,
    childNodeId,
  ]);
}

function validateBranchTopology(
  rootNodeId: string,
  nodeId: string,
  ancestorNodeIds: string[],
): BranchTopology {
  if (ancestorNodeIds[0] !== rootNodeId) {
    throw new Error(
      `Branch topology path must start at project root: ${rootNodeId}`,
    );
  }
  if (ancestorNodeIds.at(-1) !== nodeId) {
    throw new Error(`Branch topology path must end at task node: ${nodeId}`);
  }
  const topBranchId = ancestorNodeIds[1];
  if (!topBranchId) {
    throw new Error(`Root node has no top-level branch: ${nodeId}`);
  }
  return { rootNodeId, ancestorNodeIds, topBranchId };
}
