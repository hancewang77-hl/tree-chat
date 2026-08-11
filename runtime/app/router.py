from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import os
import time
from collections.abc import AsyncIterator, Callable
from dataclasses import asdict, dataclass
from enum import Enum
from typing import Protocol

import httpx
from pydantic import BaseModel, ConfigDict, Field

from .models import (
    ChatMessage,
    ProviderTelemetry,
    RerouteReason,
    RouterMode,
    SemanticCard,
)
from .provider import TaskProvider


LOGGER = logging.getLogger(__name__)
DEFAULT_WORKERS = (
    "worker-1=http://127.0.0.1:8101,"
    "worker-2=http://127.0.0.1:8102"
)
DEFAULT_HEALTH_CHECK_INTERVAL_SECONDS = 1.0
DEFAULT_HEALTH_FAILURE_THRESHOLD = 2
DEFAULT_HEALTH_RECOVERY_THRESHOLD = 2
DEFAULT_HEALTH_TIMEOUT_SECONDS = 2.0


class RouterUnavailableError(RuntimeError):
    pass


class WorkerRequestError(RuntimeError):
    pass


class WorkerHealth(BaseModel):
    model_config = ConfigDict(extra="forbid")

    worker_id: str = Field(min_length=1)
    healthy: bool
    running: int = Field(ge=0)
    waiting: int = Field(ge=0)
    assigned_pending: int = Field(ge=0)
    max_concurrency: int = Field(ge=1)
    total_requests: int = Field(ge=0)
    cancelled_requests: int = Field(ge=0)


class WorkerHealthState(str, Enum):
    HEALTHY = "healthy"
    UNHEALTHY = "unhealthy"
    RECOVERING = "recovering"


class WorkerHealthStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    worker_id: str = Field(min_length=1)
    state: WorkerHealthState
    selectable: bool
    last_probe_succeeded: bool
    consecutive_failures: int = Field(ge=0)
    consecutive_successes: int = Field(ge=0)
    last_check_at: int | None
    last_success_at: int | None
    last_failure_at: int | None
    last_state_change_at: int | None
    last_error: str | None
    reported_health: WorkerHealth | None


@dataclass(frozen=True, slots=True)
class WorkerHealthTransition:
    worker_id: str
    from_state: WorkerHealthState
    to_state: WorkerHealthState
    at: int
    reason: str


@dataclass(slots=True)
class _WorkerHealthTracker:
    worker_id: str
    state: WorkerHealthState = WorkerHealthState.HEALTHY
    last_probe_succeeded: bool = False
    consecutive_failures: int = 0
    consecutive_successes: int = 0
    last_check_at: int | None = None
    last_check_monotonic: float | None = None
    last_success_at: int | None = None
    last_failure_at: int | None = None
    last_state_change_at: int | None = None
    last_error: str | None = None
    reported_health: WorkerHealth | None = None


@dataclass(frozen=True, slots=True)
class WorkerEndpoint:
    worker_id: str
    base_url: str


@dataclass(frozen=True, slots=True)
class RoutingDecision:
    task_id: str
    affinity_key: str | None
    candidate_workers: tuple[str, ...]
    selected_worker: str
    router_mode: RouterMode
    routing_decision_at: int
    decision_reason: str
    load_snapshot: dict[str, dict[str, object]]
    affinity_worker: str | None
    rerouted: bool
    reroute_reason: RerouteReason | None


class TaskRouter(Protocol):
    async def start(self) -> None: ...

    async def route(
        self, task_id: str, *, affinity_key: str | None
    ) -> RoutingDecision: ...

    def stream_chat(
        self,
        decision: RoutingDecision,
        messages: list[ChatMessage],
    ) -> AsyncIterator[str | ProviderTelemetry]: ...

    async def structure(
        self,
        decision: RoutingDecision,
        prompt: str,
        response: str,
    ) -> SemanticCard: ...

    async def release(self, decision: RoutingDecision) -> None: ...

    async def aclose(self) -> None: ...

    async def health_status(
        self, *, refresh: bool = False
    ) -> list[WorkerHealthStatus]: ...

    @property
    def decision_log(self) -> tuple[RoutingDecision, ...]: ...

    @property
    def health_transition_log(self) -> tuple[WorkerHealthTransition, ...]: ...


