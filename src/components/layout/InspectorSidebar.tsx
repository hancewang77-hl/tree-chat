"use client";

import { useEffect, useState } from "react";
import { GitBranch, MessageSquare, RefreshCw, StickyNote, Trash2, Sun, Sparkles } from "lucide-react";
import type { MindNode, NodesMap, SemanticCard } from "@/src/types/tree";
import { useTreeState, useTreeDispatch } from "@/src/state/TreeContext";
import { useResizableSidebar } from "@/hooks/useResizableSidebar";
import { renderMarkdownToHTML } from "@/src/lib/formatResponse";
import { CARD_BOTTOM_LEAF_VEIN_PATTERN } from "@/src/lib/visualPatterns";
import { usePruneConfirm } from "@/src/components/overlays/ConfirmDialog";

type ComposerMode = "ai" | "note";

export function InspectorSidebar({
  currentPath,
  onRetrySemantics,
  structuringNodeIds,
}: {
  currentPath: MindNode[];
  onRetrySemantics: (nodeId: string) => void;
  structuringNodeIds: ReadonlySet<string>;
}) {
  const state = useTreeState();
  const dispatch = useTreeDispatch();
  const [composerMode, setComposerMode] = useState<ComposerMode>("ai");

  const activeProject = state.projects[state.activeProjectId];
  const selectedNode = activeProject?.nodes[state.selectedNodeId];
  const isRoot = selectedNode?.id === activeProject?.rootNodeId;
  const isAuxoTask = selectedNode?.nodeRole === "task" || selectedNode?.nodeRole === "task-group";
  const isStructuring = selectedNode ? structuringNodeIds.has(selectedNode.id) : false;
  const { requestPrune, pruneConfirmDialog } = usePruneConfirm({ selectedNode, isRoot });
  const { sidebarWidth, isResizingSidebar, startResizing } = useResizableSidebar(340, {
    side: "right",
    minWidth: 300,
    maxWidth: 640,
  });

  useEffect(() => {
    const handleMode = (event: Event) => {
      const nextMode = (event as CustomEvent).detail as ComposerMode;
      if (nextMode === "ai" || nextMode === "note") setComposerMode(nextMode);
    };
    window.addEventListener("composer-mode", handleMode);
    return () => window.removeEventListener("composer-mode", handleMode);
  }, []);

  return (
    <>
    <aside
      className="relative z-20 flex shrink-0 flex-col border-l animate-fade-up stagger-4"
      style={{
        width: sidebarWidth,
        background: "var(--bg-paper)",
        borderColor: "var(--border-warm)",
        boxShadow: "-2px 0 16px var(--shadow-warm)",
      }}
    >
      {/* Drag-to-resize handle on the inner edge */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          startResizing();
        }}
        className="absolute left-0 top-0 z-30 h-full w-1 cursor-col-resize transition-colors"
        style={{
          background: isResizingSidebar ? "var(--accent-sage)" : "transparent",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--accent-olive-soft)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isResizingSidebar
            ? "var(--accent-sage)"
            : "transparent";
        }}
      />
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: "var(--border-warm)" }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              background: "var(--accent-sage)",
              color: "var(--on-primary)",
              border: "1px solid rgba(255, 253, 247, 0.24)",
              boxShadow: "0 4px 10px rgba(86, 91, 61, 0.22)",
            }}
          >
            <MessageSquare size={15} />
          </span>
          <div>
            <h2
              className="text-[12px] font-semibold tracking-[0.04em] uppercase"
              style={{ color: "var(--accent-bark)", fontFamily: "var(--font-serif)" }}
            >
              Explore
            </h2>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              对话窗口 · 路径深度 {currentPath.length}
            </p>
          </div>
        </div>
        {selectedNode && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: "var(--workbench-raised)", color: "var(--text-muted)" }}
          >
            z = {selectedNode.layer}
          </span>
        )}
      </div>

      {/* Node details */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {selectedNode && (
          <section
            className="rounded-xl border p-3.5"
            style={{
              background: `${CARD_BOTTOM_LEAF_VEIN_PATTERN} no-repeat right -18px bottom -18px / 330px 124px, var(--bg-cream)`,
              borderColor: selectedNode.kind === "leaf" ? "rgba(116, 122, 85, 0.42)" : "var(--border-warm)",
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  background: selectedNode.kind === "leaf" ? "var(--accent-olive-soft)" : "var(--workbench-raised)",
                  color: selectedNode.kind === "leaf" ? "var(--accent-sage)" : "var(--text-muted)",
                }}
              >
                {selectedNode.kind === "leaf"
                  ? <StickyNote size={10} />
                  : isAuxoTask
                    ? <Sparkles size={10} />
                    : <GitBranch size={10} />}
                {selectedNode.kind === "leaf"
                  ? "Leaf · 笔记"
                  : selectedNode.nodeRole === "task-group"
                    ? "Auxo · 任务组"
                    : selectedNode.nodeRole === "task"
                      ? "Auxo · 原子任务"
                  : selectedNode.kind === "root"
                    ? "Root · 根任务"
                    : "Branch · 回答"}
              </span>
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                z={selectedNode.layer}
              </span>
            </div>

            <h3
              className="mb-3 text-[14px] font-semibold leading-snug"
              style={{ color: "var(--accent-bark)", fontFamily: "var(--font-serif)" }}
            >
              {selectedNode.prompt}
            </h3>

            {selectedNode.status === "failed" ? (
              <div
                className="rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed"
                style={{
                  background: "rgba(180, 60, 40, 0.08)",
                  borderColor: "rgba(180, 60, 40, 0.24)",
                  color: "#8F2F22",
                }}
              >
                {selectedNode.error || "生成失败，请检查网络连接和 API 配置后重试。"}
              </div>
            ) : isAuxoTask ? (
              <div
                className="rounded-lg border px-3 py-2.5"
                style={{
                  background: "rgba(116, 122, 85, 0.08)",
                  borderColor: "rgba(116, 122, 85, 0.22)",
                }}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold" style={{ color: "var(--accent-sage)" }}>
                    任务提要
                  </span>
                  {selectedNode.auxoSource && (
                    <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                      已核验原文
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-[12px] leading-relaxed" style={{ color: "var(--text-charcoal)" }}>
                  {selectedNode.taskDescription || "选中该任务后，从下方输入问题逐项执行。"}
                </p>
              </div>
            ) : selectedNode.kind === "leaf" ? (
              <div
                className="rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap"
                style={{
                  background: "rgba(116, 122, 85, 0.08)",
                  borderColor: "rgba(116, 122, 85, 0.22)",
                  color: "var(--text-charcoal)",
                }}
              >
                {selectedNode.response.trim() || selectedNode.prompt}
              </div>
            ) : selectedNode.response ? (
              <>
                <div
                  className="response-content text-[13px] leading-relaxed"
                  style={{ color: "var(--text-charcoal)" }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(selectedNode.response) }}
                />
                {selectedNode.status === "streaming" && (
                  <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    正在生成回答...
                  </p>
                )}
                {selectedNode.status === "stopped" && (
                  <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    已停止生成，以上为已收到内容。
                  </p>
                )}
              </>
            ) : (
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {selectedNode.status === "streaming"
                  ? "正在等待第一段回答..."
                  : selectedNode.status === "stopped"
                    ? "生成已停止，当前没有收到回答内容。"
                    : "这个节点还没有 AI 回答。"}
              </p>
            )}

            {selectedNode.nutrientRefs && selectedNode.nutrientRefs.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {selectedNode.nutrientRefs.map((id) => {
                  const nutrient = activeProject?.nutrients[id];
                  if (!nutrient) return null;
                  return (
                    <span
                      key={id}
                      className="rounded-full px-2 py-0.5 text-[10px]"
                      style={{ background: "var(--accent-olive-soft)", color: "var(--text-muted)" }}
                    >
                      {nutrient.name}
                    </span>
                  );
                })}
              </div>
            )}

            <NodeContextPanel
              node={selectedNode}
              isStructuring={isStructuring}
              onRetrySemantics={onRetrySemantics}
              onToggleLeaf={() => dispatch({ type: "TOGGLE_LEAF_CONTEXT", nodeId: selectedNode.id })}
            />
          </section>
        )}

        <div className="pt-1">
          <p
            className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.04em]"
            style={{ color: "var(--text-muted)" }}
          >
            Context Path
          </p>
        </div>

        {currentPath.map((node) => {
          const isSelected = node.id === state.selectedNodeId;
          const isLeafNote = node.kind === "leaf";
          const isAuxoPathNode = node.nodeRole === "task" || node.nodeRole === "task-group";

          return (
            <button
              key={node.id}
              onClick={() => dispatch({ type: "SELECT_NODE", nodeId: node.id })}
              className={`w-full rounded-xl p-3.5 text-left transition-all ${
                isSelected ? "" : "hover:opacity-90"
              }`}
              style={{
                background: isSelected
                  ? `${CARD_BOTTOM_LEAF_VEIN_PATTERN} no-repeat right -30px bottom -24px / 250px 94px, var(--accent-olive-soft)`
                  : `${CARD_BOTTOM_LEAF_VEIN_PATTERN} no-repeat right -30px bottom -24px / 250px 94px, var(--workbench-control-fill)`,
                border: "1px solid var(--control-border)",
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    background: isSelected ? "var(--accent-sage)" : "var(--workbench-raised)",
                    color: isSelected ? "var(--on-primary)" : "var(--text-muted)",
                  }}
                >
                  {isLeafNote
                    ? <StickyNote size={10} />
                    : isAuxoPathNode
                      ? <Sparkles size={10} />
                      : <GitBranch size={10} />}
                  {isLeafNote
                    ? "笔记"
                    : node.nodeRole === "task-group"
                      ? "任务组"
                      : node.nodeRole === "task"
                        ? "任务"
                        : "AI"}
                </span>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  z={node.layer}
                </span>
                <span className="ml-auto text-[10px]" style={{ color: contextStateColor(node) }}>
                  {contextStateLabel(node)}
                </span>
              </div>

              <p
                className="text-[13px] font-medium leading-snug mb-1"
                style={{ color: "var(--text-charcoal)", fontFamily: "var(--font-serif)" }}
              >
                {node.prompt}
              </p>

              {node.response && (
                <p className="line-clamp-2 text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {node.response.replace(/\s+/g, " ").slice(0, 96)}
                </p>
              )}
              {node.status === "streaming" && !node.response && (
                <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  正在生成...
                </p>
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
              active={composerMode === "ai"}
              onClick={() => {
                window.dispatchEvent(new CustomEvent("composer-mode", { detail: "ai" }));
                window.dispatchEvent(new CustomEvent("composer-focus"));
              }}
            />
            <ActionButton
              icon={<StickyNote size={13} />}
              label="叶片"
              active={composerMode === "note"}
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
                onClick={requestPrune}
              />
            )}
          </div>
        </div>
      )}
    </aside>
    {/* Rendered outside the (positioned) aside so the overlay still covers
        the app, not just the sidebar column. */}
    {pruneConfirmDialog}
    </>
  );
}

