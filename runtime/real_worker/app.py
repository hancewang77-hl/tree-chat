from __future__ import annotations

import asyncio
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import subprocess
import time
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from runtime.app.models import ChatMessage, GenerationProfile
from runtime.app.provider import (
    AUXO_MAX_TOKENS,
    AUXO_TEMPERATURE,
    STRUCTURE_SYSTEM_PROMPT,
    STRUCTURE_TEMPERATURE,
    parse_semantic_card,
)


@dataclass(frozen=True, slots=True)
class RealWorkerConfig:
    worker_id: str
    vllm_base_url: str = "http://127.0.0.1:8001/v1"
    model: str = "treechat-qwen2.5-0.5b"
    max_concurrency: int = 4
    max_tokens: int = 32
    auxo_max_tokens: int = AUXO_MAX_TOKENS
    temperature: float = 0.0
    auxo_temperature: float = AUXO_TEMPERATURE
    top_p: float = 1.0
    seed: int = 20_260_809
    structure_max_tokens: int = 384
    health_timeout_seconds: float = 2.0

    def __post_init__(self) -> None:
        if not self.worker_id.strip():
            raise ValueError("worker_id must be non-empty")
        if not self.vllm_base_url.startswith(("http://", "https://")):
            raise ValueError("vllm_base_url must be an HTTP(S) URL")
        if not self.vllm_base_url.rstrip("/").endswith("/v1"):
            raise ValueError("vllm_base_url must end with /v1")
        if not self.model.strip():
            raise ValueError("model must be non-empty")
        if self.max_concurrency < 1:
            raise ValueError("max_concurrency must be at least 1")
        if (
            self.max_tokens < 1
            or self.auxo_max_tokens < 1
            or self.structure_max_tokens < 1
        ):
            raise ValueError("token limits must be positive")
        if (
            not math.isfinite(self.temperature)
            or self.temperature < 0
            or not math.isfinite(self.auxo_temperature)
            or self.auxo_temperature < 0
        ):
            raise ValueError("temperature must be finite and non-negative")
        if not math.isfinite(self.top_p) or not 0 < self.top_p <= 1:
            raise ValueError("top_p must be finite and in (0, 1]")
        if (
            not math.isfinite(self.health_timeout_seconds)
            or self.health_timeout_seconds <= 0
        ):
            raise ValueError("health_timeout_seconds must be finite and positive")

    @property
    def api_base_url(self) -> str:
        return self.vllm_base_url.rstrip("/")

    @property
    def root_url(self) -> str:
        return self.api_base_url.removesuffix("/v1")

    @classmethod
    def from_env(cls) -> "RealWorkerConfig":
        return cls(
            worker_id=os.getenv("TREECHAT_REAL_WORKER_ID", "worker-1"),
            vllm_base_url=os.getenv(
                "TREECHAT_VLLM_BASE_URL", "http://127.0.0.1:8001/v1"
            ),
            model=os.getenv(
                "TREECHAT_VLLM_MODEL", "treechat-qwen2.5-0.5b"
            ),
            max_concurrency=int(
                os.getenv("TREECHAT_REAL_WORKER_MAX_CONCURRENCY", "4")
            ),
            max_tokens=int(os.getenv("TREECHAT_REAL_WORKER_MAX_TOKENS", "32")),
            auxo_max_tokens=int(
                os.getenv(
                    "TREECHAT_REAL_WORKER_AUXO_MAX_TOKENS",
                    str(AUXO_MAX_TOKENS),
                )
            ),
            temperature=float(
                os.getenv("TREECHAT_REAL_WORKER_TEMPERATURE", "0")
            ),
            auxo_temperature=float(
                os.getenv(
                    "TREECHAT_REAL_WORKER_AUXO_TEMPERATURE",
                    str(AUXO_TEMPERATURE),
                )
            ),
            top_p=float(os.getenv("TREECHAT_REAL_WORKER_TOP_P", "1")),
            seed=int(os.getenv("TREECHAT_REAL_WORKER_SEED", "20260809")),
            structure_max_tokens=int(
                os.getenv("TREECHAT_REAL_WORKER_STRUCTURE_MAX_TOKENS", "384")
            ),
            health_timeout_seconds=float(
                os.getenv("TREECHAT_REAL_WORKER_HEALTH_TIMEOUT_SECONDS", "2")
            ),
        )


class WorkerChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: str = Field(min_length=1)
    messages: list[ChatMessage] = Field(min_length=1)
    generation_profile: GenerationProfile = GenerationProfile.INTERACTIVE_CHAT


class WorkerStructureRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: str = Field(min_length=1)
    prompt: str = Field(min_length=1)
    response: str = Field(min_length=1)


@dataclass(slots=True)
class RequestTrace:
    task_id: str
    request_type: str
    messages_sha256: str | None
    received_at_ns: int
    started_at_ns: int | None = None
    first_token_at_ns: int | None = None
    finished_at_ns: int | None = None
    status: str = "waiting"
    upstream_request_id: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    finish_reason: str | None = None
    error: str | None = None


class RealWorkerState:
    def __init__(
        self,
        config: RealWorkerConfig,
        *,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.config = config
        self.client = client or httpx.AsyncClient(timeout=None)
        self.owns_client = client is None
        self.running = 0
        self.waiting = 0
        self.total_requests = 0
        self.cancelled_requests = 0
        self.health_check_requests = 0
        self.last_health_error: str | None = None
        self.prefix_reset_count = 0
        self.last_prefix_reset_at_ns: int | None = None
        self._traces: dict[str, RequestTrace] = {}
        self._task_order: list[str] = []
        self._semaphore = asyncio.Semaphore(config.max_concurrency)
        self._lock = asyncio.Lock()

    async def begin(
        self,
        task_id: str,
        *,
        request_type: str,
        messages_sha256: str | None,
    ) -> RequestTrace:
        trace = RequestTrace(
            task_id=task_id,
            request_type=request_type,
            messages_sha256=messages_sha256,
            received_at_ns=time.time_ns(),
        )
        async with self._lock:
            if task_id in self._traces:
                raise HTTPException(status_code=409, detail="task_id already received")
            self.waiting += 1
            self.total_requests += 1
            self._traces[task_id] = trace
            self._task_order.append(task_id)
        try:
            await self._semaphore.acquire()
        except BaseException as error:
            async with self._lock:
                self.waiting = max(0, self.waiting - 1)
                trace.status = (
                    "cancelled" if isinstance(error, asyncio.CancelledError) else "failed"
                )
                trace.error = str(error) or type(error).__name__
                trace.finished_at_ns = time.time_ns()
                if isinstance(error, asyncio.CancelledError):
                    self.cancelled_requests += 1
            raise
        async with self._lock:
            self.waiting = max(0, self.waiting - 1)
            self.running += 1
            trace.status = "running"
            trace.started_at_ns = time.time_ns()
        return trace

    async def mark_first_token(self, trace: RequestTrace) -> None:
        async with self._lock:
            if trace.first_token_at_ns is None:
                trace.first_token_at_ns = time.time_ns()

    async def record_chunk_metadata(
        self, trace: RequestTrace, chunk: dict[str, Any]
    ) -> None:
        async with self._lock:
            request_id = chunk.get("id")
            if isinstance(request_id, str) and request_id:
                trace.upstream_request_id = request_id
            usage = chunk.get("usage")
            if isinstance(usage, dict):
                prompt_tokens = usage.get("prompt_tokens")
                completion_tokens = usage.get("completion_tokens")
                if isinstance(prompt_tokens, int):
                    trace.prompt_tokens = prompt_tokens
                if isinstance(completion_tokens, int):
                    trace.completion_tokens = completion_tokens
            choices = chunk.get("choices")
            if isinstance(choices, list) and choices and isinstance(choices[0], dict):
                finish_reason = choices[0].get("finish_reason")
                if isinstance(finish_reason, str) and finish_reason:
                    trace.finish_reason = finish_reason

    async def finish(
        self,
        trace: RequestTrace,
        *,
        status: str,
        error: str | None = None,
    ) -> None:
        release = False
        async with self._lock:
            if trace.finished_at_ns is not None:
                return
            trace.status = status
            trace.error = error
            trace.finished_at_ns = time.time_ns()
            self.running = max(0, self.running - 1)
            if status == "cancelled":
                self.cancelled_requests += 1
            release = True
        if release:
            self._semaphore.release()

    async def probe_upstream(self) -> bool:
        try:
            response = await self.client.get(
                f"{self.config.root_url}/health",
                timeout=self.config.health_timeout_seconds,
            )
            response.raise_for_status()
        except httpx.HTTPError as error:
            self.last_health_error = str(error)
            return False
        self.last_health_error = None
        return True

    async def health_snapshot(self, *, record_probe: bool) -> dict[str, object]:
        healthy = await self.probe_upstream()
        async with self._lock:
            if record_probe:
                self.health_check_requests += 1
            return {
                "worker_id": self.config.worker_id,
                "healthy": healthy,
                "running": self.running,
                "waiting": self.waiting,
                "assigned_pending": self.waiting,
                "max_concurrency": self.config.max_concurrency,
                "total_requests": self.total_requests,
                "cancelled_requests": self.cancelled_requests,
            }

    async def debug_snapshot(self) -> dict[str, object]:
        async with self._lock:
            return {
                "worker_id": self.config.worker_id,
                "task_ids": list(self._task_order),
                "traces": {
                    task_id: asdict(self._traces[task_id])
                    for task_id in self._task_order
                },
                "health_check_requests": self.health_check_requests,
                "prefix_reset_count": self.prefix_reset_count,
                "last_prefix_reset_at_ns": self.last_prefix_reset_at_ns,
                "last_health_error": self.last_health_error,
                "generation_config": generation_config(self.config),
            }

    async def reset_observations(self) -> dict[str, object]:
        async with self._lock:
            if self.running or self.waiting:
                raise HTTPException(
                    status_code=409, detail="worker must be idle before reset"
                )
            cleared = len(self._task_order)
            self.total_requests = 0
            self.cancelled_requests = 0
            self._traces.clear()
            self._task_order.clear()
            return {"worker_id": self.config.worker_id, "cleared_requests": cleared}

    async def record_prefix_reset(self) -> None:
        async with self._lock:
            self.prefix_reset_count += 1
            self.last_prefix_reset_at_ns = time.time_ns()

    async def require_idle(self) -> None:
        async with self._lock:
            if self.running or self.waiting:
                raise HTTPException(
                    status_code=409, detail="worker must be idle before cache reset"
                )


def generation_config(
    config: RealWorkerConfig,
    generation_profile: GenerationProfile = GenerationProfile.INTERACTIVE_CHAT,
) -> dict[str, object]:
    result: dict[str, object] = {
        "model": config.model,
        "max_tokens": config.max_tokens,
        "temperature": config.temperature,
        "top_p": config.top_p,
        "seed": config.seed,
        "stream_options": {"include_usage": True},
    }
    if generation_profile is GenerationProfile.AUXO_PLAN:
        result.update(
            {
                "max_tokens": config.auxo_max_tokens,
                "temperature": config.auxo_temperature,
                "response_format": {"type": "json_object"},
            }
        )
    return result


def messages_sha256(messages: list[ChatMessage]) -> str:
    encoded = json.dumps(
        [message.model_dump(mode="json") for message in messages],
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def create_real_worker_app(
    config: RealWorkerConfig,
    *,
    client: httpx.AsyncClient | None = None,
) -> FastAPI:
    state = RealWorkerState(config, client=client)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        try:
            yield
        finally:
            if state.owns_client:
                await state.client.aclose()

    app = FastAPI(
        title=f"TreeChat Real vLLM Worker {config.worker_id}",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.worker = state

    @app.get("/health")
    async def health() -> dict[str, object]:
        return await state.health_snapshot(record_probe=True)

    @app.get("/identity")
    async def identity() -> dict[str, object]:
        upstream_version, upstream_models = await asyncio.gather(
            _upstream_json(state.client, f"{config.root_url}/version"),
            _upstream_json(state.client, f"{config.api_base_url}/models"),
        )
        return {
            "worker_id": config.worker_id,
            "hostname": platform.node(),
            "python": platform.python_version(),
            "vllm_package_version": _package_version("vllm"),
            "torch_package_version": _package_version("torch"),
            "triton_package_version": _package_version("triton"),
            "gpu": await asyncio.to_thread(_gpu_identity),
            "upstream_version": upstream_version,
            "upstream_models": upstream_models,
            "generation_config": generation_config(config),
            "max_concurrency": config.max_concurrency,
        }

    @app.get("/debug/requests")
    async def debug_requests() -> dict[str, object]:
        return await state.debug_snapshot()

    @app.post("/admin/reset-observations")
    async def reset_observations() -> dict[str, object]:
        return await state.reset_observations()

    @app.post("/admin/reset-prefix-cache")
    async def reset_prefix_cache() -> dict[str, object]:
        await state.require_idle()
        try:
            response = await state.client.post(
                f"{config.root_url}/reset_prefix_cache",
                timeout=config.health_timeout_seconds,
            )
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise HTTPException(
                status_code=502, detail=f"vLLM prefix reset failed: {error}"
            ) from error
        try:
            upstream_result: object = response.json()
        except ValueError:
            upstream_result = response.text
        if isinstance(upstream_result, dict) and upstream_result.get("success") is False:
            raise HTTPException(status_code=502, detail="vLLM rejected prefix reset")
        await state.record_prefix_reset()
        return {
            "worker_id": config.worker_id,
            "reset_verified": True,
            "upstream_status_code": response.status_code,
            "upstream_result": upstream_result,
            "reset_at_ns": state.last_prefix_reset_at_ns,
        }

    @app.get("/metrics")
    async def metrics() -> PlainTextResponse:
        try:
            response = await state.client.get(f"{config.root_url}/metrics")
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise HTTPException(
                status_code=502, detail=f"vLLM metrics failed: {error}"
            ) from error
        return PlainTextResponse(
            response.text,
            media_type=response.headers.get("content-type", "text/plain"),
        )

    @app.post("/v1/chat")
    async def chat(payload: WorkerChatRequest) -> StreamingResponse:
        trace = await state.begin(
            payload.task_id,
            request_type="chat",
            messages_sha256=messages_sha256(payload.messages),
        )
        upstream_payload = {
            **generation_config(config, payload.generation_profile),
            "messages": [
                message.model_dump(mode="json") for message in payload.messages
            ],
            "stream": True,
        }
        upstream_response: httpx.Response | None = None
        try:
            request = state.client.build_request(
                "POST",
                f"{config.api_base_url}/chat/completions",
                json=upstream_payload,
            )
            upstream_response = await state.client.send(request, stream=True)
            if upstream_response.is_error:
                await upstream_response.aread()
                raise httpx.HTTPStatusError(
                    "vLLM chat request failed",
                    request=upstream_response.request,
                    response=upstream_response,
                )
        except BaseException as error:
            if upstream_response is not None:
                await upstream_response.aclose()
            status = "cancelled" if isinstance(error, asyncio.CancelledError) else "failed"
            await state.finish(trace, status=status, error=str(error))
            if isinstance(error, asyncio.CancelledError):
                raise
            raise HTTPException(
                status_code=502, detail=f"vLLM chat setup failed: {error}"
            ) from error

        assert upstream_response is not None

        async def stream():
            final_status = "cancelled"
            final_error: str | None = "downstream closed before stream completed"
            try:
                async for line in upstream_response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data:
                        continue
                    if data == "[DONE]":
                        final_status = "completed"
                        final_error = None
                        break
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError as error:
                        raise RuntimeError("vLLM returned invalid SSE JSON") from error
                    if not isinstance(chunk, dict):
                        continue
                    await state.record_chunk_metadata(trace, chunk)
                    choices = chunk.get("choices")
                    if not isinstance(choices, list) or not choices:
                        continue
                    choice = choices[0]
                    if not isinstance(choice, dict):
                        continue
                    delta = choice.get("delta")
                    if not isinstance(delta, dict):
                        continue
                    content = delta.get("content")
                    if not isinstance(content, str) or not content:
                        continue
                    await state.mark_first_token(trace)
                    yield json.dumps(
                        {"worker_id": config.worker_id, "delta": content},
                        ensure_ascii=False,
                    ) + "\n"
                else:
                    final_status = "completed"
                    final_error = None
                if final_status == "completed":
                    telemetry: dict[str, object] = {
                        "provider_request_id": trace.upstream_request_id,
                        "input_tokens": trace.prompt_tokens,
                        "output_tokens": trace.completion_tokens,
                        "provider_ttft_ms": (
                            round(
                                (trace.first_token_at_ns - trace.started_at_ns)
                                / 1_000_000
                            )
                            if trace.first_token_at_ns is not None
                            and trace.started_at_ns is not None
                            else None
                        ),
                    }
                    if trace.finish_reason is not None:
                        telemetry["finish_reason"] = trace.finish_reason
                    yield json.dumps(
                        {
                            "worker_id": config.worker_id,
                            "telemetry": telemetry,
                        },
                        ensure_ascii=False,
                    ) + "\n"
            except asyncio.CancelledError as error:
                final_status = "cancelled"
                final_error = str(error) or "downstream cancelled"
                raise
            except BaseException as error:
                final_status = "failed"
                final_error = str(error) or type(error).__name__
                raise
            finally:
                await upstream_response.aclose()
                await state.finish(
                    trace, status=final_status, error=final_error
                )

        return StreamingResponse(
            stream(),
            media_type="application/x-ndjson",
            headers={"X-Worker-Id": config.worker_id},
        )

    @app.post("/v1/structure")
    async def structure(payload: WorkerStructureRequest) -> JSONResponse:
        trace = await state.begin(
            payload.task_id,
            request_type="structure",
            messages_sha256=None,
        )
        status = "failed"
        error_text: str | None = None
        try:
            response = await state.client.post(
                f"{config.api_base_url}/chat/completions",
                json={
                    "model": config.model,
                    "messages": [
                        {"role": "system", "content": STRUCTURE_SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": json.dumps(
                                {
                                    "prompt": payload.prompt.strip(),
                                    "response": payload.response.strip(),
                                },
                                ensure_ascii=False,
                            ),
                        },
                    ],
                    "response_format": {"type": "json_object"},
                    "stream": False,
                    "temperature": STRUCTURE_TEMPERATURE,
                    "seed": config.seed,
                    "max_tokens": config.structure_max_tokens,
                },
            )
            response.raise_for_status()
            completion = response.json()
            raw = completion["choices"][0]["message"]["content"]
            card = parse_semantic_card(
                raw, model=str(completion.get("model") or config.model)
            )
            status = "completed"
            return JSONResponse(
                content={
                    "worker_id": config.worker_id,
                    "semantic_card": card.model_dump(mode="json"),
                },
                headers={"X-Worker-Id": config.worker_id},
            )
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as error:
            error_text = str(error) or type(error).__name__
            raise HTTPException(
                status_code=502, detail=f"vLLM structure failed: {error_text}"
            ) from error
        finally:
            await state.finish(trace, status=status, error=error_text)

    return app


async def _upstream_json(client: httpx.AsyncClient, url: str) -> object:
    try:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as error:
        return {"unavailable": str(error)}


def _package_version(name: str) -> str:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return "unavailable"


def _gpu_identity() -> dict[str, object]:
    command = [
        "nvidia-smi",
        "--query-gpu=name,uuid,memory.total,driver_version",
        "--format=csv,noheader,nounits",
    ]
    try:
        result = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        first = result.stdout.strip().splitlines()[0]
        name, uuid, memory_total_mib, driver_version = (
            part.strip() for part in first.split(",", 3)
        )
        return {
            "name": name,
            "uuid": uuid,
            "memory_total_mib": int(memory_total_mib),
            "driver_version": driver_version,
        }
    except (OSError, ValueError, subprocess.SubprocessError, IndexError) as error:
        return {"unavailable": str(error) or type(error).__name__}


app = create_real_worker_app(RealWorkerConfig.from_env())
