from __future__ import annotations

import asyncio
import threading
import time
from collections.abc import AsyncIterator

import httpx
from fastapi.testclient import TestClient

from runtime.app.event_bus import EventType, SessionEventBus
from runtime.app.main import create_app
from runtime.app.models import ChatMessage, SemanticCard, TaskState
from runtime.app.task_registry import TaskRegistry


TERMINAL_STATES = {"completed", "failed", "cancelled"}


class GateProvider:
    def __init__(self, keys: list[str]) -> None:
        self.releases = {key: asyncio.Event() for key in keys}
        self.started = {key: asyncio.Event() for key in keys}
        self.start_order: list[str] = []
        self.active = 0
        self.max_active = 0

    async def stream_chat(
        self, messages: list[ChatMessage]
    ) -> AsyncIterator[str]:
        key = messages[-1].content
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        self.start_order.append(key)
        self.started[key].set()
        try:
            await self.releases[key].wait()
            yield key
        finally:
            self.active -= 1

    async def structure(self, prompt: str, response: str) -> SemanticCard:
        raise AssertionError("Scheduler tests do not submit structure tasks")


class RetryProvider:
    def __init__(self) -> None:
        self.calls: dict[str, int] = {}
        self.block_started = asyncio.Event()
        self.release_block = asyncio.Event()

    async def stream_chat(
        self, messages: list[ChatMessage]
    ) -> AsyncIterator[str]:
        key = messages[-1].content
        self.calls[key] = self.calls.get(key, 0) + 1
        if key == "RETRY" and self.calls[key] == 1:
            raise RuntimeError("controlled first-attempt failure")
        if key == "BLOCK":
            self.block_started.set()
            await self.release_block.wait()
        yield f"{key}-ok"

    async def structure(self, prompt: str, response: str) -> SemanticCard:
        raise AssertionError("Scheduler tests do not submit structure tasks")


class TimeoutProvider:
    async def stream_chat(
        self, messages: list[ChatMessage]
    ) -> AsyncIterator[str]:
        key = messages[-1].content
        if key == "TIMEOUT-BLOCK":
            await asyncio.sleep(1)
        else:
            await asyncio.sleep(0.03)
        yield key

    async def structure(self, prompt: str, response: str) -> SemanticCard:
        raise AssertionError("Scheduler tests do not submit structure tasks")


class ShutdownProvider:
    def __init__(self) -> None:
        self.started = threading.Event()

    async def stream_chat(
        self, messages: list[ChatMessage]
    ) -> AsyncIterator[str]:
        self.started.set()
        await asyncio.Event().wait()
        yield "unreachable"

    async def structure(self, prompt: str, response: str) -> SemanticCard:
        raise AssertionError("Scheduler tests do not submit structure tasks")


def payload(key: str, *, priority: int) -> dict[str, object]:
    return {
        "session_id": "qos-session",
        "node_id": f"node-{key}",
        "task_type": "chat_generation",
        "priority": priority,
        "messages": [{"role": "user", "content": key}],
    }


async def submit(
    client: httpx.AsyncClient, key: str, *, priority: int
) -> str:
    response = await client.post("/v1/tasks", json=payload(key, priority=priority))
    response.raise_for_status()
    return response.json()["task"]["task_id"]


async def wait_terminal(client: httpx.AsyncClient, task_id: str) -> dict[str, object]:
    deadline = time.perf_counter() + 3
    while time.perf_counter() < deadline:
        response = await client.get(f"/v1/tasks/{task_id}")
        task = response.json()
        if task["state"] in TERMINAL_STATES:
            return task
        await asyncio.sleep(0.002)
    raise TimeoutError(f"Task did not finish: {task_id}")


async def wait_scheduler_idle(app) -> None:
    deadline = time.perf_counter() + 3
    while time.perf_counter() < deadline:
        if (
            app.state.task_scheduler.running_count == 0
            and app.state.task_scheduler.queued_count == 0
        ):
            return
        await asyncio.sleep(0.002)
    raise TimeoutError("Scheduler did not become idle")