class HttpTaskRouter:
    """Health-aware Router that invokes the selected worker over HTTP."""

    def __init__(
        self,
        *,
        endpoints: list[WorkerEndpoint],
        mode: RouterMode,
        clock: Callable[[], int],
        client: httpx.AsyncClient | None = None,
        health_timeout_seconds: float | None = None,
        health_check_interval_seconds: float | None = None,
        failure_threshold: int | None = None,
        recovery_threshold: int | None = None,
        refresh_health_on_every_route: bool = True,
    ) -> None:
        if not endpoints:
            raise ValueError("At least one worker endpoint is required")
        worker_ids = [endpoint.worker_id for endpoint in endpoints]
        if len(worker_ids) != len(set(worker_ids)):
            raise ValueError("Worker endpoint IDs must be unique")
        self.mode = mode
        self._endpoints = tuple(endpoints)
        self._by_worker_id = {endpoint.worker_id: endpoint for endpoint in endpoints}
        self._clock = clock
        self._client = client
        self._owns_client = client is None
        self._health_timeout_seconds = resolve_positive_float_setting(
            health_timeout_seconds,
            "TREECHAT_HEALTH_TIMEOUT_SECONDS",
            DEFAULT_HEALTH_TIMEOUT_SECONDS,
        )
        self.health_check_interval_seconds = resolve_positive_float_setting(
            health_check_interval_seconds,
            "TREECHAT_HEALTH_CHECK_INTERVAL_SECONDS",
            DEFAULT_HEALTH_CHECK_INTERVAL_SECONDS,
        )
        self.failure_threshold = resolve_positive_int_setting(
            failure_threshold,
            "TREECHAT_HEALTH_FAILURE_THRESHOLD",
            DEFAULT_HEALTH_FAILURE_THRESHOLD,
        )
        self.recovery_threshold = resolve_positive_int_setting(
            recovery_threshold,
            "TREECHAT_HEALTH_RECOVERY_THRESHOLD",
            DEFAULT_HEALTH_RECOVERY_THRESHOLD,
        )
        self.refresh_health_on_every_route = refresh_health_on_every_route
        self._round_robin_index = 0
        self._assigned: dict[str, int] = {worker_id: 0 for worker_id in worker_ids}
        self._leases: dict[str, str] = {}
        self._decisions: list[RoutingDecision] = []
        self._lock = asyncio.Lock()
        self._health_lock = asyncio.Lock()
        self._health_trackers = {
            worker_id: _WorkerHealthTracker(worker_id=worker_id)
            for worker_id in worker_ids
        }
        self._health_transitions: list[WorkerHealthTransition] = []
        self._health_monitor_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self._health_monitor_task is not None:
            return
        await self._refresh_health(force=True)
        self._health_monitor_task = asyncio.create_task(
            self._health_monitor_loop(), name="treechat-worker-health-monitor"
        )

    async def route(
        self, task_id: str, *, affinity_key: str | None
    ) -> RoutingDecision:
        if self.mode in (
            RouterMode.BRANCH_AFFINITY,
            RouterMode.BRANCH_AFFINITY_BOUNDED,
        ) and not affinity_key:
            raise ValueError(f"{self.mode.value} routing requires an affinity_key")
        # Interactive failover keeps the historical synchronous-refresh default.
        # High-throughput callers may use the monitored health snapshot instead;
        # router leases below still make load/capacity decisions immediately.
        health_by_worker = await self._refresh_health(
            force=self.refresh_health_on_every_route
        )

        async with self._lock:
            if task_id in self._leases:
                raise ValueError(f"Task already has a Router lease: {task_id}")
            load_snapshot = self._build_load_snapshot(health_by_worker)
            healthy_worker_ids = [
                endpoint.worker_id
                for endpoint in self._endpoints
                if health_by_worker[endpoint.worker_id].selectable
            ]
            if not healthy_worker_ids:
                raise RouterUnavailableError("No healthy worker endpoint is available")

            affinity_worker: str | None = None
            rerouted = False
            reroute_reason: RerouteReason | None = None
            if self.mode is RouterMode.ROUND_ROBIN:
                selected_worker = self._select_round_robin(healthy_worker_ids)
                reason = "round_robin_next_healthy"
            elif self.mode is RouterMode.LEAST_LOAD:
                selected_worker = min(
                    healthy_worker_ids,
                    key=lambda worker_id: (
                        int(load_snapshot[worker_id]["effective_load"]),
                        self._worker_order(worker_id),
                    ),
                )
                reason = "least_effective_load_then_worker_order"
            elif self.mode is RouterMode.BRANCH_AFFINITY:
                assert affinity_key is not None
                affinity_worker = self._select_branch_affinity(
                    [endpoint.worker_id for endpoint in self._endpoints],
                    affinity_key,
                )
                if affinity_worker in healthy_worker_ids:
                    selected_worker = affinity_worker
                    reason = (
                        "branch_affinity_sha256_first64_modulo_configured_workers"
                    )
                else:
                    selected_worker = self._select_least_load(
                        healthy_worker_ids, load_snapshot
                    )
                    rerouted = True
                    reroute_reason = RerouteReason.HEALTH_UNAVAILABLE
                    reason = "branch_affinity_health_failover_least_load"
            else:
                assert self.mode is RouterMode.BRANCH_AFFINITY_BOUNDED
                assert affinity_key is not None
                affinity_worker = self._select_branch_affinity(
                    [endpoint.worker_id for endpoint in self._endpoints],
                    affinity_key,
                )
                affinity_status = health_by_worker[affinity_worker]
                affinity_health = affinity_status.reported_health
                if not affinity_status.selectable:
                    selected_worker = self._select_least_load(
                        healthy_worker_ids, load_snapshot
                    )
                    rerouted = True
                    reroute_reason = RerouteReason.HEALTH_UNAVAILABLE
                    reason = "branch_affinity_bounded_health_failover"
                elif (
                    affinity_health is not None
                    and int(load_snapshot[affinity_worker]["effective_load"])
                    < affinity_health.max_concurrency
                ):
                    selected_worker = affinity_worker
                    reason = "branch_affinity_bounded_within_capacity"
                else:
                    fallback_worker_ids = [
                        worker_id
                        for worker_id in healthy_worker_ids
                        if worker_id != affinity_worker
                    ]
                    if not fallback_worker_ids:
                        raise RouterUnavailableError(
                            "Affinity worker is at capacity and no healthy "
                            "fallback is available"
                        )
                    selected_worker = self._select_least_load(
                        fallback_worker_ids, load_snapshot
                    )
                    rerouted = True
                    reroute_reason = RerouteReason.CAPACITY
                    reason = "branch_affinity_bounded_capacity_fallback"

            self._assigned[selected_worker] += 1
            self._leases[task_id] = selected_worker
            decision = RoutingDecision(
                task_id=task_id,
                affinity_key=affinity_key,
                candidate_workers=tuple(
                    endpoint.worker_id for endpoint in self._endpoints
                ),
                selected_worker=selected_worker,
                router_mode=self.mode,
                routing_decision_at=self._clock(),
                decision_reason=reason,
                load_snapshot=load_snapshot,
                affinity_worker=affinity_worker,
                rerouted=rerouted,
                reroute_reason=reroute_reason,
            )
            self._decisions.append(decision)
            LOGGER.info(
                "router_decision %s",
                json.dumps(asdict(decision), ensure_ascii=False, default=str),
            )
            return decision

    async def stream_chat(
        self,
        decision: RoutingDecision,
        messages: list[ChatMessage],
    ) -> AsyncIterator[str | ProviderTelemetry]:
        endpoint = self._endpoint_for(decision)
        client = self._client_or_create()
        try:
            async with client.stream(
                "POST",
                f"{endpoint.base_url}/v1/chat",
                json={
                    "task_id": decision.task_id,
                    "messages": [message.model_dump(mode="json") for message in messages],
                },
            ) as response:
                await self._raise_for_worker_error(response, endpoint)
                self._validate_worker_identity(response, endpoint)
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError as error:
                        raise WorkerRequestError(
                            f"{endpoint.worker_id} returned invalid NDJSON"
                        ) from error
                    if chunk.get("worker_id") != endpoint.worker_id:
                        raise WorkerRequestError(
                            f"{endpoint.worker_id} returned a mismatched worker_id"
                        )
                    delta = chunk.get("delta")
                    if isinstance(delta, str) and delta:
                        yield delta
                    telemetry = chunk.get("telemetry")
                    if isinstance(telemetry, dict):
                        yield ProviderTelemetry.model_validate(telemetry)
        except httpx.HTTPError as error:
            raise WorkerRequestError(
                f"Worker request failed for {endpoint.worker_id}: {error}"
            ) from error

    async def structure(
        self,
        decision: RoutingDecision,
        prompt: str,
        response: str,
    ) -> SemanticCard:
        endpoint = self._endpoint_for(decision)
        client = self._client_or_create()
        try:
            worker_response = await client.post(
                f"{endpoint.base_url}/v1/structure",
                json={
                    "task_id": decision.task_id,
                    "prompt": prompt,
                    "response": response,
                },
            )
            await self._raise_for_worker_error(worker_response, endpoint)
            self._validate_worker_identity(worker_response, endpoint)
            body = worker_response.json()
            if body.get("worker_id") != endpoint.worker_id:
                raise WorkerRequestError(
                    f"{endpoint.worker_id} returned a mismatched worker_id"
                )
            return SemanticCard.model_validate(body.get("semantic_card"))
        except (httpx.HTTPError, ValueError) as error:
            if isinstance(error, WorkerRequestError):
                raise
            raise WorkerRequestError(
                f"Worker request failed for {endpoint.worker_id}: {error}"
            ) from error

    async def release(self, decision: RoutingDecision) -> None:
        async with self._lock:
            leased_worker = self._leases.get(decision.task_id)
            if leased_worker != decision.selected_worker:
                return
            self._leases.pop(decision.task_id, None)
            self._assigned[leased_worker] = max(
                0, self._assigned[leased_worker] - 1
            )

    async def aclose(self) -> None:
        monitor = self._health_monitor_task
        self._health_monitor_task = None
        if monitor is not None:
            monitor.cancel()
            try:
                await monitor
            except asyncio.CancelledError:
                pass
        if self._owns_client and self._client is not None:
            await self._client.aclose()

    async def health_status(
        self, *, refresh: bool = False
    ) -> list[WorkerHealthStatus]:
        if refresh:
            statuses = await self._refresh_health(force=True)
            return [
                statuses[endpoint.worker_id].model_copy(deep=True)
                for endpoint in self._endpoints
            ]
        async with self._health_lock:
            return [
                self._status_for(
                    self._health_trackers[endpoint.worker_id]
                ).model_copy(deep=True)
                for endpoint in self._endpoints
            ]

    @property
    def decision_log(self) -> tuple[RoutingDecision, ...]:
        return tuple(self._decisions)

    @property
    def health_transition_log(self) -> tuple[WorkerHealthTransition, ...]:
        return tuple(self._health_transitions)

    async def _health_monitor_loop(self) -> None:
        while True:
            await asyncio.sleep(self.health_check_interval_seconds)
            try:
                await self._refresh_health(force=True)
            except asyncio.CancelledError:
                raise
            except Exception:
                LOGGER.exception("worker_health_monitor_failed")

    async def _refresh_health(
        self, *, force: bool
    ) -> dict[str, WorkerHealthStatus]:
        async with self._health_lock:
            now_monotonic = time.monotonic()
            due_endpoints = [
                endpoint
                for endpoint in self._endpoints
                if force
                or self._health_trackers[endpoint.worker_id].last_check_monotonic
                is None
                or now_monotonic
                - (
                    self._health_trackers[
                        endpoint.worker_id
                    ].last_check_monotonic
                    or 0
                )
                >= self.health_check_interval_seconds
            ]
            if due_endpoints:
                results = await asyncio.gather(
                    *(self._read_health(endpoint) for endpoint in due_endpoints)
                )
                checked_at = self._clock()
                checked_monotonic = time.monotonic()
                for endpoint, (health, error) in zip(
                    due_endpoints, results, strict=True
                ):
                    self._record_health_result(
                        self._health_trackers[endpoint.worker_id],
                        health=health,
                        error=error,
                        checked_at=checked_at,
                        checked_monotonic=checked_monotonic,
                    )
            return {
                endpoint.worker_id: self._status_for(
                    self._health_trackers[endpoint.worker_id]
                )
                for endpoint in self._endpoints
            }

    def _record_health_result(
        self,
        tracker: _WorkerHealthTracker,
        *,
        health: WorkerHealth | None,
        error: str | None,
        checked_at: int,
        checked_monotonic: float,
    ) -> None:
        tracker.last_check_at = checked_at
        tracker.last_check_monotonic = checked_monotonic
        probe_succeeded = health is not None and health.healthy
        tracker.last_probe_succeeded = probe_succeeded
        if health is not None:
            tracker.reported_health = health.model_copy(deep=True)

        if probe_succeeded:
            tracker.last_success_at = checked_at
            tracker.last_error = None
            tracker.consecutive_failures = 0
            tracker.consecutive_successes = min(
                tracker.consecutive_successes + 1, self.recovery_threshold
            )
            if tracker.state is WorkerHealthState.UNHEALTHY:
                self._transition_health_state(
                    tracker,
                    WorkerHealthState.RECOVERING,
                    at=checked_at,
                    reason="health_probe_succeeded",
                )
                tracker.consecutive_successes = 1
            if (
                tracker.state is WorkerHealthState.RECOVERING
                and tracker.consecutive_successes >= self.recovery_threshold
            ):
                self._transition_health_state(
                    tracker,
                    WorkerHealthState.HEALTHY,
                    at=checked_at,
                    reason="recovery_threshold_reached",
                )
            return

        tracker.last_failure_at = checked_at
        tracker.last_error = error or "worker reported unhealthy"
        tracker.consecutive_successes = 0
        tracker.consecutive_failures += 1
        if tracker.state is WorkerHealthState.RECOVERING:
            self._transition_health_state(
                tracker,
                WorkerHealthState.UNHEALTHY,
                at=checked_at,
                reason="recovery_probe_failed",
            )
        elif (
            tracker.state is WorkerHealthState.HEALTHY
            and tracker.consecutive_failures >= self.failure_threshold
        ):
            self._transition_health_state(
                tracker,
                WorkerHealthState.UNHEALTHY,
                at=checked_at,
                reason="failure_threshold_reached",
            )

    def _transition_health_state(
        self,
        tracker: _WorkerHealthTracker,
        state: WorkerHealthState,
        *,
        at: int,
        reason: str,
    ) -> None:
        if tracker.state is state:
            return
        previous = tracker.state
        tracker.state = state
        tracker.last_state_change_at = at
        transition = WorkerHealthTransition(
            worker_id=tracker.worker_id,
            from_state=previous,
            to_state=state,
            at=at,
            reason=reason,
        )
        self._health_transitions.append(transition)
        LOGGER.info(
            "worker_health_transition %s",
            json.dumps(asdict(transition), ensure_ascii=False, default=str),
        )

    @staticmethod
    def _status_for(tracker: _WorkerHealthTracker) -> WorkerHealthStatus:
        selectable = bool(
            tracker.state is WorkerHealthState.HEALTHY
            and tracker.last_probe_succeeded
            and tracker.reported_health is not None
            and tracker.reported_health.healthy
        )
        return WorkerHealthStatus(
            worker_id=tracker.worker_id,
            state=tracker.state,
            selectable=selectable,
            last_probe_succeeded=tracker.last_probe_succeeded,
            consecutive_failures=tracker.consecutive_failures,
            consecutive_successes=tracker.consecutive_successes,
            last_check_at=tracker.last_check_at,
            last_success_at=tracker.last_success_at,
            last_failure_at=tracker.last_failure_at,
            last_state_change_at=tracker.last_state_change_at,
            last_error=tracker.last_error,
            reported_health=(
                tracker.reported_health.model_copy(deep=True)
                if tracker.reported_health is not None
                else None
            ),
        )

    async def _read_health(
        self, endpoint: WorkerEndpoint
    ) -> tuple[WorkerHealth | None, str | None]:
        try:
            response = await self._client_or_create().get(
                f"{endpoint.base_url}/health",
                timeout=self._health_timeout_seconds,
            )
            response.raise_for_status()
            health = WorkerHealth.model_validate(response.json())
            if health.worker_id != endpoint.worker_id:
                return None, (
                    f"configured {endpoint.worker_id} but endpoint reported "
                    f"{health.worker_id}"
                )
            return health, None
        except (httpx.HTTPError, ValueError) as error:
            return None, str(error)

    def _client_or_create(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=None)
        return self._client

    def _build_load_snapshot(
        self,
        health_by_worker: dict[str, WorkerHealthStatus],
    ) -> dict[str, dict[str, object]]:
        snapshot: dict[str, dict[str, object]] = {}
        for endpoint in self._endpoints:
            status = health_by_worker[endpoint.worker_id]
            health = status.reported_health
            assigned_pending = self._assigned[endpoint.worker_id]
            reported_load = (
                health.running + health.waiting if health is not None else 0
            )
            # A per-route health probe makes the reported load current enough to
            # combine with leases.  In monitored/cached mode, short inference
            # requests can finish many times within one health interval, so an
            # old reported peak must not override the controller's live leases.
            effective_load = (
                max(reported_load, assigned_pending)
                if self.refresh_health_on_every_route
                else assigned_pending
            )
            snapshot[endpoint.worker_id] = {
                "healthy": status.selectable,
                "health_state": status.state.value,
                "last_probe_succeeded": status.last_probe_succeeded,
                "consecutive_failures": status.consecutive_failures,
                "consecutive_successes": status.consecutive_successes,
                "last_check_at": status.last_check_at,
                "running": health.running if health is not None else 0,
                "waiting": health.waiting if health is not None else 0,
                "worker_assigned_pending": (
                    health.assigned_pending if health is not None else 0
                ),
                "router_assigned_pending": assigned_pending,
                "effective_load": effective_load,
                "effective_load_source": (
                    "max_reported_and_router_leases"
                    if self.refresh_health_on_every_route
                    else "router_leases"
                ),
                "max_concurrency": (
                    health.max_concurrency if health is not None else 0
                ),
                "health_error": status.last_error,
            }
        return snapshot

    def _select_least_load(
        self,
        worker_ids: list[str],
        load_snapshot: dict[str, dict[str, object]],
    ) -> str:
        return min(
            worker_ids,
            key=lambda worker_id: (
                int(load_snapshot[worker_id]["effective_load"]),
                self._worker_order(worker_id),
            ),
        )

    def _select_round_robin(self, healthy_worker_ids: list[str]) -> str:
        worker_count = len(self._endpoints)
        healthy = set(healthy_worker_ids)
        for offset in range(worker_count):
            index = (self._round_robin_index + offset) % worker_count
            worker_id = self._endpoints[index].worker_id
            if worker_id in healthy:
                self._round_robin_index = (index + 1) % worker_count
                return worker_id
        raise RouterUnavailableError("No healthy worker endpoint is available")

    @staticmethod
    def _select_branch_affinity(
        healthy_worker_ids: list[str], affinity_key: str
    ) -> str:
        index = stable_affinity_index(affinity_key, len(healthy_worker_ids))
        return healthy_worker_ids[index]

    def _worker_order(self, worker_id: str) -> int:
        return next(
            index
            for index, endpoint in enumerate(self._endpoints)
            if endpoint.worker_id == worker_id
        )

    def _endpoint_for(self, decision: RoutingDecision) -> WorkerEndpoint:
        try:
            return self._by_worker_id[decision.selected_worker]
        except KeyError as error:
            raise WorkerRequestError(
                f"Unknown selected worker: {decision.selected_worker}"
            ) from error

    @staticmethod
    async def _raise_for_worker_error(
        response: httpx.Response, endpoint: WorkerEndpoint
    ) -> None:
        if not response.is_error:
            return
        await response.aread()
        raise WorkerRequestError(
            f"{endpoint.worker_id} failed with status {response.status_code}"
        )

    @staticmethod
    def _validate_worker_identity(
        response: httpx.Response, endpoint: WorkerEndpoint
    ) -> None:
        if response.headers.get("X-Worker-Id") != endpoint.worker_id:
            raise WorkerRequestError(
                f"{endpoint.worker_id} response identity did not match selection"
            )


