import os
import shutil
from datetime import datetime, timezone
import asyncio
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import verify_app_key
from app.core.config import config
from app.core.logger import logger, LOG_DIR
from app.services.grok.services.model import ModelService
from app.services.token import get_token_manager
from app.core.storage import (
    get_storage as get_storage_backend,
    LocalStorage,
    RedisStorage,
    SQLStorage,
)
from app.services.cf_refresh.scheduler import refresh_once
from app.services.reverse.browser_bridge import (
    bridge_enabled as browser_bridge_enabled,
    get_cached_global_probe,
    get_browser_profile_session,
    refresh_browser_probe_managed,
)

router = APIRouter()


_statsig_manual_refresh_lock = asyncio.Lock()


def _clear_log_dir() -> dict:
    """清空日志目录内容，保留目录本身。"""
    log_dir = Path(LOG_DIR)
    log_dir.mkdir(parents=True, exist_ok=True)
    deleted_files = 0
    deleted_dirs = 0
    released_bytes = 0
    skipped_files: list[str] = []

    def _try_remove_file(target: Path) -> None:
        nonlocal deleted_files, released_bytes
        try:
            released_bytes += target.stat().st_size
        except OSError:
            pass
        try:
            target.unlink(missing_ok=True)
            deleted_files += 1
        except OSError as exc:
            # Windows 下 bridge 进程常占用 cloakbrowser_bridge.log，删除失败时尝试截断
            if getattr(exc, "winerror", None) == 32 or exc.errno in (13, 32):
                try:
                    with target.open("w", encoding="utf-8"):
                        pass
                    deleted_files += 1
                    return
                except OSError:
                    skipped_files.append(str(target.name))
                    return
            raise

    for child in log_dir.iterdir():
        try:
            if child.is_file() or child.is_symlink():
                _try_remove_file(child)
                continue
            if child.is_dir():
                for nested in child.rglob("*"):
                    if nested.is_file():
                        try:
                            released_bytes += nested.stat().st_size
                        except OSError:
                            pass
                shutil.rmtree(child, ignore_errors=False)
                deleted_dirs += 1
        except FileNotFoundError:
            continue

    return {
        "log_dir": str(log_dir),
        "deleted_files": deleted_files,
        "deleted_dirs": deleted_dirs,
        "released_bytes": released_bytes,
        "skipped_files": skipped_files,
    }


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
        before_seed, before_hex = _statsig_pair_from_config()
        before_xid = str(config.get("proxy.statsig_id", "") or "").strip()
        await config.update(data)
        after_seed, after_hex = _statsig_pair_from_config()
        after_xid = str(config.get("proxy.statsig_id", "") or "").strip()
        await _touch_statsig_manual_meta(
            seed=after_seed != before_seed and bool(after_seed),
            hx=after_hex != before_hex and bool(after_hex),
            xid=after_xid != before_xid and bool(after_xid),
        )
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



def _statsig_meta_iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _statsig_pair_from_config() -> tuple[str, str]:
    seed = str(config.get("proxy.statsig_seed", "") or "").strip()
    hx = str(config.get("proxy.statsig_hex", "") or "").strip()
    return seed, hx


def _statsig_manual_save_mode() -> str:
    return "manual"


async def _touch_statsig_manual_meta(*, seed: bool, hx: bool, xid: bool) -> None:
    now = _statsig_meta_iso_now()
    mode = _statsig_manual_save_mode()
    patch: dict = {}
    if seed:
        patch["statsig_seed_updated_at"] = now
        patch["statsig_seed_updated_mode"] = mode
    if hx:
        patch["statsig_hex_updated_at"] = now
        patch["statsig_hex_updated_mode"] = mode
    if xid:
        patch["statsig_xid_updated_at"] = now
        patch["statsig_xid_updated_mode"] = mode
    if not patch:
        return
    await config.update({"cloakbrowser": patch})


def _statsig_value_status(*, value: str, updated_at: str, updated_mode: str, pure_enabled: bool = False) -> dict:
    val = str(value or "").strip()
    mode = str(updated_mode or "").strip().lower()
    mode_label = {"manual": "手动", "auto": "自动"}.get(mode, "")
    if val:
        source = "manual" if mode == "manual" else ("auto" if mode == "auto" else "config")
        if pure_enabled and not mode_label:
            source = "generated"
    else:
        source = "none"
    return {
        "value": val,
        "present": bool(val),
        "updated_at": str(updated_at or "").strip(),
        "updated_mode": mode or "none",
        "updated_mode_label": mode_label or ("配置" if val and not mode_label else "未设置"),
        "source": source,
    }


