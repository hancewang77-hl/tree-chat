import { describe, expect, test, vi } from "vitest";
import {
  SessionEventMultiplexer,
  type EventSourceLike,
  type RuntimeEvent,
  type RuntimeEventType,
} from "./sessionEvents";

class FakeEventSource implements EventSourceLike {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();
  closed = false;

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, listener);
  }

  open() {
    this.readyState = 1;
    this.onopen?.({} as Event);
  }

  emit(event: RuntimeEvent) {
    this.listeners.get(event.event_type)?.({ data: JSON.stringify(event) } as MessageEvent<string>);
  }

  close() {
    this.closed = true;
    this.readyState = 2;
  }
}

describe("session SSE multiplexer", () => {
  test("reuses exactly one EventSource for one session and routes server events", async () => {
    const sources: FakeEventSource[] = [];
    const received: RuntimeEvent[] = [];
    const multiplexer = new SessionEventMultiplexer(
      (event) => received.push(event),
      "http://runtime.test/",
      (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source;
      },
    );

    const first = multiplexer.ensureConnected("session 1");
    const second = multiplexer.ensureConnected("session 1");
    expect(sources).toHaveLength(1);
    expect(sources[0].url).toBe("http://runtime.test/v1/sessions/session%201/events");
    sources[0].open();
    await Promise.all([first, second]);
    sources[0].emit(runtimeEvent("session 1", "task-a", "node-a", "task.started"));

    expect(multiplexer.connectionCount).toBe(1);
    expect(received.map((event) => event.task_id)).toEqual(["task-a"]);
    multiplexer.closeAll();
    expect(sources[0].closed).toBe(true);
    expect(multiplexer.connectionCount).toBe(0);
  });

  test("uses separate streams for separate sessions and rejects cross-session frames", async () => {
    const sources: FakeEventSource[] = [];
    const onEvent = vi.fn();
    const multiplexer = new SessionEventMultiplexer(onEvent, undefined, (url) => {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    });
    const openA = multiplexer.ensureConnected("A");
    const openB = multiplexer.ensureConnected("B");
    sources.forEach((source) => source.open());
    await Promise.all([openA, openB]);

    sources[0].emit(runtimeEvent("B", "wrong", "node-b", "task.started"));
    sources[0].emit(runtimeEvent("A", "right", "node-a", "task.started"));

    expect(multiplexer.connectionCount).toBe(2);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0].task_id).toBe("right");
  });
});

function runtimeEvent(
  sessionId: string,
  taskId: string,
  nodeId: string,
  eventType: RuntimeEventType,
): RuntimeEvent {
  return {
    event_id: `event-${taskId}`,
    session_id: sessionId,
    task_id: taskId,
    node_id: nodeId,
    event_type: eventType,
    timestamp: 1,
    data: {},
  };
}
