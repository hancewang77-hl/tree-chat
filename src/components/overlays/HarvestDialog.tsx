"use client";

import { useTreeState } from "@/src/state/TreeContext";

export function HarvestDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const state = useTreeState();
  const activeProject = state.projects[state.activeProjectId];

  if (!isOpen || !activeProject) return null;

  function exportMarkdown() {
    if (!activeProject) return;

    const lines: string[] = [`# ${activeProject.name}\n`];

    function walk(nodeId: string, depth: number) {
      const node = activeProject.nodes[nodeId];
      if (!node) return;

      const prefix = "  ".repeat(depth);
      lines.push(`${prefix}- **${node.prompt}**`);
      if (node.response) {
        lines.push(`${prefix}  ${node.response.replace(/\n/g, `\n${prefix}  `)}`);
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

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(44, 36, 22, 0.15)" }}
    >
      <div
        className="w-[340px] rounded-xl p-6 shadow-2xl"
        style={{ background: "var(--bg-paper)", border: "1px solid var(--border-warm)" }}
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
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-[14px] transition-all"
            style={{ border: "1px solid var(--border-warm)", color: "var(--text-muted)" }}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
