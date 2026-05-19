"use client";

import { useState } from "react";
import { Trees, Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useTreeState, useTreeDispatch } from "@/src/state/TreeContext";

export function ForestSidebar() {
  const state = useTreeState();
  const dispatch = useTreeDispatch();
  const projectIds = Object.keys(state.projects);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);

  function handleSeed() {
    const name = prompt("为新项目命名（森林中的一棵新树）", `探索 ${projectIds.length + 1}`);
    if (name?.trim()) {
      dispatch({ type: "SEED", name: name.trim() });
    }
  }

  return (
    <aside
      className="z-20 flex w-[220px] shrink-0 flex-col border-r animate-fade-up stagger-2"
      style={{
        background: "var(--bg-paper)",
        borderColor: "var(--border-warm)",
        boxShadow: "2px 0 16px var(--shadow-warm)",
      }}
    >
      <div
        className="flex items-center justify-between px-5 py-4 border-b"
        style={{ borderColor: "var(--border-warm)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              background: "var(--accent-sage)",
              color: "#FBF7F0",
              border: "1px solid rgba(255, 253, 247, 0.24)",
              boxShadow: "0 4px 10px rgba(86, 91, 61, 0.22)",
            }}
          >
            <Trees size={16} />
          </span>
          <h2
            className="text-[13px] font-semibold tracking-[0.03em] uppercase"
            style={{ color: "var(--accent-bark)", fontFamily: "var(--font-serif)" }}
          >
            Forest
          </h2>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--border-warm)", color: "var(--text-muted)" }}
        >
          {projectIds.length}
        </span>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {projectIds.map((id) => {
          const project = state.projects[id];
          const isActive = id === state.activeProjectId;
          return (
            <div
              key={id}
              onClick={() => dispatch({ type: "SWITCH_PROJECT", projectId: id })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  dispatch({ type: "SWITCH_PROJECT", projectId: id });
                }
              }}
              role="button"
              tabIndex={0}
              className={`w-full rounded-lg px-3 py-2.5 text-left transition-all group relative cursor-pointer ${
                isActive ? "" : "hover:bg-white/60"
              }`}
              style={{
                background: isActive ? "var(--accent-olive-soft)" : "transparent",
                border: isActive ? "1px solid rgba(116, 122, 85, 0.28)" : "1px solid transparent",
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-[13px] font-medium truncate max-w-[140px]"
                  style={{ color: isActive ? "var(--accent-bark)" : "var(--text-charcoal)" }}
                >
                  {project.name}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuProjectId(menuProjectId === id ? null : id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5 hover:bg-white/60"
                >
                  <MoreHorizontal
                    size={12}
                    style={{ color: "var(--text-muted)" }}
                  />
                </button>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {Object.keys(project.nodes).length} 节点
                </span>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  z = {Math.max(...Object.values(project.nodes).map((n) => n.layer))} 层
                </span>
              </div>

              {/* Context menu */}
              {menuProjectId === id && (
                <div
                  className="absolute right-3 mt-1 w-36 rounded-xl py-1 shadow-xl z-30"
                  style={{
                    background: "var(--bg-paper)",
                    border: "1px solid var(--border-warm)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => {
                      setMenuProjectId(null);
                      const name = prompt("重命名项目", project.name);
                      if (name?.trim() && name.trim() !== project.name) {
                        dispatch({ type: "RENAME_PROJECT", projectId: id, name: name.trim() });
                      }
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-[12px] transition-all hover:bg-white/60"
                    style={{ color: "var(--text-charcoal)" }}
                  >
                    <Pencil size={12} />
                    重命名
                  </button>
                  {projectIds.length > 1 && (
                    <button
                      onClick={() => {
                        setMenuProjectId(null);
                        const name = project.name;
                        if (confirm(`确定要删除项目「${name}」吗？此操作不可撤销。`)) {
                          dispatch({ type: "DELETE_PROJECT", projectId: id });
                        }
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-[12px] transition-all hover:bg-white/60"
                      style={{ color: "#B43C28" }}
                    >
                      <Trash2 size={12} />
                      删除
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {projectIds.length === 0 && (
          <div className="px-3 py-8 text-center">
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              还没有项目。
              <br />
              种下一颗种子，
              <br />
              开始你的思维之树。
            </p>
          </div>
        )}
      </div>

      {/* Seed button */}
      <div className="p-3 border-t" style={{ borderColor: "var(--border-warm)" }}>
        <button
          onClick={handleSeed}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-all hover:opacity-90"
          style={{ background: "var(--accent-sage)", color: "#FBF7F0" }}
        >
          <Plus size={15} />
          Seed · 播种
        </button>
      </div>
    </aside>
  );
}
