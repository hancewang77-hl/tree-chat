import type { MindNode, NodesMap } from "@/src/types/tree";

export function getContextPath(nodes: NodesMap, nodeId: string): MindNode[] {
  const reversePath: MindNode[] = [];
  const visited = new Set<string>();
  let currentId: string | null = nodeId;

  while (currentId) {
    if (visited.has(currentId)) {
      const cycle = [...reversePath.map((node) => node.id), currentId].join(" -> ");
      throw new Error(`Context path cycle detected: ${cycle}`);
    }

    const current: MindNode | undefined = nodes[currentId];
    if (!current) {
      const relation = reversePath.length === 0 ? "node" : "parent node";
      throw new Error(`Context path ${relation} not found: ${currentId}`);
    }

    visited.add(currentId);
    reversePath.push(current);
    currentId = current.parentId;
  }

  return reversePath.reverse();
}
