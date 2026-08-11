import type { ChatMessage } from "@/src/lib/contextCompiler";
import type { BranchTopology } from "@/src/lib/branchTopology";
import type { GenerationTask, TaskPriority } from "@/src/runtime/task";

export type SubmitChatTaskInput = {
  sessionId: string;
  nodeId: string;
  priority: TaskPriority;
  messages: ChatMessage[];
  topology: BranchTopology;
  signal: AbortSignal;
  runtimeUrl?: string;
};

export type RuntimeChatTaskBody = {
  session_id: string;
  node_id: string;
  task_type: "chat_generation";
  priority: TaskPriority;
  root_node_id: string;
  ancestor_node_ids: string[];
  messages: ChatMessage[];
};

export type SubmitStructureTaskInput = {
  sessionId: string;
  nodeId: string;
  priority: TaskPriority;
  prompt: string;
  response: string;
  topology: BranchTopology;
  signal: AbortSignal;
  runtimeUrl?: string;
};

type CreateTaskResponse = {
  task?: GenerationTask;
  error?: string;
  detail?: string;
};

export type RuntimeProductConfig = {
  execution_mode: "serial" | "concurrent";
  max_concurrency: number;
  queue_policy: "fcfs" | "priority";
  routing_policy:
    | "round_robin"
    | "least_load"
    | "branch_affinity"
    | "branch_affinity_bounded";
  provider_mode: string;
  product_path: string[];
};

export async function submitRuntimeChat({
  sessionId,
  nodeId,
  priority,
  messages,
  topology,
  signal,
  runtimeUrl,
}: SubmitChatTaskInput): Promise<GenerationTask> {
  return submitTask(
    buildRuntimeChatTaskBody({ sessionId, nodeId, priority, messages, topology }),
    signal,
    runtimeUrl,
    topology.topBranchId,
  );
}

export function buildRuntimeChatTaskBody(input: {
  sessionId: string;
  nodeId: string;
  priority: TaskPriority;
  messages: ChatMessage[];
  topology: BranchTopology;
}): RuntimeChatTaskBody {
  return {
    session_id: input.sessionId,
    node_id: input.nodeId,
    task_type: "chat_generation",
    priority: input.priority,
    root_node_id: input.topology.rootNodeId,
    ancestor_node_ids: [...input.topology.ancestorNodeIds],
    messages: input.messages.map((message) => ({ ...message })),
  };
}

export async function submitRuntimeStructure({
  sessionId,
  nodeId,
  priority,
  prompt,
  response,
  topology,
  signal,
  runtimeUrl,
}: SubmitStructureTaskInput): Promise<GenerationTask> {
  return submitTask(
    {
      session_id: sessionId,
      node_id: nodeId,
      task_type: "semantic_structure",
      priority,
      root_node_id: topology.rootNodeId,
      ancestor_node_ids: topology.ancestorNodeIds,
      prompt,
      response,
    },
    signal,
    runtimeUrl,
    topology.topBranchId,
  );
}

export async function getRuntimeTask(
  taskId: string,
  runtimeUrl?: string,
): Promise<GenerationTask> {
  const response = await fetch(
    `${resolveRuntimeUrl(runtimeUrl)}/v1/tasks/${encodeURIComponent(taskId)}`,
    { method: "GET" },
  );
  if (!response.ok) throw new Error(`读取服务器 Task 失败：${response.status}`);
  return (await response.json()) as GenerationTask;
}

export async function getRuntimeProductConfig(
  runtimeUrl?: string,
): Promise<RuntimeProductConfig> {
  const response = await fetch(`${resolveRuntimeUrl(runtimeUrl)}/v1/config`, {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(`读取 Runtime 配置失败：${response.status}`);
  }
  return (await response.json()) as RuntimeProductConfig;
}

export async function cancelRuntimeTask(
  taskId: string,
  runtimeUrl?: string,
): Promise<GenerationTask> {
  return taskAction(taskId, "cancel", runtimeUrl);
}

export async function retryRuntimeTask(
  taskId: string,
  runtimeUrl?: string,
): Promise<GenerationTask> {
  return taskAction(taskId, "retry", runtimeUrl);
}

export function resolveRuntimeUrl(override?: string): string {
  const configured = override ?? process.env.NEXT_PUBLIC_TREECHAT_RUNTIME_URL;
  return (configured || "http://127.0.0.1:8000").replace(/\/$/, "");
}

async function submitTask(
  body: Record<string, unknown>,
  signal: AbortSignal,
  runtimeUrl?: string,
  expectedTopBranchId?: string,
): Promise<GenerationTask> {
  const response = await fetch(`${resolveRuntimeUrl(runtimeUrl)}/v1/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload = (await response.json().catch(() => null)) as CreateTaskResponse | null;
  if (!response.ok) {
    throw new Error(payload?.error || payload?.detail || `请求失败：${response.status}`);
  }
  if (!payload?.task?.task_id) {
    throw new Error("TreeChat Runtime 未返回 server Task");
  }
  if (
    expectedTopBranchId !== undefined &&
    payload.task.top_branch_id !== expectedTopBranchId
  ) {
    throw new Error("TreeChat Runtime 返回的 top_branch_id 与真实树拓扑不一致");
  }
  return payload.task;
}

async function taskAction(
  taskId: string,
  action: "cancel" | "retry",
  runtimeUrl?: string,
): Promise<GenerationTask> {
  const response = await fetch(
    `${resolveRuntimeUrl(runtimeUrl)}/v1/tasks/${encodeURIComponent(taskId)}/${action}`,
    { method: "POST" },
  );
  const payload = (await response.json().catch(() => null)) as CreateTaskResponse | null;
  if (!response.ok) {
    throw new Error(
      payload?.error || payload?.detail || `Task ${action} 失败：${response.status}`,
    );
  }
  if (!payload?.task?.task_id) {
    throw new Error(`TreeChat Runtime 未返回 ${action} Task`);
  }
  return payload.task;
}
