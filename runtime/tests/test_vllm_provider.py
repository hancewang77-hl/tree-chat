from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

import httpx
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.testclient import TestClient

from runtime.app.main import create_app, create_configured_app
from runtime.app.models import (
    ChatMessage,
    GenerationProfile,
    ProviderTelemetry,
    RouterMode,
)
from runtime.app.provider import (
    DeepSeekProvider,
    ProviderMode,
    VLLMProvider,
    resolve_provider_mode,
)
from runtime.app.router import HttpTaskRouter, RoutingDecision, WorkerEndpoint


def make_openai_compatible_app(received: list[dict[str, object]]) -> FastAPI:
    app = FastAPI()

    @app.post("/v1/chat/completions")
    async def chat(request: Request):
        payload = await request.json()
        received.append(
            {
                "payload": payload,
                "authorization": request.headers.get("authorization"),
            }
        )
        if payload.get("stream"):

            async def chunks() -> AsyncIterator[str]:
                yield 'data: {"id":"request-1","choices": []}\n\n'
                yield 'data: {"id":"request-1","choices":[{"delta":{"content":"real"}}]}\n\n'
                yield 'data: {"id":"request-1","choices":[{"delta":{"content":" vLLM"}}]}\n\n'
                yield (
                    'data: {"id":"request-1","choices":[],"usage":'
                    '{"prompt_tokens":12,"completion_tokens":2,'
                    '"prompt_cache_hit_tokens":8,"prompt_cache_miss_tokens":4}}\n\n'
                )
                yield "data: [DONE]\n\n"

            return StreamingResponse(chunks(), media_type="text/event-stream")
        return JSONResponse(
            {
                "model": payload["model"],
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "facts": ["真实结构化结果"],
                                    "constraints": [],
                                    "assumptions": [],
                                    "decisions": [],
                                    "rejected": [],
                                    "openQuestions": [],
                                },
                                ensure_ascii=False,
                            )
                        }
                    }
                ],
            }
        )

    return app


def test_vllm_provider_streams_openai_compatible_chunks() -> None:
    async def scenario() -> None:
        received: list[dict[str, object]] = []
        transport = httpx.ASGITransport(app=make_openai_compatible_app(received))
        async with httpx.AsyncClient(
            transport=transport, base_url="http://vllm"
        ) as client:
            provider = VLLMProvider(
                base_url="http://vllm/v1",
                api_key="local-token",
                model="served-small-model",
                chat_max_tokens=64,
                client=client,
            )
            chunks = [
                chunk
                async for chunk in provider.stream_chat(
                    [ChatMessage(role="user", content="hello")]
                )
            ]

        assert chunks[:2] == ["real", " vLLM"]
        assert isinstance(chunks[2], ProviderTelemetry)
        assert chunks[2].provider_request_id == "request-1"
        assert chunks[2].input_tokens == 12
        assert chunks[2].output_tokens == 2
        assert chunks[2].prompt_cache_hit_tokens == 8
        assert chunks[2].prompt_cache_miss_tokens == 4
        assert chunks[2].provider_ttft_ms == pytest.approx(0, abs=1_000)
        assert received[0]["payload"] == {
            "model": "served-small-model",
            "messages": [{"role": "user", "content": "hello"}],
            "stream": True,
            "stream_options": {"include_usage": True},
            "max_tokens": 64,
        }
        assert received[0]["authorization"] == "Bearer local-token"

    asyncio.run(scenario())


