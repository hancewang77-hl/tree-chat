"use client";

import { useMemo } from "react";
import { Line, Text } from "@react-three/drei";
import * as THREE from "three";
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
  const texture = useMemo(() => createLeafCardTexture(node.prompt, selected), [node.prompt, selected]);

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

      <mesh
        renderOrder={22}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <planeGeometry args={[LEAF_W, LEAF_H]} />
        <meshBasicMaterial map={texture} transparent depthTest={false} />
      </mesh>

      <Text
        position={[-LEAF_W / 2 + 0.18, 0.12, 0.03]}
        fontSize={0.082}
        color={selected ? "#3D2E1C" : "#7D9B6E"}
        anchorX="left"
        anchorY="middle"
        maxWidth={LEAF_W - 0.28}
        raycast={noRaycast}
      >
        LEAF · 笔记
      </Text>

      <Text
        position={[-LEAF_W / 2 + 0.18, -0.08, 0.03]}
        fontSize={0.105}
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

function createLeafCardTexture(prompt: string, selected: boolean) {
  const width = 512;
  const height = 190;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);

  ctx.save();
  ctx.shadowColor = selected ? "rgba(125,155,110,0.36)" : "rgba(61,46,28,0.13)";
  ctx.shadowBlur = selected ? 24 : 12;
  ctx.shadowOffsetY = 7;

  const paper = ctx.createLinearGradient(0, 0, width, height);
  paper.addColorStop(0, selected ? "#F7FFF0" : "#FBFCF4");
  paper.addColorStop(0.58, "#EEF5E6");
  paper.addColorStop(1, "#E2ECD7");

  ctx.fillStyle = paper;
  roundRect(ctx, 18, 16, width - 36, height - 32, 30, true, false);
  ctx.restore();

  ctx.strokeStyle = selected ? "#7D9B6E" : "#C5D1B7";
  ctx.lineWidth = selected ? 6 : 3;
  roundRect(ctx, 23, 21, width - 46, height - 42, 26, false, true);

  ctx.save();
  ctx.strokeStyle = selected ? "rgba(125,155,110,0.30)" : "rgba(125,155,110,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(54, 146);
  ctx.bezierCurveTo(146, 102, 248, 98, 452, 44);
  ctx.stroke();

  for (let i = 0; i < 4; i++) {
    const x = 120 + i * 76;
    ctx.beginPath();
    ctx.moveTo(x, 112 - i * 9);
    ctx.quadraticCurveTo(x + 34, 100 - i * 13, x + 64, 74 - i * 9);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = selected ? "rgba(125,155,110,0.18)" : "rgba(125,155,110,0.10)";
  ctx.beginPath();
  ctx.ellipse(width - 54, 50, 28, 17, -0.45, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: boolean,
  stroke: boolean,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}