def test_same_priority_is_fifo_and_concurrency_is_bounded() -> None:
    async def exercise() -> None:
        provider = GateProvider(["A", "B", "C"])
        app = create_app(
            provider=provider, max_concurrency=1, scheduler_mode="priority"
        )
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://runtime.test"
        ) as client:
            task_a = await submit(client, "A", priority=1)
            await asyncio.wait_for(provider.started["A"].wait(), 1)
            task_b = await submit(client, "B", priority=1)
            task_c = await submit(client, "C", priority=1)

            assert app.state.task_scheduler.queued_task_ids() == (task_b, task_c)
            provider.releases["A"].set()
            await asyncio.wait_for(provider.started["B"].wait(), 1)
            provider.releases["B"].set()
            await asyncio.wait_for(provider.started["C"].wait(), 1)
            provider.releases["C"].set()
            await asyncio.gather(
                *(wait_terminal(client, task_id) for task_id in [task_a, task_b, task_c])
            )
            await wait_scheduler_idle(app)

        tasks = [app.state.task_registry.get(task_id) for task_id in [task_a, task_b, task_c]]
        assert provider.start_order == ["A", "B", "C"]
        assert provider.max_active == 1
        assert [task.enqueue_seq for task in tasks] == [1, 2, 3]
        assert all(task.enqueued_at is not None for task in tasks)

    asyncio.run(exercise())


def test_priority_overtakes_waiting_background_without_preemption() -> None:
    async def exercise() -> None:
        keys = [*(f"BG-{index}" for index in range(8)), "FG"]
        provider = GateProvider(keys)
        app = create_app(
            provider=provider, max_concurrency=2, scheduler_mode="priority"
        )
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://runtime.test"
        ) as client:
            task_ids = [await submit(client, key, priority=2) for key in keys[:8]]
            await asyncio.gather(
                provider.started["BG-0"].wait(), provider.started["BG-1"].wait()
            )
            await asyncio.sleep(0.5)
            foreground_id = await submit(client, "FG", priority=0)

            running_before_release = [
                app.state.task_registry.get(task_id).state for task_id in task_ids[:2]
            ]
            provider.releases["BG-0"].set()
            await asyncio.wait_for(provider.started["FG"].wait(), 1)

            assert running_before_release == [TaskState.RUNNING, TaskState.RUNNING]
            assert app.state.task_registry.get(task_ids[1]).state is TaskState.RUNNING
            assert provider.start_order[:3] == ["BG-0", "BG-1", "FG"]

            for release in provider.releases.values():
                release.set()
            await asyncio.gather(
                *(wait_terminal(client, task_id) for task_id in [*task_ids, foreground_id])
            )
            await wait_scheduler_idle(app)
            assert provider.max_active == 2

    asyncio.run(exercise())


def test_fcfs_mode_ignores_priority_but_keeps_arrival_order() -> None:
    async def exercise() -> None:
        provider = GateProvider(["A", "B", "FG"])
        app = create_app(provider=provider, max_concurrency=1, scheduler_mode="fcfs")
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://runtime.test"
        ) as client:
            ids = [
                await submit(client, "A", priority=2),
                await submit(client, "B", priority=2),
                await submit(client, "FG", priority=0),
            ]
            await asyncio.wait_for(provider.started["A"].wait(), 1)
            provider.releases["A"].set()
            await asyncio.wait_for(provider.started["B"].wait(), 1)
            provider.releases["B"].set()
            await asyncio.wait_for(provider.started["FG"].wait(), 1)
            provider.releases["FG"].set()
            await asyncio.gather(*(wait_terminal(client, task_id) for task_id in ids))
            await wait_scheduler_idle(app)
        assert provider.start_order == ["A", "B", "FG"]

    asyncio.run(exercise())


