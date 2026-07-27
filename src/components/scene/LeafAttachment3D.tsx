"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { LEAF_H, LEAF_W } from "@/hooks/useTreeLayout";
import type { MindNode } from "@/src/types/tree";
import { noRaycast, truncateText } from "@/src/lib/utils";

const LEAF_ACCENT = "#747A55";
const LEAF_ACCENT_SOFT = "#9C9A70";

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
  const texture = useMemo(
    () => createLeafCardTexture(node.prompt, selected),
    [node.prompt, selected],
  );

  return (
    <group>
      <Line
        points={stemPoints}
        color={selected ? LEAF_ACCENT : LEAF_ACCENT_SOFT}
        lineWidth={selected ? 1.5 : 0.95}
        transparent
        opacity={selected ? 0.78 : 0.58}
        depthTest={false}
        renderOrder={16}
        raycast={noRaycast}
      />

      <mesh
        renderOrder={24}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <planeGeometry args={[LEAF_W, LEAF_H]} />
        <meshBasicMaterial map={texture} transparent depthTest={false} />
      </mesh>
    </group>
  );
}

function createLeafCardTexture(name: string, selected: boolean) {
  const width = 520;
  const height = 150;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);

  ctx.save();
  ctx.shadowColor = selected ? "rgba(61,46,28,0.18)" : "rgba(61,46,28,0.1)";
  ctx.shadowBlur = selected ? 14 : 8;
  ctx.shadowOffsetY = 4;

  const paper = ctx.createLinearGradient(0, 0, width, height);
  paper.addColorStop(0, selected ? "#F0E7D2" : "#EFE4CF");
  paper.addColorStop(1, "#D1C4A4");

  ctx.fillStyle = paper;
  roundRect(ctx, 12, 10, width - 24, height - 20, 18, true, false);
  ctx.restore();

  ctx.strokeStyle = selected ? LEAF_ACCENT : "#A79E76";
  ctx.lineWidth = selected ? 4 : 2;
  roundRect(ctx, 15, 13, width - 30, height - 26, 16, false, true);

  ctx.fillStyle = LEAF_ACCENT;
  ctx.font = "700 14px Georgia, serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("LEAF", 24, 28);

  ctx.fillStyle = "#2C2416";
  ctx.font = "700 24px Georgia, serif";
  const displayName = truncateText(name.trim() || "未命名", 14);
  ctx.fillText(displayName, 24, height / 2 + 4);

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
