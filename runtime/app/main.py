from __future__ import annotations

import asyncio
import math
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from .event_bus import EventType, SessionEventBus, serialize_sse
from .execution_registry import ExecutionHandleRegistry
from .models import (
    CreateTaskRequest,
    CreateTaskResponse,
    ProviderTelemetry,
    RouterMode,
    SemanticCard,
    TaskErrorType,
    TaskRecord,
    TaskState,
    TaskType,
)
from .provider import (
    DeepSeekProvider,
    ProviderMode,
    TaskProvider,
    VLLMProvider,
    resolve_provider_mode,
)
from .router import (
    HttpTaskRouter,
    InProcessTaskRouter,
    RoutingDecision,
    RouterUnavailableError,
    TaskRouter,
    WorkerEndpoint,
    WorkerHealthStatus,
    parse_worker_endpoints,
    resolve_router_mode,
)
from .scheduler import QueueItem, SchedulerMode, TaskScheduler
from .task_registry import (
    RetryNotAllowedError,
    TaskNotFoundError,
    TaskRegistry,
)


DEFAULT_HEARTBEAT_SECONDS = 15.0
DEFAULT_TASK_TIMEOUT_SECONDS = 120.0
DEFAULT_MAX_RETRY_ATTEMPTS = 3
DEFAULT_MAX_CONCURRENCY = 2
DEFAULT_SCHEDULER_MODE = SchedulerMode.PRIORITY
TERMINAL_STATES = {
    TaskState.COMPLETED,
    TaskState.FAILED,
    TaskState.CANCELLED,
}


