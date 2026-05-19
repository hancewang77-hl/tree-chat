"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { NODE_W, NODE_H } from "@/hooks/useTreeLayout";
import { truncateText, roundRect, drawWrappedText } from "@/src/lib/utils";
import { summarizeForCard } from "@/src/lib/formatResponse";

const CARD_OLIVE = "#747A55";
const CARD_OLIVE_DEEP = "#565B3D";
const CARD_OLIVE_DARK = "#3F432B";
const CARD_PAPER_LIGHT = "#EFE6D2";
const CARD_PAPER_MID = "#DDD4B8";
const CARD_PAPER_DARK = "#CFC6A7";

export function CardTexture({
  prompt, response, selected, inPath, layer,
}: {
  prompt: string; response: string; selected: boolean;
  inPath: boolean; layer: number;
  interactive: boolean; priority: boolean;
}) {
  const texture = useMemo(() => {
    const width = 1024;
    const height = 520;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const isNote = response.trim().length === 0;
    const promptLabel = isNote ? "LEAF / 记录" : "SEED / 提问";
    const responseLabel = isNote ? "SOIL / 备注" : "CANOPY / 回答";
    const summary = isNote
      ? "这是一片手动记录的叶片，可继续生长出新的分支。"
      : summarizeForCard(response, 150);

    ctx.clearRect(0, 0, width, height);

    drawCardShell(ctx, width, height, selected, inPath);
    drawPaperGrain(ctx, width, height);
    drawSubtleVeins(ctx, width, height, selected, inPath);
    drawBarkSpine(ctx, height, selected, inPath);
    drawRingBadge(ctx, 52, 58, 27, layer, selected, inPath);

    drawLabelPill(ctx, 104, 42, promptLabel, selected ? CARD_OLIVE_DEEP : CARD_OLIVE);
    ctx.fillStyle = "#2C2416";
    ctx.font = "500 26px 'Lora','Georgia',serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    drawWrappedText(ctx, truncateText(prompt, 124), 104, 116, width - 176, 37, 4);

    drawBranchDivider(ctx, 104, 266, width - 76, selected, inPath);

    drawLabelPill(ctx, 104, 294, responseLabel, isNote ? CARD_OLIVE : CARD_OLIVE_DEEP);
    ctx.fillStyle = "#4A3F2F";
    ctx.font = "500 23px 'Lora','Georgia',serif";
    drawWrappedText(ctx, summary, 104, 370, width - 176, 34, 4);

    drawPathFruit(ctx, width, selected, inPath);

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

function drawCardShell(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  selected: boolean,
  inPath: boolean,
) {
  const paper = ctx.createLinearGradient(0, 0, width, height);
  paper.addColorStop(0, selected ? "#F5EED8" : CARD_PAPER_LIGHT);
  paper.addColorStop(0.52, CARD_PAPER_MID);
  paper.addColorStop(1, inPath ? "#D8D1B1" : CARD_PAPER_DARK);

  ctx.save();
  ctx.shadowColor = selected
    ? "rgba(86,91,61,0.30)"
    : inPath
      ? "rgba(116,122,85,0.22)"
      : "rgba(61,46,28,0.10)";
  ctx.shadowBlur = selected ? 34 : inPath ? 24 : 14;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = paper;
  roundRect(ctx, 18, 16, width - 36, height - 32, 42, true, false);
  ctx.restore();

  if (inPath) {
    ctx.save();
    ctx.strokeStyle = selected ? "rgba(86,91,61,0.98)" : "rgba(116,122,85,0.82)";
    ctx.lineWidth = selected ? 8 : 5;
    ctx.shadowColor = selected ? "rgba(86,91,61,0.28)" : "rgba(116,122,85,0.16)";
    ctx.shadowBlur = selected ? 22 : 14;
    roundRect(ctx, 21, 19, width - 42, height - 38, 40, false, true);
    ctx.restore();
  }

  ctx.strokeStyle = selected ? CARD_OLIVE_DEEP : inPath ? CARD_OLIVE : "#BDB391";
  ctx.lineWidth = selected ? 4 : inPath ? 3 : 2;
  roundRect(ctx, 26, 24, width - 52, height - 48, 34, false, true);
}

function drawPaperGrain(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save();
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 44; i++) {
    const x = 44 + ((i * 83) % (width - 88));
    const y = 38 + ((i * 47) % (height - 76));
    const length = 18 + (i % 5) * 9;
    ctx.strokeStyle = i % 3 === 0 ? "#BEB48F" : "#E4DBC1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + length * 0.45, y + Math.sin(i) * 4, x + length, y + Math.cos(i) * 3);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSubtleVeins(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  selected: boolean,
  inPath: boolean,
) {
  ctx.save();
  ctx.strokeStyle = selected
    ? "rgba(86,91,61,0.18)"
    : inPath
      ? "rgba(116,122,85,0.14)"
      : "rgba(116,122,85,0.08)";
  ctx.lineWidth = 1.4;

  for (let i = 0; i < 5; i++) {
    const startY = 82 + i * 76;
    ctx.beginPath();
    ctx.moveTo(width - 170, startY);
    ctx.bezierCurveTo(width - 132, startY + 20, width - 102, startY + 42, width - 54, startY + 52);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(61,46,28,0.05)";
  ctx.beginPath();
  ctx.moveTo(104, 68);
  ctx.bezierCurveTo(188, 120, 218, 190, 186, height - 58);
  ctx.stroke();
  ctx.restore();
}

function drawBarkSpine(
  ctx: CanvasRenderingContext2D,
  height: number,
  selected: boolean,
  inPath: boolean,
) {
  const x = 31;
  const y = 46;
  const w = 42;
  const h = height - 92;

  const bark = ctx.createLinearGradient(x, y, x + w, y + h);
  bark.addColorStop(0, selected ? "rgba(86,91,61,0.42)" : "rgba(86,91,61,0.24)");
  bark.addColorStop(0.52, inPath ? "rgba(116,122,85,0.38)" : "rgba(116,122,85,0.22)");
  bark.addColorStop(1, inPath ? "rgba(63,67,43,0.42)" : "rgba(107,95,79,0.22)");

  ctx.fillStyle = bark;
  roundRect(ctx, x, y, w, h, 21, true, false);

  ctx.save();
  ctx.strokeStyle = "rgba(255,248,226,0.18)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const sx = x + 10 + i * 7;
    ctx.beginPath();
    ctx.moveTo(sx, y + 18);
    ctx.bezierCurveTo(sx - 6, y + 110, sx + 8, y + 210, sx - 1, y + h - 18);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(44,36,22,0.10)";
  for (let i = 0; i < 3; i++) {
    const sy = y + 58 + i * 92;
    ctx.beginPath();
    ctx.moveTo(x + 7, sy);
    ctx.quadraticCurveTo(x + 23, sy - 14, x + w - 7, sy + 3);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = selected
    ? "rgba(86,91,61,0.72)"
    : inPath
      ? "rgba(116,122,85,0.56)"
      : "rgba(216,204,184,0.45)";
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h - 30, selected ? 4 : 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawRingBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  layer: number,
  selected: boolean,
  inPath: boolean,
) {
  ctx.save();
  ctx.fillStyle = selected ? "#EDE6CE" : "#E2D7BD";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  const rings = [0.35, 0.55, 0.74, 0.9];
  for (const ratio of rings) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * ratio, 0, Math.PI * 2);
    ctx.strokeStyle = selected
      ? "rgba(86,91,61,0.48)"
      : inPath
        ? "rgba(116,122,85,0.36)"
        : "rgba(107,95,79,0.22)";
    ctx.lineWidth = ratio > 0.8 ? 1.8 : 1.1;
    ctx.stroke();
  }

  ctx.fillStyle = selected ? CARD_OLIVE_DARK : "#6B5F4F";
  ctx.font = "700 18px 'Lora','Georgia',serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`z${layer}`, cx, cy);
  ctx.restore();
}

function drawLabelPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  accent: string,
) {
  ctx.save();
  ctx.fillStyle = "rgba(245,238,216,0.74)";
  ctx.strokeStyle = "rgba(116,122,85,0.22)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, 186, 38, 19, true, true);

  drawLeafMark(ctx, x + 23, y + 19, accent);

  ctx.fillStyle = accent;
  ctx.font = "700 16px 'Lora','Georgia',serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 46, y + 20);
  ctx.restore();
}

function drawLeafMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.55);
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.bezierCurveTo(12, -6, 13, 7, 0, 14);
  ctx.bezierCurveTo(-12, 7, -12, -6, 0, -12);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "#FFFDF7";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(0, 10);
  ctx.stroke();
  ctx.restore();
}

