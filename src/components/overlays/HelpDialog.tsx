"use client";

import { HelpCircle, GitBranch, StickyNote, Scissors, Trash2, Sun, LayoutGrid, History, Download, Trees, Plus, Search } from "lucide-react";

const helpItems = [
  {
    icon: <Trees size={16} />,
    label: "Forest · 森林",
    desc: "左侧栏切换不同项目（树）。每个项目是一棵独立的思维之树。",
  },
  {
    icon: <Plus size={16} />,
    label: "Seed · 播种",
    desc: "创建新项目，种下一棵新的思维之树。",
  },
  {
    icon: <GitBranch size={16} />,
    label: "Branch · 分支",
    desc: "选中节点后，输入新问题，AI 会生成回答并创建子节点。在底部输入框中选择「AI 分支」模式。",
  },
  {
    icon: <StickyNote size={16} />,
    label: "Leaf · 叶片",
    desc: "选中节点后，手动添加一条笔记作为子节点，无需调用 AI。在底部输入框中选择「笔记」模式。",
  },
  {
    icon: <Scissors size={16} />,
    label: "Graft · 嫁接",
    desc: "两步操作：①点击工具栏「嫁接」按钮 ②点击另一个节点作为新父节点。选中的节点及其子树将移动到新位置。",
  },
  {
    icon: <Trash2 size={16} />,
    label: "Prune · 修剪",
    desc: "删除选中的节点及其所有子节点。根节点不可删除。可通过 Rings 撤销。",
  },
  {
    icon: <Sun size={16} />,
    label: "Sunlight · 聚焦",
    desc: "一键定位：①跳到节点所在层 ②高亮根→节点的完整路径（金色连线）③在右侧 Inspector 中展示上下文链。点击工具栏或右侧面板的「聚焦」按钮即可。",
  },
  {
    icon: <LayoutGrid size={16} />,
    label: "Canopy · 树冠",
    desc: "打开鸟瞰小地图，显示整棵树的全局视图。点击节点可快速导航。",
  },
  {
    icon: <History size={16} />,
    label: "Rings · 年轮",
    desc: "打开操作历史面板，支持撤销 (Undo) 和重做 (Redo)。最多保留 50 步历史。",
  },
  {
    icon: <Download size={16} />,
    label: "Harvest · 收获",
    desc: "导出当前项目为 Markdown 或 JSON 格式文件。",
  },
  {
    icon: <Search size={16} />,
    label: "Search · 搜索",
    desc: "按 ⌘K 打开搜索面板，输入关键词在所有节点中搜索，点击结果直接跳转。",
  },
];

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(44, 36, 22, 0.15)" }}
      onClick={onClose}
    >
      <div
        className="w-[520px] max-h-[80vh] max-w-[92vw] rounded-2xl shadow-2xl overflow-hidden animate-fade-up"
        style={{ background: "var(--bg-paper)", border: "1px solid var(--border-warm)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "var(--border-warm)" }}
        >
          <div className="flex items-center gap-3">
            <HelpCircle size={18} style={{ color: "var(--accent-sage)" }} />
            <h2
              className="text-[16px] font-semibold"
              style={{ color: "var(--accent-bark)", fontFamily: "var(--font-serif)" }}
            >
              树语指南 · Tree Chat Guide
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[13px] hover:opacity-70"
            style={{ color: "var(--text-muted)" }}
          >
            关闭
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-3">
          <p className="text-[13px] leading-relaxed mb-4" style={{ color: "var(--text-muted)" }}>
            智构树语是一个<strong style={{ color: "var(--text-charcoal)" }}>树状思维探索工具</strong>。
            每个节点代表一次提问与回答，你可以从任一节点分叉出新的方向，形成一棵不断生长的思维之树。
          </p>

          {helpItems.map((item) => (
            <div
              key={item.label}
              className="flex items-start gap-3.5 rounded-xl px-4 py-3"
              style={{ background: "var(--bg-cream)", border: "1px solid var(--border-warm)" }}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5"
                style={{ background: "var(--border-warm)", color: "var(--accent-bark)" }}
              >
                {item.icon}
              </div>
              <div>
                <h3 className="text-[13px] font-semibold mb-0.5" style={{ color: "var(--text-charcoal)" }}>
                  {item.label}
                </h3>
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
