"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { LAYER_SPACING } from "@/hooks/useTreeLayout";

interface CameraTrackerProps {
  /** Whether in 3D (perspective) or 2D (orthographic) mode */
  is3DMode: boolean;
  /** Selected node world-space X position */
  nodeX: number;
  /** Selected node world-space Y position */
  nodeY: number;
  /** Selected node's layer index */
  nodeLayer: number;
  /** Animated display layer (for Z-offset compensation) */
  displayLayer: number;
  /** When false, tracking is suspended (e.g. during graft mode) */
  enabled: boolean;
  /** Ref to drei's OrbitControls instance */
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  /** Shared ref — true while user is dragging/rotating */
  userInteractingRef: React.RefObject<boolean>;
}

/**
 * Smoothly animates the OrbitControls target toward the selected node.
 *
 * Runs inside the R3F render loop via useFrame — zero React overhead.
 * Pauses during user interaction so the user's drag/rotate always wins.
 * Once the animation settles, it stops tracking — the user can explore
 * freely until the selection changes again.
 */
export function CameraTracker({
  is3DMode,
  nodeX,
  nodeY,
  nodeLayer,
  displayLayer,
  enabled,
  controlsRef,
  userInteractingRef,
}: CameraTrackerProps) {
  const currentRef = useRef(new THREE.Vector3());
  const goalRef = useRef(new THREE.Vector3());
  const isFirstRun = useRef(true);
  const hasSettledRef = useRef(false);

  // Keep latest prop values in refs so useFrame always reads current values
  // without triggering the useEffect that resets the lerp start point.
  const displayLayerRef = useRef(displayLayer);
  displayLayerRef.current = displayLayer;
  const is3DModeRef = useRef(is3DMode);
  is3DModeRef.current = is3DMode;
  const nodeLayerRef = useRef(nodeLayer);
  nodeLayerRef.current = nodeLayer;

  // Compute the goal world Z based on current displayLayer.
  // Called from both useEffect (init) and useFrame (continuous tracking).
  function goalWorldZ(): number {
    if (!is3DModeRef.current) return 0;
    return (nodeLayerRef.current - displayLayerRef.current) * LAYER_SPACING;
  }

  // Reset the lerp only when the selected node changes (nodeX / nodeY).
  // We deliberately exclude displayLayer / worldZ from deps — the Z
  // component is updated continuously in useFrame instead.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !enabled) return;

    hasSettledRef.current = false;

    if (isFirstRun.current) {
      // Snap immediately on first load — no animation
      const z = goalWorldZ();
      controls.target.set(nodeX, nodeY, z);
      controls.update();
      currentRef.current.set(nodeX, nodeY, z);
      goalRef.current.set(nodeX, nodeY, z);
      isFirstRun.current = false;
      hasSettledRef.current = true;
      return;
    }

    // Start lerping from wherever the camera is currently looking
    currentRef.current.copy(controls.target);
    goalRef.current.set(nodeX, nodeY, goalWorldZ());
  }, [controlsRef, enabled, nodeX, nodeY]);

  // Every frame: lerp toward the goal, or stay put if settled.
  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls || !enabled) return;

    // User is dragging — don't interfere
    if (userInteractingRef.current) return;

    // Continuously update the goal Z to track displayLayer animation.
    // This way layer-scroll transitions are smooth without resetting the lerp.
    goalRef.current.z = goalWorldZ();

    // If the animation already settled, don't pull the camera back.
    // The user is free to explore until they select a different node.
    if (hasSettledRef.current) return;

    const dist = currentRef.current.distanceToSquared(goalRef.current);

    if (dist < 0.0001) {
      // Arrived — snap and mark settled
      controls.target.copy(goalRef.current);
      controls.update();
      hasSettledRef.current = true;
      return;
    }

    currentRef.current.lerp(goalRef.current, 0.12);
    controls.target.copy(currentRef.current);
    controls.update();
  });

  return null;
}
