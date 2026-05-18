"use client";

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
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(44, 36, 22, 0.15)" }}>
      <div
        className="w-[360px] rounded-2xl p-5 shadow-2xl"
        style={{ background: "var(--bg-paper)", border: "1px solid var(--border-warm)" }}
      >
        <div className="mb-4">
          <h3
            className="text-[16px] font-semibold"
            style={{ color: "var(--accent-bark)", fontFamily: "var(--font-serif)" }}
          >
            命名当前平面
          </h3>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            当前平面：z = {selectedLayer}
          </p>
        </div>

        <input
          value={planeNameInput}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={selectedLayer === 0 ? "根节点层" : "输入平面名称"}
          className="w-full rounded-xl px-4 py-3 text-[14px] outline-none transition-all"
          style={{
            background: "var(--bg-cream)",
            border: "1px solid var(--border-warm)",
            color: "var(--text-charcoal)",
          }}
          autoFocus
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
            className="rounded-xl px-4 py-2 text-[14px] font-medium transition-all hover:opacity-90"
            style={{ background: "var(--accent-bark)", color: "#FBF7F0" }}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
