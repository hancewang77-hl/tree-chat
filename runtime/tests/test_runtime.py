from __future__ import annotations

import asyncio
import json
import threading
import time
from collections.abc import AsyncIterator

import pytest
from fastapi.testclient import TestClient

from runtime.app.main import create_app
from runtime.app.models import (
    ChatMessage,
    CreateTaskRequest,
    ProviderTelemetry,
    RouterMode,
    SemanticCard,
    TaskPriority,
    TaskState,
    TaskType,
)
from runtime.app.task_registry import InvalidTaskTransitionError, TaskRegistry


class SequenceClock:
    def __init__(self, *values: int) -> None:
        self._values = iter(values)

    def __call__(self) -> int:
        return next(self._values)


class MockProvider:
    def __init__(
        self,
        *,
        chunks: tuple[str, ...] = ("Tree", "Chat"),
        chat_error: Exception | None = None,
        structure_error: Exception | None = None,
    ) -> None:
        self.chunks = chunks
        self.chat_error = chat_error
        self.structure_error = structure_error
        self.received_messages: list[ChatMessage] | None = None

    async def stream_chat(self, messages: list[ChatMessage]) -> AsyncIterator[str]:
        self.received_messages = messages
        if self.chat_error:
            raise self.chat_error
        for chunk in self.chunks:
            yield chunk

    async def structure(self, prompt: str, response: str) -> SemanticCard:
        if self.structure_error:
            raise self.structure_error
        return SemanticCard(
            generatedAt=1_000,
            model="deepseek-chat",
            facts=[f"{prompt}:{response}"],
            constraints=[],
            assumptions=[],
            decisions=[],
            rejected=[],
            openQuestions=[],
        )


class BlockingProvider(MockProvider):
    def __init__(self) -> None:
        super().__init__(chunks=())
        self.entered = threading.Event()
        self.release = threading.Event()

    async def stream_chat(self, messages: list[ChatMessage]) -> AsyncIterator[str]:
        self.received_messages = messages
        self.entered.set()
        released = await asyncio.to_thread(self.release.wait, 5)
        if not released:
            raise RuntimeError("controlled provider delay timed out")
        yield "released"


class TelemetryProvider(MockProvider):
    async def stream_chat(
        self, messages: list[ChatMessage]
    ) -> AsyncIterator[str | ProviderTelemetry]:
        self.received_messages = messages
        yield "measured"
        yield ProviderTelemetry(
            provider_request_id="provider-request-1",
            input_tokens=12,
            output_tokens=3,
            prompt_cache_hit_tokens=8,
            prompt_cache_miss_tokens=4,
            provider_ttft_ms=7,
        )


def chat_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "session_id": "session-1",
        "node_id": "node-b",
        "task_type": "chat_generation",
        "priority": 0,
        "messages": [{"role": "user", "content": "hello"}],
    }
    payload.update(overrides)
    return payload


def structure_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "session_id": "session-1",
        "node_id": "node-b",
        "task_type": "semantic_structure",
        "priority": 2,
        "prompt": "question",
        "response": "answer",
    }
    payload.update(overrides)
    return payload


def test_health_task_create_get_and_session_list() -> None:
    registry = TaskRegistry()
    client = TestClient(create_app(registry=registry, provider=MockProvider()))

    assert client.get("/health").json() == {"status": "ok"}
    response = client.post("/v1/tasks", json=chat_payload())
    task_id = response.headers["X-Task-Id"]

    task = client.get(f"/v1/tasks/{task_id}").json()
    assert task["task_id"] == task_id
    assert task["state"] == "completed"
    assert task["session_id"] == "session-1"
    assert client.get("/v1/sessions/session-1/tasks").json() == [task]


def test_provider_telemetry_is_persisted_on_completed_task() -> None:
    registry = TaskRegistry()
    client = TestClient(create_app(registry=registry, provider=TelemetryProvider()))

    response = client.post("/v1/tasks", json=chat_payload())
    task = client.get(f"/v1/tasks/{response.headers['X-Task-Id']}").json()

    assert task["state"] == "completed"
    assert task["provider_request_id"] == "provider-request-1"
    assert task["input_tokens"] == 12
    assert task["output_tokens"] == 3
    assert task["prompt_cache_hit_tokens"] == 8
    assert task["prompt_cache_miss_tokens"] == 4
    assert task["provider_ttft_ms"] == 7


def test_server_task_survives_discarded_client_object() -> None:
    registry = TaskRegistry()
    client = TestClient(create_app(registry=registry, provider=MockProvider()))
    response = client.post("/v1/tasks", json=chat_payload())
    task_id = response.headers["X-Task-Id"]
    client_object = response
    del client_object

    assert client.get(f"/v1/tasks/{task_id}").json()["task_id"] == task_id


def test_client_cannot_supply_authoritative_task_id() -> None:
    registry = TaskRegistry()
    client = TestClient(create_app(registry=registry, provider=MockProvider()))

    response = client.post(
        "/v1/tasks",
        json=chat_payload(task_id="client-controlled-id"),
    )

    assert response.status_code == 422
    assert registry.list_by_session("session-1") == []


def test_server_generates_10_000_unique_task_ids() -> None:
    registry = TaskRegistry()
    ids = {
        registry.create(
            CreateTaskRequest.model_validate(chat_payload(node_id=f"node-{index}"))
        ).task_id
        for index in range(10_000)
    }
    assert len(ids) == 10_000


