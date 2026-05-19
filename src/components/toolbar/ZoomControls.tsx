"use client";

import { Plus, Minus, TreePine } from "lucide-react";

export function ZoomControls({
  zoom,
  is3DMode,
  onZoomIn,
  onZoomOut,
}: {
  zoom: number;
  is3DMode: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  return (
    <div className="absolute bottom-[104px] right-4 z-30">
      <div
        className="flex flex-col items-center gap-1 rounded-2xl px-1.5 py-1.5 shadow-lg"
        style={{
          background: "rgba(216, 204, 184, 0.92)",
          border: "1px solid var(--border-warm)",
        }}
      >
        <button
          onClick={onZoomIn}
          className="flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:bg-white/80"
          style={{ color: "var(--text-charcoal)" }}
          title="放大 — 靠近树冠"
        >
          <Plus size={15} />
        </button>

        {/* Zoom level indicator with ring accent */}
        <div
          className="flex flex-col items-center gap-0.5 select-none"
          style={{ color: "var(--text-muted)" }}
        >
          <span className="text-[9px] font-medium leading-none">
            {is3DMode ? `${zoom.toFixed(1)}×` : `${Math.round(zoom)}%`}
          </span>
          <TreePine size={10} style={{ color: "var(--accent-sage)", opacity: 0.6 }} />
        </div>

        <button
          onClick={onZoomOut}
          className="flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:bg-white/80"
          style={{ color: "var(--text-charcoal)" }}
          title="缩小 — 俯瞰全景"
        >
          <Minus size={15} />
        </button>
      </div>
    </div>
  );
}
