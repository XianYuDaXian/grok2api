"""Compatibility entrypoint for legacy `uvicorn main:app` launches."""

from app.main import app, create_app

__all__ = ["app", "create_app"]


if __name__ == "__main__":
    import os
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=os.getenv("SERVER_HOST", "0.0.0.0"),
        port=int(os.getenv("SERVER_PORT", "8000")),
        workers=int(os.getenv("SERVER_WORKERS", "1")),
        reload=os.getenv("SERVER_RELOAD", "false").strip().lower() in {"1", "true", "yes", "on"},
        log_level=os.getenv("LOG_LEVEL", "INFO").lower(),
    )
