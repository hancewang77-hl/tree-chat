"use client";

import { useMemo } from "react";
import * as THREE from "three";

export function RingsButton3D({
  selected,
  onClick,
}: {
  selected: boolean;
  onClick: () => void;
}) {
  const texture = useMemo(() => {
    const size = 192;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const ringCenterX = cx - 5;
    const ringCenterY = cy + 2;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(61, 46, 28, 0.18)";
    ctx.shadowBlur = selected ? 4 : 2;
    ctx.shadowOffsetY = 1;

    const rings = [13, 23, 34, 46, 59, 72];
    rings.forEach((ringRadius, ringIndex) => {
      ctx.beginPath();
      for (let i = 0; i <= 160; i++) {
        const angle = (i / 160) * Math.PI * 2;
        const wobble =
          Math.sin(angle * (ringIndex + 1.8)) * 2.6 +
          Math.cos(angle * (ringIndex + 3.2)) * 1.6 +
          Math.sin(angle * 5.1 + ringIndex) * 0.8;
        const r = ringRadius + wobble;
        const x = ringCenterX + Math.cos(angle) * r;
        const y = ringCenterY + Math.sin(angle) * r * 0.9;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const isOuter = ringIndex === rings.length - 1;
      const selectedPalette = [
        "rgba(61, 46, 28, 0.70)",
        "rgba(139, 106, 50, 0.76)",
        "rgba(91, 78, 57, 0.72)",
      ];
      const defaultPalette = [
        "rgba(61, 46, 28, 0.56)",
        "rgba(139, 122, 98, 0.82)",
        "rgba(91, 78, 57, 0.66)",
      ];
      ctx.strokeStyle = isOuter
        ? selected
          ? "rgba(61, 46, 28, 0.78)"
          : "rgba(86, 70, 48, 0.76)"
        : (selected ? selectedPalette : defaultPalette)[ringIndex % 3];
      ctx.lineWidth = isOuter ? 3.4 : ringIndex % 2 === 0 ? 2.5 : 1.7;
      ctx.stroke();
    });

    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + 0.12;
      const inner = 10 + (i % 3) * 10;
      const outer = 67 - (i % 4) * 8;
      ctx.beginPath();
      ctx.moveTo(
        ringCenterX + Math.cos(angle) * inner,
        ringCenterY + Math.sin(angle) * inner * 0.9,
      );
      ctx.lineTo(
        ringCenterX + Math.cos(angle + 0.07) * outer,
        ringCenterY + Math.sin(angle + 0.07) * outer * 0.9,
      );
      ctx.strokeStyle = selected ? "rgba(61, 46, 28, 0.22)" : "rgba(86, 70, 48, 0.18)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(ringCenterX - 1, ringCenterY, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = selected ? "rgba(61, 46, 28, 0.72)" : "rgba(86, 70, 48, 0.62)";
    ctx.fill();
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }, [selected]);

  if (!texture) return null;

  return (
    <mesh
      renderOrder={24}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <planeGeometry args={[0.28, 0.28]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={selected ? 0.96 : 0.88}
        depthTest={false}
      />
    </mesh>
  );
}