def create_app(
    *,
    registry: TaskRegistry | None = None,
    provider: TaskProvider | None = None,
    router: TaskRouter | None = None,
    router_mode: RouterMode | str | None = None,
    worker_endpoints: list[WorkerEndpoint] | None = None,
    event_bus: SessionEventBus | None = None,
    execution_registry: ExecutionHandleRegistry | None = None,
    heartbeat_seconds: float = DEFAULT_HEARTBEAT_SECONDS,
    task_timeout_seconds: float | None = None,
    max_retry_attempts: int | None = None,
    max_concurrency: int | None = None,
    scheduler_mode: SchedulerMode | str | None = None,
    provider_mode: ProviderMode | str | None = None,
    provider_worker_id: str = "in-process-test-worker",
) -> FastAPI:
    if provider is not None and router is not None:
        raise ValueError("Pass either provider or router, not both")
    task_registry = registry or TaskRegistry()
    session_events = event_bus or SessionEventBus()
    execution_handles = execution_registry or ExecutionHandleRegistry()
    timeout_limit = resolve_positive_float(
        task_timeout_seconds,
        "TREECHAT_TASK_TIMEOUT_SECONDS",
        DEFAULT_TASK_TIMEOUT_SECONDS,
    )
    retry_limit = resolve_positive_int(
        max_retry_attempts,
        "TREECHAT_MAX_RETRY_ATTEMPTS",
        DEFAULT_MAX_RETRY_ATTEMPTS,
    )
    concurrency_limit = resolve_positive_int(
        max_concurrency,
        "TREECHAT_MAX_CONCURRENCY",
        DEFAULT_MAX_CONCURRENCY,
    )
    scheduling_mode = resolve_scheduler_mode(scheduler_mode)
    routing_mode = resolve_router_mode(router_mode)
    if router is not None:
        task_router = router
    elif provider is not None:
        task_router = InProcessTaskRouter(
            provider,
            mode=routing_mode,
            clock=task_registry.now,
            worker_id=provider_worker_id,
        )
    else:
        task_router = HttpTaskRouter(
            endpoints=worker_endpoints or parse_worker_endpoints(),
            mode=routing_mode,
            clock=task_registry.now,
        )

    async def run_scheduled_task(
        task: TaskRecord, payload: CreateTaskRequest
    ) -> None:
        await execute_task(
            task,
            payload,
            task_registry,
            task_router,
            session_events,
        )

    task_scheduler = TaskScheduler(
        mode=scheduling_mode,
        max_concurrency=concurrency_limit,
        execution_registry=execution_handles,
        runner=run_scheduled_task,
        clock=task_registry.now,
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        try:
            await task_router.start()
            yield
        finally:
            try:
                queued_task_ids = await task_scheduler.shutdown()
                for task_id in queued_task_ids:
                    cancelled, changed = task_registry.try_cancel(
                        task_id, elapsed_ms=0
                    )
                    if changed:
                        await publish_terminal_reliably(
                            session_events, EventType.TASK_CANCELLED, cancelled
                        )
            finally:
                await task_router.aclose()

    app = FastAPI(title="TreeChat Runtime", version="0.9.0", lifespan=lifespan)
    app.state.task_registry = task_registry
    app.state.task_provider = provider
    app.state.task_router = task_router
    app.state.router_mode = routing_mode
    app.state.event_bus = session_events
    app.state.execution_registry = execution_handles
    # Backward-compatible alias retained for external diagnostics.
    app.state.execution_tracker = execution_handles
    app.state.task_timeout_seconds = timeout_limit
    app.state.max_retry_attempts = retry_limit
    app.state.task_scheduler = task_scheduler
    app.state.max_concurrency = concurrency_limit
    app.state.scheduler_mode = scheduling_mode
    app.state.provider_mode = (
        provider_mode.value
        if isinstance(provider_mode, ProviderMode)
        else provider_mode or ("injected" if provider is not None else "mock")
    )

    allowed_origins = [
        origin.strip()
        for origin in os.getenv(
            "TREECHAT_ALLOWED_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000",
        ).split(",")
        if origin.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Last-Event-ID"],
        expose_headers=["X-Task-Id"],
    )

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/v1/config")
    async def runtime_config() -> dict[str, object]:
        """Expose the non-secret Runtime configuration used by the product."""

        return {
            "execution_mode": (
                "serial" if task_scheduler.max_concurrency == 1 else "concurrent"
            ),
            "max_concurrency": task_scheduler.max_concurrency,
            "queue_policy": task_scheduler.mode.value,
            "routing_policy": routing_mode.value,
            "provider_mode": app.state.provider_mode,
            "product_path": [
                "runtime_api",
                "scheduler",
                "router",
                "worker_or_provider",
                "session_events",
            ],
        }

    @app.get("/v1/workers/health", response_model=list[WorkerHealthStatus])
    async def worker_health(
        refresh: bool = False,
    ) -> list[WorkerHealthStatus]:
        return await task_router.health_status(refresh=refresh)

    @app.get("/v1/tasks/{task_id}", response_model=TaskRecord)
    async def get_task(task_id: str) -> TaskRecord:
        try:
            return task_registry.get(task_id)
        except TaskNotFoundError as error:
            raise HTTPException(status_code=404, detail="Task not found") from error

    @app.get("/v1/sessions/{session_id}/tasks", response_model=list[TaskRecord])
    async def list_session_tasks(session_id: str) -> list[TaskRecord]:
        return task_registry.list_by_session(session_id)

    @app.get("/v1/sessions/{session_id}/events")
    async def stream_session_events(session_id: str, request: Request) -> StreamingResponse:
        subscriber = await session_events.subscribe(session_id)

        async def event_stream():
            try:
                yield ": connected\n\n"
                while True:
                    if await request.is_disconnected():
                        break
                    try:
                        event = await asyncio.wait_for(
                            subscriber.queue.get(), timeout=heartbeat_seconds
                        )
                    except TimeoutError:
                        yield ": heartbeat\n\n"
                        continue
                    yield serialize_sse(event)
            finally:
                await session_events.unsubscribe(session_id, subscriber)

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    @app.post("/v1/tasks", status_code=202)
    async def create_task(payload: CreateTaskRequest) -> JSONResponse:
        if (
            routing_mode
            in {
                RouterMode.BRANCH_AFFINITY,
                RouterMode.BRANCH_AFFINITY_BOUNDED,
            }
            and payload.derive_top_branch_id() is None
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "branch_affinity requires validated root_node_id and "
                    "ancestor_node_ids topology provenance"
                ),
            )
        task = task_registry.create(
            payload,
            timeout_limit_seconds=timeout_limit,
        )
        enqueued = await enqueue_execution(
            task,
            payload,
            task_registry,
            session_events,
            task_scheduler,
        )
        return task_response(enqueued, status_code=202)

    @app.post("/v1/tasks/{task_id}/cancel")
    async def cancel_task(task_id: str) -> JSONResponse:
        try:
            current = task_registry.get(task_id)
        except TaskNotFoundError as error:
            raise HTTPException(status_code=404, detail="Task not found") from error

        if current.state in TERMINAL_STATES:
            return task_response(current)

        if current.state is TaskState.QUEUED:
            await task_scheduler.cancel_queued(task_id)
            cancelled, changed = task_registry.try_cancel(task_id, elapsed_ms=0)
            handle = execution_handles.request_cancel(task_id)
            if changed:
                await publish_terminal_reliably(
                    session_events, EventType.TASK_CANCELLED, cancelled
                )
            await execution_handles.wait_stopped(handle)
            return task_response(task_registry.get(task_id))

        handle = execution_handles.request_cancel(task_id)
        if handle is None:
            latest = task_registry.get(task_id)
            if latest.state not in TERMINAL_STATES:
                raise HTTPException(
                    status_code=409,
                    detail="Running task has no live server execution handle",
                )
            return task_response(latest)
        await execution_handles.wait_stopped(handle)
        return task_response(task_registry.get(task_id))

    @app.post("/v1/tasks/{task_id}/retry", status_code=202)
    async def retry_task(task_id: str) -> JSONResponse:
        try:
            retried, snapshot = task_registry.create_retry(
                task_id,
                max_attempts=retry_limit,
            )
        except TaskNotFoundError as error:
            raise HTTPException(status_code=404, detail="Task not found") from error
        except RetryNotAllowedError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        enqueued = await enqueue_execution(
            retried,
            snapshot,
            task_registry,
            session_events,
            task_scheduler,
        )
        return task_response(enqueued, status_code=202)

    return app


