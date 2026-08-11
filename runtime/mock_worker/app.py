from __future__ import annotations

import asyncio
import json
import math
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from runtime.app.models import ChatMessage, SemanticCard
from runtime.app.task_registry import epoch_ms


@dataclass(frozen=True, slots=True)
class MockWorkerConfig:
    worker_id: str
    response_delay_seconds: float
    max_concurrency: int
    initially_healthy: bool = True

    def __post_init__(self) -> None:
        if not self.worker_id.strip():
            raise ValueError("worker_id must be non-empty")
        if (
            not math.isfinite(self.response_delay_seconds)
            or self.response_delay_seconds < 0
        ):
            raise ValueError("response_delay_seconds must be finite and non-negative")
        if self.max_concurrency < 1:
            raise ValueError("max_concurrency must be at least 1")

    @classmethod
    def from_env(cls) -> "MockWorkerConfig":
        return cls(
            worker_id=os.getenv("TREECHAT_MOCK_WORKER_ID", "worker-1"),
            response_delay_seconds=float(
                os.getenv("TREECHAT_MOCK_WORKER_DELAY_SECONDS", "0.25")
            ),
            max_concurrency=int(
                os.getenv("TREECHAT_MOCK_WORKER_MAX_CONCURRENCY", "4")
            ),
            initially_healthy=os.getenv(
                "TREECHAT_MOCK_WORKER_HEALTHY", "true"
            ).lower()
            not in {"0", "false", "no"},
        )


class WorkerChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: str = Field(min_length=1)
    messages: list[ChatMessage] = Field(min_length=1)


class WorkerStructureRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: str = Field(min_length=1)
    prompt: str = Field(min_length=1)
    response: str = Field(min_length=1)


class WorkerHealthControl(BaseModel):
    model_config = ConfigDict(extra="forbid")

    healthy: bool


class MockWorkerState:
    def __init__(self, config: MockWorkerConfig) -> None:
        self.config = config
        self.healthy = config.initially_healthy
        self.running = 0
        self.waiting = 0
        self.total_requests = 0
        self.cancelled_requests = 0
        self.health_check_requests = 0
        self.request_task_ids: list[str] = []
        self.received_messages: dict[str, list[ChatMessage]] = {}
        self._semaphore = asyncio.Semaphore(config.max_concurrency)
        self._lock = asyncio.Lock()

    async def snapshot(
        self, *, record_health_check: bool = False
    ) -> dict[str, object]:
        async with self._lock:
            if record_health_check:
                self.health_check_requests += 1
            return {
                "worker_id": self.config.worker_id,
                "healthy": self.healthy,
                "running": self.running,
                "waiting": self.waiting,
                "assigned_pending": self.waiting,
                "max_concurrency": self.config.max_concurrency,
                "total_requests": self.total_requests,
                "cancelled_requests": self.cancelled_requests,
            }

    async def set_health(self, healthy: bool) -> None:
        async with self._lock:
            self.healthy = healthy

    async def require_healthy(self) -> None:
        async with self._lock:
            if not self.healthy:
                raise HTTPException(status_code=503, detail="Mock worker is unhealthy")

    @asynccontextmanager
    async def execution(
        self,
        task_id: str,
        *,
        messages: list[ChatMessage] | None = None,
    ):
        async with self._lock:
            self.waiting += 1
            self.total_requests += 1
            self.request_task_ids.append(task_id)
            if messages is not None:
                self.received_messages[task_id] = [
                    message.model_copy(deep=True) for message in messages
                ]

        acquired = False
        try:
            await self._semaphore.acquire()
            acquired = True
            async with self._lock:
                self.waiting -= 1
                self.running += 1
            yield
        except asyncio.CancelledError:
            async with self._lock:
                self.cancelled_requests += 1
            raise
        finally:
            async with self._lock:
                if acquired:
                    self.running = max(0, self.running - 1)
                else:
                    self.waiting = max(0, self.waiting - 1)
            if acquired:
                self._semaphore.release()

    async def debug_requests(self) -> dict[str, object]:
        async with self._lock:
            return {
                "worker_id": self.config.worker_id,
                "task_ids": list(self.request_task_ids),
                "messages": {
                    task_id: [
                        message.model_dump(mode="json") for message in messages
                    ]
                    for task_id, messages in self.received_messages.items()
                },
                "health_check_requests": self.health_check_requests,
            }


def create_mock_worker_app(config: MockWorkerConfig) -> FastAPI:
    state = MockWorkerState(config)
    app = FastAPI(title=f"TreeChat Mock Worker {config.worker_id}", version="0.1.0")
    app.state.worker = state

    @app.get("/health")
    async def health() -> dict[str, object]:
        return await state.snapshot(record_health_check=True)

    @app.post("/control/health")
    async def control_health(payload: WorkerHealthControl) -> dict[str, object]:
        await state.set_health(payload.healthy)
        return await state.snapshot()

    @app.get("/debug/requests")
    async def debug_requests() -> dict[str, object]:
        return await state.debug_requests()

    @app.post("/v1/chat")
    async def chat(
        payload: WorkerChatRequest, request: Request
    ) -> StreamingResponse:
        await state.require_healthy()

        async def stream() -> AsyncIterator[str]:
            async with state.execution(payload.task_id, messages=payload.messages):
                await asyncio.sleep(config.response_delay_seconds)
                if await request.is_disconnected():
                    raise asyncio.CancelledError
                last_message = payload.messages[-1].content
                chunk = {
                    "worker_id": config.worker_id,
                    "delta": f"{config.worker_id}:{last_message}",
                }
                yield json.dumps(chunk, ensure_ascii=False) + "\n"

        return StreamingResponse(
            stream(),
            media_type="application/x-ndjson",
            headers={"X-Worker-Id": config.worker_id},
        )

    @app.post("/v1/structure")
    async def structure(payload: WorkerStructureRequest) -> JSONResponse:
        await state.require_healthy()
        async with state.execution(payload.task_id):
            await asyncio.sleep(config.response_delay_seconds)
            card = SemanticCard(
                generatedAt=epoch_ms(),
                model=f"mock-worker/{config.worker_id}",
                facts=[f"{payload.prompt}:{payload.response}"],
                constraints=[],
                assumptions=[],
                decisions=[],
                rejected=[],
                openQuestions=[],
            )
            return JSONResponse(
                content={
                    "worker_id": config.worker_id,
                    "semantic_card": card.model_dump(mode="json"),
                },
                headers={"X-Worker-Id": config.worker_id},
            )

    return app


app = create_mock_worker_app(MockWorkerConfig.from_env())
