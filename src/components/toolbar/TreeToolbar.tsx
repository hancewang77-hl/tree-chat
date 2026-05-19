"use client";

import { useState } from "react";
import { GitBranch, StickyNote, Scissors, Trash2, Sun } from "lucide-react";
import { useTreeState, useTreeDispatch } from "@/src/state/TreeContext";
import { ConfirmDialog } from "@/src/components/overlays/ConfirmDialog";

type ToolButton = {
  id: string;
  icon: React.ReactNode;
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export function TreeToolbar() {
  const state = useTreeState();
  const dispatch = useTreeDispatch();
  const [showPruneConfirm, setShowPruneConfirm] = useState(false);

  const activeProject = state.projects[state.activeProjectId];
  const selectedNode = activeProject?.nodes[state.selectedNodeId];
  const isRoot = selectedNode?.id === activeProject?.rootNodeId;

  function handlePruneClick() {
    if (isRoot || !selectedNode) return;
    setShowPruneConfirm(true);
  }

  function handlePruneConfirm() {
    dispatch({ type: "PRUNE", nodeId: state.selectedNodeId });
    setShowPruneConfirm(false);
  }

  const buttons: ToolButton[] = [
    {
      id: "branch",
      icon: <GitBranch size={17} />,
      label: "分支",
      title: "Branch — AI 生成子节点",
      onClick: () => {
        window.dispatchEvent(new CustomEvent("composer-mode", { detail: "ai" }));
        window.dispatchEvent(new CustomEvent("composer-focus"));
      },
    },
    {
      id: "leaf",
      icon: <StickyNote size={17} />,
      label: "叶片",
      title: "Leaf — 手动添加笔记",
      onClick: () => {
        window.dispatchEvent(new CustomEvent("composer-mode", { detail: "note" }));
        window.dispatchEvent(new CustomEvent("composer-focus"));
      },
    },
    {
      id: "graft",
      icon: <Scissors size={17} />,
      label: "嫁接",
      title: "Graft — 移动节点至另一父节点",
      active: state.toolMode === "graft",
      disabled: isRoot,
      onClick: () => {
        if (state.toolMode === "graft") {
          dispatch({ type: "GRAFT_CANCEL" });
        } else if (!isRoot) {
          dispatch({ type: "GRAFT_START", nodeId: state.selectedNodeId });
        }
      },
    },
    {
      id: "prune",
      icon: <Trash2 size={17} />,
      label: "修剪",
      title: "Prune — 删除选中节点及子树",
      disabled: isRoot,
      onClick: handlePruneClick,
    },
    {
      id: "sunlight",
      icon: <Sun size={17} />,
      label: "聚焦",
      title: "Sunlight — 聚焦当前路径",
      onClick: () => {
        dispatch({ type: "SUNLIGHT", nodeId: state.selectedNodeId });
      },
    },
  ];

  return (
    <>
      <div className="absolute left-4 top-1/2 z-30 -translate-y-1/2">
        <div
          className="flex flex-col gap-0.5 rounded-2xl px-1.5 py-1.5 shadow-lg backdrop-blur-sm"
          style={{
            background: "rgba(216, 204, 184, 0.92)",
            border: "1px solid var(--border-warm)",
          }}
        >
          {buttons.map((btn) => (
            <button
              key={btn.id}
              onClick={btn.onClick}
              disabled={btn.disabled}
              title={btn.title}
              className={`group relative flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
                btn.disabled ? "opacity-25 cursor-not-allowed" : "hover:bg-white/80"
              }`}
              style={{
                background: btn.active ? "var(--accent-sage)" : "transparent",
                color: btn.active ? "#FBF7F0" : "var(--text-muted)",
              }}
            >
              {btn.icon}
              <span
                className="pointer-events-none absolute left-11 rounded-lg px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50"
                style={{
                  background: "var(--accent-bark)",
                  color: "#FBF7F0",
                }}
              >
                {btn.label}
              </span>
            </button>
          ))}

          {state.toolMode === "graft" && state.graftSourceId && (
            <div
              className="mt-0.5 rounded-lg px-2 py-1 text-center text-[10px] font-medium"
              style={{ background: "var(--accent-sage)", color: "#FBF7F0" }}
            >
              点击目标父节点
            </div>
          )}
        </div>
      </div>

      {showPruneConfirm && selectedNode && (
        <ConfirmDialog
          title="修剪分支 · Prune"
          message={`确定要删除「${selectedNode.prompt.slice(0, 40)}」${
            selectedNode.children.length > 0 ? `及其 ${selectedNode.children.length} 个子节点` : ""
          }吗？此操作可通过 Rings 撤销。`}
          confirmLabel="确认删除"
          onConfirm={handlePruneConfirm}
          onCancel={() => setShowPruneConfirm(false)}
        />
      )}
    </>
  );
}
