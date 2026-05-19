"use client";

import { useState } from "react";
import { GitBranch, StickyNote, Trash2, Sun } from "lucide-react";
import type { MindNode } from "@/src/types/tree";
import { useTreeState, useTreeDispatch } from "@/src/state/TreeContext";
import { renderMarkdownToHTML } from "@/src/lib/formatResponse";
import { ConfirmDialog } from "@/src/components/overlays/ConfirmDialog";

export function InspectorSidebar({ currentPath }: { currentPath: MindNode[] }) {
  const state = useTreeState();
  const dispatch = useTreeDispatch();
  const [showPruneConfirm, setShowPruneConfirm] = useState(false);

  const activeProject = state.projects[state.activeProjectId];
  const selectedNode = activeProject?.nodes[state.selectedNodeId];
  const isRoot = selectedNode?.id === activeProject?.rootNodeId;

  return (
    <aside
      className="z-20 flex w-[340px] shrink-0 flex-col border-l animate-fade-up stagger-4"
      style={{
        background: "var(--bg-paper)",
        borderColor: "var(--border-warm)",
        boxShadow: "-2px 0 16px var(--shadow-warm)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: "var(--border-warm)" }}
      >
        <div>
          <h2
            className="text-[12px] font-semibold tracking-[0.04em] uppercase"
            style={{ color: "var(--accent-bark)", fontFamily: "var(--font-serif)" }}
          >
            Inspector
          </h2>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            路径深度 {currentPath.length}
          </p>
        </div>
        {selectedNode && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: "var(--border-warm)", color: "var(--text-muted)" }}
          >
            z = {selectedNode.layer}
          </span>
        )}
      </div>

      {/* Node details */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {currentPath.map((node) => {
          const isSelected = node.id === state.selectedNodeId;
          const isLeafNote = node.kind === "leaf";

          return (
            <button
              key={node.id}
              onClick={() => dispatch({ type: "SELECT_NODE", nodeId: node.id })}
              className={`w-full rounded-xl p-3.5 text-left transition-all ${
                isSelected ? "" : "hover:bg-white/60"
              }`}
              style={{
                background: isSelected ? "var(--border-warm)" : "transparent",
                border: isSelected ? "1px solid var(--accent-amber)" : "1px solid transparent",
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    background: isSelected ? "var(--accent-sage)" : "var(--border-warm)",
                    color: isSelected ? "#FBF7F0" : "var(--text-muted)",
                  }}
                >
                  {isLeafNote ? <StickyNote size={10} /> : <GitBranch size={10} />}
                  {isLeafNote ? "笔记" : "AI"}
                </span>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  z={node.layer}
                </span>
              </div>

              <p
                className="text-[13px] font-medium leading-snug mb-1"
                style={{ color: "var(--text-charcoal)", fontFamily: "var(--font-serif)" }}
              >
                {node.prompt}
              </p>

              {node.response && (
                <div
                  className="text-[12px] leading-relaxed response-content"
                  style={{ color: "var(--text-charcoal)" }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(node.response) }}
                />
              )}
            </button>
          );
        })}

        {currentPath.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              选择一个节点查看详情
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      {selectedNode && (
        <div className="shrink-0 border-t px-4 py-2.5" style={{ borderColor: "var(--border-warm)" }}>
          <div className="flex gap-1.5">
            <ActionButton
              icon={<GitBranch size={13} />}
              label="分支"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("composer-mode", { detail: "ai" }));
                window.dispatchEvent(new CustomEvent("composer-focus"));
              }}
            />
            <ActionButton
              icon={<StickyNote size={13} />}
              label="叶片"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("composer-mode", { detail: "note" }));
                window.dispatchEvent(new CustomEvent("composer-focus"));
              }}
            />
            <ActionButton
              icon={<Sun size={13} />}
              label="聚焦"
              onClick={() => dispatch({ type: "SUNLIGHT", nodeId: selectedNode.id })}
            />
            {!isRoot && (
              <ActionButton
                icon={<Trash2 size={13} />}
                label="修剪"
                danger
                onClick={() => setShowPruneConfirm(true)}
              />
            )}
          </div>
        </div>
      )}

      {showPruneConfirm && selectedNode && (
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
      )}
    </aside>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium transition-all hover:opacity-85"
      style={{
        background: danger ? "rgba(180, 60, 40, 0.07)" : "var(--bg-cream)",
        color: danger ? "#B43C28" : "var(--text-charcoal)",
        border: `1px solid ${danger ? "rgba(180, 60, 40, 0.18)" : "var(--border-warm)"}`,
      }}
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}
