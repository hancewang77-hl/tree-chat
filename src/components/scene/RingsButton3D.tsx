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
    const radius = 78;
    const wood = ctx.createRadialGradient(cx - 18, cy - 22, 12, cx, cy, radius);
    wood.addColorStop(0, selected ? "#FFF1C7" : "#FFF7DF");
    wood.addColorStop(0.35, "#E8C982");
    wood.addColorStop(0.68, "#B9823D");
    wood.addColorStop(1, "#6F4320");

    ctx.save();
    ctx.shadowColor = selected ? "rgba(196,148,58,0.62)" : "rgba(61,46,28,0.22)";
    ctx.shadowBlur = selected ? 18 : 10;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = wood;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 5, 0, Math.PI * 2);
    ctx.clip();

    const rings = [14, 24, 35, 47, 59, 70];
    rings.forEach((ringRadius, ringIndex) => {
      ctx.beginPath();
      for (let i = 0; i <= 128; i++) {
        const angle = (i / 128) * Math.PI * 2;
        const wobble =
          Math.sin(angle * (ringIndex + 2.1)) * 2.2 +
          Math.cos(angle * (ringIndex + 3.7)) * 1.4;
        const r = ringRadius + wobble;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r * 0.93;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle =
        ringIndex % 2 === 0
          ? "rgba(79,43,18,0.48)"
          : "rgba(255,240,188,0.42)";
      ctx.lineWidth = ringIndex % 2 === 0 ? 3 : 1.5;
      ctx.stroke();
    });

    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2;
      const inner = 10 + (i % 4) * 8;
      const outer = 66 - (i % 3) * 7;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle + 0.08) * outer, cy + Math.sin(angle + 0.08) * outer);
      ctx.strokeStyle = "rgba(255,248,221,0.18)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = selected ? "#FFF6D8" : "rgba(255,253,247,0.72)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2);
    ctx.stroke();

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
      <planeGeometry args={[0.34, 0.34]} />
      <meshBasicMaterial map={texture} transparent depthTest={false} />
    </mesh>
  );
}
