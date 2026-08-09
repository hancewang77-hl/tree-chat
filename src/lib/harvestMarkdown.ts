import type { MindNode, Project } from "@/src/types/tree";
import { normalizeDuplicateKey } from "@/src/lib/utils";

/**
 * Harvest Markdown export with tree-obs FORMAT.md markers.
 *
 * Each node gets a short, globally-unique display name used only in the
 * trailing `<!-- node: … | parent: … -->` marker. Names are derived at export
 * time (TreeChat has no persistent short-title field) and never mutate the
 * project. Sanitization strips `|` and `-->` so markers remain parseable by
 * tree-obs's htmlCommentMarker (FORMAT.md contract).
 */

/** Pre-dedup budget for a node name (code points). Dedup suffixes may push past it. */
export const HARVEST_NODE_NAME_MAX_CHARS = 30;
/** Fallback when a seed collapses to empty after sanitization. Matches tree-obs. */
export const HARVEST_UNTITLED_NODE_NAME = "未命名";

type WalkFrame = {
  nodeId: string;
  depth: number;
  /** Assigned name of the traversal parent (not looked up via parentId). */
  parentName: string | undefined;
};

/**
 * Iterative pre-order walk over `children` edges. Cycle-safe via a visited set
 * (matches collectSubtreeIds / contextCompiler load-hardening idioms). Children
 * of a node receive `nameOf(node)` as their parentName so marker parent fields
 * do not depend on `parentId`/`children` agreement.
 */
function walkPreorder(
  project: Project,
  visit: (node: MindNode, depth: number, parentName: string | undefined) => void,
  nameOf: (node: MindNode) => string | undefined = () => undefined,
): void {
  const stack: WalkFrame[] = [
    { nodeId: project.rootNodeId, depth: 0, parentName: undefined },
  ];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (visited.has(frame.nodeId)) continue;
    visited.add(frame.nodeId);

    const node = project.nodes[frame.nodeId];
    if (!node) continue;

    visit(node, frame.depth, frame.parentName);

    const selfName = nameOf(node);
    // Reverse push so the first child is visited first (stack LIFO).
    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      stack.push({
        nodeId: node.children[i],
        depth: frame.depth + 1,
        parentName: selfName,
      });
    }
  }
}

/** Seed text used to derive a short name. Root is handled by the caller. */
function selectNameSeed(node: MindNode): string {
  // task-group.taskDescription is a fixed "Auxo 任务组 · 共 N 项…" template
  // (treeReducer), not a title — prefer prompt (the model-authored group label).
  // Only atomic tasks use taskDescription as the seed.
  if (node.nodeRole === "task" && node.taskDescription?.trim()) {
    return node.taskDescription;
  }
  return node.prompt;
}

/**
 * Collapse whitespace, strip marker-breaking sequences, code-point-truncate.
 * `|` would split the marker into a fabricated parent field; `-->` is forbidden
 * by FORMAT.md regardless of the current parser's backtracking luck.
 */
export function sanitizeNodeName(seed: string): string {
  let text = seed.replace(/\s+/g, " ").trim();
  text = text.replace(/-->/g, "→").replace(/\|/g, "-");
  const chars = Array.from(text);
  if (chars.length > HARVEST_NODE_NAME_MAX_CHARS) {
    text = `${chars.slice(0, HARVEST_NODE_NAME_MAX_CHARS).join("")}…`;
  }
  return text === "" ? HARVEST_UNTITLED_NODE_NAME : text;
}

/**
 * Assign a short, globally unique name to every reachable node (pre-order DFS).
 * Collision key is NFKC + case-folded; visible suffix is ` ${i}` starting at 2,
 * matching tree-obs generate.ts.
 */
export function assignNodeNames(project: Project): Map<string, string> {
  const names = new Map<string, string>();
  const usedKeys = new Set<string>();

  walkPreorder(project, (node) => {
    const seed =
      node.id === project.rootNodeId ? project.name : selectNameSeed(node);
    const base = sanitizeNodeName(seed);
    let candidate = base;
    let i = 2;
    let key = normalizeDuplicateKey(candidate);
    while (usedKeys.has(key)) {
      candidate = `${base} ${i++}`;
      key = normalizeDuplicateKey(candidate);
    }
    usedKeys.add(key);
    names.set(node.id, candidate);
  });

  return names;
}

function renderMarker(name: string, parentName: string | undefined): string {
  return parentName
    ? `<!-- node: ${name} | parent: ${parentName} -->`
    : `<!-- node: ${name} -->`;
}

/**
 * Build the Harvest Markdown document: indented bullet tree (legacy shape) plus
 * a FORMAT.md marker after each node's own content and before its children.
 */
export function buildHarvestMarkdown(project: Project): string {
  const names = assignNodeNames(project);
  const lines: string[] = [`# ${project.name}\n`];

  walkPreorder(
    project,
    (node, depth, parentName) => {
      const prefix = "  ".repeat(depth);
      lines.push(`${prefix}- **${node.prompt}**`);
      if (node.taskDescription) {
        lines.push(
          `${prefix}  > Auxo 规划：${node.taskDescription.replace(/\n/g, `\n${prefix}  > `)}`,
        );
      }
      if (node.response) {
        lines.push(
          `${prefix}  ${node.response.replace(/\n/g, `\n${prefix}  `)}`,
        );
      }
      const name = names.get(node.id) ?? HARVEST_UNTITLED_NODE_NAME;
      lines.push(`${prefix}  ${renderMarker(name, parentName)}`);
      lines.push("");
    },
    (node) => names.get(node.id),
  );

  return lines.join("\n");
}
