from __future__ import annotations

import threading
import time
import uuid
from collections.abc import Callable, Collection

from .models import (
    CreateTaskRequest,
    RerouteReason,
    RouterMode,
    TaskErrorType,
    TaskRecord,
    TaskState,
)


ALLOWED_TRANSITIONS: dict[TaskState, frozenset[TaskState]] = {
    TaskState.QUEUED: frozenset({TaskState.RUNNING, TaskState.CANCELLED}),
    TaskState.RUNNING: frozenset(
        {TaskState.COMPLETED, TaskState.FAILED, TaskState.CANCELLED}
    ),
    TaskState.COMPLETED: frozenset(),
    TaskState.FAILED: frozenset(),
    TaskState.CANCELLED: frozenset(),
}


class TaskNotFoundError(KeyError):
    pass


class InvalidTaskTransitionError(ValueError):
    pass


class RetryNotAllowedError(ValueError):
    pass


def epoch_ms() -> int:
    return int(time.time() * 1000)


class TaskRegistry:
    """Single-process authoritative Task state and immutable input snapshots."""

    def __init__(
        self,
        *,
        clock: Callable[[], int] = epoch_ms,
        id_factory: Callable[[], str] | None = None,
    ) -> None:
        self._clock = clock
        self._id_factory = id_factory or (lambda: f"task-{uuid.uuid4()}")
        self._tasks: dict[str, TaskRecord] = {}
        self._requests: dict[str, CreateTaskRequest] = {}
        self._retry_children: dict[str, str] = {}
        self._lock = threading.RLock()

    def create(
        self,
        request: CreateTaskRequest,
        *,
        timeout_limit_seconds: float = 120.0,
        retry_of_task_id: str | None = None,
        attempt: int = 1,
    ) -> TaskRecord:
        with self._lock:
            return self._create_internal(
                request,
                timeout_limit_seconds=timeout_limit_seconds,
                retry_of_task_id=retry_of_task_id,
                attempt=attempt,
            )

    def create_retry(
        self,
        task_id: str,
        *,
        max_attempts: int,
    ) -> tuple[TaskRecord, CreateTaskRequest]:
        with self._lock:
            source = self._get_internal(task_id)
            if source.state not in {TaskState.FAILED, TaskState.CANCELLED}:
                raise RetryNotAllowedError(
                    "Only failed or cancelled tasks can be retried"
                )
            if source.attempt >= max_attempts:
                raise RetryNotAllowedError(
                    f"Retry limit reached ({max_attempts} attempts)"
                )
            existing_child = self._retry_children.get(task_id)
            if existing_child is not None:
                raise RetryNotAllowedError(
                    f"Task was already retried as {existing_child}"
                )
            snapshot = self._requests[task_id].model_copy(deep=True)
            retried = self._create_internal(
                snapshot,
                timeout_limit_seconds=source.timeout_limit_seconds,
                retry_of_task_id=task_id,
                attempt=source.attempt + 1,
            )
            self._retry_children[task_id] = retried.task_id
            return retried, snapshot.model_copy(deep=True)

    def get(self, task_id: str) -> TaskRecord:
        with self._lock:
            return self._get_internal(task_id).model_copy(deep=True)

    def get_request_snapshot(self, task_id: str) -> CreateTaskRequest:
        with self._lock:
            self._get_internal(task_id)
            return self._requests[task_id].model_copy(deep=True)

    def list_by_session(self, session_id: str) -> list[TaskRecord]:
        with self._lock:
            return [
                task.model_copy(deep=True)
                for task in self._tasks.values()
                if task.session_id == session_id
            ]

    def now(self) -> int:
        with self._lock:
            return self._clock()

    def mark_enqueued(
        self,
        task_id: str,
        *,
        enqueue_seq: int,
        enqueued_at: int,
    ) -> TaskRecord:
        with self._lock:
            task = self._get_internal(task_id)
            if task.state is not TaskState.QUEUED:
                raise InvalidTaskTransitionError(
                    f"Cannot enqueue task while task is {task.state.value}"
                )
            if task.enqueued_at is not None or task.enqueue_seq is not None:
                raise InvalidTaskTransitionError("Task was already enqueued")
            if enqueue_seq < 1:
                raise ValueError("enqueue_seq must be at least 1")
            if enqueued_at < task.created_at:
                raise ValueError("enqueued_at must be at or after created_at")
            updated = task.model_copy(
                update={
                    "enqueue_seq": enqueue_seq,
                    "enqueued_at": enqueued_at,
                }
            )
            self._tasks[task_id] = updated
            return updated.model_copy(deep=True)

    def try_start(self, task_id: str) -> tuple[TaskRecord, bool]:
        with self._lock:
            task = self._get_internal(task_id)
            if task.state is not TaskState.QUEUED or task.enqueued_at is None:
                return task.model_copy(deep=True), False
            updated = self._transition_internal(
                task,
                TaskState.RUNNING,
                error=None,
                error_type=None,
                elapsed_ms=None,
            )
            return updated.model_copy(deep=True), True

    def mark_routed(
        self,
        task_id: str,
        *,
        affinity_key: str | None,
        affinity_worker: str | None,
        worker_id: str,
        router_mode: RouterMode,
        routing_decision_at: int,
        decision_reason: str,
        rerouted: bool,
        reroute_reason: RerouteReason | None,
    ) -> TaskRecord:
        with self._lock:
            task = self._get_internal(task_id)
            if task.state is not TaskState.RUNNING:
                raise InvalidTaskTransitionError(
                    f"Cannot route task while task is {task.state.value}"
                )
            if task.worker_id is not None or task.routing_decision_at is not None:
                raise InvalidTaskTransitionError("Task already has routing provenance")
            if not worker_id.strip():
                raise ValueError("worker_id must be non-empty")
            if affinity_key != task.top_branch_id:
                raise ValueError("Router affinity_key must match Task top_branch_id")
            branch_modes = {
                RouterMode.BRANCH_AFFINITY,
                RouterMode.BRANCH_AFFINITY_BOUNDED,
            }
            if router_mode in branch_modes and not affinity_worker:
                raise ValueError("Branch routing requires affinity_worker")
            if router_mode not in branch_modes and affinity_worker is not None:
                raise ValueError("Non-affinity routing cannot set affinity_worker")
            if rerouted:
                capacity_reroute = (
                    router_mode is RouterMode.BRANCH_AFFINITY_BOUNDED
                    and reroute_reason is RerouteReason.CAPACITY
                )
                health_reroute = (
                    router_mode in branch_modes
                    and reroute_reason is RerouteReason.HEALTH_UNAVAILABLE
                )
                if (
                    not (capacity_reroute or health_reroute)
                    or affinity_worker == worker_id
                ):
                    raise ValueError("Invalid reroute provenance")
            elif reroute_reason is not None:
                raise ValueError("Non-rerouted Task cannot set reroute_reason")
            elif (
                router_mode in branch_modes
                and worker_id != affinity_worker
            ):
                raise ValueError("Branch affinity changed worker without reroute")
            if not decision_reason.strip():
                raise ValueError("decision_reason must be non-empty")
            if task.started_at is None or routing_decision_at < task.started_at:
                raise ValueError(
                    "routing_decision_at must be at or after started_at"
                )
            updated = task.model_copy(
                update={
                    "affinity_key": affinity_key,
                    "affinity_worker": affinity_worker,
                    "worker_id": worker_id,
                    "router_mode": router_mode,
                    "routing_decision_at": routing_decision_at,
                    "decision_reason": decision_reason,
                    "rerouted": rerouted,
                    "reroute_reason": reroute_reason,
                }
            )
            self._tasks[task_id] = updated
            return updated.model_copy(deep=True)

    def try_cancel(
        self, task_id: str, *, elapsed_ms: int
    ) -> tuple[TaskRecord, bool]:
        return self._try_transition(
            task_id,
            {TaskState.QUEUED, TaskState.RUNNING},
            TaskState.CANCELLED,
            elapsed_ms=elapsed_ms,
        )

    def try_fail(
        self,
        task_id: str,
        *,
        error: str,
        error_type: TaskErrorType,
        elapsed_ms: int,
    ) -> tuple[TaskRecord, bool]:
        return self._try_transition(
            task_id,
            {TaskState.RUNNING},
            TaskState.FAILED,
            error=error,
            error_type=error_type,
            elapsed_ms=elapsed_ms,
        )

    def try_complete(
        self,
        task_id: str,
        *,
        result: str,
        elapsed_ms: int,
        response_latency_ms: int | None = None,
    ) -> tuple[TaskRecord, bool]:
        with self._lock:
            task = self._get_internal(task_id)
            if task.state is not TaskState.RUNNING:
                return task.model_copy(deep=True), False
            updated = task.model_copy(
                update={
                    "state": TaskState.COMPLETED,
                    "finished_at": self._clock(),
                    "result": result,
                    "response_latency_ms": response_latency_ms,
                    "elapsed_ms": max(0, elapsed_ms),
                    "error": None,
                    "error_type": None,
                }
            )
            self._tasks[task_id] = updated
            return updated.model_copy(deep=True), True

    def transition(
        self,
        task_id: str,
        next_state: TaskState,
        *,
        error: str | None = None,
    ) -> TaskRecord:
        with self._lock:
            task = self._get_internal(task_id)
            if next_state not in ALLOWED_TRANSITIONS[task.state]:
                raise InvalidTaskTransitionError(
                    f"Invalid task state transition: {task.state.value} -> {next_state.value}"
                )
            return self._transition_internal(
                task,
                next_state,
                error=error,
                error_type=TaskErrorType.PROVIDER
                if next_state is TaskState.FAILED
                else None,
                elapsed_ms=None,
            ).model_copy(deep=True)

    def mark_first_token(self, task_id: str) -> TaskRecord:
        with self._lock:
            task = self._get_internal(task_id)
            if task.state is not TaskState.RUNNING:
                raise InvalidTaskTransitionError(
                    f"Cannot record first token while task is {task.state.value}"
                )
            if task.first_token_at is not None:
                return task.model_copy(deep=True)
            updated = task.model_copy(update={"first_token_at": self._clock()})
            self._tasks[task_id] = updated
            return updated.model_copy(deep=True)

    def set_response_latency(self, task_id: str, latency_ms: int) -> TaskRecord:
        with self._lock:
            task = self._get_internal(task_id)
            if task.state is not TaskState.RUNNING:
                raise InvalidTaskTransitionError(
                    f"Cannot record response latency while task is {task.state.value}"
                )
            updated = task.model_copy(
                update={"response_latency_ms": max(0, latency_ms)}
            )
            self._tasks[task_id] = updated
            return updated.model_copy(deep=True)

    def record_provider_telemetry(
        self,
        task_id: str,
        *,
        provider_request_id: str | None,
        input_tokens: int | None,
        output_tokens: int | None,
        prompt_cache_hit_tokens: int | None,
        prompt_cache_miss_tokens: int | None,
        provider_ttft_ms: int | None,
    ) -> TaskRecord:
        with self._lock:
            task = self._get_internal(task_id)
            if task.state is not TaskState.RUNNING:
                raise InvalidTaskTransitionError(
                    f"Cannot record provider telemetry while task is {task.state.value}"
                )
            if (
                task.provider_request_id is not None
                and provider_request_id is not None
                and task.provider_request_id != provider_request_id
            ):
                raise ValueError("Provider request ID changed within one Task stream")
            for name, value in (
                ("input_tokens", input_tokens),
                ("output_tokens", output_tokens),
                ("prompt_cache_hit_tokens", prompt_cache_hit_tokens),
                ("prompt_cache_miss_tokens", prompt_cache_miss_tokens),
                ("provider_ttft_ms", provider_ttft_ms),
            ):
                if value is not None and value < 0:
                    raise ValueError(f"{name} must be non-negative")
            updated = task.model_copy(
                update={
                    "provider_request_id": (
                        provider_request_id or task.provider_request_id
                    ),
                    "input_tokens": (
                        input_tokens
                        if input_tokens is not None
                        else task.input_tokens
                    ),
                    "output_tokens": (
                        output_tokens
                        if output_tokens is not None
                        else task.output_tokens
                    ),
                    "prompt_cache_hit_tokens": (
                        prompt_cache_hit_tokens
                        if prompt_cache_hit_tokens is not None
                        else task.prompt_cache_hit_tokens
                    ),
                    "prompt_cache_miss_tokens": (
                        prompt_cache_miss_tokens
                        if prompt_cache_miss_tokens is not None
                        else task.prompt_cache_miss_tokens
                    ),
                    "provider_ttft_ms": (
                        provider_ttft_ms
                        if provider_ttft_ms is not None
                        else task.provider_ttft_ms
                    ),
                }
            )
            self._tasks[task_id] = updated
            return updated.model_copy(deep=True)

    def set_result(self, task_id: str, result: str) -> TaskRecord:
        with self._lock:
            task = self._get_internal(task_id)
            if task.state is not TaskState.RUNNING:
                raise InvalidTaskTransitionError(
                    f"Cannot record result while task is {task.state.value}"
                )
            updated = task.model_copy(update={"result": result})
            self._tasks[task_id] = updated
            return updated.model_copy(deep=True)

    def _create_internal(
        self,
        request: CreateTaskRequest,
        *,
        timeout_limit_seconds: float,
        retry_of_task_id: str | None,
        attempt: int,
    ) -> TaskRecord:
        task_id = self._id_factory()
        while task_id in self._tasks:
            task_id = self._id_factory()
        task = TaskRecord(
            task_id=task_id,
            session_id=request.session_id,
            node_id=request.node_id,
            task_type=request.task_type,
            priority=request.priority,
            state=TaskState.QUEUED,
            created_at=self._clock(),
            timeout_limit_seconds=timeout_limit_seconds,
            retry_of_task_id=retry_of_task_id,
            attempt=attempt,
            top_branch_id=request.derive_top_branch_id(),
        )
        self._tasks[task_id] = task
        self._requests[task_id] = request.model_copy(deep=True)
        return task.model_copy(deep=True)

    def _try_transition(
        self,
        task_id: str,
        expected: Collection[TaskState],
        next_state: TaskState,
        *,
        error: str | None = None,
        error_type: TaskErrorType | None = None,
        elapsed_ms: int | None = None,
    ) -> tuple[TaskRecord, bool]:
        with self._lock:
            task = self._get_internal(task_id)
            if task.state not in expected:
                return task.model_copy(deep=True), False
            updated = self._transition_internal(
                task,
                next_state,
                error=error,
                error_type=error_type,
                elapsed_ms=elapsed_ms,
            )
            return updated.model_copy(deep=True), True

    def _transition_internal(
        self,
        task: TaskRecord,
        next_state: TaskState,
        *,
        error: str | None,
        error_type: TaskErrorType | None,
        elapsed_ms: int | None,
    ) -> TaskRecord:
        at = self._clock()
        if next_state is TaskState.RUNNING:
            updated = task.model_copy(
                update={
                    "state": next_state,
                    "started_at": at,
                    "error": None,
                    "error_type": None,
                }
            )
        else:
            updated = task.model_copy(
                update={
                    "state": next_state,
                    "finished_at": at,
                    "error": self._normalize_error(error)
                    if next_state is TaskState.FAILED
                    else None,
                    "error_type": error_type
                    if next_state is TaskState.FAILED
                    else None,
                    "elapsed_ms": max(0, elapsed_ms)
                    if elapsed_ms is not None
                    else task.elapsed_ms,
                }
            )
        self._tasks[task.task_id] = updated
        return updated

    def _get_internal(self, task_id: str) -> TaskRecord:
        task = self._tasks.get(task_id)
        if task is None:
            raise TaskNotFoundError(task_id)
        return task

    @staticmethod
    def _normalize_error(error: str | None) -> str:
        normalized = (error or "Task failed").strip()
        return normalized[:2_000] or "Task failed"
