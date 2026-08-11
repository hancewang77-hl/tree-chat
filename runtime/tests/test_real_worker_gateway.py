from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

import httpx
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse

from runtime.real_worker.app import RealWorkerConfig, create_real_worker_app


def fake_vllm(received: list[dict[str, object]]) -> FastAPI:
    app = FastAPI()

    @app.get("/health")
    async def health() -> PlainTextResponse:
        return PlainTextResponse("")

    @app.get("/version")
    async def version() -> dict[str, str]:
        return {"version": "0.26.0"}

    @app.get("/v1/models")
    async def models() -> dict[str, object]:
        return {"data": [{"id": "served-small-model"}]}

    @app.get("/metrics")
    async def metrics() -> PlainTextResponse:
        return PlainTextResponse(
            "vllm:prefix_cache_queries_total 100\n"
            "vllm:prefix_cache_hits_total 75\n"
        )

    @app.post("/reset_prefix_cache")
    async def reset_prefix_cache() -> dict[str, bool]:
        return {"success": True}

    @app.post("/v1/chat/completions")
    async def chat(request: Request):
        payload = await request.json()
        received.append(payload)
        if payload.get("stream"):

            async def chunks() -> AsyncIterator[str]:
                yield 'data: {"id":"request-1","choices":[]}\n\n'
                yield (
                    'data: {"id":"request-1","choices":'
                    '[{"delta":{"content":"real"}}]}\n\n'
                )
                yield (
                    'data: {"id":"request-1","choices":[],"usage":'
                    '{"prompt_tokens":12,"completion_tokens":2}}\n\n'
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


def config() -> RealWorkerConfig:
    return RealWorkerConfig(
        worker_id="worker-1",
        vllm_base_url="http://vllm/v1",
        model="served-small-model",
        max_concurrency=2,
        max_tokens=16,
        temperature=0,
        top_p=1,
        seed=20260809,
    )


def test_real_worker_streams_identity_and_records_real_timing() -> None:
    async def scenario() -> None:
        received: list[dict[str, object]] = []
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=fake_vllm(received)),
            base_url="http://vllm",
        ) as upstream:
            gateway = create_real_worker_app(config(), client=upstream)
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=gateway),
                base_url="http://gateway",
            ) as client:
                health = (await client.get("/health")).json()
                assert health == {
                    "worker_id": "worker-1",
                    "healthy": True,
                    "running": 0,
                    "waiting": 0,
                    "assigned_pending": 0,
                    "max_concurrency": 2,
                    "total_requests": 0,
                    "cancelled_requests": 0,
                }

                response = await client.post(
                    "/v1/chat",
                    json={
                        "task_id": "task-1",
                        "messages": [{"role": "user", "content": "hello"}],
                    },
                )
                assert response.status_code == 200
                assert response.headers["X-Worker-Id"] == "worker-1"
                chunks = [json.loads(line) for line in response.text.splitlines()]
                assert chunks == [
                    {"worker_id": "worker-1", "delta": "real"},
                    {
                        "worker_id": "worker-1",
                        "telemetry": {
                            "provider_request_id": "request-1",
                            "input_tokens": 12,
                            "output_tokens": 2,
                            "provider_ttft_ms": pytest.approx(0, abs=1_000),
                        },
                    },
                ]

                debug = (await client.get("/debug/requests")).json()
                trace = debug["traces"]["task-1"]
                assert trace["status"] == "completed"
                assert trace["started_at_ns"] >= trace["received_at_ns"]
                assert trace["first_token_at_ns"] >= trace["started_at_ns"]
                assert trace["finished_at_ns"] >= trace["first_token_at_ns"]
                assert trace["prompt_tokens"] == 12
                assert trace["completion_tokens"] == 2
                assert trace["upstream_request_id"] == "request-1"
                assert len(trace["messages_sha256"]) == 64

                assert received[0]["model"] == "served-small-model"
                assert received[0]["max_tokens"] == 16
                assert received[0]["temperature"] == 0
                assert received[0]["top_p"] == 1
                assert received[0]["seed"] == 20260809
                assert received[0]["stream_options"] == {"include_usage": True}

    asyncio.run(scenario())


def test_real_worker_applies_auxo_profile_without_client_generation_knobs() -> None:
    async def scenario() -> None:
        received: list[dict[str, object]] = []
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=fake_vllm(received)),
            base_url="http://vllm",
        ) as upstream:
            gateway = create_real_worker_app(config(), client=upstream)
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=gateway),
                base_url="http://gateway",
            ) as client:
                response = await client.post(
                    "/v1/chat",
                    json={
                        "task_id": "task-auxo",
                        "messages": [{"role": "user", "content": "return JSON"}],
                        "generation_profile": "auxo_plan",
                    },
                )

        assert response.status_code == 200
        assert received[0]["max_tokens"] == 8_000
        assert received[0]["temperature"] == 0.1
        assert received[0]["response_format"] == {"type": "json_object"}
        assert received[0]["stream"] is True

    asyncio.run(scenario())


def test_real_worker_structure_metrics_identity_and_resets() -> None:
    async def scenario() -> None:
        received: list[dict[str, object]] = []
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=fake_vllm(received)),
            base_url="http://vllm",
        ) as upstream:
            gateway = create_real_worker_app(config(), client=upstream)
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=gateway),
                base_url="http://gateway",
            ) as client:
                structured = await client.post(
                    "/v1/structure",
                    json={"task_id": "task-2", "prompt": "问题", "response": "回答"},
                )
                assert structured.status_code == 200
                assert structured.headers["X-Worker-Id"] == "worker-1"
                assert structured.json()["semantic_card"]["facts"] == [
                    "真实结构化结果"
                ]

                metrics = await client.get("/metrics")
                assert "prefix_cache_hits_total 75" in metrics.text

                identity = (await client.get("/identity")).json()
                assert identity["worker_id"] == "worker-1"
                assert identity["upstream_version"] == {"version": "0.26.0"}
                assert identity["upstream_models"]["data"][0]["id"] == (
                    "served-small-model"
                )

                reset = (await client.post("/admin/reset-prefix-cache")).json()
                assert reset["reset_verified"] is True
                assert reset["upstream_result"] == {"success": True}

                cleared = (await client.post("/admin/reset-observations")).json()
                assert cleared == {"worker_id": "worker-1", "cleared_requests": 1}
                health = (await client.get("/health")).json()
                assert health["total_requests"] == 0

    asyncio.run(scenario())
