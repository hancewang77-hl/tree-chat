"use client";

import { BrainCircuit, GitBranch, Plus, Send, Sparkles } from "lucide-react";
import type { MindNode } from "@/src/types/tree";

function NodeDetailCard({
  node,
  isSelected,
}: {
  node: MindNode;
  isSelected: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-100 bg-white/80 p-4 shadow-sm transition-all ${
        isSelected ? "ring-1 ring-indigo-300" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-indigo-600">
          <BrainCircuit size={13} />
          Thought Node
        </span>

        <span className="text-[11px] text-slate-400">z = {node.layer}</span>
      </div>

      <div className="space-y-4">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Prompt
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-[14px] leading-7 text-slate-700">
            {node.prompt}
          </div>
        </div>

        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Response
          </div>
          <div
            className={`rounded-xl px-4 py-3 text-[14px] leading-7 ${
              isSelected
                ? "bg-indigo-600 text-white shadow-[0_14px_30px_rgba(99,102,241,0.18)]"
                : "bg-[#FBFBFC] text-slate-600"
            }`}
          >
            {node.response}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PathSidebar({
  currentPath,
  selectedNodeId,
  selectedLayer,
  isAiTyping,
  inputText,
  sidebarWidth,
  onInputChange,
  onSend,
}: {
  currentPath: MindNode[];
  selectedNodeId: string;
  selectedLayer: number;
  isAiTyping: boolean;
  inputText: string;
  sidebarWidth: number;
  onInputChange: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <div
      className="relative z-30 flex shrink-0 flex-col border-l border-slate-200/80 bg-white/88 shadow-[-12px_0_40px_rgba(15,23,42,0.05)] backdrop-blur-xl"
      style={{ width: sidebarWidth }}
    >
      <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-slate-100 bg-white/65 px-7 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-[16px] font-semibold text-slate-900">
            <GitBranch className="text-indigo-600" size={17} />
            当前探索路径
          </h2>
          <p className="mt-1 text-[12px] text-slate-500">
            Focused branch in nonlinear knowledge space
          </p>
        </div>

        <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-[12px] font-semibold text-indigo-700">
          深度 {currentPath.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-7">
        {currentPath.map((node) => (
          <NodeDetailCard
            key={node.id}
            node={node}
            isSelected={node.id === selectedNodeId}
          />
        ))}

        {isAiTyping && (
          <div className="rounded-2xl border border-slate-100 bg-white/80 p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="animate-pulse text-indigo-500" size={16} />
              <span className="text-[14px] font-medium text-slate-500">
                Structured reasoning in progress...
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200/80 bg-white/92 px-5 py-5">
        <div className="mb-2.5 flex items-center gap-1.5 text-[12px] font-medium text-slate-400">
          <Plus size={12} />
          基于当前焦点延展新的思维分支
        </div>

        <div className="rounded-2xl border border-slate-200 bg-[#FBFBFC] p-2 shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
          <div className="relative">
            <textarea
              className="w-full resize-none rounded-[14px] border-0 bg-transparent px-3 py-3 pr-14 text-[14px] leading-6 text-slate-700 outline-none placeholder:text-slate-400"
              rows={4}
              placeholder={`在 z = ${selectedLayer} 平面继续展开你的问题...`}
              value={inputText}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
            />

            <button
              onClick={onSend}
              disabled={!inputText.trim() || isAiTyping}
              className={`absolute bottom-3 right-3 rounded-xl p-2.5 transition-all ${
                inputText.trim() && !isAiTyping
                  ? "bg-indigo-600 text-white shadow-[0_12px_24px_rgba(99,102,241,0.20)] hover:bg-indigo-700"
                  : "cursor-not-allowed bg-slate-200 text-slate-400"
              }`}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
