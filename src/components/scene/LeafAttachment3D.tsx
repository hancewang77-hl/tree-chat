"use client";

import { Line, Text } from "@react-three/drei";
import { LEAF_H, LEAF_W } from "@/hooks/useTreeLayout";
import type { MindNode } from "@/src/types/tree";
import { noRaycast, truncateText } from "@/src/lib/utils";

export function LeafAttachment3D({
  node,
  selected,
  stemPoints,
  onSelect,
}: {
  node: MindNode;
  selected: boolean;
  stemPoints: [number, number, number][];
  onSelect: () => void;
}) {
  return (
    <group>
      <Line
        points={stemPoints}
        color={selected ? "#7D9B6E" : "#A9B898"}
        lineWidth={selected ? 1.6 : 0.9}
        transparent
        opacity={selected ? 0.86 : 0.52}
        depthTest={false}
        renderOrder={16}
        raycast={noRaycast}
      />

      <mesh position={[0, 0, -0.01]} renderOrder={21} raycast={noRaycast}>
        <planeGeometry args={[LEAF_W + 0.05, LEAF_H + 0.05]} />
        <meshBasicMaterial
          color={selected ? "#7D9B6E" : "#D7DEC8"}
          transparent
          opacity={selected ? 0.92 : 0.64}
          depthTest={false}
        />
      </mesh>

      <mesh
        renderOrder={22}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <planeGeometry args={[LEAF_W, LEAF_H]} />
        <meshBasicMaterial
          color={selected ? "#EEF6E9" : "#F7FAF0"}
          transparent
          opacity={0.96}
          depthTest={false}
        />
      </mesh>

      <Text
        position={[-LEAF_W / 2 + 0.16, 0.13, 0.03]}
        fontSize={0.09}
        color="#7D9B6E"
        anchorX="left"
        anchorY="middle"
        maxWidth={LEAF_W - 0.28}
        raycast={noRaycast}
      >
        LEAF · 笔记
      </Text>

      <Text
        position={[-LEAF_W / 2 + 0.16, -0.08, 0.03]}
        fontSize={0.115}
        color="#3D2E1C"
        anchorX="left"
        anchorY="middle"
        maxWidth={LEAF_W - 0.28}
        raycast={noRaycast}
      >
        {truncateText(node.prompt, 54)}
      </Text>
    </group>
  );
}
