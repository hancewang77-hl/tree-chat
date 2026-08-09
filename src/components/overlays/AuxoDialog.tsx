"use client";

import { useMemo, useRef } from "react";
import { FileText, FolderTree, Leaf, LoaderCircle, ShieldCheck, Sparkles, X } from "lucide-react";
import { AUXO_MAX_DEPTH, AUXO_MAX_NODES, AUXO_MAX_NUTRIENT_CHARS } from "@/src/lib/auxo";
import { summarizeForCard } from "@/src/lib/formatResponse";
import type { AuxoPlan, AuxoPlanNode } from "@/src/types/tree";
import { DialogPortal, useDialogFocus } from "./useDialogFocus";

type PlanTreeRow = { node: AuxoPlanNode; depth: number };

function flattenPlanForPreview(plan: AuxoPlan): PlanTreeRow[] {
  const childrenByParent = new Map<string, AuxoPlanNode[]>();
  for (const node of plan.nodes) {
    const siblings = childrenByParent.get(node.parentPlanId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentPlanId, siblings);
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => a.order - b.order);
  }

  const rows: PlanTreeRow[] = [];
  function visit(parentPlanId: string, depth: number) {
    for (const node of childrenByParent.get(parentPlanId) ?? []) {
      rows.push({ node, depth });
      visit(node.planId, depth + 1);
    }
  }
  visit("root", 0);
  return rows;
}

