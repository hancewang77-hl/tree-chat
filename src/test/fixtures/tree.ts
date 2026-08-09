import type { MindNode, NutrientItem, Project, SemanticCard, TreeState } from "@/src/types/tree";

export function testSemanticCard(fact = "事实", generatedAt = 1): SemanticCard {
  return {
    version: 1,
    generatedAt,
    model: "test-model",
    facts: [fact],
    constraints: [],
    assumptions: [],
    decisions: [],
    rejected: [],
    openQuestions: [],
  };
}

export function testNode(overrides: Partial<MindNode> = {}): MindNode {
  const kind = overrides.kind ?? "branch";
  return {
    id: overrides.id ?? "node",
    kind,
    prompt: overrides.prompt ?? "Prompt",
    response: overrides.response ?? (kind === "leaf" ? "" : "Response"),
    children: overrides.children ?? [],
    parentId: overrides.parentId ?? null,
    timestamp: overrides.timestamp ?? 1,
    layer: overrides.layer ?? 0,
    status: overrides.status ?? "complete",
    contextState: overrides.contextState ?? (kind === "leaf" ? "missing" : "valid"),
    nutrientRefs: overrides.nutrientRefs ?? [],
    semanticCard: overrides.semanticCard ?? (kind === "leaf" ? undefined : testSemanticCard()),
    ...overrides,
  };
}

export function testNutrient(overrides: Partial<NutrientItem> = {}): NutrientItem {
  const extractedText = overrides.extractedText ?? "alpha beta gamma";
  return {
    id: overrides.id ?? "nutrient-1",
    name: overrides.name ?? "notes.md",
    mimeType: overrides.mimeType ?? "text/markdown",
    size: overrides.size ?? extractedText.length,
    kind: overrides.kind ?? "text",
    createdAt: overrides.createdAt ?? 1,
    extractionStatus: overrides.extractionStatus ?? "ready",
    extractedText,
    excerpt: overrides.excerpt ?? extractedText.slice(0, 80),
    extractedCharCount: overrides.extractedCharCount ?? extractedText.length,
    ...overrides,
  };
}

export function testProject(overrides: Partial<Project> = {}): Project {
  const root = testNode({
    id: "root",
    kind: "root",
    prompt: "Root task",
    response: "Root response",
    parentId: null,
    children: [],
    contextState: "valid",
  });
  return {
    id: overrides.id ?? "project",
    name: overrides.name ?? "Project",
    rootNodeId: overrides.rootNodeId ?? root.id,
    nodes: overrides.nodes ?? { [root.id]: root },
    nutrients: overrides.nutrients ?? {},
    activeNutrientIds: overrides.activeNutrientIds ?? [],
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
  };
}

export function testTreeState(overrides: Partial<TreeState> = {}): TreeState {
  const project = testProject();
  return {
    projects: overrides.projects ?? { [project.id]: project },
    activeProjectId: overrides.activeProjectId ?? project.id,
    selectedNodeId: overrides.selectedNodeId ?? project.rootNodeId,
    selectedLayer: overrides.selectedLayer ?? 0,
    is3DMode: overrides.is3DMode ?? false,
    toolMode: overrides.toolMode ?? "view",
    movingNodeId: overrides.movingNodeId ?? null,
    pendingNodeLayer: overrides.pendingNodeLayer ?? null,
    graftSourceId: overrides.graftSourceId ?? null,
    zoom2D: overrides.zoom2D ?? 105,
    zoom3D: overrides.zoom3D ?? 1,
    planeNames: overrides.planeNames ?? { 0: "根节点层" },
    isCanopyOpen: overrides.isCanopyOpen ?? false,
    isRingsOpen: overrides.isRingsOpen ?? false,
    ringsMode: overrides.ringsMode ?? "global",
    ringsFocusNodeId: overrides.ringsFocusNodeId ?? null,
    history: overrides.history ?? { past: [], future: [] },
  };
}
