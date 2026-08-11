import type { SemanticCard } from "@/src/types/tree";
import type { GenerationTask, TaskType } from "@/src/runtime/task";
import type { RuntimeEvent } from "@/src/runtime/sessionEvents";

type PendingKind = "chat" | "structure";

type PendingRequest = {
  sessionId: string;
  nodeId: string;
  taskType: TaskType;
  kind: PendingKind;
  taskId: string | null;
  settled: boolean;
  accumulated: string;
  onText: (text: string) => void;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  removeAbortListener: () => void;
};

export type PendingTask<T> = {
  completion: Promise<T>;
  bindTask: (task: GenerationTask) => void;
  fail: (error: unknown) => void;
};

export class TaskEventDispatcher {
  private readonly pendingByKey = new Map<string, PendingRequest>();
  private readonly pendingByTask = new Map<string, PendingRequest>();

  constructor(private readonly onTask: (task: GenerationTask) => void) {}

  registerChat(input: {
    sessionId: string;
    nodeId: string;
    signal: AbortSignal;
    onText: (text: string) => void;
  }): PendingTask<string> {
    return this.register<string>({
      ...input,
      taskType: "chat_generation",
      kind: "chat",
    });
  }

  registerStructure(input: {
    sessionId: string;
    nodeId: string;
    signal: AbortSignal;
  }): PendingTask<SemanticCard> {
    return this.register<SemanticCard>({
      ...input,
      onText: () => {},
      taskType: "semantic_structure",
      kind: "structure",
    });
  }

  handleEvent = (event: RuntimeEvent): void => {
    const serverTask = event.data.task;
    if (serverTask) this.onTask(serverTask);

    let pending = this.pendingByTask.get(event.task_id);
    if (!pending && serverTask) {
      pending = this.pendingByKey.get(
        requestKey(event.session_id, event.node_id, serverTask.task_type),
      );
      if (pending) this.bind(pending, serverTask);
    }
    if (!pending) return;
    if (
      pending.sessionId !== event.session_id ||
      pending.nodeId !== event.node_id ||
      pending.taskId !== event.task_id
    ) {
      return;
    }

    if (event.event_type === "token.delta") {
      if (pending.kind !== "chat" || typeof event.data.delta !== "string") return;
      pending.accumulated += event.data.delta;
      pending.onText(pending.accumulated);
      return;
    }
    if (event.event_type === "task.completed") {
      if (pending.kind === "chat") {
        this.complete(pending, serverTask?.result ?? pending.accumulated);
      } else {
        const card = event.data.semanticCard ?? parseSemanticCard(serverTask?.result);
        if (card) this.complete(pending, card);
        else this.fail(pending, new Error("语义整理返回了无效卡片"));
      }
      return;
    }
    if (event.event_type === "task.failed") {
      this.fail(pending, new Error(serverTask?.error || "TreeChat Runtime 任务失败"));
      return;
    }
    if (event.event_type === "task.cancelled") {
      this.fail(pending, abortError());
    }
  };

  private register<T>(input: {
    sessionId: string;
    nodeId: string;
    taskType: TaskType;
    kind: PendingKind;
    signal: AbortSignal;
    onText: (text: string) => void;
  }): PendingTask<T> {
    const key = requestKey(input.sessionId, input.nodeId, input.taskType);
    if (this.pendingByKey.has(key)) {
      throw new Error(`Active Runtime task already exists for node: ${input.nodeId}`);
    }
    let resolvePromise: (value: unknown) => void = () => {};
    let rejectPromise: (reason: unknown) => void = () => {};
    const completion = new Promise<T>((resolve, reject) => {
      resolvePromise = (value) => resolve(value as T);
      rejectPromise = reject;
    });
    const pending: PendingRequest = {
      sessionId: input.sessionId,
      nodeId: input.nodeId,
      taskType: input.taskType,
      kind: input.kind,
      taskId: null,
      settled: false,
      accumulated: "",
      onText: input.onText,
      resolve: resolvePromise,
      reject: rejectPromise,
      removeAbortListener: () => {},
    };
    const onAbort = () => this.fail(pending, abortError());
    input.signal.addEventListener("abort", onAbort, { once: true });
    pending.removeAbortListener = () =>
      input.signal.removeEventListener("abort", onAbort);
    this.pendingByKey.set(key, pending);
    if (input.signal.aborted) onAbort();

    return {
      completion,
      bindTask: (task) => this.bind(pending, task),
      fail: (error) => this.fail(pending, error),
    };
  }

  private bind(pending: PendingRequest, task: GenerationTask): void {
    if (pending.settled) return;
    if (
      task.session_id !== pending.sessionId ||
      task.node_id !== pending.nodeId ||
      task.task_type !== pending.taskType
    ) {
      this.fail(pending, new Error("TreeChat Runtime Task 与请求节点不匹配"));
      return;
    }
    if (pending.taskId && pending.taskId !== task.task_id) {
      this.fail(pending, new Error("TreeChat Runtime 返回了冲突的 Task ID"));
      return;
    }
    pending.taskId = task.task_id;
    this.pendingByTask.set(task.task_id, pending);
    this.onTask(task);
  }

  private complete(pending: PendingRequest, value: unknown): void {
    if (pending.settled) return;
    this.cleanup(pending);
    pending.resolve(value);
  }

  private fail(pending: PendingRequest, error: unknown): void {
    if (pending.settled) return;
    this.cleanup(pending);
    pending.reject(error);
  }

  private cleanup(pending: PendingRequest): void {
    pending.settled = true;
    this.pendingByKey.delete(
      requestKey(pending.sessionId, pending.nodeId, pending.taskType),
    );
    if (pending.taskId) this.pendingByTask.delete(pending.taskId);
    pending.removeAbortListener();
  }
}

function requestKey(sessionId: string, nodeId: string, taskType: TaskType): string {
  return `${sessionId}\u0000${nodeId}\u0000${taskType}`;
}

function parseSemanticCard(value: string | null | undefined): SemanticCard | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as SemanticCard;
  } catch {
    return null;
  }
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}
