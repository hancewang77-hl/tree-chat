"use client";

import { Plus, Minus } from "lucide-react";

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
    <div className="absolute bottom-7 right-7 z-30">
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/20 bg-[rgba(255,255,255,0.14)] p-2 shadow-[0_20px_50px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
        <button
          onClick={onZoomIn}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-slate-700 transition-all hover:bg-white"
          title="放大"
        >
          <Plus size={18} />
        </button>

        <div className="px-2 text-[11px] font-medium text-slate-600">
          {is3DMode ? `${zoom.toFixed(2)}x` : `${Math.round(zoom)}%`}
        </div>

        <button
          onClick={onZoomOut}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-slate-700 transition-all hover:bg-white"
          title="缩小"
        >
          <Minus size={18} />
        </button>
      </div>
    </div>
  );
}
