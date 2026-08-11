import { useEffect, useRef, useState } from "react";
import type { SemanticCard } from "@/src/types/tree";
import type { ChatMessage } from "@/src/lib/contextCompiler";
import type { BranchTopology } from "@/src/lib/branchTopology";
import { isUsableSemanticCard } from "@/src/lib/semanticCard";
import {
  cancelRuntimeTask,
  retryRuntimeTask,
  submitRuntimeChat,
  submitRuntimeStructure,
} from "@/src/runtime/client";
import { NodeAbortControllerStore } from "@/src/runtime/nodeAbortControllers";
import { SessionEventMultiplexer } from "@/src/runtime/sessionEvents";
import { TaskEventDispatcher } from "@/src/runtime/taskEventDispatcher";
import type { GenerationTask, TaskPriority, TaskState } from "@/src/runtime/task";

type SendMessageInput = {
  sessionId: string;
  nodeId: string;
  priority: TaskPriority;
  messages: ChatMessage[];
  topology: BranchTopology;
  onText?: (text: string) => void;
};

type RetryMessageInput = {
  taskId: string;
  onText?: (text: string) => void;
};

type StructureNodeInput = {
  sessionId: string;
  nodeId: string;
  priority: TaskPriority;
  prompt: string;
  response: string;
  topology: BranchTopology;
};

export function useAIChat() {
  const [tasks, setTasks] = useState<Record<string, GenerationTask>>({});
  const [activeChatNodeIds, setActiveChatNodeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [controllerStore] = useState(() => new NodeAbortControllerStore());
  const tasksRef = useRef<Record<string, GenerationTask>>({});
  const chatSubmissionsRef = useRef<Map<string, Promise<GenerationTask>>>(new Map());
  const [dispatcher] = useState(
    () => new TaskEventDispatcher(publishServerTask),
  );
  const [sessionEvents] = useState(
    () => new SessionEventMultiplexer(dispatcher.handleEvent),
  );

  useEffect(() => () => sessionEvents.closeAll(), [sessionEvents]);

  function publishServerTask(task: GenerationTask) {
    const current = tasksRef.current[task.task_id];
    if (current && taskStateRank(task.state) < taskStateRank(current.state)) return;
    const next = { ...tasksRef.current, [task.task_id]: task };
    tasksRef.current = next;
    setTasks(next);
  }

  async function sendMessage({
    sessionId,
    nodeId,
    priority,
    messages,
    topology,
    onText = () => {},
  }: SendMessageInput): Promise<string> {
    return runObservedChat({
      sessionId,
      nodeId,
      onText,
      submit: (signal) =>
        submitRuntimeChat({
          sessionId,
          nodeId,
          priority,
          messages,
          topology,
          signal,
        }),
    });
  }

  async function retryMessage({
    taskId,
    onText = () => {},
  }: RetryMessageInput): Promise<string> {
    const source = tasksRef.current[taskId];
    if (!source) throw new Error("找不到需要重试的服务器 Task");
    if (source.task_type !== "chat_generation") {
      throw new Error("该 Task 不是回答生成任务");
    }
    if (source.state !== "failed" && source.state !== "cancelled") {
      throw new Error("只有失败或已取消的 Task 可以重试");
    }
    return runObservedChat({
      sessionId: source.session_id,
      nodeId: source.node_id,
      onText,
      submit: () => retryRuntimeTask(source.task_id),
    });
  }

  async function runObservedChat({
    sessionId,
    nodeId,
    onText,
    submit,
  }: {
    sessionId: string;
    nodeId: string;
    onText: (text: string) => void;
    submit: (signal: AbortSignal) => Promise<GenerationTask>;
  }): Promise<string> {
    const abortController = controllerStore.create(nodeId);
    setActiveChatNodeIds((current) => new Set(current).add(nodeId));
    let submission: Promise<GenerationTask> | null = null;

    try {
      await sessionEvents.ensureConnected(sessionId);
      const pending = dispatcher.registerChat({
        sessionId,
        nodeId,
        signal: abortController.signal,
        onText,
      });
      submission = submit(abortController.signal);
      chatSubmissionsRef.current.set(nodeId, submission);
      try {
        const task = await submission;
        pending.bindTask(task);
      } catch (error) {
        pending.fail(error);
      }
      return await pending.completion;
    } finally {
      if (submission && chatSubmissionsRef.current.get(nodeId) === submission) {
        chatSubmissionsRef.current.delete(nodeId);
      }
      controllerStore.finish(nodeId, abortController);
      setActiveChatNodeIds((current) => {
        const next = new Set(current);
        next.delete(nodeId);
        return next;
      });
    }
  }

  async function structureNode({
    sessionId,
    nodeId,
    priority,
    prompt,
    response,
    topology,
  }: StructureNodeInput): Promise<SemanticCard> {
    const abortController = new AbortController();
    await sessionEvents.ensureConnected(sessionId);
    const pending = dispatcher.registerStructure({
      sessionId,
      nodeId,
      signal: abortController.signal,
    });
    try {
      const task = await submitRuntimeStructure({
        sessionId,
        nodeId,
        priority,
        prompt,
        response,
        topology,
        signal: abortController.signal,
      });
      pending.bindTask(task);
    } catch (error) {
      pending.fail(error);
    }
    const semanticCard = await pending.completion;
    if (!isUsableSemanticCard(semanticCard)) {
      throw new Error("语义整理返回了无效卡片");
    }
    return semanticCard;
  }

  async function stopStreaming(nodeId: string): Promise<GenerationTask | null> {
    const submission = chatSubmissionsRef.current.get(nodeId);
    if (!submission) {
      // No authoritative Task exists yet; abort only the not-yet-submitted local request.
      controllerStore.abort(nodeId);
      return null;
    }
    const task = await submission;
    const authoritative = await cancelRuntimeTask(task.task_id);
    publishServerTask(authoritative);
    if (authoritative.state === "cancelled") {
      // SSE normally settles the observer first; this is a response-based fallback.
      controllerStore.abort(nodeId);
    }
    return authoritative;
  }

  return {
    activeChatNodeIds,
    tasks,
    sendMessage,
    retryMessage,
    structureNode,
    stopStreaming,
  } as const;
}

const STATE_RANK: Record<TaskState, number> = {
  queued: 0,
  running: 1,
  completed: 2,
  failed: 2,
  cancelled: 2,
};

function taskStateRank(state: TaskState): number {
  return STATE_RANK[state];
}