async def enqueue_execution(
    task: TaskRecord,
    payload: CreateTaskRequest,
    registry: TaskRegistry,
    event_bus: SessionEventBus,
    scheduler: TaskScheduler,
) -> TaskRecord:
    async def record_enqueue(queue_item: QueueItem) -> None:
        enqueued = registry.mark_enqueued(
            task.task_id,
            enqueue_seq=queue_item.enqueue_seq,
            enqueued_at=queue_item.enqueued_at,
        )
        await publish_task_event(event_bus, EventType.TASK_QUEUED, enqueued)

    await scheduler.enqueue(task, payload, on_enqueued=record_enqueue)
    return registry.get(task.task_id)


async def execute_task(
    task: TaskRecord,
    payload: CreateTaskRequest,
    registry: TaskRegistry,
    router: TaskRouter,
    event_bus: SessionEventBus,
) -> None:
    running, started = registry.try_start(task.task_id)
    if not started:
        return
    started_at = time.perf_counter()
    semantic_card: SemanticCard | None = None
    response_latency_ms: int | None = None

    try:
        await publish_task_event(event_bus, EventType.TASK_STARTED, running)
        try:
            async with asyncio.timeout(task.timeout_limit_seconds):
                if payload.task_type is TaskType.SEMANTIC_STRUCTURE:
                    structure_started = time.perf_counter()
                    assert payload.prompt is not None
                    assert payload.response is not None
                    decision = await router.route(
                        task.task_id, affinity_key=task.top_branch_id
                    )
                    try:
                        routed = registry.mark_routed(
                            task.task_id,
                            affinity_key=decision.affinity_key,
                            affinity_worker=decision.affinity_worker,
                            worker_id=decision.selected_worker,
                            router_mode=decision.router_mode,
                            routing_decision_at=decision.routing_decision_at,
                            decision_reason=decision.decision_reason,
                            rerouted=decision.rerouted,
                            reroute_reason=decision.reroute_reason,
                        )
                        semantic_card = await router.structure(
                            decision, payload.prompt, payload.response
                        )
                        response_latency_ms = round(
                            (time.perf_counter() - structure_started) * 1000
                        )
                        result = semantic_card.model_dump_json()
                    finally:
                        await router.release(decision)
                else:
                    decision = await router.route(
                        task.task_id, affinity_key=task.top_branch_id
                    )
                    try:
                        routed = registry.mark_routed(
                            task.task_id,
                            affinity_key=decision.affinity_key,
                            affinity_worker=decision.affinity_worker,
                            worker_id=decision.selected_worker,
                            router_mode=decision.router_mode,
                            routing_decision_at=decision.routing_decision_at,
                            decision_reason=decision.decision_reason,
                            rerouted=decision.rerouted,
                            reroute_reason=decision.reroute_reason,
                        )
                        result = await execute_chat_router(
                            routed, payload, registry, router, decision, event_bus
                        )
                    finally:
                        await router.release(decision)
        except TimeoutError:
            elapsed_ms = elapsed_since(started_at)
            failed, changed = registry.try_fail(
                task.task_id,
                error=(
                    "Task exceeded server timeout "
                    f"of {task.timeout_limit_seconds:g} seconds"
                ),
                error_type=TaskErrorType.TIMEOUT,
                elapsed_ms=elapsed_ms,
            )
            if changed:
                await publish_terminal_reliably(
                    event_bus, EventType.TASK_FAILED, failed
                )
            return
        except RouterUnavailableError as error:
            elapsed_ms = elapsed_since(started_at)
            failed, changed = registry.try_fail(
                task.task_id,
                error=str(error),
                error_type=TaskErrorType.ROUTER_UNAVAILABLE,
                elapsed_ms=elapsed_ms,
            )
            if changed:
                await publish_terminal_reliably(
                    event_bus, EventType.TASK_FAILED, failed
                )
            return
        except Exception as error:
            elapsed_ms = elapsed_since(started_at)
            failed, changed = registry.try_fail(
                task.task_id,
                error=str(error),
                error_type=TaskErrorType.PROVIDER,
                elapsed_ms=elapsed_ms,
            )
            if changed:
                await publish_terminal_reliably(
                    event_bus, EventType.TASK_FAILED, failed
                )
            return

        completed, changed = registry.try_complete(
            task.task_id,
            result=result,
            response_latency_ms=response_latency_ms,
            elapsed_ms=elapsed_since(started_at),
        )
        if changed:
            terminal_data = (
                {"semanticCard": semantic_card.model_dump(mode="json")}
                if semantic_card is not None
                else None
            )
            await publish_terminal_reliably(
                event_bus,
                EventType.TASK_COMPLETED,
                completed,
                data=terminal_data,
            )
    except asyncio.CancelledError:
        cancelled, changed = registry.try_cancel(
            task.task_id,
            elapsed_ms=elapsed_since(started_at),
        )
        if changed:
            await publish_terminal_reliably(
                event_bus, EventType.TASK_CANCELLED, cancelled
            )
        raise


