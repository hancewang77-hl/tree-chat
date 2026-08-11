from __future__ import annotations

import asyncio
import time
import uuid
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class EventType(str, Enum):
    TASK_QUEUED = "task.queued"
    TASK_STARTED = "task.started"
    TOKEN_DELTA = "token.delta"
    TASK_COMPLETED = "task.completed"
    TASK_FAILED = "task.failed"
    TASK_CANCELLED = "task.cancelled"


class ServerEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str
    session_id: str
    task_id: str
    node_id: str
    event_type: EventType
    timestamp: int
    data: dict[str, object] = Field(default_factory=dict)


class EventSubscriber:
    """One active SSE connection and its delivery channel."""

    def __init__(self) -> None:
        self.queue: asyncio.Queue[ServerEvent] = asyncio.Queue()


class SessionEventBus:
    """In-memory live fan-out for server-authored task events; it has no replay."""

    def __init__(self) -> None:
        self._subscribers: dict[str, set[EventSubscriber]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, session_id: str) -> EventSubscriber:
        subscriber = EventSubscriber()
        async with self._lock:
            self._subscribers.setdefault(session_id, set()).add(subscriber)
        return subscriber

    async def unsubscribe(
        self, session_id: str, subscriber: EventSubscriber
    ) -> None:
        async with self._lock:
            session_subscribers = self._subscribers.get(session_id)
            if session_subscribers is None:
                return
            session_subscribers.discard(subscriber)
            if not session_subscribers:
                self._subscribers.pop(session_id, None)

    async def publish(
        self,
        *,
        session_id: str,
        task_id: str,
        node_id: str,
        event_type: EventType,
        data: dict[str, object] | None = None,
    ) -> ServerEvent:
        event = ServerEvent(
            event_id=f"event-{uuid.uuid4()}",
            session_id=session_id,
            task_id=task_id,
            node_id=node_id,
            event_type=event_type,
            timestamp=int(time.time() * 1000),
            data=data or {},
        )
        async with self._lock:
            targets = tuple(self._subscribers.get(session_id, ()))
        for subscriber in targets:
            subscriber.queue.put_nowait(event)
        return event

    async def subscriber_count(self, session_id: str | None = None) -> int:
        async with self._lock:
            if session_id is not None:
                return len(self._subscribers.get(session_id, ()))
            return sum(len(items) for items in self._subscribers.values())


def serialize_sse(event: ServerEvent) -> str:
    return (
        f"id: {event.event_id}\n"
        f"event: {event.event_type.value}\n"
        f"data: {event.model_dump_json()}\n\n"
    )