def test_deepseek_provider_applies_model_limit_and_non_thinking_overrides(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TREECHAT_DEEPSEEK_MODEL", "deepseek-v4-flash")
    monkeypatch.setenv("TREECHAT_DEEPSEEK_MAX_TOKENS", "96")

    async def scenario() -> None:
        received: list[dict[str, object]] = []
        transport = httpx.ASGITransport(app=make_openai_compatible_app(received))
        async with httpx.AsyncClient(
            transport=transport, base_url="http://deepseek"
        ) as client:
            provider = DeepSeekProvider(
                base_url="http://deepseek/v1", api_key="local-test-key", client=client
            )
            _ = [
                item
                async for item in provider.stream_chat(
                    [ChatMessage(role="user", content="hello")]
                )
            ]

        assert received[0]["payload"] == {
            "model": "deepseek-v4-flash",
            "messages": [{"role": "user", "content": "hello"}],
            "stream": True,
            "stream_options": {"include_usage": True},
            "max_tokens": 96,
            "thinking": {"type": "disabled"},
        }

    asyncio.run(scenario())


def test_deepseek_provider_uses_server_approved_auxo_json_profile() -> None:
    async def scenario() -> None:
        received: list[dict[str, object]] = []
        transport = httpx.ASGITransport(app=make_openai_compatible_app(received))
        async with httpx.AsyncClient(
            transport=transport, base_url="http://deepseek"
        ) as client:
            provider = DeepSeekProvider(
                base_url="http://deepseek/v1",
                api_key="local-test-key",
                model="deepseek-chat",
                chat_max_tokens=64,
                auxo_max_tokens=8_000,
                client=client,
            )
            _ = [
                item
                async for item in provider.stream_chat(
                    [ChatMessage(role="user", content="return JSON")],
                    GenerationProfile.AUXO_PLAN,
                )
            ]

        assert received[0]["payload"] == {
            "model": "deepseek-chat",
            "messages": [{"role": "user", "content": "return JSON"}],
            "stream": True,
            "stream_options": {"include_usage": True},
            "max_tokens": 8_000,
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
            "thinking": {"type": "disabled"},
        }

    asyncio.run(scenario())


def test_http_router_forwards_worker_telemetry() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/chat"
        assert json.loads(request.content)["generation_profile"] == "interactive_chat"
        return httpx.Response(
            200,
            headers={"X-Worker-Id": "worker-1"},
            content=(
                b'{"worker_id":"worker-1","delta":"answer"}\n'
                b'{"worker_id":"worker-1","telemetry":'
                b'{"provider_request_id":"request-1","input_tokens":12,'
                b'"output_tokens":2,"provider_ttft_ms":8}}\n'
            ),
        )

    async def scenario() -> None:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            router = HttpTaskRouter(
                endpoints=[WorkerEndpoint("worker-1", "http://worker.test")],
                mode=RouterMode.ROUND_ROBIN,
                clock=lambda: 1,
                client=client,
            )
            decision = RoutingDecision(
                task_id="task-1",
                affinity_key=None,
                candidate_workers=("worker-1",),
                selected_worker="worker-1",
                router_mode=RouterMode.ROUND_ROBIN,
                routing_decision_at=1,
                decision_reason="test",
                load_snapshot={},
                affinity_worker=None,
                rerouted=False,
                reroute_reason=None,
            )
            items = [
                item
                async for item in router.stream_chat(
                    decision, [ChatMessage(role="user", content="hello")]
                )
            ]

        assert items == [
            "answer",
            ProviderTelemetry(
                provider_request_id="request-1",
                input_tokens=12,
                output_tokens=2,
                provider_ttft_ms=8,
            ),
        ]

    asyncio.run(scenario())


def test_vllm_provider_structures_with_same_real_endpoint() -> None:
    async def scenario() -> None:
        received: list[dict[str, object]] = []
        transport = httpx.ASGITransport(app=make_openai_compatible_app(received))
        async with httpx.AsyncClient(
            transport=transport, base_url="http://vllm"
        ) as client:
            provider = VLLMProvider(
                base_url="http://vllm/v1",
                model="served-small-model",
                client=client,
            )
            card = await provider.structure("问题", "回答")

        assert card.model == "served-small-model"
        assert card.facts == ["真实结构化结果"]
        assert received[0]["payload"]["response_format"] == {
            "type": "json_object"
        }
        assert received[0]["authorization"] is None

    asyncio.run(scenario())


def test_provider_modes_preserve_mock_deepseek_and_vllm(monkeypatch) -> None:
    assert resolve_provider_mode("mock") is ProviderMode.MOCK
    assert resolve_provider_mode("deepseek") is ProviderMode.DEEPSEEK
    assert resolve_provider_mode("vllm") is ProviderMode.VLLM
    with pytest.raises(ValueError, match="mock.*deepseek.*vllm"):
        resolve_provider_mode("unknown")

    monkeypatch.setenv("TREECHAT_VLLM_MODEL", "served-small-model")
    mock_app = create_configured_app("mock")
    deepseek_app = create_configured_app("deepseek")
    vllm_app = create_configured_app("vllm")

    assert mock_app.state.provider_mode == "mock"
    assert mock_app.state.task_provider is None
    assert deepseek_app.state.provider_mode == "deepseek"
    assert isinstance(deepseek_app.state.task_provider, DeepSeekProvider)
    assert vllm_app.state.provider_mode == "vllm"
    assert isinstance(vllm_app.state.task_provider, VLLMProvider)
    assert vllm_app.state.task_provider.model == "served-small-model"


def test_vllm_single_worker_provenance_reaches_task_record() -> None:
    received: list[dict[str, object]] = []
    transport = httpx.ASGITransport(app=make_openai_compatible_app(received))
    upstream_client = httpx.AsyncClient(
        transport=transport, base_url="http://vllm"
    )
    provider = VLLMProvider(
        base_url="http://vllm/v1",
        model="served-small-model",
        client=upstream_client,
    )
    try:
        client = TestClient(
            create_app(
                provider=provider,
                provider_mode=ProviderMode.VLLM,
                provider_worker_id="vllm-single-worker",
            )
        )
        with client:
            response = client.post(
                "/v1/tasks",
                json={
                    "session_id": "vllm-contract",
                    "node_id": "node-a",
                    "task_type": "chat_generation",
                    "priority": 0,
                    "messages": [{"role": "user", "content": "hello"}],
                },
            )
            task_id = response.headers["X-Task-Id"]
            task = client.get(f"/v1/tasks/{task_id}").json()
        assert task["state"] == "completed"
        assert task["result"] == "real vLLM"
        assert task["worker_id"] == "vllm-single-worker"
        assert task["decision_reason"] == "in_process_test_adapter"
    finally:
        asyncio.run(upstream_client.aclose())