async def execute_chat_router(
    task: TaskRecord,
    payload: CreateTaskRequest,
    registry: TaskRegistry,
    router: TaskRouter,
    decision: RoutingDecision,
    event_bus: SessionEventBus,
) -> str:
    result_chunks: list[str] = []
    assert payload.messages is not None
    async for item in router.stream_chat(decision, payload.messages):
        if isinstance(item, ProviderTelemetry):
            registry.record_provider_telemetry(
                task.task_id,
                provider_request_id=item.provider_request_id,
                input_tokens=item.input_tokens,
                output_tokens=item.output_tokens,
                prompt_cache_hit_tokens=item.prompt_cache_hit_tokens,
                prompt_cache_miss_tokens=item.prompt_cache_miss_tokens,
                provider_ttft_ms=item.provider_ttft_ms,
            )
            continue
        content = item
        if not content:
            continue
        current = registry.get(task.task_id)
        if current.first_token_at is None:
            registry.mark_first_token(task.task_id)
        result_chunks.append(content)
        await event_bus.publish(
            session_id=task.session_id,
            task_id=task.task_id,
            node_id=task.node_id,
            event_type=EventType.TOKEN_DELTA,
            data={"delta": content},
        )
    return "".join(result_chunks)


async def publish_terminal_reliably(
    event_bus: SessionEventBus,
    event_type: EventType,
    task: TaskRecord,
    *,
    data: dict[str, object] | None = None,
) -> None:
    publish_handle = asyncio.create_task(
        publish_task_event(event_bus, event_type, task, data=data)
    )
    try:
        await asyncio.shield(publish_handle)
    except asyncio.CancelledError:
        await publish_handle
        raise


