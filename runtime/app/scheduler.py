from __future__ import annotations

import asyncio
import heapq
import itertools
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from enum import Enum

from .execution_registry import ExecutionHandleRegistry
from .models import CreateTaskRequest, TaskPriority, TaskRecord


class SchedulerMode(str, Enum):
    FCFS = "fcfs"
    PRIORITY = "priority"


@dataclass(frozen=True, slots=True)
class QueueItem:
    task_id: str
    priority: TaskPriority
    enqueue_seq: int
    enqueued_at: int


@dataclass(frozen=True, slots=True)
class _ScheduledExecution:
    queue_item: QueueItem
    task: TaskRecord = field(repr=False)
    payload: CreateTaskRequest = field(repr=False)


TaskRunner = Callable[[TaskRecord, CreateTaskRequest], Awaitable[None]]
EnqueuedCallback = Callable[[QueueItem], Awaitable[None]]


class TaskScheduler:
    """Single-process, non-preemptive FCFS/strict-priority dispatcher."""

    def __init__(
        self,
        *,
        mode: SchedulerMode,
        max_concurrency: int,
        execution_registry: ExecutionHandleRegistry,
        runner: TaskRunner,
        clock: Callable[[], int],
    ) -> None:
        if max_concurrency < 1:
            raise ValueError("max_concurrency must be at least 1")
        self.mode = mode
        self.max_concurrency = max_concurrency
        self._execution_registry = execution_registry
        self._runner = runner
        self._clock = clock
        self._sequence = itertools.count(1)
        self._queue: list[tuple[tuple[int, ...], int, _ScheduledExecution]] = []
        self._queued_by_task_id: dict[str, _ScheduledExecution] = {}
        self._running_task_ids: set[str] = set()
        self._cleanup_tasks: set[asyncio.Task[None]] = set()
        self._lock = asyncio.Lock()
        self._closing = False

    async def enqueue(
        self,
        task: TaskRecord,
        payload: CreateTaskRequest,
        *,
        on_enqueued: EnqueuedCallback,
    ) -> QueueItem:
        if self._closing:
            raise RuntimeError("Task scheduler is shutting down")

        queue_item = QueueItem(
            task_id=task.task_id,
            priority=task.priority,
            enqueue_seq=next(self._sequence),
            enqueued_at=self._clock(),
        )
        await on_enqueued(queue_item)
        scheduled = _ScheduledExecution(
            queue_item=queue_item,
            task=task.model_copy(deep=True),
            payload=payload.model_copy(deep=True),
        )

        async with self._lock:
            if self._closing:
                raise RuntimeError("Task scheduler is shutting down")
            if task.task_id in self._queued_by_task_id:
                raise ValueError(f"Task is already queued: {task.task_id}")
            self._queued_by_task_id[task.task_id] = scheduled
            heapq.heappush(
                self._queue,
                (self._sort_key(queue_item), queue_item.enqueue_seq, scheduled),
            )
            self._dispatch_available_locked()
        return queue_item

    async def cancel_queued(self, task_id: str) -> bool:
        async with self._lock:
            removed = self._queued_by_task_id.pop(task_id, None) is not None
            if removed:
                self._dispatch_available_locked()
            return removed

    async def shutdown(self) -> list[str]:
        """Stop accepting work, discard queued items, and stop running handles."""

        async with self._lock:
            self._closing = True
            queued_task_ids = list(self._queued_by_task_id)
            self._queued_by_task_id.clear()
            self._queue.clear()
            running_task_ids = list(self._running_task_ids)
            handles = [
                self._execution_registry.request_cancel(task_id)
                for task_id in running_task_ids
            ]

        await asyncio.gather(
            *(self._execution_registry.wait_stopped(handle) for handle in handles)
        )
        cleanup_tasks = list(self._cleanup_tasks)
        if cleanup_tasks:
            await asyncio.gather(*cleanup_tasks, return_exceptions=True)
        return queued_task_ids

    @property
    def queued_count(self) -> int:
        return len(self._queued_by_task_id)

    @property
    def running_count(self) -> int:
        return len(self._running_task_ids)

    def queued_task_ids(self) -> tuple[str, ...]:
        queued = sorted(
            self._queued_by_task_id.values(),
            key=lambda execution: self._sort_key(execution.queue_item),
        )
        return tuple(execution.queue_item.task_id for execution in queued)

    def _sort_key(self, item: QueueItem) -> tuple[int, ...]:
        if self.mode is SchedulerMode.PRIORITY:
            return (int(item.priority), item.enqueue_seq)
        return (item.enqueue_seq,)

    def _dispatch_available_locked(self) -> None:
        while (
            not self._closing
            and len(self._running_task_ids) < self.max_concurrency
        ):
            scheduled = self._pop_next_locked()
            if scheduled is None:
                return
            task_id = scheduled.queue_item.task_id
            self._running_task_ids.add(task_id)
            handle = self._execution_registry.start(
                task_id,
                self._runner(scheduled.task, scheduled.payload),
            )
            handle.add_done_callback(
                lambda _completed, completed_task_id=task_id: self._schedule_cleanup(
                    completed_task_id
                )
            )

    def _pop_next_locked(self) -> _ScheduledExecution | None:
        while self._queue:
            _key, _sequence, scheduled = heapq.heappop(self._queue)
            task_id = scheduled.queue_item.task_id
            if self._queued_by_task_id.get(task_id) is not scheduled:
                continue
            self._queued_by_task_id.pop(task_id, None)
            return scheduled
        return None

    def _schedule_cleanup(self, task_id: str) -> None:
        cleanup = asyncio.create_task(
            self._release_slot(task_id), name=f"treechat-scheduler-release-{task_id}"
        )
        self._cleanup_tasks.add(cleanup)
        cleanup.add_done_callback(self._cleanup_tasks.discard)

    async def _release_slot(self, task_id: str) -> None:
        async with self._lock:
            self._running_task_ids.discard(task_id)
            self._dispatch_available_locked()
