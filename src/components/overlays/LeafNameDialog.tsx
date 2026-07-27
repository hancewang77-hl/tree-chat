"use client";

import { ModalPortal } from "@/src/components/overlays/ModalPortal";

export function LeafNameDialog({
  isOpen,
  name,
  onNameChange,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  name: string;
  onNameChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto p-4 sm:p-6"
        style={{ background: "rgba(44, 36, 22, 0.15)" }}
        onClick={onCancel}
      >
        <div
          className="my-auto w-[360px] max-w-full rounded-2xl p-5 shadow-2xl"
          style={{ background: "var(--bg-paper)", border: "1px solid var(--border-warm)" }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-4">
            <h3
              className="text-[16px] font-semibold"
              style={{ color: "var(--accent-bark)", fontFamily: "var(--font-serif)" }}
            >
              命名叶片笔记
            </h3>
            <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
              先为笔记取一个简短名称，确认后再在底部输入框写入具体内容。
            </p>
          </div>

          <input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="例如：待查资料、关键结论"
            className="w-full rounded-xl px-4 py-3 text-[14px] outline-none transition-all"
            style={{
              background: "var(--bg-cream)",
              border: "1px solid var(--border-warm)",
              color: "var(--text-charcoal)",
            }}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter" && name.trim()) onConfirm();
            }}
          />

          <div className="mt-5 flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="rounded-xl px-4 py-2 text-[14px] transition-all hover:opacity-80"
              style={{ border: "1px solid var(--border-warm)", color: "var(--text-muted)" }}
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              disabled={!name.trim()}
              className="rounded-xl px-4 py-2 text-[14px] font-medium transition-all hover:opacity-90 disabled:opacity-45"
              style={{ background: "var(--accent-sage)", color: "#FBF7F0" }}
            >
              下一步
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