def test_queued_cancel_never_reaches_provider_and_sse_stays_ordered() -> None:
    async def exercise() -> None:
        provider = GateProvider(["RUNNING", "CANCEL-ME"])
        registry = TaskRegistry()
        bus = SessionEventBus()
        app = create_app(
            registry=registry,
            provider=provider,
            event_bus=bus,
            max_concurrency=1,
        )
        subscriber = await bus.subscribe("qos-session")
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://runtime.test"
        ) as client:
            running_id = await submit(client, "RUNNING", priority=0)
            await asyncio.wait_for(provider.started["RUNNING"].wait(), 1)
            cancelled_id = await submit(client, "CANCEL-ME", priority=2)
            cancel_response = await client.post(
                f"/v1/tasks/{cancelled_id}/cancel"
            )
            assert cancel_response.json()["task"]["state"] == "cancelled"
            provider.releases["RUNNING"].set()
            await wait_terminal(client, running_id)
            await wait_scheduler_idle(app)

        cancelled_events = []
        while not subscriber.queue.empty():
            event = subscriber.queue.get_nowait()
            if event.task_id == cancelled_id:
                cancelled_events.append(event.event_type)
        await bus.unsubscribe("qos-session", subscriber)
        assert "CANCEL-ME" not in provider.start_order
        assert cancelled_events == [EventType.TASK_QUEUED, EventType.TASK_CANCELLED]

    asyncio.run(exercise())


def test_retry_reenters_queue_and_timeout_starts_only_when_running() -> None:
    async def retry_exercise() -> None:
        provider = RetryProvider()
        app = create_app(provider=provider, max_concurrency=1)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://runtime.test"
        ) as client:
            original_id = await submit(client, "RETRY", priority=0)
            original = await wait_terminal(client, original_id)
            assert original["state"] == "failed"

            block_id = await submit(client, "BLOCK", priority=0)
            await asyncio.wait_for(provider.block_started.wait(), 1)
            retry_response = await client.post(f"/v1/tasks/{original_id}/retry")
            retry_task = retry_response.json()["task"]
            assert retry_task["state"] == "queued"
            assert retry_task["retry_of_task_id"] == original_id
            assert provider.calls["RETRY"] == 1

            provider.release_block.set()
            retried = await wait_terminal(client, retry_task["task_id"])
            await wait_terminal(client, block_id)
            await wait_scheduler_idle(app)
            assert retried["state"] == "completed"
            assert provider.calls["RETRY"] == 2

    async def timeout_exercise() -> None:
        app = create_app(
            provider=TimeoutProvider(),
            max_concurrency=1,
            task_timeout_seconds=0.05,
        )
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://runtime.test"
        ) as client:
            blocker_id = await submit(client, "TIMEOUT-BLOCK", priority=0)
            queued_id = await submit(client, "FAST", priority=0)
            blocker, queued = await asyncio.gather(
                wait_terminal(client, blocker_id), wait_terminal(client, queued_id)
            )
            await wait_scheduler_idle(app)

        assert blocker["state"] == "failed"
        assert blocker["error_type"] == "timeout"
        assert queued["state"] == "completed"
        assert queued["started_at"] - queued["enqueued_at"] >= 40
        assert queued["elapsed_ms"] < 50

    asyncio.run(retry_exercise())
    asyncio.run(timeout_exercise())


def test_app_shutdown_cleans_running_and_queued_tasks() -> None:
    registry = TaskRegistry()
    provider = ShutdownProvider()
    app = create_app(registry=registry, provider=provider, max_concurrency=1)

    with TestClient(app) as client:
        running_response = client.post(
            "/v1/tasks", json=payload("SHUTDOWN-RUNNING", priority=0)
        )
        assert provider.started.wait(1)
        queued_response = client.post(
            "/v1/tasks", json=payload("SHUTDOWN-QUEUED", priority=2)
        )
        running_id = running_response.json()["task"]["task_id"]
        queued_id = queued_response.json()["task"]["task_id"]
        assert registry.get(running_id).state is TaskState.RUNNING
        assert registry.get(queued_id).state is TaskState.QUEUED

    assert registry.get(running_id).state is TaskState.CANCELLED
    assert registry.get(queued_id).state is TaskState.CANCELLED
    assert app.state.execution_registry.active_count == 0
    assert app.state.task_scheduler.running_count == 0
    assert app.state.task_scheduler.queued_count == 0
