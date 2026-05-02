"use client";

import { ReactNode } from "react";
import {
  BrainCircuit,
  GitBranch,
  Move,
  RotateCcw,
  ScanSearch,
} from "lucide-react";
import type { ToolMode } from "@/src/types/tree";

function ToolCircle({
  active,
  icon,
  label,
  title,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`group flex min-w-[72px] flex-col items-center gap-1 rounded-2xl px-3 py-2 transition-all ${
        active
          ? "bg-indigo-600 text-white shadow-[0_10px_24px_rgba(99,102,241,0.28)]"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      <div className="flex h-8 w-8 items-center justify-center">{icon}</div>
      <span className="text-[11px] font-medium tracking-[0.02em]">{label}</span>
    </button>
  );
}

const modeLabels: Record<ToolMode, string> = {
  view: "视图模式",
  node: "节点模式",
  layerMove: "层级模式",
};

export function SceneToolbar({
  toolMode,
  is3DMode,
  selectedLayer,
  onToolChange,
  onToggle3D,
  onAutoArrange,
  onOpenNameDialog,
}: {
  toolMode: ToolMode;
  is3DMode: boolean;
  selectedLayer: number;
  onToolChange: (mode: ToolMode) => void;
  onToggle3D: () => void;
  onAutoArrange: () => void;
  onOpenNameDialog: (layer: number) => void;
}) {
  return (
    <div className="absolute bottom-7 left-1/2 z-30 -translate-x-1/2">
      <div className="flex items-end gap-2 rounded-[22px] border border-white/20 bg-[rgba(255,255,255,0.14)] px-3 py-3 shadow-[0_20px_50px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
        <ToolCircle
          active={toolMode === "view"}
          icon={<ScanSearch size={18} />}
          label="视图"
          title="视图模式"
          onClick={() => onToolChange("view")}
        />

        <ToolCircle
          active={toolMode === "node"}
          icon={<Move size={18} />}
          label="节点"
          title="节点拖动模式"
          onClick={() => onToolChange("node")}
        />

        <ToolCircle
          active={false}
          icon={<RotateCcw size={18} />}
          label="整理"
          title="自动整理"
          onClick={onAutoArrange}
        />

        <ToolCircle
          active={is3DMode}
          icon={<BrainCircuit size={18} />}
          label="3D"
          title="2D / 3D 切换"
          onClick={onToggle3D}
        />

        <ToolCircle
          active={false}
          icon={<GitBranch size={18} />}
          label="命名"
          title="命名当前平面"
          onClick={() => {
            if (is3DMode) onOpenNameDialog(selectedLayer);
          }}
        />

        <ToolCircle
          active={toolMode === "layerMove"}
          icon={<GitBranch size={18} />}
          label="层级"
          title="层级移动"
          onClick={() => onToolChange("layerMove")}
        />
        <div className="ml-1 text-[12px] text-slate-500">
          {modeLabels[toolMode]}
        </div>
      </div>
    </div>
  );
}
