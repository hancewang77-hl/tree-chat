"use client";

import { Undo2, Redo2, History } from "lucide-react";
import { useTreeState, useTreeDispatch } from "@/src/state/TreeContext";

export function RingsPanel() {
  const state = useTreeState();
  const dispatch = useTreeDispatch();

  if (!state.isRingsOpen) return null;

  const { past, future } = state.history;

  return (
    <div
      className="absolute right-0 top-0 z-40 h-full w-[280px] shadow-2xl animate-fade-up"
      style={{ background: "var(--bg-paper)", borderLeft: "1px solid var(--border-warm)" }}
    >
      <div
        className="flex items-center justify-between px-5 py-4 border-b"
        style={{ borderColor: "var(--border-warm)" }}
      >
        <div className="flex items-center gap-2">
          <History size={16} style={{ color: "var(--accent-amber)" }} />
          <h2
            className="text-[13px] font-semibold tracking-[0.03em] uppercase"
            style={{ color: "var(--accent-bark)", fontFamily: "var(--font-serif)" }}
          >
            Rings · 年轮
          </h2>
        </div>
        <button
          onClick={() => dispatch({ type: "TOGGLE_RINGS" })}
          className="text-[11px] hover:opacity-70"
          style={{ color: "var(--text-muted)" }}
        >
          关闭
        </button>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex gap-2">
          <button
            onClick={() => dispatch({ type: "UNDO" })}
            disabled={past.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-all disabled:opacity-30"
            style={{ background: "var(--accent-bark)", color: "#FBF7F0" }}
          >
            <Undo2 size={14} />
            Undo
          </button>
          <button
            onClick={() => dispatch({ type: "REDO" })}
            disabled={future.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-all disabled:opacity-30"
            style={{ background: "var(--accent-amber)", color: "#FBF7F0" }}
          >
            <Redo2 size={14} />
            Redo
          </button>
        </div>

        <div
          className="rounded-xl p-3 text-center"
          style={{ background: "var(--bg-cream)", border: "1px solid var(--border-warm)" }}
        >
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            {past.length} 步可撤销 · {future.length} 步可重做
          </p>
        </div>

        {/* History timeline */}
        <div className="space-y-1 max-h-[calc(100vh-280px)] overflow-y-auto">
          {past.length === 0 && (
            <p className="text-center text-[12px] py-6" style={{ color: "var(--text-muted)" }}>
              暂无操作历史
            </p>
          )}
          {past.slice().reverse().slice(0, 20).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg px-3 py-2"
              style={{ border: "1px solid transparent" }}
            >
              <div
                className="h-2 w-2 rounded-full shrink-0"
                style={{ background: "var(--accent-sage)" }}
              />
              <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                操作 {past.length - i}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