export function AuxoDialog({
  rootTask,
  nutrients,
  isGenerating,
  error,
  plan,
  onGenerate,
  onConfirm,
  onDiscard,
  onCancel,
}: {
  rootTask: string;
  nutrients: Array<{ id: string; name: string; extractedCharCount: number }>;
  isGenerating: boolean;
  error: string | null;
  plan?: AuxoPlan | null;
  onGenerate: () => void | Promise<void>;
  onConfirm?: () => void | Promise<void>;
  onDiscard?: () => void;
  onCancel: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { modalRootRef, dialogRef, onDialogKeyDown } = useDialogFocus<HTMLDivElement>({
    open: true,
    initialFocusRef: closeButtonRef,
    onEscape: onCancel,
  });

  const totalChars = nutrients.reduce((sum, nutrient) => sum + nutrient.extractedCharCount, 0);
  const planRows = useMemo(() => (plan ? flattenPlanForPreview(plan) : []), [plan]);

  return (
    <DialogPortal>
      <div
        ref={modalRootRef}
        className="fixed inset-0 z-[70] flex items-center justify-center px-4"
        style={{ background: "rgba(44, 36, 22, 0.22)", backdropFilter: "blur(3px)" }}
        onClick={() => {
          if (!isGenerating) onCancel();
        }}
        role="presentation"
      >
        <div
          ref={dialogRef}
          className="w-[520px] max-w-full overflow-hidden rounded-2xl shadow-2xl animate-fade-up"
          style={{ background: "var(--bg-paper)", border: "1px solid var(--border-warm)" }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={onDialogKeyDown}
          role="dialog"
          aria-modal="true"
          aria-labelledby="auxo-title"
        >
        <div
          className="flex items-start justify-between gap-4 border-b px-6 py-5"
          style={{ borderColor: "var(--border-warm)" }}
        >
          <div className="flex items-start gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "var(--accent-sage)", color: "#FBF7F0" }}
            >
              <Sparkles size={19} />
            </span>
            <div>
              <h2
                id="auxo-title"
                className="text-[17px] font-semibold"
                style={{ color: "var(--accent-bark)", fontFamily: "var(--font-serif)" }}
              >
                Auxo · 生成基础任务树
              </h2>
              <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                只规划任务结构，不批量生成答案。校验通过后一次写入，可在全局 Rings 中一次撤销。
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 transition-opacity hover:opacity-70"
            style={{ color: "var(--text-muted)" }}
            title={isGenerating ? "停止 Auxo" : "关闭"}
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {plan ? (
            <section
              className="rounded-xl border px-4 py-3"
              style={{ background: "var(--bg-cream)", borderColor: "var(--border-warm)" }}
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--accent-bark)" }}>
                  <FolderTree size={13} />
                  预览生成结果
                </p>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  共 {plan.nodes.length} 个节点
                </span>
              </div>
              <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {planRows.map(({ node, depth }) => (
                  <div
                    key={node.planId}
                    className="flex items-start gap-2 rounded-lg px-2 py-1.5"
                    style={{
                      marginLeft: depth * 16,
                      background: node.nodeRole === "task-group" ? "rgba(116, 122, 85, 0.08)" : "transparent",
                    }}
                  >
                    {node.nodeRole === "task-group" ? (
                      <FolderTree size={13} className="mt-0.5 shrink-0" style={{ color: "var(--accent-sage)" }} />
                    ) : (
                      <Leaf size={13} className="mt-0.5 shrink-0" style={{ color: "var(--accent-olive-deep)" }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium leading-snug" style={{ color: "var(--text-charcoal)" }}>
                        {node.title}
                      </p>
                      {node.source && (
                        <p className="mt-0.5 text-[10px] leading-snug" style={{ color: "var(--text-muted)" }}>
                          {summarizeForCard(node.source.exactQuote, 90)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <>
              <section
                className="rounded-xl border px-4 py-3"
                style={{ background: "var(--bg-cream)", borderColor: "var(--border-warm)" }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--text-muted)" }}>
                  Root Task
                </p>
                <p className="mt-1.5 max-h-24 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed" style={{ color: "var(--text-charcoal)" }}>
                  {rootTask}
                </p>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--accent-bark)" }}>
                    <FileText size={13} />
                    全部启用的 Nutrients
                  </p>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {nutrients.length} 份 · {totalChars.toLocaleString()} 字
                  </span>
                </div>
                {nutrients.length > 0 ? (
                  <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                    {nutrients.map((nutrient) => (
                      <span
                        key={nutrient.id}
                        className="rounded-full border px-2.5 py-1 text-[10px]"
                        style={{
                          background: "var(--accent-olive-soft)",
                          borderColor: "rgba(116, 122, 85, 0.30)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {nutrient.name} · {nutrient.extractedCharCount.toLocaleString()} 字
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    未启用资料，Auxo 将只根据根任务规划。
                  </p>
                )}
              </section>

              <div
                className="flex items-start gap-2.5 rounded-xl border px-3.5 py-3"
                style={{ background: "rgba(116, 122, 85, 0.08)", borderColor: "rgba(116, 122, 85, 0.24)" }}
              >
                <ShieldCheck size={15} className="mt-0.5 shrink-0" style={{ color: "var(--accent-sage)" }} />
                <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  最多 {AUXO_MAX_NODES} 个节点 / {AUXO_MAX_DEPTH} 层。Nutrient 预算为 {AUXO_MAX_NUTRIENT_CHARS.toLocaleString()} 字；带编号题目会先固定为原文单元，若出现遗漏、重复、乱序、超限或结构无效，将保持整棵树不变。
                </p>
              </div>
            </>
          )}

          {error && (
            <div
              className="rounded-xl border px-3.5 py-3 text-[12px] leading-relaxed"
              style={{
                background: "rgba(180, 60, 40, 0.08)",
                borderColor: "rgba(180, 60, 40, 0.22)",
                color: "#8F2F22",
              }}
              role="alert"
            >
              {error}
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-3 border-t px-6 py-4"
          style={{ borderColor: "var(--border-warm)" }}
        >
          <button
            type="button"
            onClick={plan ? onDiscard : onCancel}
            className="rounded-xl px-4 py-2 text-[13px] transition-opacity hover:opacity-80"
            style={{ border: "1px solid var(--border-warm)", color: "var(--text-muted)" }}
          >
            {plan ? "重新生成" : isGenerating ? "停止" : "取消"}
          </button>
          <button
            type="button"
            onClick={() => void (plan ? onConfirm?.() : onGenerate())}
            disabled={isGenerating}
            className="inline-flex min-w-32 items-center justify-center gap-2 rounded-xl px-5 py-2 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-65"
            style={{ background: "var(--accent-sage)", color: "#FBF7F0" }}
          >
            {isGenerating ? (
              <>
                <LoaderCircle size={14} className="animate-spin" />
                正在规划
              </>
            ) : plan ? (
              <>
                <ShieldCheck size={14} />
                确认写入
              </>
            ) : (
              <>
                <Sparkles size={14} />
                生成任务树
              </>
            )}
          </button>
        </div>
        </div>
      </div>
    </DialogPortal>
  );
}
