import os

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import verify_app_key
from app.core.config import config
from app.core.logger import logger
from app.services.grok.services.model import ModelService
from app.services.token import get_token_manager
from app.core.storage import (
    get_storage as get_storage_backend,
    LocalStorage,
    RedisStorage,
    SQLStorage,
)
from app.services.cf_refresh.scheduler import refresh_once

router = APIRouter()


@router.get("/verify", dependencies=[Depends(verify_app_key)])
async def admin_verify():
    """验证后台访问密钥（app_key）"""
    return {"status": "success"}


@router.get("/config", dependencies=[Depends(verify_app_key)])
async def get_config():
    """获取当前配置"""
    # 暴露原始配置字典
    return config._config


@router.post("/config", dependencies=[Depends(verify_app_key)])
async def update_config(data: dict):
    """更新配置"""
    try:
        await config.update(data)
        return {"status": "success", "message": "配置已更新"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config/cf-refresh", dependencies=[Depends(verify_app_key)])
async def refresh_cf_clearance():
    """手动刷新 cf_clearance。"""
    try:
        success = await refresh_once()
        if not success:
            raise HTTPException(status_code=500, detail="刷新失败，请检查 FlareSolverr、代理和网络配置")
        proxy_conf = (config._config or {}).get("proxy", {}) if isinstance(config._config, dict) else {}
        return {
            "status": "success",
            "message": "CF Clearance 已刷新",
            "data": {
                "browser": proxy_conf.get("browser") or "",
                "user_agent": proxy_conf.get("user_agent") or "",
                "has_cf_clearance": bool(proxy_conf.get("cf_clearance")),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Manual cf_clearance refresh failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/model-routing/meta", dependencies=[Depends(verify_app_key)])
async def get_model_routing_meta():
    """获取模型池路由界面所需的模型与池元数据。"""
    token_mgr = await get_token_manager()
    pool_names = set(token_mgr.pools.keys())
    pool_names.update({"ssoBasic", "ssoSuper"})

    models = [
        {
            "id": item.model_id,
            "display_name": item.display_name,
        }
        for item in ModelService.list()
    ]

    return {
        "models": models,
        "pools": sorted(pool_names),
    }


@router.get("/storage", dependencies=[Depends(verify_app_key)])
async def admin_get_storage():
    """获取当前存储模式"""
    storage_type = os.getenv("SERVER_STORAGE_TYPE", "").lower()
    if not storage_type:
        storage = get_storage_backend()
        if isinstance(storage, LocalStorage):
            storage_type = "local"
        elif isinstance(storage, RedisStorage):
            storage_type = "redis"
        elif isinstance(storage, SQLStorage):
            storage_type = {
                "mysql": "mysql",
                "mariadb": "mysql",
                "postgres": "pgsql",
                "postgresql": "pgsql",
                "pgsql": "pgsql",
            }.get(storage.dialect, storage.dialect)
    return {"type": storage_type or "local"}
