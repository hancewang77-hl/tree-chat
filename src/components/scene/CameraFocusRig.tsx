"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { MindNode, NodesMap } from "@/src/types/tree";
import {
  LEAF_H,
  LEAF_W,
  NODE_H,
  LAYER_SPACING,
  type PositionedLeafAttachment,
} from "@/hooks/useTreeLayout";
import type { HierarchyPointNode } from "d3-hierarchy";

type HierarchyNodeData = MindNode & {
  children: HierarchyNodeData[];
};

const FOCUS_DURATION_MS = 520;

type FocusAnimation = {
  startTime: number;
  duration: number;
  fromCamera: THREE.Vector3;
  toCamera: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  is3DMode: boolean;
};

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function getFocusTarget(
  nodeId: string,
  renderedNodes: HierarchyPointNode<HierarchyNodeData>[],
  renderedLeafAttachments: PositionedLeafAttachment[],
  is3DMode: boolean,
  selectedLayer: number,
): THREE.Vector3 | null {
  const lookAtZ = selectedLayer * LAYER_SPACING;

  const branchPoint = renderedNodes.find((n) => n.data.id === nodeId);
  if (branchPoint) {
    const x = branchPoint.y + (branchPoint.data.offsetX ?? 0) / 100;
    const y = -branchPoint.x - (branchPoint.data.offsetY ?? 0) / 100;
    const z = is3DMode ? branchPoint.data.layer * LAYER_SPACING : lookAtZ;
    return new THREE.Vector3(x, y, z);
  }

  const leafAttachment = renderedLeafAttachments.find((a) => a.node.id === nodeId);
  if (leafAttachment) {
    const parent = leafAttachment.parentPoint;
    const parentData = parent.data;
    const parentX = parent.y + (parentData.offsetX ?? 0) / 100;
    const parentY = -parent.x - (parentData.offsetY ?? 0) / 100;
    const offsetX =
      (leafAttachment.index - (leafAttachment.total - 1) / 2) * (LEAF_W + 0.18);
    const x = parentX + offsetX;
    const y = parentY - NODE_H / 2 - LEAF_H / 2 - 0.42;
    const z = is3DMode ? parentData.layer * LAYER_SPACING : lookAtZ;
    return new THREE.Vector3(x, y, z);
  }

  return null;
}

function getCameraPose(
  target: THREE.Vector3,
  is3DMode: boolean,
  lookAtZ: number,
): { camera: THREE.Vector3; focusTarget: THREE.Vector3 } {
  const focusTarget = new THREE.Vector3(target.x, target.y, lookAtZ);
  const camera = is3DMode
    ? new THREE.Vector3(target.x - 12, target.y + 12, 18)
    : new THREE.Vector3(target.x, target.y, 40);
  return { camera, focusTarget };
}

export function CameraFocusRig({
  nodes,
  selectedNodeId,
  renderedNodes,
  renderedLeafAttachments,
  is3DMode,
  selectedLayer,
  controlsRef,
}: {
  nodes: NodesMap;
  selectedNodeId: string;
  renderedNodes: HierarchyPointNode<HierarchyNodeData>[];
  renderedLeafAttachments: PositionedLeafAttachment[];
  is3DMode: boolean;
  selectedLayer: number;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const prevNodeIdsRef = useRef<Set<string> | null>(null);
  const animationRef = useRef<FocusAnimation | null>(null);
  const cameraPosRef = useRef(new THREE.Vector3());
  const targetRef = useRef(new THREE.Vector3());

  useEffect(() => {
    const currentIds = new Set(Object.keys(nodes));

    if (prevNodeIdsRef.current === null) {
      prevNodeIdsRef.current = currentIds;
      return;
    }

    const isNewNode =
      Boolean(selectedNodeId) &&
      Boolean(nodes[selectedNodeId]) &&
      !prevNodeIdsRef.current.has(selectedNodeId);

    prevNodeIdsRef.current = currentIds;

    if (!isNewNode) return;

    const target = getFocusTarget(
      selectedNodeId,
      renderedNodes,
      renderedLeafAttachments,
      is3DMode,
      selectedLayer,
    );
    if (!target) return;

    const lookAtZ = selectedLayer * LAYER_SPACING;
    const controls = controlsRef.current;
    const { camera: toCamera, focusTarget: toTarget } = getCameraPose(
      target,
      is3DMode,
      lookAtZ,
    );

    const fromTarget = controls
      ? controls.target.clone()
      : new THREE.Vector3(0, 0, lookAtZ);
    const fromCamera = camera.position.clone();

    animationRef.current = {
      startTime: performance.now(),
      duration: FOCUS_DURATION_MS,
      fromCamera,
      toCamera,
      fromTarget,
      toTarget,
      is3DMode,
    };
  }, [
    nodes,
    selectedNodeId,
    renderedNodes,
    renderedLeafAttachments,
    is3DMode,
    selectedLayer,
    camera,
    controlsRef,
  ]);

  useFrame(() => {
    const animation = animationRef.current;
    if (!animation) return;

    const controls = controlsRef.current;
    const elapsed = performance.now() - animation.startTime;
    const rawT = Math.min(elapsed / animation.duration, 1);
    const t = easeOutCubic(rawT);

    cameraPosRef.current.lerpVectors(animation.fromCamera, animation.toCamera, t);
    targetRef.current.lerpVectors(animation.fromTarget, animation.toTarget, t);

    camera.position.copy(cameraPosRef.current);
    camera.lookAt(targetRef.current);

    if (controls) {
      controls.target.copy(targetRef.current);
      controls.update();
    }

    if (rawT >= 1) {
      animationRef.current = null;
    }
  });

  return null;
}
