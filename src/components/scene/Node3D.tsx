"use client";

import { Text } from "@react-three/drei";
import type { MindNode } from "@/src/types/tree";
import { NODE_W } from "@/hooks/useTreeLayout";
import { noRaycast } from "@/src/lib/utils";
import { CardTexture } from "./CardTexture";

export function Node3D({
  node,
  selected,
  inPath,
  interactive,
  priority,
  onSelect,
  showConfirmButton,
  onConfirmLayerMove,
}: {
  node: MindNode;
  selected: boolean;
  inPath: boolean;
  interactive: boolean;
  priority: boolean;
  moving: boolean;
  onSelect: () => void;
  showConfirmButton: boolean;
  onConfirmLayerMove: () => void;
}) {
  return (
    <group
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              onSelect();
            }
          : undefined
      }
    >
      <CardTexture
        prompt={node.prompt}
        response={node.response}
        selected={selected}
        inPath={inPath}
        layer={node.layer}
        interactive={interactive}
        priority={priority}
      />

      {showConfirmButton && (
        <group position={[NODE_W / 2 + 0.45, 0.1, 0.03]}>
          <mesh
            onClick={(e) => {
              e.stopPropagation();
              onConfirmLayerMove();
            }}
          >
            <circleGeometry args={[0.2, 32]} />
            <meshBasicMaterial color="#22C55E" />
          </mesh>
          <Text
            position={[0, 0, 0.02]}
            fontSize={0.2}
            color="white"
            anchorX="center"
            anchorY="middle"
            raycast={noRaycast}
          >
            ✓
          </Text>
        </group>
      )}
    </group>
  );
}
