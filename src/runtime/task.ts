export type TaskState = "queued" | "running" | "completed" | "failed" | "cancelled";
export type TaskType = "chat_generation" | "semantic_structure";
export type TaskPriority = 0 | 1 | 2;
export type TaskErrorType = "provider" | "timeout" | "router_unavailable";
export type RouterMode =
  | "round_robin"
  | "least_load"
  | "branch_affinity"
  | "branch_affinity_bounded";
export type RerouteReason = "capacity" | "health_unavailable";

export const TASK_PRIORITY = {
  ForegroundInteractive: 0,
  UserParallel: 1,
  Background: 2,
} as const satisfies Record<string, TaskPriority>;

export type GenerationTask = {
  task_id: string;
  session_id: string;
  node_id: string;
  task_type: TaskType;
  priority: TaskPriority;
  state: TaskState;
  created_at: number;
  enqueue_seq: number | null;
  enqueued_at: number | null;
  started_at: number | null;
  first_token_at: number | null;
  finished_at: number | null;
  error: string | null;
  error_type: TaskErrorType | null;
  response_latency_ms: number | null;
  provider_request_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  prompt_cache_hit_tokens: number | null;
  prompt_cache_miss_tokens: number | null;
  provider_ttft_ms: number | null;
  result: string | null;
  timeout_limit_seconds: number;
  elapsed_ms: number | null;
  retry_of_task_id: string | null;
  attempt: number;
  top_branch_id: string | null;
  affinity_key: string | null;
  affinity_worker: string | null;
  worker_id: string | null;
  router_mode: RouterMode | null;
  routing_decision_at: number | null;
  decision_reason: string | null;
  rerouted: boolean;
  reroute_reason: RerouteReason | null;
};

export type TaskTelemetry = {
  queue_time: number | null;
  TTFT: number | null;
  provider_ttft: number | null;
  end_to_end_ttft: number | null;
  generation_time: number | null;
  total_time: number | null;
};

export type CreateTaskInput = {
  session_id: string;
  node_id: string;
  task_type: TaskType;
  priority: TaskPriority;
};

const ALLOWED_TRANSITIONS: Record<TaskState, ReadonlySet<TaskState>> = {
  queued: new Set(["running", "cancelled"]),
  running: new Set(["completed", "failed", "cancelled"]),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
};

export class InvalidTaskTransitionError extends Error {
  constructor(from: TaskState, to: TaskState) {
    super(`Invalid task state transition: ${from} -> ${to}`);
    this.name = "InvalidTaskTransitionError";
  }
}

export function createGenerationTask(
  input: CreateTaskInput,
  options: { taskId?: string; now?: number } = {},
): GenerationTask {
  const createdAt = options.now ?? Date.now();
  if (!Number.isFinite(createdAt)) throw new Error("Task created_at must be finite");
  if (!input.session_id) throw new Error("Task session_id is required");
  if (!input.node_id) throw new Error("Task node_id is required");
  if (!Number.isFinite(input.priority)) throw new Error("Task priority must be finite");

  return {
    task_id: options.taskId ?? `task-${crypto.randomUUID()}`,
    session_id: input.session_id,
    node_id: input.node_id,
    task_type: input.task_type,
    priority: input.priority,
    state: "queued",
    created_at: createdAt,
    enqueue_seq: null,
    enqueued_at: null,
    started_at: null,
    first_token_at: null,
    finished_at: null,
    error: null,
    error_type: null,
    response_latency_ms: null,
    provider_request_id: null,
    input_tokens: null,
    output_tokens: null,
    prompt_cache_hit_tokens: null,
    prompt_cache_miss_tokens: null,
    provider_ttft_ms: null,
    result: null,
    timeout_limit_seconds: 120,
    elapsed_ms: null,
    retry_of_task_id: null,
    attempt: 1,
    top_branch_id: null,
    affinity_key: null,
    affinity_worker: null,
    worker_id: null,
    router_mode: null,
    routing_decision_at: null,
    decision_reason: null,
    rerouted: false,
    reroute_reason: null,
  };
}

export function transitionTask(
  task: GenerationTask,
  nextState: TaskState,
  options: { now?: number; error?: string } = {},
): GenerationTask {
  if (!ALLOWED_TRANSITIONS[task.state].has(nextState)) {
    throw new InvalidTaskTransitionError(task.state, nextState);
  }

  const at = options.now ?? Date.now();
  assertChronologicalTimestamp(task, at);

  if (nextState === "running") {
    return {
      ...task,
      state: "running",
      started_at: at,
      error: null,
    };
  }

  return {
    ...task,
    state: nextState,
    finished_at: at,
    error: nextState === "failed" ? options.error?.trim() || "Task failed" : null,
    error_type: nextState === "failed" ? "provider" : null,
    elapsed_ms: at - task.created_at,
  };
}

export function markTaskFirstToken(
  task: GenerationTask,
  now: number = Date.now(),
): GenerationTask {
  if (task.state !== "running") {
    throw new InvalidTaskTransitionError(task.state, "running");
  }
  if (task.first_token_at !== null) return task;
  if (task.started_at === null || now < task.started_at || !Number.isFinite(now)) {
    throw new Error("Task first_token_at must be at or after started_at");
  }
  return { ...task, first_token_at: now };
}

export function calculateTaskTelemetry(task: GenerationTask): TaskTelemetry {
  return {
    queue_time:
      task.started_at === null
        ? null
        : task.started_at - (task.enqueued_at ?? task.created_at),
    TTFT:
      task.first_token_at === null ? null : task.first_token_at - task.created_at,
    provider_ttft:
      task.first_token_at === null || task.started_at === null
        ? null
        : task.first_token_at - task.started_at,
    end_to_end_ttft:
      task.first_token_at === null ? null : task.first_token_at - task.created_at,
    generation_time:
      task.finished_at === null || task.first_token_at === null
        ? null
        : task.finished_at - task.first_token_at,
    total_time:
      task.finished_at === null ? null : task.finished_at - task.created_at,
  };
}

function assertChronologicalTimestamp(task: GenerationTask, at: number) {
  if (!Number.isFinite(at) || at < task.created_at) {
    throw new Error("Task transition timestamp must be at or after created_at");
  }
  if (task.started_at !== null && at < task.started_at) {
    throw new Error("Task terminal timestamp must be at or after started_at");
  }
  if (task.first_token_at !== null && at < task.first_token_at) {
    throw new Error("Task terminal timestamp must be at or after first_token_at");
  }
}
