from __future__ import annotations

import json
import os
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from enum import Enum
from typing import Protocol

import httpx

from .models import ChatMessage, GenerationProfile, ProviderTelemetry, SemanticCard
from .task_registry import epoch_ms


CHAT_MODEL = "deepseek-chat"
CHAT_MAX_TOKENS = 2_048
AUXO_MAX_TOKENS = 8_000
AUXO_TEMPERATURE = 0.1
VLLM_BASE_URL = "http://127.0.0.1:8001/v1"
VLLM_MODEL = "treechat-qwen2.5-0.5b"
VLLM_CHAT_MAX_TOKENS = 384
STRUCTURE_MAX_TOKENS = 1_200
STRUCTURE_TEMPERATURE = 0.1

STRUCTURE_SYSTEM_PROMPT = """
你是「智构树语」的语义整理器。你只负责将一个问题和它的回答整理为轻量语义卡片，不补充原文中没有的知识。

必须只返回 JSON 对象，格式如下：
{
  "facts": ["已明确的事实"],
  "constraints": ["必须满足的约束"],
  "assumptions": ["未被证实的假设"],
  "decisions": ["已作出的决定或结论"],
  "rejected": ["已否定的选项或说法"],
  "openQuestions": ["仍需回答或验证的问题"]
}

规则：
1. 每项使用简短、可独立理解的陈述句。
2. 无对应内容时返回空数组。
3. 区分事实与假设，不把建议写成事实。
4. 不输出 Markdown 代码块、解释或其他字段。
""".strip()

CARD_FIELDS = (
    "facts",
    "constraints",
    "assumptions",
    "decisions",
    "rejected",
    "openQuestions",
)


class ProviderError(RuntimeError):
    pass


class ProviderMode(str, Enum):
    MOCK = "mock"
    DEEPSEEK = "deepseek"
    VLLM = "vllm"


class TaskProvider(Protocol):
    async def stream_chat(
        self,
        messages: list[ChatMessage],
        generation_profile: GenerationProfile = GenerationProfile.INTERACTIVE_CHAT,
    ) -> AsyncIterator[str | ProviderTelemetry]: ...

    async def structure(self, prompt: str, response: str) -> SemanticCard: ...


