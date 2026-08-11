import type { SemanticCard } from "@/src/types/tree";
import type { GenerationTask } from "@/src/runtime/task";
import { resolveRuntimeUrl } from "@/src/runtime/client";

export const RUNTIME_EVENT_TYPES = [
  "task.queued",
  "task.started",
  "token.delta",
  "task.completed",
  "task.failed",
  "task.cancelled",
] as const;

export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[number];

export type RuntimeEvent = {
  event_id: string;
  session_id: string;
  task_id: string;
  node_id: string;
  event_type: RuntimeEventType;
  timestamp: number;
  data: {
    task?: GenerationTask;
    delta?: string;
    semanticCard?: SemanticCard;
  };
};

export type EventSourceLike = {
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
};

type SessionConnection = {
  source: EventSourceLike;
  opened: Promise<void>;
  isOpen: boolean;
};

type EventSourceFactory = (url: string) => EventSourceLike;

export class SessionEventMultiplexer {
  private readonly connections = new Map<string, SessionConnection>();

  constructor(
    private readonly onEvent: (event: RuntimeEvent) => void,
    private readonly runtimeUrl?: string,
    private readonly createEventSource: EventSourceFactory = (url) =>
      new EventSource(url),
  ) {}

  ensureConnected(sessionId: string): Promise<void> {
    const existing = this.connections.get(sessionId);
    if (existing) return existing.opened;

    const source = this.createEventSource(
      `${resolveRuntimeUrl(this.runtimeUrl)}/v1/sessions/${encodeURIComponent(sessionId)}/events`,
    );
    let resolveOpen: () => void = () => {};
    let rejectOpen: (reason?: unknown) => void = () => {};
    const opened = new Promise<void>((resolve, reject) => {
      resolveOpen = resolve;
      rejectOpen = reject;
    });
    const connection: SessionConnection = { source, opened, isOpen: false };
    this.connections.set(sessionId, connection);

    source.onopen = () => {
      connection.isOpen = true;
      resolveOpen();
    };
    source.onerror = () => {
      if (connection.isOpen) return;
      source.close();
      this.connections.delete(sessionId);
      rejectOpen(new Error("无法连接 TreeChat Runtime 事件流"));
    };

    for (const eventType of RUNTIME_EVENT_TYPES) {
      source.addEventListener(eventType, (message) => {
        const event = parseRuntimeEvent(message.data);
        if (event.session_id === sessionId && event.event_type === eventType) {
          this.onEvent(event);
        }
      });
    }
    return opened;
  }

  closeAll(): void {
    for (const connection of this.connections.values()) {
      connection.source.close();
    }
    this.connections.clear();
  }

  get connectionCount(): number {
    return this.connections.size;
  }
}

export function parseRuntimeEvent(value: string): RuntimeEvent {
  const event = JSON.parse(value) as RuntimeEvent;
  if (
    !event.event_id ||
    !event.session_id ||
    !event.task_id ||
    !event.node_id ||
    !RUNTIME_EVENT_TYPES.includes(event.event_type)
  ) {
    throw new Error("TreeChat Runtime 返回了无效事件");
  }
  return event;
}