async def publish_task_event(
    event_bus: SessionEventBus,
    event_type: EventType,
    task: TaskRecord,
    *,
    data: dict[str, object] | None = None,
) -> None:
    event_data = {"task": task.model_dump(mode="json")}
    if data:
        event_data.update(data)
    await event_bus.publish(
        session_id=task.session_id,
        task_id=task.task_id,
        node_id=task.node_id,
        event_type=event_type,
        data=event_data,
    )


def task_response(task: TaskRecord, *, status_code: int = 200) -> JSONResponse:
    response = CreateTaskResponse(task=task)
    return JSONResponse(
        status_code=status_code,
        content=response.model_dump(mode="json"),
        headers={"X-Task-Id": task.task_id},
    )


def elapsed_since(started_at: float) -> int:
    return max(0, round((time.perf_counter() - started_at) * 1000))


def resolve_positive_float(
    override: float | None,
    environment_name: str,
    default: float,
) -> float:
    raw = override if override is not None else os.getenv(environment_name, str(default))
    try:
        value = float(raw)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{environment_name} must be a number") from error
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f"{environment_name} must be a positive finite number")
    return value


def resolve_positive_int(
    override: int | None,
    environment_name: str,
    default: int,
) -> int:
    raw = override if override is not None else os.getenv(environment_name, str(default))
    try:
        value = int(raw)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{environment_name} must be an integer") from error
    if value < 1:
        raise ValueError(f"{environment_name} must be at least 1")
    return value


def resolve_scheduler_mode(
    override: SchedulerMode | str | None,
) -> SchedulerMode:
    raw = override if override is not None else os.getenv(
        "TREECHAT_SCHEDULER_MODE", DEFAULT_SCHEDULER_MODE.value
    )
    if isinstance(raw, SchedulerMode):
        return raw
    try:
        return SchedulerMode(str(raw).strip().lower())
    except ValueError as error:
        raise ValueError("TREECHAT_SCHEDULER_MODE must be 'fcfs' or 'priority'") from error


def create_configured_app(
    mode: ProviderMode | str | None = None,
) -> FastAPI:
    provider_mode = resolve_provider_mode(mode)
    if provider_mode is ProviderMode.MOCK:
        return create_app(provider_mode=provider_mode)
    if provider_mode is ProviderMode.DEEPSEEK:
        return create_app(
            provider=DeepSeekProvider(),
            provider_mode=provider_mode,
            provider_worker_id="deepseek-commercial",
        )
    return create_app(
        provider=VLLMProvider(),
        provider_mode=provider_mode,
        provider_worker_id="vllm-single-worker",
    )


app = create_configured_app()