function NodeContextPanel({
  node,
  isStructuring,
  onRetrySemantics,
  onToggleLeaf,
}: {
  node: MindNode;
  isStructuring: boolean;
  onRetrySemantics: (nodeId: string) => void;
  onToggleLeaf: () => void;
}) {
  const state = useTreeState();
  const activeProject = state.projects[state.activeProjectId];
  const nodes = activeProject?.nodes ?? {};

  const canRetry =
    node.kind === "branch" &&
    (node.nodeRole ?? "answer") === "answer" &&
    node.contextState === "missing" &&
    node.status === "complete" &&
    Boolean(node.response.trim());

  return (
    <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border-warm)" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--text-muted)" }}>
          Model Context
        </p>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            background: "var(--workbench-raised)",
            color: contextStateColor(node),
          }}
        >
          {isStructuring ? "整理中" : contextStateLabel(node)}
        </span>
      </div>

      {node.kind === "leaf" ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {node.includeInContext
              ? "该笔记会作为用户给定信息加入所在路径。"
              : "默认只保存与展示，不影响 AI 推理。"}
          </p>
          <button
            type="button"
            onClick={onToggleLeaf}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-opacity hover:opacity-80"
            style={{
              background: node.includeInContext ? "var(--accent-sage)" : "var(--bg-paper)",
              color: node.includeInContext ? "var(--on-primary)" : "var(--accent-bark)",
              border: "1px solid var(--control-border)",
            }}
          >
            {node.includeInContext ? "已纳入" : "作为上下文"}
          </button>
        </div>
      ) : (
        <>
          <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {node.contextState === "valid"
              ? node.kind === "root"
                ? "后续追问读取根任务原文，根节点无需调用模型整理。"
                : node.nodeRole === "task" || node.nodeRole === "task-group"
                  ? "后续追问直接读取经 Auxo 校验的任务原文与规划说明；不会把它误当成已完成答案。"
                : "后续追问只读取下方语义卡片，不重复拼接完整回答。"
              : node.contextState === "stale"
                ? "节点已被嫁接到新路径；原回答保留，但旧语义不再进入模型。"
                : "当前没有可用语义卡片；完整回答仍保留，但不会被当作后续模型记忆。"}
          </p>

          {canRetry && (
            <button
              type="button"
              onClick={() => onRetrySemantics(node.id)}
              disabled={isStructuring}
              className="mt-2 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: "var(--bg-paper)",
                color: "var(--accent-bark)",
                border: "1px solid var(--control-border)",
              }}
            >
              <RefreshCw size={11} className={isStructuring ? "animate-spin" : ""} />
              {isStructuring ? "正在整理" : "重试语义整理"}
            </button>
          )}

          {node.contextState === "valid" && node.semanticCard && (
            <SemanticCardDetails card={node.semanticCard} />
          )}

          {node.contextManifest && (
            <details className="mt-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <summary className="cursor-pointer select-none">
                生成清单 · {node.contextManifest.includedNodeIds.length} 节点 / {node.contextManifest.nutrientChunks.length} 资料片段
              </summary>
              <p className="mt-1 break-all leading-relaxed">
                Compiler v{node.contextManifest.compilerVersion} · {node.contextManifest.model}
              </p>
              <p className="mt-1 break-all leading-relaxed">
                节点：{node.contextManifest.includedNodeIds
                  .map((id) => formatNodeLabel(id, nodes))
                  .join(" → ")}
              </p>
              {node.contextManifest.nutrientChunks.length > 0 && (
                <p className="mt-1 break-all leading-relaxed">
                  资料：{node.contextManifest.nutrientChunks
                    .map((chunk) => `${chunk.nutrientName}#${chunk.chunkId}`)
                    .join("、")}
                </p>
              )}
              {node.contextManifest.warnings.length > 0 && (
                <p className="mt-1 leading-relaxed" style={{ color: "#B43C28" }}>
                  {node.contextManifest.warnings.join("；")}
                </p>
              )}
            </details>
          )}

          {node.auxoManifest && (
            <details className="mt-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <summary className="cursor-pointer select-none">
                Auxo 清单 · {node.auxoManifest.nodeCount} 节点 / {node.auxoManifest.nutrientChunks.length} 资料片段
              </summary>
              <p className="mt-1 break-all leading-relaxed">
                Auxo v{node.auxoManifest.version} · {node.auxoManifest.model}
              </p>
              {node.auxoManifest.nutrientChunks.length > 0 && (
                <p className="mt-1 break-all leading-relaxed">
                  资料：{node.auxoManifest.nutrientChunks
                    .map((chunk) => `${chunk.nutrientName}#${chunk.chunkId}`)
                    .join("、")}
                </p>
              )}
            </details>
          )}
        </>
      )}
    </div>
  );
}