class InProcessTaskRouter:
    """Compatibility adapter for deterministic provider-injected unit tests."""

    def __init__(
        self,
        provider: TaskProvider,
        *,
        mode: RouterMode,
        clock: Callable[[], int],
        worker_id: str = "in-process-test-worker",
    ) -> None:
        self.mode = mode
        self._provider = provider
        self._clock = clock
        self._worker_id = worker_id
        self._assigned = 0
        self._leases: set[str] = set()
        self._decisions: list[RoutingDecision] = []
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        return

    async def route(
        self, task_id: str, *, affinity_key: str | None
    ) -> RoutingDecision:
        if self.mode in (
            RouterMode.BRANCH_AFFINITY,
            RouterMode.BRANCH_AFFINITY_BOUNDED,
        ) and not affinity_key:
            raise ValueError(f"{self.mode.value} routing requires an affinity_key")
        async with self._lock:
            if task_id in self._leases:
                raise ValueError(f"Task already has a Router lease: {task_id}")
            decision_at = self._clock()
            snapshot = {
                self._worker_id: {
                    "healthy": True,
                    "health_state": WorkerHealthState.HEALTHY.value,
                    "last_probe_succeeded": True,
                    "consecutive_failures": 0,
                    "consecutive_successes": 1,
                    "last_check_at": decision_at,
                    "running": self._assigned,
                    "waiting": 0,
                    "worker_assigned_pending": 0,
                    "router_assigned_pending": self._assigned,
                    "effective_load": self._assigned,
                    "max_concurrency": 1,
                    "health_error": None,
                }
            }
            self._assigned += 1
            self._leases.add(task_id)
            decision = RoutingDecision(
                task_id=task_id,
                affinity_key=affinity_key,
                candidate_workers=(self._worker_id,),
                selected_worker=self._worker_id,
                router_mode=self.mode,
                routing_decision_at=decision_at,
                decision_reason="in_process_test_adapter",
                load_snapshot=snapshot,
                affinity_worker=(
                    self._worker_id
                    if self.mode
                    in (
                        RouterMode.BRANCH_AFFINITY,
                        RouterMode.BRANCH_AFFINITY_BOUNDED,
                    )
                    else None
                ),
                rerouted=False,
                reroute_reason=None,
            )
            self._decisions.append(decision)
            return decision

    async def stream_chat(
        self,
        decision: RoutingDecision,
        messages: list[ChatMessage],
    ) -> AsyncIterator[str | ProviderTelemetry]:
        async for item in self._provider.stream_chat(messages):
            yield item

    async def structure(
        self,
        decision: RoutingDecision,
        prompt: str,
        response: str,
    ) -> SemanticCard:
        return await self._provider.structure(prompt, response)

    async def release(self, decision: RoutingDecision) -> None:
        async with self._lock:
            if decision.task_id not in self._leases:
                return
            self._leases.remove(decision.task_id)
            self._assigned = max(0, self._assigned - 1)

    async def aclose(self) -> None:
        return

    async def health_status(
        self, *, refresh: bool = False
    ) -> list[WorkerHealthStatus]:
        checked_at = self._clock()
        return [
            WorkerHealthStatus(
                worker_id=self._worker_id,
                state=WorkerHealthState.HEALTHY,
                selectable=True,
                last_probe_succeeded=True,
                consecutive_failures=0,
                consecutive_successes=1,
                last_check_at=checked_at,
                last_success_at=checked_at,
                last_failure_at=None,
                last_state_change_at=None,
                last_error=None,
                reported_health=WorkerHealth(
                    worker_id=self._worker_id,
                    healthy=True,
                    running=self._assigned,
                    waiting=0,
                    assigned_pending=0,
                    max_concurrency=1,
                    total_requests=0,
                    cancelled_requests=0,
                ),
            )
        ]

    @property
    def decision_log(self) -> tuple[RoutingDecision, ...]:
        return tuple(self._decisions)

    @property
    def health_transition_log(self) -> tuple[WorkerHealthTransition, ...]:
        return ()


