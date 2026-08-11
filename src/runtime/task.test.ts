import { describe, expect, test } from "vitest";
import {
  InvalidTaskTransitionError,
  calculateTaskTelemetry,
  createGenerationTask,
  markTaskFirstToken,
  transitionTask,
  type GenerationTask,
  type TaskState,
} from "./task";

function queued(index = 0): GenerationTask {
  return createGenerationTask(
    {
      session_id: `session-${index}`,
      node_id: `node-${index}`,
      task_type: "chat_generation",
      priority: 0,
    },
    { taskId: `task-test-${index}`, now: 100 },
  );
}

describe("Task lifecycle", () => {
  test("binds every task to its session and node", () => {
    const task = queued(7);
    expect(task).toMatchObject({
      task_id: "task-test-7",
      session_id: "session-7",
      node_id: "node-7",
      task_type: "chat_generation",
      priority: 0,
      state: "queued",
    });
  });

  test("generated task ids have zero collisions in 10,000 creations", () => {
    const ids = new Set<string>();
    for (let index = 0; index < 10_000; index++) {
      ids.add(
        createGenerationTask({
          session_id: "session",
          node_id: `node-${index}`,
          task_type: "chat_generation",
          priority: 0,
        }).task_id,
      );
    }
    expect(ids.size).toBe(10_000);
  });

  test("accepts every legal state transition", () => {
    const runningForCompletion = transitionTask(queued(1), "running", { now: 110 });
    const runningForFailure = transitionTask(queued(2), "running", { now: 110 });
    const runningForCancellation = transitionTask(queued(3), "running", { now: 110 });

    expect(transitionTask(runningForCompletion, "completed", { now: 120 }).state).toBe(
      "completed",
    );
    expect(
      transitionTask(runningForFailure, "failed", { now: 120, error: "network" }).state,
    ).toBe("failed");
    expect(transitionTask(queued(4), "cancelled", { now: 105 }).state).toBe("cancelled");
    expect(transitionTask(runningForCancellation, "cancelled", { now: 120 }).state).toBe(
      "cancelled",
    );
  });

  test("rejects every transition not present in the state machine", () => {
    const examples: Record<TaskState, GenerationTask> = {
      queued: queued(10),
      running: transitionTask(queued(11), "running", { now: 110 }),
      completed: transitionTask(
        transitionTask(queued(12), "running", { now: 110 }),
        "completed",
        { now: 120 },
      ),
      failed: transitionTask(
        transitionTask(queued(13), "running", { now: 110 }),
        "failed",
        { now: 120, error: "failed" },
      ),
      cancelled: transitionTask(queued(14), "cancelled", { now: 105 }),
    };
    const legal = new Set([
      "queued->running",
      "queued->cancelled",
      "running->completed",
      "running->failed",
      "running->cancelled",
    ]);
    const states: TaskState[] = ["queued", "running", "completed", "failed", "cancelled"];
    let acceptedIllegalTransitions = 0;

    for (const from of states) {
      for (const to of states) {
        if (legal.has(`${from}->${to}`)) continue;
        try {
          transitionTask(examples[from], to, { now: 130 });
          acceptedIllegalTransitions++;
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidTaskTransitionError);
        }
      }
    }

    expect(acceptedIllegalTransitions).toBe(0);
  });

  test("records only the first token timestamp", () => {
    const running = transitionTask(queued(20), "running", { now: 120 });
    const first = markTaskFirstToken(running, 150);
    const repeated = markTaskFirstToken(first, 170);

    expect(first.first_token_at).toBe(150);
    expect(repeated.first_token_at).toBe(150);
  });

  test("calculates queue time, TTFT, generation time, and total time", () => {
    const running = transitionTask(queued(21), "running", { now: 120 });
    const streaming = markTaskFirstToken(running, 160);
    const completed = transitionTask(streaming, "completed", { now: 220 });

    expect(calculateTaskTelemetry(completed)).toEqual({
      queue_time: 20,
      TTFT: 60,
      provider_ttft: 40,
      end_to_end_ttft: 60,
      generation_time: 60,
      total_time: 120,
    });
  });

  test("all completed tasks have fully calculable telemetry", () => {
    const completedTasks = Array.from({ length: 100 }, (_, index) => {
      const running = transitionTask(queued(100 + index), "running", { now: 110 });
      const streaming = markTaskFirstToken(running, 120 + index);
      return transitionTask(streaming, "completed", { now: 230 + index });
    });
    const calculable = completedTasks.filter((task) =>
      Object.values(calculateTaskTelemetry(task)).every((value) => value !== null),
    );

    expect(calculable).toHaveLength(completedTasks.length);
  });

  test("completion without streamed content keeps TTFT unavailable", () => {
    const running = transitionTask(queued(300), "running", { now: 110 });
    const completed = transitionTask(running, "completed", { now: 140 });

    expect(completed.first_token_at).toBeNull();
    expect(calculateTaskTelemetry(completed)).toEqual({
      queue_time: 10,
      TTFT: null,
      provider_ttft: null,
      end_to_end_ttft: null,
      generation_time: null,
      total_time: 40,
    });
  });

  test("rejects timestamps that move backwards", () => {
    const running = transitionTask(queued(400), "running", { now: 120 });
    expect(() => markTaskFirstToken(running, 119)).toThrow("first_token_at");
    expect(() => transitionTask(running, "failed", { now: 119 })).toThrow("started_at");
  });
});
