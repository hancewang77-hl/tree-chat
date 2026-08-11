from __future__ import annotations

import asyncio
import logging
from collections.abc import Coroutine


LOGGER = logging.getLogger(__name__)


class ExecutionHandleRegistry:
    """Indexes live asyncio execution handles by authoritative server task ID."""

    def __init__(self) -> None:
        self._handles: dict[str, asyncio.Task[None]] = {}
        self._cancel_requested: set[str] = set()

    def start(
        self,
        task_id: str,
        execution: Coroutine[object, object, None],
    ) -> asyncio.Task[None]:
        if task_id in self._handles:
            execution.close()
            raise ValueError(f"Execution handle already exists for {task_id}")
        handle = asyncio.create_task(execution, name=f"treechat-{task_id}")
        self._handles[task_id] = handle
        handle.add_done_callback(
            lambda completed, registered_task_id=task_id: self._on_done(
                registered_task_id, completed
            )
        )
        return handle

    def request_cancel(self, task_id: str) -> asyncio.Task[None] | None:
        handle = self._handles.get(task_id)
        if handle is None or handle.done():
            return handle
        if task_id not in self._cancel_requested:
            self._cancel_requested.add(task_id)
            handle.cancel()
        return handle

    def get(self, task_id: str) -> asyncio.Task[None] | None:
        return self._handles.get(task_id)

    async def wait_stopped(self, handle: asyncio.Task[None] | None) -> None:
        if handle is None:
            return
        try:
            await asyncio.shield(handle)
        except asyncio.CancelledError:
            if not handle.cancelled():
                raise
        except Exception:
            # The done callback logs unexpected errors; API callers still receive
            # the authoritative Task state rather than an execution exception.
            return

    @property
    def active_count(self) -> int:
        return len(self._handles)

    def _on_done(self, task_id: str, handle: asyncio.Task[None]) -> None:
        if self._handles.get(task_id) is handle:
            self._handles.pop(task_id, None)
        self._cancel_requested.discard(task_id)
        try:
            handle.result()
        except asyncio.CancelledError:
            return
        except Exception:
            LOGGER.exception("Uncaught task execution error for %s", task_id)
