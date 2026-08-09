"use client";

import { useId, useRef } from "react";
import { DialogPortal, useDialogFocus } from "./overlays/useDialogFocus";

export function LayerNameDialog({
  isOpen,
  selectedLayer,
  planeNameInput,
  onInputChange,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  selectedLayer: number;
  planeNameInput: string;
  onInputChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { modalRootRef, dialogRef, onDialogKeyDown } = useDialogFocus<HTMLFormElement>({
    open: isOpen,
    initialFocusRef: inputRef,
    onEscape: onCancel,
  });

  if (!isOpen) return null;

  return (
    <DialogPortal>
      <div
        ref={modalRootRef}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(44, 36, 22, 0.15)" }}
      >
        <form
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm();
          }}
          onKeyDown={onDialogKeyDown}
          className="w-[360px] rounded-2xl p-5 shadow-2xl"
          style={{ background: "var(--bg-paper)", border: "1px solid var(--border-warm)" }}
        >
          <div className="mb-4">
            <h3
              id={titleId}
              className="text-[16px] font-semibold"
              style={{ color: "var(--accent-bark)", fontFamily: "var(--font-serif)" }}
            >
              命名当前平面
            </h3>
            <p
              id={descriptionId}
              className="mt-1 text-[12px]"
              style={{ color: "var(--text-muted)" }}
            >
              当前平面：z = {selectedLayer}
            </p>
          </div>

          <input
            ref={inputRef}
            aria-label="平面名称"
            value={planeNameInput}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={selectedLayer === 0 ? "根节点层" : "输入平面名称"}
            className="w-full rounded-xl px-4 py-3 text-[14px] outline-none transition-all"
            style={{
              background: "var(--bg-cream)",
              border: "1px solid var(--control-border)",
              color: "var(--text-charcoal)",
            }}
          />

          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl px-4 py-2 text-[14px] transition-all hover:opacity-80"
              style={{ border: "1px solid var(--control-border)", color: "var(--text-muted)" }}
            >
              取消
            </button>

            <button
              type="submit"
              className="rounded-xl px-4 py-2 text-[14px] font-medium transition-all hover:opacity-90"
              style={{ background: "var(--accent-bark)", color: "var(--on-primary)" }}
            >
              确定
            </button>
          </div>
        </form>
      </div>
    </DialogPortal>
  );
}
