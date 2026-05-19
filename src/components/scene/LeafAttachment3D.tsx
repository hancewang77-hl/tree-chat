"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { LEAF_H, LEAF_W } from "@/hooks/useTreeLayout";
import type { MindNode } from "@/src/types/tree";
import { drawWrappedText, noRaycast, truncateText } from "@/src/lib/utils";

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
    () => createLeafCardTexture(node.prompt, node.timestamp, selected),
    [node.prompt, node.timestamp, selected],
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

function createLeafCardTexture(prompt: string, timestamp: number, selected: boolean) {
  const width = 640;
  const height = 260;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);

  ctx.save();
  ctx.shadowColor = selected ? "rgba(61,46,28,0.22)" : "rgba(61,46,28,0.12)";
  ctx.shadowBlur = selected ? 22 : 12;
  ctx.shadowOffsetY = 7;

  const paper = ctx.createLinearGradient(0, 0, width, height);
  paper.addColorStop(0, selected ? "#F0E7D2" : "#EFE4CF");
  paper.addColorStop(0.58, "#E2D7BD");
  paper.addColorStop(1, "#D1C4A4");

  ctx.fillStyle = paper;
  roundRect(ctx, 18, 16, width - 36, height - 32, 30, true, false);
  ctx.restore();

  ctx.strokeStyle = selected ? LEAF_ACCENT : "#A79E76";
  ctx.lineWidth = selected ? 6 : 3;
  roundRect(ctx, 23, 21, width - 46, height - 42, 26, false, true);

  ctx.fillStyle = selected ? "rgba(116,122,85,0.16)" : "rgba(116,122,85,0.10)";
  roundRect(ctx, 44, 39, 156, 34, 17, true, false);
  ctx.fillStyle = LEAF_ACCENT;
  ctx.font = "700 18px Georgia, serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`${leafIntentLabel(prompt)} · LEAF`, 60, 56);

  ctx.fillStyle = "#2C2416";
  ctx.font = "700 31px Georgia, serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  drawWrappedText(ctx, truncateText(prompt, 96), 54, 122, width - 108, 38, 3);

  ctx.fillStyle = "#5F5548";
  ctx.font = "600 15px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(`LOCAL NOTE · ${formatLeafDate(timestamp)}`, 54, height - 48);

  ctx.save();
  ctx.strokeStyle = selected ? "rgba(116,122,85,0.24)" : "rgba(116,122,85,0.14)";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(width - 184, height - 46);
  ctx.bezierCurveTo(width - 128, height - 82, width - 102, 98, width - 46, 45);
  ctx.stroke();

  for (let i = 0; i < 3; i++) {
    const x = width - 154 + i * 40;
    ctx.beginPath();
    ctx.moveTo(x, height - 70 - i * 12);
    ctx.quadraticCurveTo(x + 24, height - 88 - i * 20, x + 52, height - 118 - i * 16);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = selected ? "rgba(116,122,85,0.14)" : "rgba(116,122,85,0.08)";
  ctx.beginPath();
  ctx.ellipse(width - 58, 56, 28, 17, -0.45, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function leafIntentLabel(prompt: string) {
  if (/[?？]$/.test(prompt.trim())) return "QUESTION";
  if (/todo|待办|需要|记得|检查|完成/i.test(prompt)) return "TODO";
  return "NOTE";
}

function formatLeafDate(timestamp: number) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "saved";
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
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
