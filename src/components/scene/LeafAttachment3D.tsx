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
    () => createLeafNameTexture(node.prompt, selected),
    [node.prompt, selected],
  );

  return (
    <group>
      <Line
        points={stemPoints}
        color={selected ? LEAF_ACCENT : LEAF_ACCENT_SOFT}
        lineWidth={selected ? 1.7 : 1.05}
        transparent
        opacity={selected ? 0.78 : 0.58}
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
    </group>
  );
}

function createLeafNameTexture(name: string, selected: boolean) {
  const width = 480;
  const height = 160;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);

  ctx.save();
  ctx.shadowColor = selected ? "rgba(61,46,28,0.22)" : "rgba(61,46,28,0.12)";
  ctx.shadowBlur = selected ? 18 : 10;
  ctx.shadowOffsetY = 5;

  const paper = ctx.createLinearGradient(0, 0, width, height);
  paper.addColorStop(0, selected ? "#F0E7D2" : "#EFE4CF");
  paper.addColorStop(0.58, "#E2D7BD");
  paper.addColorStop(1, "#D1C4A4");

  ctx.fillStyle = paper;
  roundRect(ctx, 16, 18, width - 32, height - 36, 22, true, false);
  ctx.restore();

  ctx.strokeStyle = selected ? LEAF_ACCENT : "#A79E76";
  ctx.lineWidth = selected ? 5 : 3;
  roundRect(ctx, 20, 22, width - 40, height - 44, 18, false, true);

  ctx.fillStyle = selected ? "rgba(116,122,85,0.16)" : "rgba(116,122,85,0.10)";
  roundRect(ctx, 36, 36, 88, 28, 14, true, false);
  ctx.fillStyle = LEAF_ACCENT;
  ctx.font = "700 16px Georgia, serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("LEAF", 52, 50);

  ctx.fillStyle = "#2C2416";
  ctx.font = "700 34px Georgia, serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(truncateText(name.trim() || "未命名叶片", 22), 36, height / 2 + 18);

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