class DeepSeekProvider:
    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        chat_max_tokens: int | None = None,
        auxo_max_tokens: int | None = None,
        provider_name: str = "DeepSeek",
        api_key_environment: str = "DEEPSEEK_API_KEY",
        api_key_required: bool = True,
        thinking_mode: str | None = "disabled",
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._base_url = (
            base_url
            or os.getenv("DEEPSEEK_BASE_URL")
            or "https://api.deepseek.com"
        ).rstrip("/")
        self._api_key = api_key
        self._model = model or os.getenv("TREECHAT_DEEPSEEK_MODEL") or CHAT_MODEL
        self._chat_max_tokens = chat_max_tokens or _positive_int_environment(
            "TREECHAT_DEEPSEEK_MAX_TOKENS", CHAT_MAX_TOKENS
        )
        self._auxo_max_tokens = auxo_max_tokens or _positive_int_environment(
            "TREECHAT_AUXO_MAX_TOKENS", AUXO_MAX_TOKENS
        )
        self._provider_name = provider_name
        self._api_key_environment = api_key_environment
        self._api_key_required = api_key_required
        self._thinking_mode = thinking_mode
        self._client = client

    @property
    def base_url(self) -> str:
        return self._base_url

    @property
    def model(self) -> str:
        return self._model

    async def stream_chat(
        self,
        messages: list[ChatMessage],
        generation_profile: GenerationProfile = GenerationProfile.INTERACTIVE_CHAT,
    ) -> AsyncIterator[str | ProviderTelemetry]:
        payload = {
            "model": self._model,
            "messages": [message.model_dump() for message in messages],
            "stream": True,
            "stream_options": {"include_usage": True},
            "max_tokens": self._chat_max_tokens,
        }
        if generation_profile is GenerationProfile.AUXO_PLAN:
            payload.update(
                {
                    "response_format": {"type": "json_object"},
                    "temperature": AUXO_TEMPERATURE,
                    "max_tokens": self._auxo_max_tokens,
                }
            )
        if self._thinking_mode is not None:
            payload["thinking"] = {"type": self._thinking_mode}
        provider_request_id: str | None = None
        input_tokens: int | None = None
        output_tokens: int | None = None
        prompt_cache_hit_tokens: int | None = None
        prompt_cache_miss_tokens: int | None = None
        provider_ttft_ms: int | None = None
        finish_reason: str | None = None
        request_started = time.perf_counter()
        async with self._client_context() as client:
            async with client.stream(
                "POST",
                f"{self._base_url}/chat/completions",
                headers=self._headers(),
                json=payload,
            ) as response:
                if response.is_error:
                    await response.aread()
                    raise ProviderError(self._provider_error(response))
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data:
                        continue
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError as error:
                        raise ProviderError(
                            f"{self._provider_name} returned an invalid stream chunk"
                        ) from error
                    request_id = chunk.get("id")
                    if isinstance(request_id, str) and request_id:
                        provider_request_id = request_id
                    usage = chunk.get("usage")
                    if isinstance(usage, dict):
                        prompt_tokens = usage.get("prompt_tokens")
                        completion_tokens = usage.get("completion_tokens")
                        cache_hit_tokens = usage.get("prompt_cache_hit_tokens")
                        cache_miss_tokens = usage.get("prompt_cache_miss_tokens")
                        if isinstance(prompt_tokens, int) and prompt_tokens >= 0:
                            input_tokens = prompt_tokens
                        if isinstance(completion_tokens, int) and completion_tokens >= 0:
                            output_tokens = completion_tokens
                        if isinstance(cache_hit_tokens, int) and cache_hit_tokens >= 0:
                            prompt_cache_hit_tokens = cache_hit_tokens
                        if isinstance(cache_miss_tokens, int) and cache_miss_tokens >= 0:
                            prompt_cache_miss_tokens = cache_miss_tokens

                    choices = chunk.get("choices")
                    if not isinstance(choices, list) or not choices:
                        continue
                    choice = choices[0]
                    if not isinstance(choice, dict):
                        continue
                    chunk_finish_reason = choice.get("finish_reason")
                    if isinstance(chunk_finish_reason, str) and chunk_finish_reason:
                        finish_reason = chunk_finish_reason
                    delta = choice.get("delta")
                    if not isinstance(delta, dict):
                        continue
                    content = delta.get("content", "")
                    if isinstance(content, str) and content:
                        if provider_ttft_ms is None:
                            provider_ttft_ms = round(
                                (time.perf_counter() - request_started) * 1000
                            )
                        yield content
        if (
            provider_request_id is not None
            or input_tokens is not None
            or output_tokens is not None
            or prompt_cache_hit_tokens is not None
            or prompt_cache_miss_tokens is not None
            or provider_ttft_ms is not None
            or finish_reason is not None
        ):
            yield ProviderTelemetry(
                provider_request_id=provider_request_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                prompt_cache_hit_tokens=prompt_cache_hit_tokens,
                prompt_cache_miss_tokens=prompt_cache_miss_tokens,
                provider_ttft_ms=provider_ttft_ms,
                finish_reason=finish_reason,
            )

    async def structure(self, prompt: str, response: str) -> SemanticCard:
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": STRUCTURE_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {"prompt": prompt.strip(), "response": response.strip()},
                        ensure_ascii=False,
                    ),
                },
            ],
            "response_format": {"type": "json_object"},
            "stream": False,
            "temperature": STRUCTURE_TEMPERATURE,
            "max_tokens": STRUCTURE_MAX_TOKENS,
        }
        if self._thinking_mode is not None:
            payload["thinking"] = {"type": self._thinking_mode}
        async with self._client_context() as client:
            response_data = await client.post(
                f"{self._base_url}/chat/completions",
                headers=self._headers(),
                json=payload,
            )
        if response_data.is_error:
            raise ProviderError(self._provider_error(response_data))

        try:
            completion = response_data.json()
            raw = completion["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as error:
            raise ProviderError(
                f"{self._provider_name} returned an invalid structure response"
            ) from error
        model = completion.get("model") or self._model
        return parse_semantic_card(raw, model=model)

    def _headers(self) -> dict[str, str]:
        api_key = self._api_key or os.getenv(self._api_key_environment)
        if not api_key and self._api_key_required:
            raise ProviderError(
                f"{self._api_key_environment} is not configured in the FastAPI runtime"
            )
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        return headers

    def _provider_error(self, response: httpx.Response) -> str:
        try:
            body = response.json()
            message = body.get("error", {}).get("message")
        except (ValueError, AttributeError):
            message = None
        return message or (
            f"{self._provider_name} request failed with status "
            f"{response.status_code}"
        )

    @asynccontextmanager
    async def _client_context(self) -> AsyncIterator[httpx.AsyncClient]:
        if self._client is not None:
            yield self._client
            return
        async with httpx.AsyncClient(timeout=None) as client:
            yield client


class VLLMProvider(DeepSeekProvider):
    """OpenAI-compatible provider backed by one real vLLM server."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        chat_max_tokens: int | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        resolved_max_tokens = chat_max_tokens or _positive_int_environment(
            "TREECHAT_VLLM_MAX_TOKENS", VLLM_CHAT_MAX_TOKENS
        )
        super().__init__(
            base_url=base_url or os.getenv("TREECHAT_VLLM_BASE_URL") or VLLM_BASE_URL,
            api_key=api_key,
            model=model or os.getenv("TREECHAT_VLLM_MODEL") or VLLM_MODEL,
            chat_max_tokens=resolved_max_tokens,
            provider_name="vLLM",
            api_key_environment="TREECHAT_VLLM_API_KEY",
            api_key_required=False,
            thinking_mode=None,
            client=client,
        )


def resolve_provider_mode(raw: str | ProviderMode | None = None) -> ProviderMode:
    value = raw if raw is not None else os.getenv(
        "TREECHAT_PROVIDER_MODE", ProviderMode.MOCK.value
    )
    if isinstance(value, ProviderMode):
        return value
    try:
        return ProviderMode(str(value).strip().lower())
    except ValueError as error:
        raise ValueError(
            "TREECHAT_PROVIDER_MODE must be 'mock', 'deepseek', or 'vllm'"
        ) from error


def _positive_int_environment(name: str, default: int) -> int:
    raw = os.getenv(name, str(default))
    try:
        value = int(raw)
    except ValueError as error:
        raise ValueError(f"{name} must be a positive integer") from error
    if value < 1 or str(value) != raw.strip():
        raise ValueError(f"{name} must be a positive integer")
    return value


def parse_semantic_card(raw: object, *, model: str) -> SemanticCard:
    if not isinstance(raw, str) or not raw.strip():
        raise ProviderError("Semantic structure returned no content")
    text = raw.strip()
    if text.startswith("```"):
        text = text.removeprefix("```json").removeprefix("```")
        text = text.removesuffix("```").strip()

    candidates = [text]
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace >= 0 and last_brace > first_brace:
        candidates.append(text[first_brace : last_brace + 1])

    parsed: dict[str, object] | None = None
    for candidate in candidates:
        try:
            value = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            parsed = value
            break
    if parsed is None:
        raise ProviderError("Semantic structure returned invalid JSON")

    normalized = {field: _normalize_string_list(parsed.get(field)) for field in CARD_FIELDS}
    if not any(normalized.values()):
        raise ProviderError("Semantic structure returned an empty card")
    return SemanticCard(generatedAt=epoch_ms(), model=model, **normalized)


def _normalize_string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            continue
        text = " ".join(item.split()).strip()[:320]
        if not text or text in seen:
            continue
        seen.add(text)
        normalized.append(text)
        if len(normalized) >= 8:
            break
    return normalized
