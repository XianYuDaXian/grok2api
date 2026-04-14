"""
Grok2API 应用入口

FastAPI 应用初始化和路由注册
"""

from contextlib import asynccontextmanager
import argparse
import os
import platform
import sys
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
APP_DIR = BASE_DIR / "app"

# Ensure the project root is on sys.path (helps when Vercel sets a different CWD)
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

env_file = BASE_DIR / ".env"
if env_file.exists():
    load_dotenv(env_file)

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi import Depends  # noqa: E402

from app.core.auth import verify_api_key  # noqa: E402
from app.core.config import get_config  # noqa: E402
from app.core.logger import logger, setup_logging  # noqa: E402
from app.core.exceptions import register_exception_handlers  # noqa: E402
from app.core.response_middleware import ResponseLoggerMiddleware  # noqa: E402
from app.api.v1.chat import router as chat_router  # noqa: E402
from app.api.v1.image import router as image_router  # noqa: E402
from app.api.v1.nsfw import router as nsfw_router  # noqa: E402
from app.api.v1.files import router as files_router  # noqa: E402
from app.api.v1.models import router as models_router  # noqa: E402
from app.api.v1.response import router as responses_router  # noqa: E402
from app.services.token import get_scheduler  # noqa: E402
from app.api.v1.admin_api import router as admin_router
from app.api.v1.public_api import router as public_router
from app.api.v1.video_api import router as video_router
from app.api.pages import router as pages_router
from fastapi.staticfiles import StaticFiles

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动早期先仅初始化控制台日志，配置加载后再按配置决定是否写文件。
    setup_logging(
        level=os.getenv("LOG_LEVEL", "INFO"), json_console=False, file_logging=False
    )

    # 1. 注册服务默认配置
    from app.core.config import config, register_defaults
    from app.services.grok.defaults import get_grok_defaults

    register_defaults(get_grok_defaults())

    # 2. 加载配置
    await config.load()
    setup_logging(
        level=os.getenv("LOG_LEVEL", "INFO"),
        json_console=False,
        file_logging=get_config("app.app_log_enabled", True),
    )

    # 3. 启动服务显示
    logger.info("Starting Grok2API...")
    logger.info(f"Platform: {platform.system()} {platform.release()}")
    logger.info(f"Python: {sys.version.split()[0]}")

    # 4. 启动 Token 刷新调度器
    refresh_enabled = get_config("token.auto_refresh", True)
    if refresh_enabled:
        basic_interval = get_config("token.refresh_interval_hours", 8)
        super_interval = get_config("token.super_refresh_interval_hours", 2)
        interval = min(basic_interval, super_interval)
        scheduler = get_scheduler(interval)
        scheduler.start()

    # 5. 启动 cf_clearance 自动刷新
    #    环境变量 FLARESOLVERR_URL 会作为初始值写入配置（兼容旧部署方式）
    _flaresolverr_env = os.getenv("FLARESOLVERR_URL", "")
    if _flaresolverr_env and not get_config("proxy.flaresolverr_url"):
        await config.update({
            "proxy": {
                "enabled": True,
                "flaresolverr_url": _flaresolverr_env,
                "refresh_interval": int(os.getenv("CF_REFRESH_INTERVAL", "600")),
                "timeout": int(os.getenv("CF_TIMEOUT", "60")),
            }
        })

    from app.services.cf_refresh import start as cf_refresh_start
    cf_refresh_start()

    logger.info("Application startup complete.")
    yield

    # 关闭
    logger.info("Shutting down Grok2API...")

    from app.services.cf_refresh import stop as cf_refresh_stop
    cf_refresh_stop()

    from app.core.storage import StorageFactory

    if StorageFactory._instance:
        await StorageFactory._instance.close()

    if refresh_enabled:
        scheduler = get_scheduler()
        scheduler.stop()


def create_app() -> FastAPI:
    """创建 FastAPI 应用"""
    app = FastAPI(
        title="Grok2API",
        lifespan=lifespan,
    )

    # CORS 配置
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 请求日志和 ID 中间件
    app.add_middleware(ResponseLoggerMiddleware)

    # 注册异常处理器
    register_exception_handlers(app)

    # 注册路由
    app.include_router(
        chat_router, prefix="/v1", dependencies=[Depends(verify_api_key)]
    )
    app.include_router(
        image_router, prefix="/v1", dependencies=[Depends(verify_api_key)]
    )
    app.include_router(
        nsfw_router, prefix="/v1", dependencies=[Depends(verify_api_key)]
    )
    app.include_router(
        models_router, prefix="/v1", dependencies=[Depends(verify_api_key)]
    )
    app.include_router(
        responses_router, prefix="/v1", dependencies=[Depends(verify_api_key)]
    )
    # 兼容部分客户端直接请求 /responses（不带 /v1）
    app.include_router(
        responses_router, dependencies=[Depends(verify_api_key)]
    )
    app.include_router(
        video_router, prefix="/v1", dependencies=[Depends(verify_api_key)]
    )
    app.include_router(files_router, prefix="/v1/files")

    # 静态文件服务
    static_dir = APP_DIR / "static"
    if static_dir.exists():
        app.mount("/static", StaticFiles(directory=static_dir), name="static")

    # 注册管理与公共路由
    app.include_router(admin_router, prefix="/v1/admin")
    app.include_router(public_router, prefix="/v1/public")
    app.include_router(pages_router)

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="启动 Grok2API 服务")
    parser.add_argument(
        "--host",
        default=os.getenv("SERVER_HOST", "0.0.0.0"),
        help="监听地址，默认读取 SERVER_HOST 或 0.0.0.0",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("SERVER_PORT", "8000")),
        help="监听端口，默认读取 SERVER_PORT 或 8000",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=int(os.getenv("SERVER_WORKERS", "1")),
        help="Worker 数量，默认读取 SERVER_WORKERS 或 1",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="开启热重载（开发模式）",
    )

    args = parser.parse_args()

    host = args.host
    port = args.port
    workers = args.workers
    reload_enabled = args.reload

    # 平台检查
    is_windows = platform.system() == "Windows"

    # 自动降级
    if is_windows and workers > 1:
        logger.warning(
            f"Windows platform detected. Multiple workers ({workers}) is not supported. "
            "Using single worker instead."
        )
        workers = 1

    # uvicorn 不支持 reload 与多 worker 同时启用
    if reload_enabled and workers > 1:
        logger.warning(
            f"Reload mode detected. Multiple workers ({workers}) is not supported. "
            "Using single worker instead."
        )
        workers = 1

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        workers=workers,
        reload=reload_enabled,
        log_level=os.getenv("LOG_LEVEL", "INFO").lower(),
    )
