"use client";

import { useEffect, useState } from "react";
import { GitBranch, StickyNote, Scissors, Layers, Trash2, Sun, Sparkles } from "lucide-react";
import { useTreeState, useTreeDispatch } from "@/src/state/TreeContext";
import { usePruneConfirm } from "@/src/components/overlays/ConfirmDialog";

type ToolButton = {
  id: string;
  icon: React.ReactNode;
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

type ComposerMode = "ai" | "note";

export function TreeToolbar({
  onOpenAuxo,
  isAuxoGenerating,
}: {
  onOpenAuxo: () => void;
  isAuxoGenerating: boolean;
}) {
  const state = useTreeState();
  const dispatch = useTreeDispatch();
  const [composerMode, setComposerMode] = useState<ComposerMode>("ai");

  const activeProject = state.projects[state.activeProjectId];
  const selectedNode = activeProject?.nodes[state.selectedNodeId];
  const isRoot = selectedNode?.id === activeProject?.rootNodeId;
  const hasRootChildren = Boolean(isRoot && selectedNode && selectedNode.children.length > 0);
  const { requestPrune, pruneConfirmDialog } = usePruneConfirm({ selectedNode, isRoot });

  useEffect(() => {
    const handleMode = (event: Event) => {
      const nextMode = (event as CustomEvent).detail as ComposerMode;
      if (nextMode === "ai" || nextMode === "note") setComposerMode(nextMode);
    };
    window.addEventListener("composer-mode", handleMode);
    return () => window.removeEventListener("composer-mode", handleMode);
  }, []);

  const buttons: ToolButton[] = [
    ...(isRoot
      ? [
          {
            id: "auxo",
            icon: <Sparkles size={17} />,
            label: isAuxoGenerating ? "规划中" : "Auxo",
            title:
              hasRootChildren
                ? "Auxo 仅用于空白根任务；请新建项目，或先撤销/修剪现有分支"
                : "Auxo — 从根任务和全部启用资料生成基础任务树",
            active: isAuxoGenerating,
            disabled: isAuxoGenerating || hasRootChildren,
            onClick: onOpenAuxo,
          } satisfies ToolButton,
        ]
      : []),
    {
      id: "branch",
      icon: <GitBranch size={17} />,
      label: "分支",
      title: "Branch — AI 生成子节点",
      active: composerMode === "ai",
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
      active: composerMode === "note",
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
      id: "layerMove",
      icon: <Layers size={17} />,
      label: "移层",
      title: "Layer — 将选中节点移动到其他图层",
      active: state.toolMode === "layerMove",
      disabled: isRoot || selectedNode?.kind === "leaf",
      onClick: () => {
        if (state.toolMode === "layerMove") {
          dispatch({ type: "LAYER_MOVE_CANCEL" });
          return;
        }
        if (isRoot || !selectedNode || selectedNode.kind === "leaf") return;
        // Target layers are picked on the 3D glass stack, so the move
        // flow always runs in 3D mode.
        if (!state.is3DMode) dispatch({ type: "TOGGLE_3D" });
        dispatch({ type: "LAYER_MOVE_START", nodeId: state.selectedNodeId });
      },
    },
    {
      id: "prune",
      icon: <Trash2 size={17} />,
      label: "修剪",
      title: "Prune — 删除选中节点及子树",
      disabled: isRoot,
      onClick: requestPrune,
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
          role="group"
          aria-label="树编辑工具"
          className="flex flex-col gap-0.5 rounded-2xl px-1.5 py-1.5 shadow-lg backdrop-blur-sm"
          style={{
            background: "rgba(216, 204, 184, 0.90)",
            border: "1px solid rgba(116, 122, 85, 0.22)",
            boxShadow: "0 10px 24px rgba(61, 46, 28, 0.14)",
          }}
        >
          {buttons.map((btn) => (
            <button
              key={btn.id}
              onClick={btn.onClick}
              disabled={btn.disabled}
              title={btn.title}
              aria-label={btn.label}
              aria-pressed={btn.active === undefined ? undefined : btn.active}
              className={`group relative flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
                btn.disabled ? "opacity-25 cursor-not-allowed" : "hover:opacity-85"
              }`}
              style={{
                background: btn.active ? "var(--accent-sage)" : "rgba(255, 253, 247, 0.46)",
                color: btn.active ? "#FBF7F0" : "var(--text-muted)",
                border: `1px solid ${btn.active ? "rgba(86, 91, 61, 0.42)" : "rgba(199, 184, 157, 0.54)"}`,
                boxShadow: btn.active ? "0 5px 12px rgba(86, 91, 61, 0.20)" : "none",
              }}
            >
              {btn.icon}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-11 rounded-lg px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50"
                style={{
                  background: "var(--accent-olive-deep)",
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

          {state.toolMode === "layerMove" && state.movingNodeId && (
            <div
              className="mt-0.5 rounded-lg px-2 py-1 text-center text-[10px] font-medium"
              style={{ background: "var(--accent-sage)", color: "#FBF7F0" }}
            >
              滚轮选层，点 ✓ 确认
            </div>
          )}
        </div>
      </div>

      {pruneConfirmDialog}
    </>
  );
}
