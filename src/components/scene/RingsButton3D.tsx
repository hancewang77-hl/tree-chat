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
    ctx.shadowColor = "rgba(61, 46, 28, 0.24)";
    ctx.shadowBlur = selected ? 5 : 3;
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
      const alpha = selected ? 0.84 - ringIndex * 0.06 : 0.68 - ringIndex * 0.05;
      ctx.strokeStyle = `rgba(255, 253, 247, ${Math.max(alpha, 0.36)})`;
      ctx.lineWidth = ringIndex === rings.length - 1 ? 3 : ringIndex % 2 === 0 ? 2.3 : 1.45;
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
      ctx.strokeStyle = selected ? "rgba(255, 253, 247, 0.20)" : "rgba(255, 253, 247, 0.14)";
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(ringCenterX - 1, ringCenterY, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = selected ? "rgba(255, 253, 247, 0.78)" : "rgba(255, 253, 247, 0.58)";
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
      <planeGeometry args={[0.25, 0.25]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={selected ? 0.92 : 0.78}
        depthTest={false}
      />
    </mesh>
  );
}
