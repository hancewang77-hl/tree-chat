from __future__ import annotations

import os

import uvicorn

from .app import app


def main() -> None:
    uvicorn.run(
        app,
        host=os.getenv("TREECHAT_REAL_WORKER_HOST", "127.0.0.1"),
        port=int(os.getenv("TREECHAT_REAL_WORKER_PORT", "8101")),
        log_level=os.getenv("TREECHAT_REAL_WORKER_LOG_LEVEL", "info"),
        access_log=False,
    )


if __name__ == "__main__":
    main()
