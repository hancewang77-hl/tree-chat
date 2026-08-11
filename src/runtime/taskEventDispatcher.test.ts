import { describe, expect, test, vi } from "vitest";
import { TaskEventDispatcher } from "./taskEventDispatcher";
import type { RuntimeEvent, RuntimeEventType } from "./sessionEvents";
import type { GenerationTask } from "./task";

describe("task event dispatcher", () => {
  test("reconstructs three interleaved tasks without task or node cross-talk", async () => {
    const mirrored: GenerationTask[] = [];
    const dispatcher = new TaskEventDispatcher((task) => mirrored.push(task));
    const displayed = new Map<string, string>();
    const pending = Object.fromEntries(
      ["A", "B", "C"].map((key) => [
        key,
        dispatcher.registerChat({
          sessionId: "session-1",
          nodeId: `node-${key}`,
          signal: new AbortController().signal,
          onText: (text) => displayed.set(key, text),
        }),
      ]),
    );

    for (const key of ["A", "B", "C"]) {
      dispatcher.handleEvent(event(key, "task.queued", queuedTask(key)));
      dispatcher.handleEvent(event(key, "task.started", runningTask(key)));
    }
    dispatcher.handleEvent(delta("B", "BB"));
    dispatcher.handleEvent(delta("A", "AA"));
    dispatcher.handleEvent(delta("C", "CC"));
    dispatcher.handleEvent(delta("A", "AAA"));
    dispatcher.handleEvent(delta("C", "CCC"));
    dispatcher.handleEvent(delta("B", "BBB"));
    for (const key of ["C", "A", "B"]) {
      dispatcher.handleEvent(event(key, "task.completed", completedTask(key)));
    }

    await expect(pending.A.completion).resolves.toBe("AAAAA");
    await expect(pending.B.completion).resolves.toBe("BBBBB");
    await expect(pending.C.completion).resolves.toBe("CCCCC");
    expect(displayed).toEqual(new Map([["A", "AAAAA"], ["B", "BBBBB"], ["C", "CCCCC"]]));
    expect(mirrored.filter((task) => task.state === "completed")).toHaveLength(3);
  });

  test("local node stop rejects only that observer and does not affect another task", async () => {
    const dispatcher = new TaskEventDispatcher(() => {});
    const controllerA = new AbortController();
    const pendingA = dispatcher.registerChat({
      sessionId: "session-1", nodeId: "node-A", signal: controllerA.signal, onText: vi.fn(),
    });
    const pendingB = dispatcher.registerChat({
      sessionId: "session-1", nodeId: "node-B", signal: new AbortController().signal, onText: vi.fn(),
    });
    dispatcher.handleEvent(event("A", "task.queued", queuedTask("A")));
    dispatcher.handleEvent(event("B", "task.queued", queuedTask("B")));
    controllerA.abort();
    dispatcher.handleEvent(delta("B", "BBBBB"));
    dispatcher.handleEvent(event("B", "task.completed", completedTask("B")));

    await expect(pendingA.completion).rejects.toMatchObject({ name: "AbortError" });
    await expect(pendingB.completion).resolves.toBe("BBBBB");
  });

  test("semantic structure completes from the server card without token.delta", async () => {
    const dispatcher = new TaskEventDispatcher(() => {});
    const pending = dispatcher.registerStructure({
      sessionId: "session-1",
      nodeId: "node-S",
      signal: new AbortController().signal,
    });
    const task = { ...queuedTask("S"), task_type: "semantic_structure" as const, priority: 2 as const };
    dispatcher.handleEvent(event("S", "task.queued", task));
    dispatcher.handleEvent({
      ...event("S", "task.completed", { ...task, state: "completed", finished_at: 3 }),
      data: {
        task: { ...task, state: "completed", finished_at: 3 },
        semanticCard: {
          version: 1, generatedAt: 3, model: "test", facts: ["fact"], constraints: [],
          assumptions: [], decisions: [], rejected: [], openQuestions: [],
        },
      },
    });

    await expect(pending.completion).resolves.toMatchObject({ facts: ["fact"] });
  });

  test("a late POST response cannot rebind an already completed request", async () => {
    const onText = vi.fn();
    const dispatcher = new TaskEventDispatcher(() => {});
    const pending = dispatcher.registerChat({
      sessionId: "session-1",
      nodeId: "node-A",
      signal: new AbortController().signal,
      onText,
    });
    dispatcher.handleEvent(event("A", "task.queued", queuedTask("A")));
    dispatcher.handleEvent(delta("A", "AAAAA"));
    dispatcher.handleEvent(event("A", "task.completed", completedTask("A")));
    await expect(pending.completion).resolves.toBe("AAAAA");

    pending.bindTask(queuedTask("A"));
    dispatcher.handleEvent(delta("A", "late"));
    expect(onText).toHaveBeenCalledTimes(1);
    expect(onText).toHaveBeenLastCalledWith("AAAAA");
  });
});

function queuedTask(key: string): GenerationTask {
  return {
    task_id: `task-${key}`, session_id: "session-1", node_id: `node-${key}`,
    task_type: "chat_generation", priority: 0, state: "queued", created_at: 1,
    enqueue_seq: 1, enqueued_at: 1,
    started_at: null, first_token_at: null, finished_at: null, error: null,
    error_type: null, response_latency_ms: null,
    provider_request_id: null, input_tokens: null, output_tokens: null,
    prompt_cache_hit_tokens: null, prompt_cache_miss_tokens: null,
    provider_ttft_ms: null, result: null,
    timeout_limit_seconds: 120, elapsed_ms: null, retry_of_task_id: null, attempt: 1,
    top_branch_id: null, affinity_key: null, affinity_worker: null,
    worker_id: null, router_mode: null, routing_decision_at: null,
    decision_reason: null,
    rerouted: false, reroute_reason: null,
  };
}

function runningTask(key: string): GenerationTask {
  return { ...queuedTask(key), state: "running", started_at: 2 };
}

function completedTask(key: string): GenerationTask {
  return {
    ...runningTask(key), state: "completed", first_token_at: 2,
    finished_at: 3, result: key.repeat(5),
  };
}

function event(key: string, eventType: RuntimeEventType, task: GenerationTask): RuntimeEvent {
  return {
    event_id: `event-${key}-${eventType}`, session_id: "session-1",
    task_id: `task-${key}`, node_id: `node-${key}`, event_type: eventType,
    timestamp: 2, data: { task },
  };
}

function delta(key: string, text: string): RuntimeEvent {
  return {
    event_id: `event-${key}-${text}`, session_id: "session-1",
    task_id: `task-${key}`, node_id: `node-${key}`, event_type: "token.delta",
    timestamp: 2, data: { delta: text },
  };
}
