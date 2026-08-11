"use client";

import type { MindNode } from "@/src/types/tree";
import { NODE_H, NODE_W } from "@/hooks/useTreeLayout";
import { summarizeForCard } from "@/src/lib/formatResponse";
import { BASE_WORLD_SCALE } from "@/src/lib/viewport2d";

export function NodeCard2D({
  node,
  selected,
  inPath,
  onSelect,
  showConfirmButton,
  onConfirmLayerMove,
  onOpenRings,
}: {
  node: MindNode;
  selected: boolean;
  inPath: boolean;
  onSelect: () => void;
  showConfirmButton: boolean;
  onConfirmLayerMove: () => void;
  onOpenRings: () => void;
}) {
  const status = node.status ?? "complete";
  const isNote = node.kind === "leaf";
  const promptLabel = isNote ? "LEAF / 记录" : "SEED / 提问";
  const responseLabel = isNote
    ? "SOIL / 备注"
    : status === "streaming"
      ? "GROWTH / 生成中"
      : status === "failed"
        ? "CANOPY / 失败"
        : status === "stopped"
          ? "CANOPY / 已停止"
          : "CANOPY / 回答";
  const summary = isNote
    ? "这是一片手动记录的叶片，可继续生长出新的分支。"
    : status === "failed"
      ? "生成失败。请检查网络或 API 配置后重新提问。"
      : node.response.trim()
        ? `${summarizeForCard(node.response, 150)}${status === "streaming" ? " ▌" : ""}`
        : status === "streaming"
          ? "正在等待第一段回答... ▌"
          : "这个分支还没有回答。";

  return (
    <article
      className={`tree-card-2d ${selected ? "is-selected" : ""} ${inPath ? "is-path" : ""}`}
      style={{
        width: Math.round(NODE_W * BASE_WORLD_SCALE),
        height: Math.round(NODE_H * BASE_WORLD_SCALE),
      }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      aria-label={`选择节点：${node.prompt || "未命名节点"}`}
    >
      <span className="tree-card-spine-2d" aria-hidden="true" />
      <span className="tree-card-ring-2d" aria-label={`图层 z${node.layer}`}>
        <i />
        <i />
        <i />
        <span>z{node.layer}</span>
      </span>

      <div className="tree-card-content-2d">
        <CardPill label={promptLabel} tone="olive" />
        <p className="tree-card-prompt-2d">{node.prompt || "未命名节点"}</p>
        <div className="tree-card-divider-2d" aria-hidden="true" />
        <CardPill label={responseLabel} tone={isNote ? "olive" : "deep"} />
        <p className="tree-card-summary-2d">{summary}</p>
      </div>

      {(selected || inPath) && <span className="tree-card-fruit-2d" aria-hidden="true" />}

      <button
        type="button"
        className="tree-rings-button-2d"
        onClick={(event) => {
          event.stopPropagation();
          onOpenRings();
        }}
        aria-label="打开节点年轮"
        title="打开节点年轮"
      >
        <i />
        <i />
        <i />
        <i />
      </button>

      {showConfirmButton && (
        <button
          type="button"
          className="tree-layer-confirm-2d"
          onClick={(event) => {
            event.stopPropagation();
            onConfirmLayerMove();
          }}
          aria-label="确认移动图层"
        >
          ✓
        </button>
      )}
    </article>
  );
}

function CardPill({ label, tone }: { label: string; tone: "olive" | "deep" }) {
  return (
    <span className={`tree-card-pill-2d is-${tone}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}
