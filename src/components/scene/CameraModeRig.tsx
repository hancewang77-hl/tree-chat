"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { LAYER_SPACING } from "@/hooks/useTreeLayout";

export function CameraModeRig({
  is3DMode,
  selectedLayer,
  zoom2D,
  zoom3D,
}: {
  is3DMode: boolean;
  selectedLayer: number;
  zoom2D: number;
  zoom3D: number;
}) {
  const { camera } = useThree();

  useEffect(() => {
    if (is3DMode && camera instanceof THREE.PerspectiveCamera) {
      camera.position.set(-12, 12, 18);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, selectedLayer * LAYER_SPACING);
      // eslint-disable-next-line react-hooks/immutability -- Three.js requires direct camera property mutation
      camera.zoom = zoom3D;
      camera.updateProjectionMatrix();
    }

    if (!is3DMode && camera instanceof THREE.OrthographicCamera) {
      camera.position.set(0, 0, 40);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, selectedLayer * LAYER_SPACING);
      camera.zoom = zoom2D;
      camera.updateProjectionMatrix();
    }
  }, [camera, is3DMode, selectedLayer, zoom2D, zoom3D]);

  return null;
}
