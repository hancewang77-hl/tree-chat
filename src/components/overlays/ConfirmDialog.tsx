"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { MindNode } from "@/src/types/tree";
import { useTreeDispatch } from "@/src/state/TreeContext";

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(44, 36, 22, 0.18)" }}
      onClick={onCancel}
    >
      <div
        className="w-[360px] max-w-[90vw] rounded-2xl p-6 shadow-2xl animate-fade-up"
        style={{ background: "var(--bg-paper)", border: "1px solid var(--border-warm)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 mb-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "rgba(180, 60, 40, 0.1)" }}
          >
            <AlertTriangle size={20} style={{ color: "#B43C28" }} />
          </div>
          <div>
            <h3
              className="text-[15px] font-semibold mb-1"
              style={{ color: "var(--accent-bark)", fontFamily: "var(--font-serif)" }}
            >
              {title}
            </h3>
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {message}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-xl px-4 py-2 text-[13px] transition-all hover:opacity-80"
            style={{ border: "1px solid var(--border-warm)", color: "var(--text-muted)" }}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl px-4 py-2 text-[13px] font-medium transition-all hover:opacity-90"
            style={{ background: "#B43C28", color: "#FFF" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 修剪确认流程（TreeToolbar 与 InspectorSidebar 共用）。
 * 约束：根节点受保护，requestPrune 对根节点/空选择不弹窗；
 * 文案与 PRUNE 派发必须在两处入口保持一致。
 * 弹窗以调用方渲染 pruneConfirmDialog 的位置为定位上下文。
 */
export function usePruneConfirm({
  selectedNode,
  isRoot,
}: {
  selectedNode: MindNode | undefined;
  isRoot: boolean;
}) {
  const dispatch = useTreeDispatch();
  const [showPruneConfirm, setShowPruneConfirm] = useState(false);

  function requestPrune() {
    if (isRoot || !selectedNode) return;
    setShowPruneConfirm(true);
  }

  const pruneConfirmDialog = showPruneConfirm && selectedNode ? (
    <ConfirmDialog
      title="修剪分支 · Prune"
      message={`确定要删除「${selectedNode.prompt.slice(0, 40)}」${
        selectedNode.children.length > 0 ? `及其 ${selectedNode.children.length} 个子节点` : ""
      }吗？此操作可通过 Rings 撤销。`}
      confirmLabel="确认删除"
      onConfirm={() => {
        dispatch({ type: "PRUNE", nodeId: selectedNode.id });
        setShowPruneConfirm(false);
      }}
      onCancel={() => setShowPruneConfirm(false)}
    />
  ) : null;

  return { requestPrune, pruneConfirmDialog };
}