def test_illegal_terminal_transition_is_rejected() -> None:
    registry = TaskRegistry(clock=SequenceClock(100, 110, 120, 130))
    task = registry.create(CreateTaskRequest.model_validate(chat_payload()))
    registry.transition(task.task_id, TaskState.RUNNING)
    registry.transition(task.task_id, TaskState.COMPLETED)

    with pytest.raises(InvalidTaskTransitionError):
        registry.transition(task.task_id, TaskState.RUNNING)


def test_chat_lifecycle_and_first_non_empty_token_timestamp() -> None:
    registry = TaskRegistry(
        clock=SequenceClock(1_000, 1_100, 1_200, 1_300, 1_400, 1_500)
    )
    provider = MockProvider(chunks=("", "first", "second"))
    client = TestClient(create_app(registry=registry, provider=provider))

    response = client.post("/v1/tasks", json=chat_payload())
    task = registry.get(response.headers["X-Task-Id"])

    assert response.status_code == 202
    assert response.json()["task"]["state"] == "queued"
    assert task.state is TaskState.COMPLETED
    assert task.created_at == 1_000
    assert task.enqueued_at == 1_100
    assert task.enqueue_seq == 1
    assert task.started_at == 1_200
    assert task.routing_decision_at == 1_300
    assert task.worker_id == "in-process-test-worker"
    assert task.router_mode is RouterMode.ROUND_ROBIN
    assert task.first_token_at == 1_400
    assert task.finished_at == 1_500
    assert task.error is None
    assert task.result == "firstsecond"


def test_chat_without_content_keeps_first_token_null() -> None:
    registry = TaskRegistry(
        clock=SequenceClock(1_000, 1_100, 1_200, 1_300, 1_400)
    )
    client = TestClient(
        create_app(registry=registry, provider=MockProvider(chunks=("",)))
    )

    response = client.post("/v1/tasks", json=chat_payload())
    task = registry.get(response.headers["X-Task-Id"])

    assert task.state is TaskState.COMPLETED
    assert task.first_token_at is None
    assert task.result == ""


def test_provider_failure_moves_running_task_to_failed() -> None:
    registry = TaskRegistry(
        clock=SequenceClock(1_000, 1_100, 1_200, 1_300, 1_400)
    )
    provider = MockProvider(chat_error=RuntimeError("controlled failure"))
    client = TestClient(
        create_app(registry=registry, provider=provider),
        raise_server_exceptions=False,
    )

    client.post("/v1/tasks", json=chat_payload())
    task = registry.list_by_session("session-1")[0]

    assert task.state is TaskState.FAILED
    assert task.error == "controlled failure"
    assert task.first_token_at is None
    assert task.result is None


def test_semantic_structure_uses_server_lifecycle_without_ttft() -> None:
    registry = TaskRegistry(
        clock=SequenceClock(1_000, 1_100, 1_200, 1_300, 1_400)
    )
    client = TestClient(create_app(registry=registry, provider=MockProvider()))

    response = client.post("/v1/tasks", json=structure_payload())
    body = response.json()
    task = registry.get(body["task"]["task_id"])

    assert response.status_code == 202
    assert body["task"]["state"] == "queued"
    assert task.state is TaskState.COMPLETED
    assert task.first_token_at is None
    assert task.response_latency_ms is not None
    assert task.result is not None
    assert json.loads(task.result)["facts"] == ["question:answer"]


def test_semantic_structure_failure_is_authoritatively_failed() -> None:
    registry = TaskRegistry(
        clock=SequenceClock(1_000, 1_100, 1_200, 1_300, 1_400)
    )
    provider = MockProvider(structure_error=RuntimeError("structure failed"))
    client = TestClient(create_app(registry=registry, provider=provider))

    response = client.post("/v1/tasks", json=structure_payload())

    assert response.status_code == 202
    assert response.json()["task"]["state"] == "queued"
    assert registry.list_by_session("session-1")[0].state is TaskState.FAILED


def test_branch_local_messages_arrive_unchanged_at_provider() -> None:
    provider = MockProvider(chunks=("ok",))
    client = TestClient(create_app(provider=provider))
    messages = [
        {"role": "system", "content": "ROOT_CONTEXT_001"},
        {"role": "user", "content": "BETA_294"},
    ]

    client.post("/v1/tasks", json=chat_payload(messages=messages))
    received = "\n".join(message.content for message in provider.received_messages or [])

    assert "ROOT_CONTEXT_001" in received
    assert "BETA_294" in received
    assert "ALPHA_731" not in received


def test_client_mirror_cannot_change_running_server_task() -> None:
    registry = TaskRegistry()
    provider = BlockingProvider()
    app = create_app(registry=registry, provider=provider)
    with TestClient(app) as client:
        response = client.post("/v1/tasks", json=chat_payload())
        assert response.status_code == 202
        assert provider.entered.wait(2)
        server_task = registry.list_by_session("session-1")[0]
        assert server_task.state is TaskState.RUNNING

        client_mirror = server_task.model_dump(mode="json")
        client_mirror["state"] = "completed"
        authoritative = client.get(f"/v1/tasks/{server_task.task_id}").json()

        assert client_mirror["state"] == "completed"
        assert authoritative["state"] == "running"
        provider.release.set()
        for _ in range(100):
            if registry.get(server_task.task_id).state is TaskState.COMPLETED:
                break
            time.sleep(0.01)
        assert registry.get(server_task.task_id).state is TaskState.COMPLETED


def test_priority_convention_is_frozen_and_metadata_only() -> None:
    assert TaskPriority.FOREGROUND_INTERACTIVE == 0
    assert TaskPriority.USER_PARALLEL == 1
    assert TaskPriority.BACKGROUND == 2
    assert TaskType.CHAT_GENERATION.value == "chat_generation"
