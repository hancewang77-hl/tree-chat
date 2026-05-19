"use client";

import { Canvas } from "@react-three/fiber";
import {
  Line,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from "@react-three/drei";
import * as THREE from "three";
import type { NodesMap, ToolMode } from "@/src/types/tree";
import {
  LEAF_H,
  LEAF_W,
  NODE_H,
  NODE_W,
  LAYER_SPACING,
  useTreeLayout,
} from "@/hooks/useTreeLayout";
import { noRaycast } from "@/src/lib/utils";

function curvedBranchPoints(
  source: [number, number, number],
  target: [number, number, number],
  segments: number = 10,
  offset: number = 0,
): [number, number, number][] {
  const points: [number, number, number][] = [];
  const mx = (source[0] + target[0]) / 2;
  const my = (source[1] + target[1]) / 2;
  const mz = (source[2] + target[2]) / 2;

  const dx = target[0] - source[0];
  const dy = target[1] - source[1];
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const bow = Math.min(len * 0.1, 0.45);

  const cx = mx + px * (bow + offset);
  const cy = my + py * (bow + offset);
  const cz = mz;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    points.push([
      (1 - t) ** 2 * source[0] + 2 * (1 - t) * t * cx + t ** 2 * target[0],
      (1 - t) ** 2 * source[1] + 2 * (1 - t) * t * cy + t ** 2 * target[1],
      (1 - t) ** 2 * source[2] + 2 * (1 - t) * t * cz + t ** 2 * target[2],
    ]);
  }
  return points;
}
import { CameraModeRig } from "./CameraModeRig";
import { Node3D } from "./Node3D";
import { LayerPlane } from "./LayerPlane";
import { LeafAttachment3D } from "./LeafAttachment3D";

