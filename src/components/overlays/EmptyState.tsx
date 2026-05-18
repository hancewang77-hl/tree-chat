"use client";

import { Trees, Plus } from "lucide-react";
import { useTreeDispatch } from "@/src/state/TreeContext";

export function EmptyState() {
  const dispatch = useTreeDispatch();

  function handleSeed() {
    const name = prompt("为你的第一棵树命名", "我的思维之树");
    if (name?.trim()) {
      dispatch({ type: "SEED", name: name.trim() });
    }
  }

  return (
    <div
      className="flex h-screen w-full items-center justify-center"
      style={{ background: "var(--bg-cream)" }}
    >
      <div className="text-center max-w-sm animate-fade-up">
        <div
          className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-3xl"
          style={{ background: "var(--border-warm)" }}
        >
          <Trees size={36} style={{ color: "var(--accent-sage)" }} />
        </div>

        <h1
          className="mb-3 text-[28px] font-semibold tracking-[0.02em]"
          style={{ fontFamily: "var(--font-serif)", color: "var(--accent-bark)" }}
        >
          智构树语
        </h1>

        <p className="mb-8 text-[14px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          一棵树从一个种子开始。
          <br />
          提出你的第一个问题，
          <br />
          AI 会帮你展开思维的枝叶。
        </p>

        <button
          onClick={handleSeed}
          className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[15px] font-medium transition-all hover:opacity-90 shadow-lg"
          style={{ background: "var(--accent-sage)", color: "#FBF7F0" }}
        >
          <Plus size={17} />
          Seed · 播种
        </button>

        <p className="mt-6 text-[11px]" style={{ color: "var(--text-muted)" }}>
          也可以从左侧森林面板导入已有项目
        </p>
      </div>
    </div>
  );
}