function drawBranchDivider(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y: number,
  x2: number,
  selected: boolean,
  inPath: boolean,
) {
  ctx.save();
  ctx.strokeStyle = selected ? CARD_OLIVE_DEEP : inPath ? CARD_OLIVE : "#B9A98D";
  ctx.lineWidth = selected ? 3.2 : 2.2;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.bezierCurveTo(x1 + 210, y - 28, x2 - 240, y + 26, x2, y);
  ctx.stroke();

  ctx.strokeStyle = "rgba(61,46,28,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1 + 12, y + 8);
  ctx.bezierCurveTo(x1 + 220, y - 12, x2 - 250, y + 40, x2 - 10, y + 8);
  ctx.stroke();

  drawBranchFork(ctx, x1 + 260, y - 2, -1, selected, inPath);
  drawBranchFork(ctx, x2 - 240, y + 3, 1, selected, inPath);
  ctx.restore();
}

function drawBranchFork(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  side: number,
  selected: boolean,
  inPath: boolean,
) {
  ctx.save();
  ctx.strokeStyle = selected
    ? "rgba(86,91,61,0.42)"
    : inPath
      ? "rgba(116,122,85,0.34)"
      : "rgba(107,95,79,0.18)";
  ctx.lineWidth = selected ? 1.7 : 1.2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.quadraticCurveTo(cx + side * 36, cy - 14, cx + side * 68, cy - 26);
  ctx.stroke();
  ctx.restore();
}

function drawPathFruit(
  ctx: CanvasRenderingContext2D,
  width: number,
  selected: boolean,
  inPath: boolean,
) {
  if (!selected && !inPath) return;

  ctx.save();
  const cx = width - 58;
  const cy = 58;
  const r = selected ? 12 : 9;
  ctx.shadowColor = selected ? "rgba(86,91,61,0.38)" : "rgba(116,122,85,0.22)";
  ctx.shadowBlur = selected ? 18 : 10;
  ctx.fillStyle = selected ? CARD_OLIVE_DEEP : CARD_OLIVE;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,253,247,0.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 4, -0.2, Math.PI * 1.25);
  ctx.stroke();
  ctx.restore();
}
