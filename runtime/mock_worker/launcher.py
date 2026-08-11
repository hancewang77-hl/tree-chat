from __future__ import annotations

import argparse
import asyncio
import os
from contextlib import nullcontext

import uvicorn

from .app import MockWorkerConfig, create_mock_worker_app


async def run_server(server: uvicorn.Server) -> None:
    server.capture_signals = lambda: nullcontext()
    await server.serve()


def build_server(worker_id: str) -> uvicorn.Server:
    if worker_id not in {"worker-1", "worker-2"}:
        raise ValueError("worker_id must be worker-1 or worker-2")
    worker_number = "1" if worker_id == "worker-1" else "2"
    default_delay = "0.25" if worker_number == "1" else "0.05"
    worker_app = create_mock_worker_app(
        MockWorkerConfig(
            worker_id=worker_id,
            response_delay_seconds=float(
                os.getenv(
                    f"TREECHAT_MOCK_WORKER{worker_number}_DELAY_SECONDS",
                    default_delay,
                )
            ),
            max_concurrency=int(
                os.getenv("TREECHAT_MOCK_WORKER_MAX_CONCURRENCY", "4")
            ),
        )
    )
    return uvicorn.Server(
        uvicorn.Config(
            worker_app,
            host="127.0.0.1",
            port=8101 if worker_id == "worker-1" else 8102,
            log_level="info",
            access_log=False,
        )
    )


async def main(selected_worker: str = "both") -> None:
    worker_ids = (
        ("worker-1", "worker-2")
        if selected_worker == "both"
        else (selected_worker,)
    )
    servers = [build_server(worker_id) for worker_id in worker_ids]
    tasks = [asyncio.create_task(run_server(server)) for server in servers]
    try:
        await asyncio.gather(*tasks)
    finally:
        for server in servers:
            server.should_exit = True
        await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run TreeChat Mock Workers")
    parser.add_argument(
        "--worker",
        choices=("both", "worker-1", "worker-2"),
        default="both",
        help="Run both workers or one independently stoppable worker",
    )
    args = parser.parse_args()
    try:
        asyncio.run(main(args.worker))
    except KeyboardInterrupt:
        pass
