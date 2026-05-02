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
  NODE_W,
  LAYER_SPACING,
  useTreeLayout,
} from "@/hooks/useTreeLayout";
import { noRaycast } from "@/src/lib/utils";
import { CameraModeRig } from "./CameraModeRig";
import { Node3D } from "./Node3D";
import { LayerPlane } from "./LayerPlane";

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
}) {
  const {
    renderedNodes,
    renderedLinks,
    currentPath,
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
          "radial-gradient(circle at 50% 42%, rgba(244,247,250,0.48) 0%, rgba(220,225,232,0.72) 42%, rgba(196,202,211,0.94) 100%)",
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
            currentPath.some((n) => n.id === link.source.data.id) &&
            currentPath.some((n) => n.id === link.target.data.id);

          return (
            <Line
              key={`line-${i}`}
              points={[source, target]}
              color={isPathEdge ? "#4338CA" : "#94A3B8"}
              lineWidth={isPathEdge ? 2.8 : 1.55}
              transparent
              opacity={isPathEdge ? 0.98 : 0.78}
              depthTest={false}
              renderOrder={12}
              raycast={noRaycast}
            />
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
