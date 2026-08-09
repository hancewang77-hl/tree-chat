"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search } from "lucide-react";
import { useTreeState, useTreeDispatch } from "@/src/state/TreeContext";
import { DialogPortal, hasOpenModal, useDialogFocus } from "./useDialogFocus";

export function SearchPalette() {
  const state = useTreeState();
  const dispatch = useTreeDispatch();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { modalRootRef, dialogRef, onDialogKeyDown, isTopmost } = useDialogFocus<HTMLDivElement>({
    open,
    initialFocusRef: inputRef,
    onEscape: () => setOpen(false),
  });

  const activeProject = state.projects[state.activeProjectId];
  const allNodes = activeProject ? Object.values(activeProject.nodes) : [];

  const results = query.trim()
    ? allNodes.filter(
        (n) =>
          n.prompt.toLowerCase().includes(query.toLowerCase()) ||
          n.response.toLowerCase().includes(query.toLowerCase()) ||
          n.taskDescription?.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10)
    : [];

  const toggleSearch = useCallback(() => {
    setOpen((previouslyOpen) => {
      if (previouslyOpen) return isTopmost() ? false : true;
      return !hasOpenModal();
    });
  }, [isTopmost]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggleSearch();
      }
    },
    [toggleSearch],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    window.addEventListener("search-toggle", toggleSearch);
    return () => window.removeEventListener("search-toggle", toggleSearch);
  }, [toggleSearch]);

  if (!open) return null;

  return (
    <DialogPortal>
      <div
        ref={modalRootRef}
        className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
        style={{ background: "rgba(44, 36, 22, 0.12)" }}
        onClick={() => setOpen(false)}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="搜索节点"
          className="w-[480px] max-w-[90vw] rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: "var(--bg-paper)", border: "1px solid var(--border-warm)" }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onDialogKeyDown}
        >
          <div
            className="flex items-center gap-3 px-4 py-3 border-b"
            style={{ borderColor: "var(--border-warm)" }}
          >
            <Search size={16} style={{ color: "var(--text-muted)" }} />
            <input
              ref={inputRef}
              aria-label="搜索节点"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索节点..."
              className="flex-1 bg-transparent text-[14px] outline-none"
              style={{ color: "var(--text-charcoal)" }}
            />
            <kbd
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{ background: "var(--border-warm)", color: "var(--text-muted)" }}
            >
              ESC
            </kbd>
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {results.map((node) => (
              <button
                key={node.id}
                onClick={() => {
                  dispatch({ type: "SUNLIGHT", nodeId: node.id });
                  setOpen(false);
                  setQuery("");
                }}
                    className="w-full px-4 py-3 text-left transition-all hover:opacity-85 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[13px] font-medium truncate"
                    style={{ color: "var(--text-charcoal)", fontFamily: "var(--font-serif)" }}
                  >
                    {node.prompt}
                  </p>
                  {(node.response || node.taskDescription) && (
                    <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {(node.response || node.taskDescription || "").slice(0, 80)}
                    </p>
                  )}
                </div>
                <span className="text-[10px] shrink-0 mt-0.5" style={{ color: "var(--text-muted)" }}>
                  z={node.layer}
                </span>
              </button>
            ))}

            {query.trim() && results.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                  未找到匹配节点
                </p>
              </div>
            )}

            {!query.trim() && (
              <div className="px-4 py-8 text-center">
                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                  输入关键词搜索所有节点
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DialogPortal>
  );
}