def _current_statsig_payload() -> dict:
    manual_statsig = str(config.get("cloakbrowser.manual_statsig_id", "") or "").strip()
    session_data = {}
    probe_data = get_cached_global_probe() if browser_bridge_enabled() else {}
    request_headers = {}

    try:
        session_data = get_browser_profile_session(0, False) if browser_bridge_enabled() else {}
    except Exception as exc:
        logger.info(f"Statsig status read skipped live browser bridge fetch: {exc}")

    if isinstance(session_data, dict) and isinstance(session_data.get("request_headers"), dict):
        request_headers = session_data.get("request_headers") or {}
    elif isinstance(probe_data, dict) and isinstance(probe_data.get("request_headers"), dict):
        request_headers = probe_data.get("request_headers") or {}

    request_headers = (
        request_headers if isinstance(request_headers, dict) else {}
    )
    statsig = str(
        (session_data or {}).get("x_statsig_id")
        or (probe_data or {}).get("x_statsig_id")
        or request_headers.get("x-statsig-id")
        or ""
    ).strip()
    seed_cfg, hex_cfg = _statsig_pair_from_config()
    captured_fallback = str(
        (session_data or {}).get("captured_at") or (probe_data or {}).get("captured_at") or ""
    ).strip()
    seed_at = str(config.get("cloakbrowser.statsig_seed_updated_at", "") or "").strip()
    seed_mode = str(config.get("cloakbrowser.statsig_seed_updated_mode", "") or "").strip()
    hex_at = str(config.get("cloakbrowser.statsig_hex_updated_at", "") or "").strip()
    hex_mode = str(config.get("cloakbrowser.statsig_hex_updated_mode", "") or "").strip()
    if seed_cfg and not seed_at and captured_fallback:
        seed_at, seed_mode = captured_fallback, seed_mode or "auto"
    if hex_cfg and not hex_at and captured_fallback:
        hex_at, hex_mode = captured_fallback, hex_mode or "auto"
    fixed_xid = str(config.get("proxy.statsig_id", "") or "").strip()
    pure_enabled = bool(config.get("proxy.statsig_pure_enabled", False))
    effective_xid = manual_statsig or statsig or fixed_xid
    xid_mode = str(config.get("cloakbrowser.statsig_xid_updated_mode", "") or "").strip()
    if manual_statsig and not xid_mode:
        xid_mode = "manual"
    elif statsig and not xid_mode:
        xid_mode = "auto"
    elif fixed_xid and not xid_mode:
        xid_mode = "manual"
    return {
        "enabled": browser_bridge_enabled(),
        "x_statsig_id": statsig,
        "manual_statsig_id": manual_statsig,
        "effective_statsig_id": effective_xid,
        "source": (
            "manual"
            if manual_statsig
            else ("browser" if statsig else ("config" if fixed_xid or (seed_cfg and hex_cfg and pure_enabled) else "none"))
        ),
        "captured_at": (session_data or {}).get("captured_at") or (probe_data or {}).get("captured_at") or "",
        "user_agent": (session_data or {}).get("user_agent") or (probe_data or {}).get("user_agent") or "",
        "header_keys": sorted(request_headers.keys()) if request_headers else [],
        "seed": _statsig_value_status(
            value=seed_cfg,
            updated_at=seed_at,
            updated_mode=seed_mode,
        ),
        "hex": _statsig_value_status(
            value=hex_cfg,
            updated_at=hex_at,
            updated_mode=hex_mode,
        ),
        "xid": _statsig_value_status(
            value=effective_xid,
            updated_at=str(config.get("cloakbrowser.statsig_xid_updated_at", "") or "") or (
                (session_data or {}).get("captured_at") or (probe_data or {}).get("captured_at") or ""
            ),
            updated_mode=xid_mode,
            pure_enabled=bool(seed_cfg and hex_cfg and pure_enabled and not effective_xid),
        ),
        "statsig_pure_enabled": pure_enabled,
        "statsig_seed": seed_cfg,
        "statsig_hex": hex_cfg,
    }


@router.get("/config/statsig", dependencies=[Depends(verify_app_key)])
async def get_statsig_status():
    """获取当前浏览器探针捕获到的 x-statsig-id。"""
    try:
        return {
            "status": "success",
            "message": "已获取当前 x-statsig-id",
            "data": _current_statsig_payload(),
        }
    except Exception as e:
        logger.error(f"Get current x-statsig-id failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config/statsig-refresh", dependencies=[Depends(verify_app_key)])
async def refresh_statsig():
    """手动刷新浏览器探针并获取新的 x-statsig-id。"""
    if not browser_bridge_enabled():
        raise HTTPException(status_code=400, detail="CloakBrowser bridge 未启用")
    if _statsig_manual_refresh_lock.locked():
        raise HTTPException(
            status_code=409,
            detail="已有 x-statsig-id 刷新任务进行中，请等待完成后再试",
        )
    try:
        async with _statsig_manual_refresh_lock:
            await refresh_browser_probe_managed("", True, reason="manual")
        return {
            "status": "success",
            "message": "x-statsig-id 已刷新",
            "data": _current_statsig_payload(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Manual x-statsig-id refresh failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config/statsig-manual", dependencies=[Depends(verify_app_key)])
async def update_manual_statsig(data: dict):
    """手动设置/清空 x-statsig-id。"""
    try:
        value = str((data or {}).get("manual_statsig_id") or "").strip()
        await config.update({"cloakbrowser": {"manual_statsig_id": value}})
        if value:
            await _touch_statsig_manual_meta(seed=False, hx=False, xid=True)
        return {
            "status": "success",
            "message": "手动 x-statsig-id 已更新" if value else "手动 x-statsig-id 已清空",
            "data": _current_statsig_payload(),
        }
    except Exception as e:
        logger.error(f"Update manual x-statsig-id failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config/clear-logs", dependencies=[Depends(verify_app_key)])
async def clear_logs():
    """清空日志目录。"""
    try:
        result = _clear_log_dir()
        return {
            "status": "success",
            "message": "日志文件夹已清空",
            "data": result,
        }
    except Exception as e:
        logger.error(f"Clear log directory failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/model-routing/meta", dependencies=[Depends(verify_app_key)])
async def get_model_routing_meta():
    """获取模型池路由界面所需的模型与池元数据。"""
    token_mgr = await get_token_manager()
    pool_names = set(token_mgr.pools.keys())
    pool_names.update({"ssoBasic", "ssoSuper", "ssoHeavy"})

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
