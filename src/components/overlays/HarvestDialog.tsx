"use client";

import { useState } from "react";
import { useTreeState } from "@/src/state/TreeContext";
import { ModalPortal } from "@/src/components/overlays/ModalPortal";
import { downloadObsidianVaultZip } from "@/src/lib/downloadObsidianVault";
import { downloadBlob } from "@/src/lib/downloadZip";
import { getExportableNodeBody } from "@/src/lib/rootNodeContent";

export function HarvestDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const state = useTreeState();
  const activeProject = state.projects[state.activeProjectId];
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  if (!isOpen || !activeProject) return null;

  function exportMarkdown() {
    if (!activeProject) return;

    const lines: string[] = [`# ${activeProject.name}\n`];

    function walk(nodeId: string, depth: number) {
      const node = activeProject.nodes[nodeId];
      if (!node) return;

      const prefix = "  ".repeat(depth);
      lines.push(`${prefix}- **${node.prompt}**`);
      const body = getExportableNodeBody(node);
      if (body) {
        lines.push(`${prefix}  ${body.replace(/\n/g, `\n${prefix}  `)}`);
      }
      lines.push("");

      for (const childId of node.children) {
        walk(childId, depth + 1);
      }
    }

    walk(activeProject.rootNodeId, 0);
    downloadFile(`${activeProject.name}.md`, lines.join("\n"), "text/markdown");
    onClose();
  }

  function exportJSON() {
    if (!activeProject) return;
    downloadFile(
      `${activeProject.name}.json`,
      JSON.stringify(activeProject, null, 2),
      "application/json",
    );
    onClose();
  }

  function exportObsidianVault() {
    if (!activeProject) return;
    try {
      const notes = downloadObsidianVaultZip(activeProject);
      if (notes.length > 0) {
        setExportNotice(`已导出 Obsidian 笔记包。注意：\n${notes.join("\n")}`);
        return;
      }
      onClose();
    } catch (error) {
      setExportNotice(error instanceof Error ? error.message : "导出失败，请稍后重试");
    }
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto p-4 sm:p-6"
        style={{ background: "rgba(44, 36, 22, 0.15)" }}
        onClick={onClose}
      >
        <div
          className="my-auto w-[340px] max-w-full rounded-xl p-6 shadow-2xl"
          style={{ background: "var(--bg-paper)", border: "1px solid var(--border-warm)" }}
          onClick={(event) => event.stopPropagation()}
        >
          <h2
            className="mb-2 text-[17px] font-semibold"
            style={{ fontFamily: "var(--font-serif)", color: "var(--accent-bark)" }}
          >
            收获 · Harvest
          </h2>
          <p className="mb-5 text-[13px]" style={{ color: "var(--text-muted)" }}>
            导出当前项目 &ldquo;{activeProject.name}&rdquo;
          </p>
          {exportNotice ? (
            <p
              className="mb-4 whitespace-pre-wrap rounded-lg px-3 py-2 text-[12px] leading-relaxed"
              style={{
                background: "rgba(196, 148, 58, 0.12)",
                color: "var(--accent-bark)",
                border: "1px solid var(--border-warm)",
              }}
            >
              {exportNotice}
            </p>
          ) : null}
          <div className="flex flex-col gap-3">
            <button
              onClick={exportMarkdown}
              className="rounded-lg px-4 py-2.5 text-[14px] font-medium transition-all hover:opacity-90"
              style={{ background: "var(--accent-bark)", color: "#FBF7F0" }}
            >
              导出 Markdown
            </button>
            <button
              onClick={exportJSON}
              className="rounded-lg px-4 py-2.5 text-[14px] font-medium transition-all hover:opacity-90"
              style={{ background: "var(--accent-sage)", color: "#FBF7F0" }}
            >
              导出 JSON
            </button>
            <button
              onClick={exportObsidianVault}
              className="rounded-lg px-4 py-2.5 text-[14px] font-medium transition-all hover:opacity-90"
              style={{ background: "var(--accent-amber)", color: "#FBF7F0" }}
            >
              导出 Obsidian 笔记包
            </button>
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-[14px] transition-all"
              style={{ border: "1px solid var(--border-warm)", color: "var(--text-muted)" }}
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  downloadBlob(filename, blob);
}
