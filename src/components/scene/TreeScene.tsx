"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { flushSync } from "react-dom";
import type { HierarchyPointLink, HierarchyPointNode } from "d3-hierarchy";
import type { MindNode, NodesMap, ToolMode } from "@/src/types/tree";
import { LEAF_VEIN_PATTERN } from "@/src/lib/visualPatterns";
import {
  LEAF_H,
  LEAF_W,
  NODE_H,
  NODE_W,
  computeLeafWorldPosition,
  useTreeLayout,
} from "@/hooks/useTreeLayout";
import {
  BASE_WORLD_SCALE,
  centerViewportOn,
  pointIntersectsBounds,
  preserveViewportCenter,
  viewportWorldBounds,
  worldPointToPixels,
  zoomPercentToScale,
  type Viewport2D,
} from "@/src/lib/viewport2d";
import { NodeCard2D } from "./NodeCard2D";
import { ZoomControls } from "@/src/components/toolbar/ZoomControls";
import { clamp } from "@/src/lib/utils";

type HierarchyNodeData = MindNode & { children: HierarchyNodeData[] };

type Point = { x: number; y: number };

function nodeWorldPoint(node: HierarchyPointNode<HierarchyNodeData>): Point {
  return {
    x: node.y + (node.data.offsetX ?? 0) / 100,
    y: -node.x - (node.data.offsetY ?? 0) / 100,
  };
}

function quadraticBranchPath(
  source: Point,
  target: Point,
  offset = 0,
): string {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  const bow = Math.min(length * 0.1, 0.45) + offset;
  const control = {
    x: (source.x + target.x) / 2 + (-dy / length) * bow,
    y: (source.y + target.y) / 2 + (dx / length) * bow,
  };
  const start = worldPointToPixels(source);
  const end = worldPointToPixels(target);
  const bend = worldPointToPixels(control);
  return `M ${start.x} ${start.y} Q ${bend.x} ${bend.y} ${end.x} ${end.y}`;
}

function selectedWorldPoint(
  selectedNodeId: string,
  renderedNodes: HierarchyPointNode<HierarchyNodeData>[],
  renderedLeafAttachments: ReturnType<typeof useTreeLayout>["renderedLeafAttachments"],
): Point | null {
  const branch = renderedNodes.find((node) => node.data.id === selectedNodeId);
  if (branch) return nodeWorldPoint(branch);

  const leaf = renderedLeafAttachments.find(
    (attachment) => attachment.node.id === selectedNodeId,
  );
  if (!leaf) return null;

  const parent = nodeWorldPoint(leaf.parentPoint);
  return computeLeafWorldPosition(
    parent.x,
    parent.y,
    leaf.index,
    leaf.total,
  );
}

