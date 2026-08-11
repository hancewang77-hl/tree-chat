"""TreeChat gateway for one real, independently hosted vLLM worker."""

from .app import RealWorkerConfig, create_real_worker_app

__all__ = ["RealWorkerConfig", "create_real_worker_app"]