export function TreeScene({
  nodes,
  selectedNodeId,
  selectedLayer,
  displayLayer,
  planeNames,
  is3DMode,
  toolMode,
  movingNodeId,
  pendingNodeLayer,
  zoom2D,
  zoom3D,
  onSelectNode,
  onStartLayerMove,
  onConfirmLayerMove,
  onSelectLayer,
  onRenameLayer,
  onOpenNodeRings,
}: {
  nodes: NodesMap;
  selectedNodeId: string;
  selectedLayer: number;
  displayLayer: number;
  planeNames: Record<number, string>;
  is3DMode: boolean;
  toolMode: ToolMode;
  movingNodeId: string | null;
  pendingNodeLayer: number | null;
  zoom2D: number;
  zoom3D: number;
  onSelectNode: (id: string) => void;
  onStartLayerMove: (id: string) => void;
  onConfirmLayerMove: () => void;
  onSelectLayer: (layer: number) => void;
  onRenameLayer: (layer: number) => void;
  onOpenNodeRings: (id: string) => void;
}) {
  const {
    renderedNodes,
    renderedLinks,
    renderedLeafAttachments,
    currentPathIds,
    effectiveLayer,
    globalPlaneBounds,
    minLayer,
    maxLayer,
  } = useTreeLayout({
    nodes,
    selectedNodeId,
    selectedLayer,
    is3DMode,
    movingNodeId,
    pendingNodeLayer,
  });

  return (
    <Canvas
      style={{
        background:
          "radial-gradient(circle at 50% 42%, rgba(251,247,240,0.6) 0%, rgba(240,235,225,0.8) 42%, rgba(225,218,205,0.95) 100%)",
      }}
    >
      {is3DMode ? (
        <PerspectiveCamera makeDefault position={[-12, 12, 18]} fov={42} />
      ) : (
        <OrthographicCamera makeDefault position={[0, 0, 40]} zoom={105} />
      )}

      <CameraModeRig
        is3DMode={is3DMode}
        selectedLayer={selectedLayer}
        zoom2D={zoom2D}
        zoom3D={zoom3D}
      />

      <ambientLight intensity={0.92} color="#EEF2F7" />
      <directionalLight
        position={[10, 12, 14]}
        intensity={0.95}
        color="#FFFFFF"
      />
      <directionalLight
        position={[-8, -4, 6]}
        intensity={0.28}
        color="#C5CCD8"
      />
      <directionalLight
        position={[0, 6, -10]}
        intensity={0.12}
        color="#AAB4C8"
      />

      <group
        rotation={[0, 0, 0]}
        position={
          is3DMode
            ? [
                0,
                0,
                -(toolMode === "layerMove" ? selectedLayer : displayLayer) *
                  LAYER_SPACING,
              ]
            : [0, 0, -selectedLayer * LAYER_SPACING]
        }
      >
        {(is3DMode
          ? Array.from(
              { length: maxLayer - minLayer + 5 },
              (_, idx) => minLayer - 2 + idx,
            )
          : [selectedLayer]
        ).map((layer) => {
          return (
            <LayerPlane
              key={`plane-${layer}`}
              layer={layer}
              bounds={globalPlaneBounds}
              active={layer === selectedLayer}
              label={layer === 0 ? "根节点层" : (planeNames[layer] ?? "")}
              onClick={() => {
                if (is3DMode) onSelectLayer(layer);
              }}
              onDoubleClick={() => {
                if (is3DMode) onRenameLayer(layer);
              }}
            />
          );
        })}

        {renderedLinks.map((link, i) => {
          const source: [number, number, number] = [
            link.source.y + (link.source.data.offsetX ?? 0) / 100 + NODE_W / 2,
            -link.source.x - (link.source.data.offsetY ?? 0) / 100,
            is3DMode
              ? effectiveLayer(link.source.data) * LAYER_SPACING
              : selectedLayer * LAYER_SPACING + 0.02,
          ];

          const target: [number, number, number] = [
            link.target.y + (link.target.data.offsetX ?? 0) / 100 - NODE_W / 2,
            -link.target.x - (link.target.data.offsetY ?? 0) / 100,
            is3DMode
              ? effectiveLayer(link.target.data) * LAYER_SPACING
              : selectedLayer * LAYER_SPACING + 0.02,
          ];

          const isPathEdge =
            currentPathIds.has(link.source.data.id) &&
            currentPathIds.has(link.target.data.id);

          const mainPoints = curvedBranchPoints(source, target, isPathEdge ? 16 : 12);
          const highlightPoints = curvedBranchPoints(source, target, isPathEdge ? 16 : 12, 0.018);

          return (
            <group key={`line-${i}`}>
              <Line
                points={mainPoints}
                color={isPathEdge ? "#8A6A32" : "#8B7A62"}
                lineWidth={isPathEdge ? 2.35 : 1.25}
                transparent
                opacity={isPathEdge ? 0.88 : 0.46}
                depthTest={false}
                renderOrder={11}
                raycast={noRaycast}
              />
              <Line
                points={highlightPoints}
                color={isPathEdge ? "#D4A84A" : "#B7A88C"}
                lineWidth={isPathEdge ? 0.75 : 0.35}
                transparent
                opacity={isPathEdge ? 0.58 : 0.26}
                depthTest={false}
                renderOrder={13}
                raycast={noRaycast}
              />
            </group>
          );
        })}

        {renderedNodes.map((node) => {
          const previewLayer =
            movingNodeId === node.data.id && pendingNodeLayer !== null
              ? pendingNodeLayer
              : node.data.layer;

          const isCurrentLayerNode = previewLayer === selectedLayer;

          const isInteractiveNode =
            !(is3DMode && toolMode === "layerMove") || isCurrentLayerNode;

          const isPriorityNode = !is3DMode || isCurrentLayerNode;
          const isMovingNode = movingNodeId === node.data.id;

          const nodeZ = is3DMode
            ? previewLayer * LAYER_SPACING
            : selectedLayer * LAYER_SPACING + 0.12;

          const position: [number, number, number] = [
            node.y + (node.data.offsetX ?? 0) / 100,
            -node.x - (node.data.offsetY ?? 0) / 100,
            nodeZ,
          ];

          return (
            <group key={node.data.id} position={position}>
              <Node3D
                node={node.data}
                selected={node.data.id === selectedNodeId}
                inPath={currentPathIds.has(node.data.id)}
                interactive={isInteractiveNode}
                priority={isPriorityNode}
                moving={isMovingNode}
                onSelect={() => {
                  if (!isInteractiveNode) return;

                  onSelectNode(node.data.id);

                  if (
                    is3DMode &&
                    toolMode === "layerMove" &&
                    node.data.id !== "root"
                  ) {
                    onStartLayerMove(node.data.id);
                  }
                }}
                showConfirmButton={toolMode === "layerMove" && isMovingNode}
                onConfirmLayerMove={onConfirmLayerMove}
                onOpenRings={() => onOpenNodeRings(node.data.id)}
              />
            </group>
          );
        })}

        {renderedLeafAttachments.map((attachment) => {
          const parent = attachment.parentPoint;
          const parentData = parent.data;
          const parentLayer = effectiveLayer(parentData);
          const leafLayer = is3DMode ? parentLayer : selectedLayer;
          const parentX = parent.y + (parentData.offsetX ?? 0) / 100;
          const parentY = -parent.x - (parentData.offsetY ?? 0) / 100;
          const offsetX = (attachment.index - (attachment.total - 1) / 2) * (LEAF_W + 0.18);
          const leafX = parentX + offsetX;
          const leafY = parentY - NODE_H / 2 - LEAF_H / 2 - 0.42;
          const leafZ = leafLayer * LAYER_SPACING + (is3DMode ? 0.04 : 0.2);
          const stemPoints: [number, number, number][] = [
            [parentX + offsetX * 0.18, parentY - NODE_H / 2 + 0.05, leafZ - 0.02],
            [leafX, leafY + LEAF_H / 2 - 0.02, leafZ],
          ];

          return (
            <group
              key={attachment.node.id}
              position={[leafX, leafY, leafZ]}
            >
              <LeafAttachment3D
                node={attachment.node}
                selected={attachment.node.id === selectedNodeId}
                stemPoints={stemPoints.map(([x, y, z]) => [x - leafX, y - leafY, z - leafZ])}
                onSelect={() => onSelectNode(attachment.node.id)}
              />
            </group>
          );
        })}
      </group>

      {is3DMode ? (
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          enableRotate={false}
        />
      ) : (
        <OrbitControls
          enablePan={true}
          enableZoom={false}
          enableRotate={false}
          screenSpacePanning={true}
          panSpeed={1.1}
          zoomSpeed={0.9}
          mouseButtons={{
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          }}
        />
      )}
    </Canvas>
  );
}