def parse_worker_endpoints(raw: str | None = None) -> list[WorkerEndpoint]:
    value = raw if raw is not None else os.getenv("TREECHAT_WORKERS", DEFAULT_WORKERS)
    endpoints: list[WorkerEndpoint] = []
    for item in value.split(","):
        normalized = item.strip()
        if not normalized:
            continue
        worker_id, separator, base_url = normalized.partition("=")
        if not separator or not worker_id.strip() or not base_url.strip():
            raise ValueError(
                "TREECHAT_WORKERS must use worker-id=http://host:port entries"
            )
        endpoints.append(
            WorkerEndpoint(
                worker_id=worker_id.strip(),
                base_url=base_url.strip().rstrip("/"),
            )
        )
    if not endpoints:
        raise ValueError("TREECHAT_WORKERS must configure at least one worker")
    return endpoints


def resolve_router_mode(override: RouterMode | str | None) -> RouterMode:
    raw = override if override is not None else os.getenv(
        "TREECHAT_ROUTER_MODE", RouterMode.ROUND_ROBIN.value
    )
    if isinstance(raw, RouterMode):
        return raw
    try:
        return RouterMode(str(raw).strip().lower())
    except ValueError as error:
        raise ValueError(
            "TREECHAT_ROUTER_MODE must be 'round_robin', 'least_load', "
            "'branch_affinity', or 'branch_affinity_bounded'"
        ) from error


def stable_affinity_index(affinity_key: str, worker_count: int) -> int:
    if not affinity_key:
        raise ValueError("affinity_key must be non-empty")
    if worker_count < 1:
        raise ValueError("worker_count must be positive")
    digest = hashlib.sha256(affinity_key.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], byteorder="big") % worker_count


def resolve_positive_float_setting(
    override: float | None, env_name: str, default: float
) -> float:
    raw: object = override if override is not None else os.getenv(env_name, str(default))
    try:
        value = float(raw)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{env_name} must be a positive finite number") from error
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f"{env_name} must be a positive finite number")
    return value


def resolve_positive_int_setting(
    override: int | None, env_name: str, default: int
) -> int:
    raw: object = override if override is not None else os.getenv(env_name, str(default))
    if isinstance(raw, bool):
        raise ValueError(f"{env_name} must be a positive integer")
    try:
        value = int(raw)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{env_name} must be a positive integer") from error
    if value < 1 or str(raw).strip() != str(value):
        raise ValueError(f"{env_name} must be a positive integer")
    return value
