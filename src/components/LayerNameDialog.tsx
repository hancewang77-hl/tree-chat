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
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/18 backdrop-blur-[2px]">
      <div className="w-[360px] rounded-2xl border border-white/30 bg-white/88 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
        <div className="mb-4">
          <h3 className="text-[16px] font-semibold text-slate-900">
            命名当前平面
          </h3>
          <p className="mt-1 text-[12px] text-slate-500">
            当前平面：z = {selectedLayer}
          </p>
        </div>

        <input
          value={planeNameInput}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={selectedLayer === 0 ? "根节点层" : "输入平面名称"}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[14px] text-slate-700 outline-none transition-all focus:border-indigo-400"
          autoFocus
        />

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[14px] text-slate-600 transition-all hover:bg-slate-50"
          >
            取消
          </button>

          <button
            onClick={onConfirm}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-[14px] text-white transition-all hover:bg-indigo-700"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
