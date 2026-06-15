"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

export function CameraModeRig({
  is3DMode,
  zoom2D,
  zoom3D,
}: {
  is3DMode: boolean;
  zoom2D: number;
  zoom3D: number;
}) {
  const { camera } = useThree();

  // Set camera position + lookAt only on mount and mode switches.
  // OrbitControls + CameraTracker handle selection/layer tracking after that.
  useEffect(() => {
    if (is3DMode && camera instanceof THREE.PerspectiveCamera) {
      camera.position.set(-12, 12, 18);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      // eslint-disable-next-line react-hooks/immutability
      camera.updateProjectionMatrix();
    }

    if (!is3DMode && camera instanceof THREE.OrthographicCamera) {
      camera.position.set(0, 0, 40);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      // eslint-disable-next-line react-hooks/immutability
      camera.updateProjectionMatrix();
    }
  }, [camera, is3DMode]);

  // Zoom is still managed here — OrbitControls has zoom disabled.
  useEffect(() => {
    if (is3DMode && camera instanceof THREE.PerspectiveCamera) {
      // eslint-disable-next-line react-hooks/immutability
      camera.zoom = zoom3D;
      camera.updateProjectionMatrix();
    }

    if (!is3DMode && camera instanceof THREE.OrthographicCamera) {
      // eslint-disable-next-line react-hooks/immutability
      camera.zoom = zoom2D;
      camera.updateProjectionMatrix();
    }
  }, [camera, is3DMode, zoom2D, zoom3D]);

  return null;
}
