import type { MindNode, NodesMap, Project } from "@/src/types/tree";
import { getExportableNodeBody } from "@/src/lib/rootNodeContent";

export type ObsidianVaultFile = {
  /** 不含 .md 后缀的文件名（已清洗、已去重） */
  baseName: string;
  /** 节点显示名，用于标题与 wikilink 别名 */
  nodeName: string;
  content: string;
};

export type ObsidianVaultExport = {
  folderName: string;
  files: ObsidianVaultFile[];
  notes: string[];
};

type ExportNode = {
  id: string;
  node: MindNode;
  displayName: string;
  parentId: string | null;
  childIds: string[];
};

/** 文件系统与 wikilink 不允许的字符（| 由 tree-obs 标记语法排除，此处兜底） */
const ILLEGAL_CHARS_RE = /[\\/:*?"<>|[\]#^]/g;
const ALIAS_ILLEGAL_RE = /[[\]|]/g;

export function sanitizeObsidianName(name: string): string {
  const cleaned = name.replace(ILLEGAL_CHARS_RE, "-").replace(/^[.\s]+|[.\s]+$/g, "");
  return cleaned === "" ? "未命名" : cleaned;
}

function defaultDisplayName(node: MindNode): string {
  const title = node.prompt.trim();
  return title || (node.kind === "leaf" ? "叶片" : "未命名");
}

function nodeBody(node: MindNode): string {
  return getExportableNodeBody(node);
}

function collectReachableNodes(nodes: NodesMap, rootNodeId: string): MindNode[] {
  const result: MindNode[] = [];
  const seen = new Set<string>();

  function walk(nodeId: string) {
    if (seen.has(nodeId)) return;
    const node = nodes[nodeId];
    if (!node) return;
    seen.add(nodeId);
    result.push(node);
    for (const childId of node.children) walk(childId);
  }

  walk(rootNodeId);
  return result;
}

function assignUniqueDisplayNames(nodes: MindNode[]): Map<string, string> {
  const names = new Map<string, string>();
  const taken = new Set<string>();

  for (const node of nodes) {
    const base = defaultDisplayName(node);
    let candidate = base;
    let i = 2;
    while (taken.has(candidate.toLowerCase())) {
      candidate = `${base} ${i++}`;
    }
    taken.add(candidate.toLowerCase());
    names.set(node.id, candidate);
  }

  return names;
}

function buildExportNodes(project: Project): { exportNodes: ExportNode[]; notes: string[] } {
  const notes: string[] = [];
  const reachable = collectReachableNodes(project.nodes, project.rootNodeId);
  if (reachable.length === 0) {
    throw new Error("当前项目没有可导出的节点");
  }

  const displayNames = assignUniqueDisplayNames(reachable);
  const reachableIds = new Set(reachable.map((node) => node.id));

  for (const node of reachable) {
    const base = defaultDisplayName(node);
    const assigned = displayNames.get(node.id)!;
    if (assigned !== base) {
      notes.push(`节点「${base}」的显示名调整为「${assigned}」（与其他节点重名）`);
    }
  }

  const exportNodes: ExportNode[] = reachable.map((node) => ({
    id: node.id,
    node,
    displayName: displayNames.get(node.id)!,
    parentId: node.parentId && reachableIds.has(node.parentId) ? node.parentId : null,
    childIds: node.children.filter((childId) => reachableIds.has(childId)),
  }));

  return { exportNodes, notes };
}

function uniqueBaseNames(exportNodes: ExportNode[], notes: string[]): Map<string, string> {
  const taken = new Set<string>();
  const baseNames = new Map<string, string>();

  for (const item of exportNodes) {
    const base = sanitizeObsidianName(item.displayName);
    let candidate = base;
    let i = 2;
    while (taken.has(candidate.toLowerCase())) {
      candidate = `${base} ${i++}`;
    }
    taken.add(candidate.toLowerCase());
    if (candidate !== item.displayName) {
      notes.push(
        `节点「${item.displayName}」的文件名调整为「${candidate}」（含非法字符或清洗后重名）`,
      );
    }
    baseNames.set(item.id, candidate);
  }

  return baseNames;
}

function wikilink(targetId: string, byId: Map<string, ExportNode>, baseNames: Map<string, string>): string {
  const target = byId.get(targetId);
  if (!target) return "";
  const base = baseNames.get(targetId)!;
  const alias = target.displayName.replace(ALIAS_ILLEGAL_RE, "-");
  return base === alias ? `[[${base}]]` : `[[${base}|${alias}]]`;
}

/**
 * 将 tree-chat 项目转换为 Obsidian vault 文件夹结构（多 md + 双链）。
 * 输出格式与 tree-obs 插件 generate 阶段一致，解压进 vault 即可在关系图谱中浏览。
 */
export function buildObsidianVaultExport(project: Project): ObsidianVaultExport {
  const { exportNodes, notes } = buildExportNodes(project);
  const byId = new Map(exportNodes.map((item) => [item.id, item]));
  const baseNames = uniqueBaseNames(exportNodes, notes);

  const root = exportNodes.find((item) => item.parentId === null);
  if (!root) {
    throw new Error("未找到根节点，无法导出 Obsidian 笔记包");
  }

  const files: ObsidianVaultFile[] = exportNodes.map((item) => {
    const parts: string[] = [`# ${item.displayName}`];
    const body = nodeBody(item.node);
    if (body) parts.push(body);

    const footer: string[] = [];
    if (item.parentId) {
      footer.push(`⬆ 父节点: ${wikilink(item.parentId, byId, baseNames)}`);
    }
    if (item.childIds.length > 0) {
      footer.push(
        `⬇ 子节点: ${item.childIds.map((childId) => wikilink(childId, byId, baseNames)).join(" · ")}`,
      );
    }
    if (footer.length > 0) parts.push(`---\n${footer.join("\n")}`);

    return {
      baseName: baseNames.get(item.id)!,
      nodeName: item.displayName,
      content: `${parts.join("\n\n")}\n`,
    };
  });

  const folderName = sanitizeObsidianName(root.displayName);
  if (folderName !== root.displayName) {
    notes.push(`根文件夹名调整为「${folderName}」（原名含非法字符）`);
  }

  return { folderName, files, notes };
}