export function TreeScene({
  nodes,
  selectedNodeId,
  selectedLayer,
  toolMode,
  movingNodeId,
  pendingNodeLayer,
  zoom2D,
  onSelectNode,
  onConfirmLayerMove,
  onOpenNodeRings,
}: {
  nodes: NodesMap;
  selectedNodeId: string;
  selectedLayer: number;
  toolMode: ToolMode;
  movingNodeId: string | null;
  pendingNodeLayer: number | null;
  zoom2D: number;
  onSelectNode: (id: string) => void;
  onConfirmLayerMove: () => void;
  onOpenNodeRings: (id: string) => void;
}) {
  const initialScale = zoomPercentToScale(zoom2D);
  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const viewportRef = useRef<Viewport2D>({ x: 0, y: 0, scale: initialScale });
  const visualViewportRef = useRef<Viewport2D>({ x: 0, y: 0, scale: initialScale });
  const desiredViewportRef = useRef<Viewport2D>({ x: 0, y: 0, scale: initialScale });
  const cameraFrameRef = useRef<number | null>(null);
  const lastCameraFrameAtRef = useRef(0);
  const lastCameraInputAtRef = useRef(0);
  const initializedRef = useRef(false);
  const centeredNodeIdRef = useRef<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [sceneZoom, setSceneZoom] = useState(zoom2D);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewportState] = useState<Viewport2D>(() => ({
    x: 0,
    y: 0,
    scale: zoomPercentToScale(zoom2D),
  }));

  const setViewport = useCallback((next: Viewport2D) => {
    viewportRef.current = next;
    visualViewportRef.current = next;
    desiredViewportRef.current = next;
    setViewportState(next);
  }, []);

  const showCameraPreview = useCallback((current: Viewport2D) => {
    const element = panRef.current;
    if (!element) return;
    const base = viewportRef.current;
    element.style.transform = `translate3d(${current.x - base.x}px, ${current.y - base.y}px, 0) scale(${current.scale / base.scale})`;
    element.style.transformOrigin = "0 0";
    element.style.transition = "none";
    const container = containerRef.current;
    container?.classList.add("is-camera-moving");
    container?.classList.toggle("is-compact-view", current.scale < 0.58);
    container?.classList.toggle("is-minimal-view", current.scale < 0.32);
  }, []);

  const commitCamera = useCallback((target: Viewport2D) => {
    flushSync(() => {
      setViewport(target);
      setSceneZoom(target.scale * BASE_WORLD_SCALE);
    });
    const element = panRef.current;
    if (element) {
      element.style.transform = "none";
    }
    const container = containerRef.current;
    container?.classList.remove("is-camera-moving");
    container?.classList.toggle("is-compact-view", target.scale < 0.58);
    container?.classList.toggle("is-minimal-view", target.scale < 0.32);
  }, [setViewport]);

  const startCamera = useCallback(() => {
    if (cameraFrameRef.current !== null) return;
    lastCameraFrameAtRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = Math.min(now - lastCameraFrameAtRef.current, 34);
      lastCameraFrameAtRef.current = now;
      const current = visualViewportRef.current;
      const desired = desiredViewportRef.current;
      const alpha = 1 - Math.exp(-elapsed / 62);
      const next = {
        x: current.x + (desired.x - current.x) * alpha,
        y: current.y + (desired.y - current.y) * alpha,
        scale: current.scale + (desired.scale - current.scale) * alpha,
      };
      visualViewportRef.current = next;
      showCameraPreview(next);

      const settled =
        Math.abs(next.x - desired.x) < 0.08 &&
        Math.abs(next.y - desired.y) < 0.08 &&
        Math.abs(next.scale - desired.scale) < 0.00015 &&
        now - lastCameraInputAtRef.current > 70;

      if (settled) {
        cameraFrameRef.current = null;
        commitCamera(desired);
        return;
      }
      cameraFrameRef.current = requestAnimationFrame(tick);
    };

    cameraFrameRef.current = requestAnimationFrame(tick);
  }, [commitCamera, showCameraPreview]);

  const stopCamera = useCallback(() => {
    if (cameraFrameRef.current !== null) {
      cancelAnimationFrame(cameraFrameRef.current);
      cameraFrameRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      stopCamera();
    },
    [stopCamera],
  );

  const {
    renderedNodes,
    renderedLinks,
    renderedLeafAttachments,
    currentPathIds,
  } = useTreeLayout({
    nodes,
    selectedNodeId,
    selectedLayer,
    is3DMode: false,
    movingNodeId,
    pendingNodeLayer,
  });

  const selectedPoint = useMemo(
    () => selectedWorldPoint(selectedNodeId, renderedNodes, renderedLeafAttachments),
    [renderedLeafAttachments, renderedNodes, selectedNodeId],
  );

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setViewportSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedPoint || viewportSize.width === 0 || viewportSize.height === 0) {
      return;
    }
    if (
      initializedRef.current &&
      centeredNodeIdRef.current === selectedNodeId
    ) {
      return;
    }
    const pixelPoint = worldPointToPixels(selectedPoint);
    const next = centerViewportOn(
      pixelPoint,
      viewportSize,
      desiredViewportRef.current.scale,
    );
    if (initializedRef.current) {
      desiredViewportRef.current = next;
      lastCameraInputAtRef.current = performance.now();
      startCamera();
    } else {
      setViewport(next);
    }
    initializedRef.current = true;
    centeredNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId, selectedPoint, setViewport, startCamera, viewportSize]);

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const pixelDelta =
      event.deltaMode === 1
        ? event.deltaY * 16
        : event.deltaMode === 2
          ? event.deltaY * window.innerHeight
          : event.deltaY;
    const boundedDelta = clamp(pixelDelta, -120, 120);
    const desired = desiredViewportRef.current;
    const nextScale = clamp(
      desired.scale * Math.exp(-boundedDelta * 0.00105),
      zoomPercentToScale(10),
      zoomPercentToScale(260),
    );
    desiredViewportRef.current = preserveViewportCenter(
      desired,
      viewportSize,
      nextScale,
    );
    lastCameraInputAtRef.current = performance.now();
    startCamera();
  };

  const nudgeZoom = (amount: number) => {
    const desired = desiredViewportRef.current;
    const nextScale = clamp(
      desired.scale + zoomPercentToScale(amount),
      zoomPercentToScale(10),
      zoomPercentToScale(260),
    );
    desiredViewportRef.current = preserveViewportCenter(
      desired,
      viewportSize,
      nextScale,
    );
    lastCameraInputAtRef.current = performance.now();
    startCamera();
  };

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
    stopCamera();
    commitCamera(visualViewportRef.current);
    const current = visualViewportRef.current;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: current.x,
      originY: current.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  };

  const continuePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    desiredViewportRef.current = {
      ...desiredViewportRef.current,
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    };
    lastCameraInputAtRef.current = performance.now();
    startCamera();
  };

  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsPanning(false);
    lastCameraInputAtRef.current = performance.now();
    startCamera();
  };

  const virtualBounds = useMemo(
    () => viewportWorldBounds(viewport, viewportSize, 0.8),
    [viewport, viewportSize],
  );
  const visibleNodes = useMemo(
    () =>
      renderedNodes.filter((node) => {
        if (node.data.id === selectedNodeId) return true;
        return pointIntersectsBounds(
          worldPointToPixels(nodeWorldPoint(node)),
          virtualBounds,
          Math.max(NODE_W, NODE_H) * BASE_WORLD_SCALE,
        );
      }),
    [renderedNodes, selectedNodeId, virtualBounds],
  );
  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((node) => node.data.id)),
    [visibleNodes],
  );
  const visibleLinks = useMemo(
    () =>
      renderedLinks.filter(
        (link) =>
          visibleNodeIds.has(link.source.data.id) ||
          visibleNodeIds.has(link.target.data.id),
      ),
    [renderedLinks, visibleNodeIds],
  );
  const visibleLeafAttachments = useMemo(
    () =>
      renderedLeafAttachments.filter((attachment) => {
        if (
          attachment.node.id === selectedNodeId ||
          visibleNodeIds.has(attachment.parentPoint.data.id)
        ) {
          return true;
        }
        const parent = nodeWorldPoint(attachment.parentPoint);
        const leaf = computeLeafWorldPosition(
          parent.x,
          parent.y,
          attachment.index,
          attachment.total,
        );
        return pointIntersectsBounds(
          worldPointToPixels(leaf),
          virtualBounds,
          LEAF_W * BASE_WORLD_SCALE,
        );
      }),
    [renderedLeafAttachments, selectedNodeId, virtualBounds, visibleNodeIds],
  );

  return (
    <div
      ref={containerRef}
      className={`tree-scene-2d ${isPanning ? "is-panning" : ""} ${viewport.scale < 0.58 ? "is-compact-view" : ""} ${viewport.scale < 0.32 ? "is-minimal-view" : ""}`}
      style={{
        backgroundImage: [
          LEAF_VEIN_PATTERN,
          "var(--workbench-canvas-background)",
        ].join(", "),
        backgroundSize: "260px 210px, auto",
        backgroundPosition: "18px 24px, center",
      }}
      onPointerDown={beginPan}
      onPointerMove={continuePan}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onWheel={handleWheel}
      onContextMenu={(event) => event.preventDefault()}
      aria-label="对话树二维画布"
    >
      <div
        ref={panRef}
        className="tree-pan-2d"
        style={{
          left: viewport.x,
          top: viewport.y,
          transform: "none",
          transition: "none",
        }}
      >
        <div
          className="tree-world-2d"
          style={{ zoom: viewport.scale }}
        >
        <svg className="tree-links-2d" width="1" height="1" aria-hidden="true">
          {visibleLinks.map((link, index) => (
            <BranchLink2D
              key={`${link.source.data.id}-${link.target.data.id}-${index}`}
              link={link}
              highlighted={
                currentPathIds.has(link.source.data.id) &&
                currentPathIds.has(link.target.data.id)
              }
            />
          ))}
          {visibleLeafAttachments.map((attachment) => {
            const parent = nodeWorldPoint(attachment.parentPoint);
            const leaf = computeLeafWorldPosition(
              parent.x,
              parent.y,
              attachment.index,
              attachment.total,
            );
            const start = worldPointToPixels({
              x: parent.x,
              y: parent.y + NODE_H / 2 - 0.03,
            });
            const end = worldPointToPixels({
              x: leaf.x,
              y: leaf.y - LEAF_H / 2 + 0.02,
            });
            const selected = attachment.node.id === selectedNodeId;
            return (
              <line
                key={`leaf-stem-${attachment.node.id}`}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={selected ? "#747A55" : "#9C9A70"}
                strokeWidth={selected ? 1.5 : 0.95}
                strokeOpacity={selected ? 0.78 : 0.58}
              />
            );
          })}
        </svg>

        {visibleNodes.map((node) => {
          const point = worldPointToPixels(nodeWorldPoint(node));
          const previewLayer =
            movingNodeId === node.data.id && pendingNodeLayer !== null
              ? pendingNodeLayer
              : node.data.layer;
          const isMoving = movingNodeId === node.data.id;
          return (
            <div
              key={node.data.id}
              className="tree-node-position-2d"
              style={{
                left: Math.round(point.x - (NODE_W * BASE_WORLD_SCALE) / 2),
                top: Math.round(point.y - (NODE_H * BASE_WORLD_SCALE) / 2),
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <NodeCard2D
                node={{ ...node.data, layer: previewLayer }}
                selected={node.data.id === selectedNodeId}
                inPath={currentPathIds.has(node.data.id)}
                onSelect={() => onSelectNode(node.data.id)}
                showConfirmButton={toolMode === "layerMove" && isMoving}
                onConfirmLayerMove={onConfirmLayerMove}
                onOpenRings={() => onOpenNodeRings(node.data.id)}
              />
            </div>
          );
        })}

        {visibleLeafAttachments.map((attachment) => {
          const parent = nodeWorldPoint(attachment.parentPoint);
          const leaf = computeLeafWorldPosition(
            parent.x,
            parent.y,
            attachment.index,
            attachment.total,
          );
          const point = worldPointToPixels(leaf);
          const selected = attachment.node.id === selectedNodeId;
          return (
            <button
              key={attachment.node.id}
              type="button"
              className={`tree-leaf-2d ${selected ? "is-selected" : ""}`}
              style={{
                left: Math.round(point.x - (LEAF_W * BASE_WORLD_SCALE) / 2),
                top: Math.round(point.y - (LEAF_H * BASE_WORLD_SCALE) / 2),
                width: Math.round(LEAF_W * BASE_WORLD_SCALE),
                height: Math.round(LEAF_H * BASE_WORLD_SCALE),
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onSelectNode(attachment.node.id)}
              aria-label={`选择叶片：${attachment.node.prompt || "未命名"}`}
            >
              <span className="tree-leaf-kicker-2d">LEAF</span>
              <span className="tree-leaf-title-2d">
                {attachment.node.prompt.trim() || "未命名"}
              </span>
            </button>
          );
        })}
        </div>
      </div>
      <ZoomControls
        zoom={sceneZoom}
        is3DMode={false}
        onZoomIn={() => nudgeZoom(14)}
        onZoomOut={() => nudgeZoom(-14)}
      />
    </div>
  );
}

function BranchLink2D({
  link,
  highlighted,
}: {
  link: HierarchyPointLink<HierarchyNodeData>;
  highlighted: boolean;
}) {
  const sourceNode = nodeWorldPoint(link.source);
  const targetNode = nodeWorldPoint(link.target);
  const source = { x: sourceNode.x + NODE_W / 2, y: sourceNode.y };
  const target = { x: targetNode.x - NODE_W / 2, y: targetNode.y };
  return (
    <g>
      <path
        d={quadraticBranchPath(source, target)}
        fill="none"
        stroke={highlighted ? "#8A6A32" : "#8B7A62"}
        strokeWidth={highlighted ? 2.35 : 1.25}
        strokeOpacity={highlighted ? 0.88 : 0.46}
        strokeLinecap="round"
      />
      <path
        className="tree-link-highlight-2d"
        d={quadraticBranchPath(source, target, 0.018)}
        fill="none"
        stroke={highlighted ? "#D4A84A" : "#B7A88C"}
        strokeWidth={highlighted ? 0.75 : 0.35}
        strokeOpacity={highlighted ? 0.58 : 0.26}
        strokeLinecap="round"
      />
    </g>
  );
}
