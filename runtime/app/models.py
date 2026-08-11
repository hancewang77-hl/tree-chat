from __future__ import annotations

from enum import Enum, IntEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TaskState(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskErrorType(str, Enum):
    PROVIDER = "provider"
    TIMEOUT = "timeout"
    ROUTER_UNAVAILABLE = "router_unavailable"


class TaskType(str, Enum):
    CHAT_GENERATION = "chat_generation"
    SEMANTIC_STRUCTURE = "semantic_structure"


class TaskPriority(IntEnum):
    FOREGROUND_INTERACTIVE = 0
    USER_PARALLEL = 1
    BACKGROUND = 2


class GenerationProfile(str, Enum):
    INTERACTIVE_CHAT = "interactive_chat"
    AUXO_PLAN = "auxo_plan"


class RouterMode(str, Enum):
    ROUND_ROBIN = "round_robin"
    LEAST_LOAD = "least_load"
    BRANCH_AFFINITY = "branch_affinity"
    BRANCH_AFFINITY_BOUNDED = "branch_affinity_bounded"


class RerouteReason(str, Enum):
    CAPACITY = "capacity"
    HEALTH_UNAVAILABLE = "health_unavailable"


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["system", "user", "assistant"]
    content: str


class ProviderTelemetry(BaseModel):
    """Provider-authored identifiers and usage for one completed chat stream."""

    model_config = ConfigDict(extra="forbid")

    provider_request_id: str | None = Field(default=None, min_length=1)
    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    prompt_cache_hit_tokens: int | None = Field(default=None, ge=0)
    prompt_cache_miss_tokens: int | None = Field(default=None, ge=0)
    provider_ttft_ms: int | None = Field(default=None, ge=0)
    finish_reason: str | None = Field(default=None, min_length=1, max_length=80)


class CreateTaskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str = Field(min_length=1)
    node_id: str = Field(min_length=1)
    task_type: TaskType
    priority: TaskPriority
    root_node_id: str | None = Field(default=None, min_length=1)
    ancestor_node_ids: list[str] | None = None
    messages: list[ChatMessage] | None = None
    generation_profile: GenerationProfile | None = None
    prompt: str | None = None
    response: str | None = None

    @model_validator(mode="after")
    def validate_task_payload(self) -> "CreateTaskRequest":
        has_root = self.root_node_id is not None
        has_path = self.ancestor_node_ids is not None
        if has_root != has_path:
            raise ValueError(
                "root_node_id and ancestor_node_ids must be provided together"
            )
        if self.ancestor_node_ids is not None:
            if len(self.ancestor_node_ids) < 2:
                raise ValueError(
                    "ancestor_node_ids must include root and top-level branch"
                )
            if any(not node_id.strip() for node_id in self.ancestor_node_ids):
                raise ValueError("ancestor_node_ids cannot contain blank IDs")
            if len(set(self.ancestor_node_ids)) != len(self.ancestor_node_ids):
                raise ValueError("ancestor_node_ids cannot contain a cycle")
            if self.ancestor_node_ids[0] != self.root_node_id:
                raise ValueError("ancestor_node_ids must start at root_node_id")
            if self.ancestor_node_ids[-1] != self.node_id:
                raise ValueError("ancestor_node_ids must end at node_id")

        if self.task_type is TaskType.CHAT_GENERATION:
            if not self.messages:
                raise ValueError("chat_generation requires non-empty messages")
            if self.prompt is not None or self.response is not None:
                raise ValueError("chat_generation does not accept prompt/response")
            return self

        if self.generation_profile is not None:
            raise ValueError("semantic_structure does not accept generation_profile")

        if not self.prompt or not self.prompt.strip():
            raise ValueError("semantic_structure requires a non-empty prompt")
        if not self.response or not self.response.strip():
            raise ValueError("semantic_structure requires a non-empty response")
        if len(self.prompt) + len(self.response) > 50_000:
            raise ValueError("semantic_structure source is too long")
        if self.messages is not None:
            raise ValueError("semantic_structure does not accept messages")
        return self

    def derive_top_branch_id(self) -> str | None:
        if self.ancestor_node_ids is None:
            return None
        return self.ancestor_node_ids[1]

    def effective_generation_profile(self) -> GenerationProfile:
        return self.generation_profile or GenerationProfile.INTERACTIVE_CHAT


class TaskRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: str
    session_id: str
    node_id: str
    task_type: TaskType
    priority: TaskPriority
    state: TaskState
    created_at: int
    enqueue_seq: int | None = None
    enqueued_at: int | None = None
    started_at: int | None = None
    first_token_at: int | None = None
    finished_at: int | None = None
    error: str | None = None
    error_type: TaskErrorType | None = None
    response_latency_ms: int | None = None
    provider_request_id: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    prompt_cache_hit_tokens: int | None = None
    prompt_cache_miss_tokens: int | None = None
    provider_ttft_ms: int | None = None
    result: str | None = None
    timeout_limit_seconds: float
    elapsed_ms: int | None = None
    retry_of_task_id: str | None = None
    attempt: int = Field(ge=1)
    top_branch_id: str | None = None
    affinity_key: str | None = None
    affinity_worker: str | None = None
    worker_id: str | None = None
    router_mode: RouterMode | None = None
    routing_decision_at: int | None = None
    decision_reason: str | None = None
    rerouted: bool = False
    reroute_reason: RerouteReason | None = None


class SemanticCard(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    generatedAt: int
    model: str
    facts: list[str]
    constraints: list[str]
    assumptions: list[str]
    decisions: list[str]
    rejected: list[str]
    openQuestions: list[str]


class CreateTaskResponse(BaseModel):
    task: TaskRecord
