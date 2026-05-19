"use client";

import { useTreeState, useTreeDispatch } from "@/src/state/TreeContext";
import type { MindNode } from "@/src/types/tree";

export function CanopyMinimap() {
  const state = useTreeState();
  const dispatch = useTreeDispatch();
  const activeProject = state.projects[state.activeProjectId];
  if (!activeProject) return null;

  const nodes = activeProject.nodes;
  const allNodes = Object.values(nodes);
  if (allNodes.length === 0) return null;

  const PADDING = 20;
  const W = 220;
  const H = 160;

  // Compute bounding box of tree positions
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  // We need to compute tree positions. For the minimap, use a simple BFS layout.
  const positions = computeSimplePositions(nodes, activeProject.rootNodeId);

  for (const pos of Object.values(positions)) {
    minX = Math.min(minX, pos.x);
    maxX = Math.max(maxX, pos.x);
    minY = Math.min(minY, pos.y);
    maxY = Math.max(maxY, pos.y);
  }

  const dataW = maxX - minX || 1;
  const dataH = maxY - minY || 1;
  const scale = Math.min((W - PADDING * 2) / dataW, (H - PADDING * 2) / dataH);

  function tx(x: number) { return PADDING + (x - minX) * scale; }
  function ty(y: number) { return PADDING + (y - minY) * scale; }

  return (
    <div
      className="absolute bottom-16 left-4 z-30 rounded-xl overflow-hidden shadow-lg"
      style={{
        background: "rgba(216, 204, 184, 0.94)",
        border: "1px solid var(--border-warm)",
        width: W,
        height: H,
      }}
    >
      <svg width={W} height={H} className="block">
        {/* Edges */}
        {allNodes.map((node) => {
          if (!node.parentId) return null;
          const parent = positions[node.parentId];
          const child = positions[node.id];
          if (!parent || !child) return null;
          return (
            <line
              key={`e-${node.id}`}
              x1={tx(parent.x)}
              y1={ty(parent.y)}
              x2={tx(child.x)}
              y2={ty(child.y)}
              stroke="var(--border-warm)"
              strokeWidth={1}
            />
          );
        })}

        {/* Nodes */}
        {allNodes.map((node) => {
          const pos = positions[node.id];
          if (!pos) return null;
          const isSelected = node.id === state.selectedNodeId;
          const isRoot = node.id === activeProject.rootNodeId;
          return (
            <circle
              key={node.id}
              cx={tx(pos.x)}
              cy={ty(pos.y)}
              r={isRoot ? 4 : isSelected ? 3.5 : 2.5}
              fill={
                isSelected
                  ? "var(--accent-amber)"
                  : isRoot
                  ? "var(--accent-bark)"
                  : "var(--accent-sage)"
              }
              stroke="var(--bg-cream)"
              strokeWidth={1}
              style={{ cursor: "pointer" }}
              onClick={() => dispatch({ type: "SUNLIGHT", nodeId: node.id })}
            />
          );
        })}
      </svg>

      <div
        className="absolute bottom-1 right-2 text-[9px]"
        style={{ color: "var(--text-muted)" }}
      >
        {allNodes.length} nodes
      </div>
    </div>
  );
}

function computeSimplePositions(
  nodes: Record<string, MindNode>,
  rootId: string
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const X_GAP = 30;
  const Y_GAP = 40;

  function layout(nodeId: string, x: number, y: number) {
    positions[nodeId] = { x, y };
    const node = nodes[nodeId];
    if (!node || node.children.length === 0) return;

    const totalWidth = (node.children.length - 1) * X_GAP;
    const startX = x - totalWidth / 2;

    for (let i = 0; i < node.children.length; i++) {
      layout(node.children[i], startX + i * X_GAP, y + Y_GAP);
    }
  }

  layout(rootId, 0, 0);
  return positions;
}
