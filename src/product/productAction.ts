import { getBranchTopologyForChild, type BranchTopology } from "@/src/lib/branchTopology";
import {
  compileContext,
  type ChatMessage,
  type CompiledContext,
} from "@/src/lib/contextCompiler";
import { buildRuntimeChatTaskBody, type RuntimeChatTaskBody } from "@/src/runtime/client";
import type { TaskPriority } from "@/src/runtime/task";
import type { TreeAction, TreeState } from "@/src/types/tree";

const FOREGROUND_INTERACTIVE_PRIORITY: TaskPriority = 0;

export const PRODUCT_ACTION_VERSION = 1;

export type PrepareTreeChatActionInput = {
  treeState: TreeState;
  prompt: string;
  model: string;
  nodeId?: string;
  compiledAt?: number;
  priority?: TaskPriority;
};

export type PreparedTreeChatAction = {
  version: typeof PRODUCT_ACTION_VERSION;
  projectId: string;
  selectedNodeId: string;
  nodeId: string;
  parentNodeId: string;
  prompt: string;
  nutrientRefs: string[];
  priority: TaskPriority;
  compiled: CompiledContext;
  topology: BranchTopology;
  runtimeRequest: RuntimeChatTaskBody;
  startAction: TreeAction;
};

export type ProductChatTransport = (input: {
  sessionId: string;
  nodeId: string;
  priority: TaskPriority;
  messages: ChatMessage[];
  topology: BranchTopology;
  onText: (text: string) => void;
}) => Promise<string>;

export type SubmitTreeChatActionInput = PrepareTreeChatActionInput & {
  dispatch: (action: TreeAction) => void;
  sendChat: ProductChatTransport;
};

export type SubmitTreeChatActionResult = {
  status: "complete" | "stopped";
  response: string;
  prepared: PreparedTreeChatAction;
};

export function prepareTreeChatAction(
  input: PrepareTreeChatActionInput,
): PreparedTreeChatAction {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("当前问题不能为空");

  const projectId = input.treeState.activeProjectId;
  const project = input.treeState.projects[projectId];
  if (!project) throw new Error(`Active TreeChat project not found: ${projectId}`);
  if (!project.nodes[input.treeState.selectedNodeId]) {
    throw new Error(`Selected TreeChat node not found: ${input.treeState.selectedNodeId}`);
  }

  const nodeId = input.nodeId ?? `node-${crypto.randomUUID()}`;
  const compiled = compileContext({
    project,
    selectedNodeId: input.treeState.selectedNodeId,
    prompt,
    model: input.model,
    compiledAt: input.compiledAt ?? Date.now(),
  });
  const topology = getBranchTopologyForChild(
    project.nodes,
    project.rootNodeId,
    compiled.anchorNodeId,
    nodeId,
  );
  const priority = input.priority ?? FOREGROUND_INTERACTIVE_PRIORITY;
  const nutrientRefs = [...project.activeNutrientIds];
  const runtimeRequest = buildRuntimeChatTaskBody({
    sessionId: projectId,
    nodeId,
    priority,
    messages: compiled.messages,
    topology,
  });

  return {
    version: PRODUCT_ACTION_VERSION,
    projectId,
    selectedNodeId: input.treeState.selectedNodeId,
    nodeId,
    parentNodeId: compiled.anchorNodeId,
    prompt,
    nutrientRefs,
    priority,
    compiled,
    topology,
    runtimeRequest,
    startAction: {
      type: "STREAM_BRANCH_START",
      projectId,
      nodeId,
      prompt,
      parentId: compiled.anchorNodeId,
      nutrientRefs,
      contextManifest: compiled.manifest,
    },
  };
}

export async function submitTreeChatAction(
  input: SubmitTreeChatActionInput,
): Promise<SubmitTreeChatActionResult> {
  const prepared = prepareTreeChatAction(input);
  input.dispatch(prepared.startAction);

  try {
    const response = await input.sendChat({
      sessionId: prepared.projectId,
      nodeId: prepared.nodeId,
      priority: prepared.priority,
      messages: prepared.compiled.messages,
      topology: prepared.topology,
      onText: (partialResponse) => {
        input.dispatch({
          type: "STREAM_BRANCH_UPDATE",
          projectId: prepared.projectId,
          nodeId: prepared.nodeId,
          response: partialResponse,
        });
      },
    });
    input.dispatch({
      type: "STREAM_BRANCH_FINISH",
      projectId: prepared.projectId,
      nodeId: prepared.nodeId,
      status: "complete",
    });
    return { status: "complete", response, prepared };
  } catch (error) {
    if (isAbortError(error)) {
      input.dispatch({
        type: "STREAM_BRANCH_FINISH",
        projectId: prepared.projectId,
        nodeId: prepared.nodeId,
        status: "stopped",
      });
      return { status: "stopped", response: "", prepared };
    }
    input.dispatch({
      type: "STREAM_BRANCH_FAIL",
      projectId: prepared.projectId,
      nodeId: prepared.nodeId,
      error: error instanceof Error ? error.message : "TreeChat product action failed",
    });
    throw error;
  }
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError",
  );
}
