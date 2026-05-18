"use client";

import { AlertTriangle } from "lucide-react";

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
