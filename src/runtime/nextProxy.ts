import {
  TASK_PRIORITY,
  type GenerationTask,
} from "@/src/runtime/task";

const TERMINAL_TASK_STATES = new Set<GenerationTask["state"]>([
  "completed",
  "failed",
  "cancelled",
]);
const DEFAULT_POLL_INTERVAL_MS = 150;

type CreateTaskResponse = {
  task?: GenerationTask;
  error?: string;
  detail?: string;
};

export class RuntimeTaskExecutionError extends Error {
  constructor(readonly task: GenerationTask) {
    super(task.error || `Runtime Task ${task.state}`);
    this.name = "RuntimeTaskExecutionError";
  }
}

export async function proxyLegacyChat(request: Request): Promise<Response> {
  const body = await parseBody(request);
  if (!body) return invalidJsonResponse();
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "messages 不能为空" }, { status: 400 });
  }

  return forwardTask(
    {
      session_id: stringOrFallback(body.session_id, "legacy-session"),
      node_id: stringOrFallback(body.node_id, `legacy-node-${crypto.randomUUID()}`),
      task_type: "chat_generation",
      priority: TASK_PRIORITY.ForegroundInteractive,
      messages: body.messages,
    },
    request.signal,
  );
}

export async function proxyLegacyStructure(request: Request): Promise<Response> {
  const body = await parseBody(request);
  if (!body) return invalidJsonResponse();
  if (typeof body.prompt !== "string" || !body.prompt.trim()) {
    return Response.json({ error: "prompt 不能为空" }, { status: 400 });
  }
  if (typeof body.response !== "string" || !body.response.trim()) {
    return Response.json({ error: "response 不能为空" }, { status: 400 });
  }

  return forwardTask(
    {
      session_id: stringOrFallback(body.session_id, "legacy-session"),
      node_id: stringOrFallback(body.node_id, `legacy-node-${crypto.randomUUID()}`),
      task_type: "semantic_structure",
      priority: TASK_PRIORITY.Background,
      prompt: body.prompt,
      response: body.response,
    },
    request.signal,
  );
}

/**
 * Submit a server-owned Runtime task and wait for its authoritative terminal
 * record. This is used by non-streaming Next routes such as Auxo; interactive
 * chat continues to consume the Runtime session event stream in the browser.
 */
export async function runRuntimeTask(
  payload: Record<string, unknown>,
  signal: AbortSignal,
  options: { pollIntervalMs?: number } = {},
): Promise<GenerationTask> {
  const runtimeUrl = serverRuntimeUrl();
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  let latestTask: GenerationTask | null = null;

  try {
    const response = await fetch(`${runtimeUrl}/v1/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    const body = (await response.json().catch(() => null)) as CreateTaskResponse | null;
    if (!response.ok) {
      throw new Error(body?.error || body?.detail || `Runtime 拒绝任务：${response.status}`);
    }
    if (!body?.task?.task_id) {
      throw new Error("TreeChat Runtime 未返回 server Task");
    }
    latestTask = body.task;

    while (!TERMINAL_TASK_STATES.has(latestTask.state)) {
      await abortableDelay(pollIntervalMs, signal);
      const taskResponse = await fetch(
        `${runtimeUrl}/v1/tasks/${encodeURIComponent(latestTask.task_id)}`,
        { method: "GET", signal },
      );
      if (!taskResponse.ok) {
        throw new Error(`读取 Runtime Task 失败：${taskResponse.status}`);
      }
      latestTask = (await taskResponse.json()) as GenerationTask;
    }

    if (latestTask.state !== "completed" || latestTask.result === null) {
      throw new RuntimeTaskExecutionError(latestTask);
    }
    return latestTask;
  } catch (error) {
    if (latestTask && !TERMINAL_TASK_STATES.has(latestTask.state)) {
      await cancelRuntimeTaskBestEffort(runtimeUrl, latestTask.task_id);
    }
    throw error;
  }
}

async function forwardTask(payload: Record<string, unknown>, signal: AbortSignal) {
  try {
    const upstream = await fetch(`${serverRuntimeUrl()}/v1/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    const headers = new Headers();
    for (const name of ["content-type", "cache-control", "x-accel-buffering", "x-task-id"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Runtime unavailable";
    return Response.json(
      { error: `TreeChat Runtime 不可用：${message}` },
      { status: 502 },
    );
  }
}

async function parseBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function invalidJsonResponse() {
  return Response.json(
    { error: "请求体格式错误，需要有效的 JSON" },
    { status: 400 },
  );
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function serverRuntimeUrl(): string {
  return (process.env.TREECHAT_RUNTIME_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    const handleAbort = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", handleAbort);
      reject(abortError(signal));
    };
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}

async function cancelRuntimeTaskBestEffort(runtimeUrl: string, taskId: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2_000);
  try {
    await fetch(`${runtimeUrl}/v1/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: "POST",
      signal: controller.signal,
    });
  } catch {
    // The original request error remains authoritative; cancellation is best effort.
  } finally {
    clearTimeout(timeoutId);
  }
}
