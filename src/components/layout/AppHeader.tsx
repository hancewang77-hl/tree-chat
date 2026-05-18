"use client";

import { useState } from "react";
import { Search, Box, Layers, LayoutGrid, History, Download, Trees, HelpCircle } from "lucide-react";
import { useTreeState, useTreeDispatch } from "@/src/state/TreeContext";
import { HelpDialog } from "@/src/components/overlays/HelpDialog";
import { HarvestDialog } from "@/src/components/overlays/HarvestDialog";

export function AppHeader() {
  const state = useTreeState();
  const dispatch = useTreeDispatch();
  const [helpOpen, setHelpOpen] = useState(false);

  const activeProject = state.projects[state.activeProjectId];

  return (
    <header
      className="z-20 flex h-[56px] shrink-0 items-center justify-between border-b px-6 animate-fade-up stagger-1"
      style={{
        background: "var(--bg-paper)",
        borderColor: "var(--border-warm)",
        boxShadow: "0 1px 0 var(--border-warm), 0 4px 12px var(--shadow-warm)",
      }}
    >
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-lg"
            style={{ color: "var(--accent-sage)" }}
          >
            <Trees size={20} />
          </div>
          <div>
            <h1
              className="text-[15px] font-semibold tracking-[0.02em]"
              style={{ fontFamily: "var(--font-serif)", color: "var(--accent-bark)" }}
            >
              智构树语
            </h1>
            {activeProject && (
              <p className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                {activeProject.name}
              </p>
            )}
          </div>
        </div>

        <div className="h-6 w-px" style={{ background: "var(--border-warm)" }} />

        {/* Search */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("search-toggle"))}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] transition-all hover:bg-white/60"
          style={{ color: "var(--text-muted)", border: "1px solid var(--border-warm)" }}
        >
          <Search size={14} />
          <span className="hidden sm:inline">搜索节点</span>
          <kbd
            className="ml-1 hidden rounded px-1.5 py-0.5 text-[10px] sm:inline"
            style={{ background: "var(--border-warm)" }}
          >
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        {/* 2D/3D toggle */}
        <button
          onClick={() => dispatch({ type: "TOGGLE_3D" })}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all hover:bg-white/60"
          style={{ color: "var(--text-charcoal)" }}
          title={state.is3DMode ? "切换至 2D" : "切换至 3D"}
        >
          {state.is3DMode ? <Layers size={15} /> : <Box size={15} />}
          <span className="hidden sm:inline">{state.is3DMode ? "3D" : "2D"}</span>
        </button>

        <div className="h-5 w-px" style={{ background: "var(--border-warm)" }} />

        {/* Canopy */}
        <button
          onClick={() => dispatch({ type: "TOGGLE_CANOPY" })}
          className={`rounded-lg p-2 transition-all hover:bg-white/60 ${
            state.isCanopyOpen ? "bg-white/80" : ""
          }`}
          style={{ color: state.isCanopyOpen ? "var(--accent-sage)" : "var(--text-muted)" }}
          title="树冠 — 全局视图"
        >
          <LayoutGrid size={15} />
        </button>

        {/* Rings */}
        <button
          onClick={() => dispatch({ type: "TOGGLE_RINGS" })}
          className={`rounded-lg p-2 transition-all hover:bg-white/60 ${
            state.isRingsOpen ? "bg-white/80" : ""
          }`}
          style={{ color: state.isRingsOpen ? "var(--accent-amber)" : "var(--text-muted)" }}
          title="年轮 — 操作历史"
        >
          <History size={15} />
        </button>

        {/* Harvest */}
        <HarvestButton />

        {/* Help */}
        <button
          onClick={() => setHelpOpen(true)}
          className="rounded-lg p-2 transition-all hover:bg-white/60"
          style={{ color: "var(--text-muted)" }}
          title="帮助 — 功能指南"
        >
          <HelpCircle size={15} />
        </button>
      </div>

      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
    </header>
  );
}

function HarvestButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg p-2 transition-all hover:bg-white/60"
        style={{ color: "var(--text-muted)" }}
        title="收获 — 导出项目"
      >
        <Download size={15} />
      </button>
      <HarvestDialog isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
