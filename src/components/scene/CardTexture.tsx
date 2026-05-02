"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { NODE_W, NODE_H } from "@/hooks/useTreeLayout";
import { truncateText, roundRect, drawWrappedText } from "@/src/lib/utils";

export function CardTexture({
  prompt,
  response,
  selected,
  inPath,
  layer,
}: {
  prompt: string;
  response: string;
  selected: boolean;
  inPath: boolean;
  layer: number;
  interactive: boolean;
  priority: boolean;
}) {
  const texture = useMemo(() => {
    const width = 1024;
    const height = 520;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // background
    ctx.fillStyle = selected ? "#FFFFFF" : inPath ? "#FFFFFF" : "#FBFCFE";
    ctx.fillRect(0, 0, width, height);

    if (inPath) {
      ctx.strokeStyle = selected
        ? "rgba(79,70,229,0.95)"
        : "rgba(129,140,248,0.88)";
      ctx.lineWidth = selected ? 14 : 9;
      ctx.shadowColor = selected
        ? "rgba(79,70,229,0.34)"
        : "rgba(129,140,248,0.22)";
      ctx.shadowBlur = selected ? 28 : 16;
      roundRect(ctx, 10, 10, width - 20, height - 20, 34, false, true);
      ctx.shadowBlur = 0;
    }

    // main border
    ctx.strokeStyle = selected ? "#4338CA" : inPath ? "#818CF8" : "#D7DCE5";
    ctx.lineWidth = selected ? 8 : inPath ? 5 : 2.5;
    roundRect(ctx, 6, 6, width - 12, height - 12, 36, true, true);

    // chip
    ctx.fillStyle = selected ? "#E0E7FF" : inPath ? "#EEF2FF" : "#F3F4F6";
    roundRect(ctx, 28, 24, 170, 42, 21, true, false);
    ctx.fillStyle = selected ? "#3730A3" : "#4F46E5";
    ctx.font = "600 22px Inter, Arial, sans-serif";
    ctx.fillText(`Layer ${layer}`, 52, 51);

    if (selected || inPath) {
      ctx.beginPath();
      ctx.arc(width - 40, 46, selected ? 10 : 8, 0, Math.PI * 2);
      ctx.fillStyle = selected ? "#4F46E5" : "#A5B4FC";
      ctx.shadowColor = selected
        ? "rgba(79,70,229,0.45)"
        : "rgba(165,180,252,0.28)";
      ctx.shadowBlur = selected ? 20 : 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = "#6B7280";
    ctx.font = "600 20px Inter, Arial, sans-serif";
    ctx.fillText("Prompt", 32, 110);

    ctx.fillStyle = "#111827";
    ctx.font = "500 24px Inter, Arial, sans-serif";
    drawWrappedText(ctx, truncateText(prompt, 120), 32, 150, width - 64, 38, 4);

    ctx.strokeStyle = "#E5E7EB";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(32, 260);
    ctx.lineTo(width - 32, 260);
    ctx.stroke();

    ctx.fillStyle = "#94A3B8";
    ctx.font = "600 20px Inter, Arial, sans-serif";
    ctx.fillText("Response", 32, 305);

    ctx.fillStyle = "#374151";
    ctx.font = "500 22px Inter, Arial, sans-serif";
    drawWrappedText(
      ctx,
      truncateText(response, 170),
      32,
      345,
      width - 64,
      34,
      4,
    );

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }, [prompt, response, selected, inPath, layer]);

  if (!texture) return null;

  return (
    <mesh renderOrder={20}>
      <planeGeometry args={[NODE_W, NODE_H]} />
      <meshBasicMaterial map={texture} transparent depthTest={false} />
    </mesh>
  );
}
