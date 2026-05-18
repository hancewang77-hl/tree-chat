"use client";

import { Plane, Text } from "@react-three/drei";
import { LAYER_SPACING } from "@/hooks/useTreeLayout";
import { noRaycast } from "@/src/lib/utils";

type Bounds = { width: number; height: number; centerX: number; centerY: number };

export function LayerPlane({
  layer,
  bounds,
  active,
  label,
  onClick,
  onDoubleClick,
}: {
  layer: number;
  bounds: Bounds;
  active: boolean;
  label: string;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  const baseColor = active ? "#F0ECD8" : "#FBF7F0";
  const glowColor = active ? "#C4A882" : "#D8CFBC";
  const labelColor = active ? "#3D2E1C" : "#6B5F4F";

  return (
    <group
      position={[bounds.centerX, bounds.centerY, layer * LAYER_SPACING]}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
    >
      {/* outermost spatial fog */}
      <Plane
        args={[bounds.width * 1.28, bounds.height * 1.28]}
        position={[0, 0, -0.1]}
        raycast={noRaycast}
      >
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={active ? 0.022 : 0.008}
          depthWrite={false}
        />
      </Plane>

      {/* mid-layer diffusion */}
      <Plane
        args={[bounds.width * 1.14, bounds.height * 1.14]}
        position={[0, 0, -0.06]}
        raycast={noRaycast}
      >
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={active ? 0.07 : 0.018}
          depthWrite={false}
        />
      </Plane>

      {/* core frosted glass */}
      <Plane
        args={[bounds.width, bounds.height]}
        position={[0, 0, -0.02]}
        raycast={noRaycast}
      >
        <meshPhysicalMaterial
          color={baseColor}
          transparent
          opacity={active ? 0.28 : 0.08}
          roughness={0.06}
          metalness={0}
          transmission={0.82}
          thickness={0.9}
          clearcoat={1}
          clearcoatRoughness={0.04}
          reflectivity={0.45}
          ior={1.18}
          depthWrite={false}
        />
      </Plane>

      {/* inner glow core */}
      <Plane
        args={[bounds.width * 0.92, bounds.height * 0.92]}
        position={[0, 0, -0.015]}
        raycast={noRaycast}
      >
        <meshBasicMaterial
          color={active ? "#FFFDF7" : "#FFFFFF"}
          transparent
          opacity={active ? 0.065 : 0.018}
          depthWrite={false}
        />
      </Plane>

      {/* left light-guide edge */}
      <Plane
        args={[0.16, bounds.height * 0.92]}
        position={[-bounds.width / 2 + 0.1, 0, -0.005]}
        raycast={noRaycast}
      >
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={active ? 0.22 : 0.05}
          depthWrite={false}
        />
      </Plane>

      {/* right light-guide edge */}
      <Plane
        args={[0.16, bounds.height * 0.92]}
        position={[bounds.width / 2 - 0.1, 0, -0.005]}
        raycast={noRaycast}
      >
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={active ? 0.16 : 0.04}
          depthWrite={false}
        />
      </Plane>

      {/* top light-guide edge */}
      <Plane
        args={[bounds.width * 0.88, 0.12]}
        position={[0, bounds.height / 2 - 0.08, -0.005]}
        raycast={noRaycast}
      >
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={active ? 0.11 : 0.03}
          depthWrite={false}
        />
      </Plane>

      {/* layer label */}
      {label && (
        <Text
          position={[-bounds.width / 2 + 0.55, bounds.height / 2 + 0.42, 0.02]}
          fontSize={0.24}
          color={labelColor}
          anchorX="left"
          anchorY="middle"
        >
          {label}
        </Text>
      )}
    </group>
  );
}