/**
 * 将节点 ID 转为基于树位置的可读标签。
 * 格式：根 → z1 分支1 → z2 笔记3 → ...
 */
function formatNodeLabel(nodeId: string, nodes: NodesMap): string {
  const node = nodes[nodeId];
  if (!node) return `[?] ${nodeId.slice(0, 8)}`;

  if (node.kind === "root") return "根";

  const parent = node.parentId ? nodes[node.parentId] : null;
  const siblingIndex = parent ? parent.children.indexOf(nodeId) : -1;
  const pos = siblingIndex >= 0 ? `#${siblingIndex + 1}` : "#?";

  const kind = node.kind === "leaf"
    ? "笔记"
    : node.nodeRole === "task-group"
      ? "任务组"
      : node.nodeRole === "task"
        ? "任务"
        : "分支";
  return `z${node.layer} ${kind}${pos}`;
}

function SemanticCardDetails({ card }: { card: SemanticCard }) {
  const rows: Array<[string, string[]]> = [
    ["事实", card.facts],
    ["约束", card.constraints],
    ["假设", card.assumptions],
    ["决定", card.decisions],
    ["已否定", card.rejected],
    ["开放问题", card.openQuestions],
  ];
  const visibleRows = rows.filter(([, items]) => items.length > 0);

  if (visibleRows.length === 0) return null;
  return (
    <details className="mt-2 rounded-lg border px-2.5 py-2" style={{ borderColor: "var(--border-warm)" }}>
      <summary className="cursor-pointer select-none text-[10px] font-semibold" style={{ color: "var(--accent-bark)" }}>
        查看语义卡片
      </summary>
      <div className="mt-2 space-y-2">
        {visibleRows.map(([label, items]) => (
          <div key={label}>
            <p className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>{label}</p>
            <ul className="mt-0.5 space-y-0.5 pl-3 text-[11px] leading-relaxed" style={{ color: "var(--text-charcoal)" }}>
              {items.map((item) => <li key={item} className="list-disc">{item}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

function contextStateLabel(node: MindNode): string {
  if (node.kind === "leaf") return node.includeInContext ? "已纳入" : "默认隔离";
  if (node.nodeRole === "task" || node.nodeRole === "task-group") return "源任务";
  if (node.contextState === "valid") return "有效";
  if (node.contextState === "stale") return "已失效";
  return "待整理";
}

function contextStateColor(node: MindNode): string {
  if (node.kind === "leaf") {
    return node.includeInContext ? "var(--accent-sage)" : "var(--text-muted)";
  }
  if (node.contextState === "valid") return "var(--accent-sage)";
  if (node.contextState === "stale") return "#B43C28";
  return "var(--accent-amber)";
}

function ActionButton({
  icon,
  label,
  onClick,
  active,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium transition-all hover:opacity-85"
      style={{
        background: danger ? "rgba(180, 60, 40, 0.07)" : active ? "var(--accent-sage)" : "var(--bg-cream)",
        color: danger ? "#B43C28" : active ? "var(--on-primary)" : "var(--text-charcoal)",
        border: `1px solid ${danger ? "rgba(180, 60, 40, 0.18)" : "var(--control-border)"}`,
        boxShadow: active && !danger ? "0 5px 12px rgba(86, 91, 61, 0.14)" : "none",
      }}
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}
