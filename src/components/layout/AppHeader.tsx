"use client";

import { useState } from "react";
import { Search, LayoutGrid, History, Download, HelpCircle, Sun, Moon } from "lucide-react";
import { BrandLogo } from "@/src/components/brand/BrandLogo";
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
          <BrandLogo compact decorative markOnly className="brand-logo--app-header" />
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
          aria-label="搜索节点"
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] transition-all hover:opacity-85"
          style={{
            background: "var(--accent-olive-soft)",
            color: "var(--accent-olive-deep)",
            border: "1px solid var(--control-border)",
          }}
        >
          <Search size={14} />
          <span className="hidden sm:inline">搜索节点</span>
          <kbd
            className="ml-1 hidden rounded px-1.5 py-0.5 text-[10px] sm:inline"
            style={{ background: "var(--workbench-raised)" }}
          >
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Canopy */}
        <button
          onClick={() => dispatch({ type: "TOGGLE_CANOPY" })}
          aria-label="树冠 — 全局视图"
          aria-pressed={state.isCanopyOpen}
          className="rounded-lg p-2 transition-all hover:opacity-85"
          style={{
            background: state.isCanopyOpen ? "var(--accent-sage)" : "var(--accent-olive-soft)",
            color: state.isCanopyOpen ? "var(--on-primary)" : "var(--accent-olive-deep)",
            border: "1px solid var(--control-border)",
          }}
          title="树冠 — 全局视图"
        >
          <LayoutGrid size={15} />
        </button>

        {/* Rings */}
        <button
          onClick={() => dispatch({ type: "OPEN_GLOBAL_RINGS" })}
          aria-label="年轮 — 操作历史"
          aria-pressed={state.isRingsOpen}
          className="rounded-lg p-2 transition-all hover:opacity-85"
          style={{
            background: state.isRingsOpen ? "var(--accent-sage)" : "var(--accent-olive-soft)",
            color: state.isRingsOpen ? "var(--on-primary)" : "var(--accent-olive-deep)",
            border: "1px solid var(--control-border)",
          }}
          title="年轮 — 操作历史"
        >
          <History size={15} />
        </button>

        {/* Harvest */}
        <HarvestButton />

        {/* Help */}
        <button
          onClick={() => setHelpOpen(true)}
          aria-label="帮助 — 功能指南"
          className="rounded-lg p-2 transition-all hover:opacity-85"
          style={{
            background: "var(--accent-olive-soft)",
            color: "var(--accent-olive-deep)",
            border: "1px solid var(--control-border)",
          }}
          title="帮助 — 功能指南"
        >
          <HelpCircle size={15} />
        </button>

        {/* Theme toggle */}
        <ThemeToggle />
      </div>

      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
    </header>
  );
}

function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.getAttribute("data-theme") === "dark";
    }
    return false;
  });

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", "light");
    }
  };

  return (
    <button
      onClick={toggle}
      aria-label="深色模式"
      aria-pressed={isDark}
      className="rounded-lg p-2 transition-all hover:opacity-85"
      style={{
        background: "var(--accent-olive-soft)",
        color: "var(--accent-olive-deep)",
        border: "1px solid var(--control-border)",
      }}
      title={isDark ? "浅色模式" : "深色模式"}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}

function HarvestButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="收获 — 导出项目"
        className="rounded-lg p-2 transition-all hover:opacity-85"
        style={{
          background: "var(--accent-olive-soft)",
          color: "var(--accent-olive-deep)",
          border: "1px solid var(--control-border)",
        }}
        title="收获 — 导出项目"
      >
        <Download size={15} />
      </button>
      <HarvestDialog isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
