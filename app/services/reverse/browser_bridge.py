"""
Browser bridge client for real-browser chat upstream.
"""

from __future__ import annotations

import asyncio
import json
import threading
import time
from pathlib import Path
from typing import Any, AsyncIterator, Dict
from urllib import request as urllib_request
from urllib.error import HTTPError, URLError
from urllib.parse import quote

from app.core.config import get_config
from app.core.exceptions import UpstreamException
from app.core.logger import logger
from app.services.browser_bridge import healthcheck as bridge_healthcheck
from app.services.browser_bridge import start as start_bridge
from app.services.browser_bridge import stop as stop_bridge

_SESSION_CACHE: dict[str, dict[str, Any]] = {}
_PROFILE_CACHE_KEY = "__profile__"
_GLOBAL_PROBE_KEY = "__global_probe__"
_PROBE_CACHE_LOADED = False
_PROBE_REFRESH_LOCK = threading.Lock()
_PROBE_CF_FAILURE = False

BASE_DIR = Path(__file__).resolve().parents[3]


def _bridge_base_url() -> str:
    host = str(get_config("cloakbrowser.bridge_host", "127.0.0.1") or "127.0.0.1").strip()
    port = int(get_config("cloakbrowser.bridge_port", 9081) or 9081)
    return f"http://{host}:{port}"


def bridge_enabled() -> bool:
    return bool(get_config("cloakbrowser.enabled", False))


def bridge_chat_first() -> bool:
    return bool(
        get_config("cloakbrowser.enabled", False)
        and get_config("cloakbrowser.chat_first", True)
    )


def _bridge_chat_timeout() -> float:
    """浏览器真实对话链路超时，需与首包超时策略对齐。"""
    try:
        configured = float(get_config("cloakbrowser.timeout", 120) or 120)
        first_token_timeout = float(get_config("chat.first_token_timeout", 20) or 20)
        return max(min(configured, first_token_timeout + 10), 1.0)
    except Exception:
        return 30.0


def _bridge_probe_timeout() -> float:
    """probe / session 抓取允许更长时间，避免页面自动化未完成就被 Python 侧断开。"""
    try:
        configured = float(get_config("cloakbrowser.timeout", 120) or 120)
        nav_ms = float(get_config("cloakbrowser.nav_timeout_ms", 45000) or 45000)
        ready_ms = float(get_config("cloakbrowser.ready_timeout_ms", 30000) or 30000)
        page_budget = (nav_ms + ready_ms) / 1000.0 + 15.0
        return max(configured, page_budget, 90.0)
    except Exception:
        return 120.0


def _bridge_timeout() -> float:
    """兼容旧调用：默认仍指对话链路超时。"""
    return _bridge_chat_timeout()


def _extract_raw_sso(token: str) -> str:
    raw = str(token or "").strip()
    return raw[4:].strip() if raw.startswith("sso=") else raw


def _probe_cache_path() -> Path:
    configured = str(
        get_config("cloakbrowser.probe_cache_file", "data/cloakbrowser-probe.json")
        or "data/cloakbrowser-probe.json"
    ).strip()
    path = Path(configured)
    if not path.is_absolute():
        path = (BASE_DIR / path).resolve()
    return path


def _probe_cache_ttl_seconds() -> float:
    try:
        return float(get_config("cloakbrowser.probe_cache_ttl_seconds", 0) or 0)
    except Exception:
        return 0.0


def _global_probe_enabled() -> bool:
    return bool(get_config("cloakbrowser.global_probe", True))


def _manual_statsig_configured() -> bool:
    return bool(str(get_config("cloakbrowser.manual_statsig_id", "") or "").strip())


def _extract_statsig_pair_from_probe(probe_data: Dict[str, Any]) -> tuple[str, str]:
    """从浏览器 probe 快照中提取 Statsig seed/hex 配对。"""
    if not isinstance(probe_data, dict):
        return "", ""
    seed = str(probe_data.get("statsig_seed") or "").strip()
    hx = str(probe_data.get("statsig_hex") or "").strip()
    if not _is_valid_statsig_pair(seed, hx):
        return "", ""
    return seed, hx


def _probe_reason_to_mode(reason: str) -> str:
    """将 probe 调用来源映射为管理页展示用的 manual / auto。"""
    r = str(reason or "").strip().lower()
    if r in ("scheduler", "prewarm", "startup", "cf_refresh"):
        return "auto"
    if r in ("manual", "run_probe_once"):
        return "manual"
    return "auto" if r == "scheduler" else "manual"


def _statsig_meta_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


async def _record_statsig_pair_meta(probe_data: Dict[str, Any], *, reason: str = "probe") -> None:
    seed, hx = _extract_statsig_pair_from_probe(probe_data or {})
    if not seed or not hx:
        return
    mode = _probe_reason_to_mode(
        str((probe_data or {}).get("__refresh_reason") or reason or "probe")
    )
    now = _statsig_meta_now()
    try:
        from app.core.config import config

        await config.update(
            {
                "cloakbrowser": {
                    "statsig_seed_updated_at": now,
                    "statsig_seed_updated_mode": mode,
                    "statsig_hex_updated_at": now,
                    "statsig_hex_updated_mode": mode,
                }
            }
        )
    except Exception as exc:
        logger.warning(f"Browser probe statsig pair meta record skipped: {exc}")


async def _record_statsig_xid_meta(*, mode: str) -> None:
    now = _statsig_meta_now()
    try:
        from app.core.config import config

        await config.update(
            {
                "cloakbrowser": {
                    "statsig_xid_updated_at": now,
                    "statsig_xid_updated_mode": mode,
                }
            }
        )
    except Exception as exc:
        logger.warning(f"Statsig xid meta record skipped: {exc}")


def _is_valid_statsig_pair(seed: str, hx: str) -> bool:
    seed=str(seed or '').strip(); hx=str(hx or '').strip()
    if len(seed)<40 or len(seed)>96: return False
    if not hx or len(hx)<60 or len(hx)>68: return False
    try: int(hx,16)
    except Exception: return False
    return True

def _should_persist_statsig_pair(
    current_seed: str,
    current_hex: str,
    new_seed: str,
    new_hex: str,
) -> bool:
    """判断捕获到的配对是否需要写回配置。"""
    if not new_seed or not new_hex:
        return False
    return new_seed != current_seed or new_hex != current_hex



async def _clear_manual_statsig_if_browser_captured(probe_data: Dict[str, Any]) -> None:
    """浏览器抓到有效 x-statsig-id 时，清空手动值，让捕获结果成为生效来源。"""
    if not probe_data or not _has_captured_app_chat_headers(probe_data):
        return
    await _record_statsig_xid_meta(
        mode=_probe_reason_to_mode(str(probe_data.get("__refresh_reason") or "browser_capture"))
    )
    if not _manual_statsig_configured():
        return
    try:
        from app.core.config import config

        await config.update({"cloakbrowser": {"manual_statsig_id": ""}})
        logger.info(
            "Browser probe captured valid x-statsig-id; manual_statsig_id cleared to use browser value"
        )
    except Exception as exc:
        logger.warning(f"Clear manual_statsig_id after browser capture failed: {exc}")


def _has_reusable_probe_source() -> bool:
    if _manual_statsig_configured():
        return True
    probe = _load_global_probe()
    return bool(probe and probe.get("x_statsig_id") and probe.get("request_headers"))


def _cached_probe_session_payload() -> Dict[str, Any]:
    probe = _load_global_probe()
    if not probe:
        return {}
    return {
        "request_headers": probe.get("request_headers") or {},
        "x_statsig_id": probe.get("x_statsig_id") or "",
        "user_agent": probe.get("user_agent") or "",
        "captured_at": probe.get("captured_at") or "",
        "probe_source": "global",
    }


def _use_system_proxy() -> bool:
    return bool(get_config("cloakbrowser.use_system_proxy", True))


def _cf_before_probe_enabled() -> bool:
    if not bool(get_config("cloakbrowser.cf_before_probe", True)):
        return False
    from app.services.cf_refresh.config import get_flaresolverr_url

    return bool(str(get_flaresolverr_url() or "").strip())


def _mark_probe_cf_failure() -> None:
    global _PROBE_CF_FAILURE
    _PROBE_CF_FAILURE = True


def _clear_probe_cf_failure() -> None:
    global _PROBE_CF_FAILURE
    _PROBE_CF_FAILURE = False


def _extract_config_cf_clearance() -> str:
    from app.services.cf_refresh.config import get_cf_clearance_value

    return get_cf_clearance_value()


def _cf_refresh_reuse_grace_seconds() -> float:
    try:
        from app.services.cf_refresh.config import get_refresh_interval

        return float(get_refresh_interval())
    except Exception:
        return 3600.0


def _should_refresh_cf_for_probe(*, force: bool = False) -> tuple[bool, str]:
    from app.services.cf_refresh.config import get_cf_cookies_value, is_cf_clearance_usable
    from app.services.cf_refresh.scheduler import seconds_since_cf_refresh

    if force:
        return True, "forced"
    if _PROBE_CF_FAILURE:
        return True, "last_probe_cf_failed"
    recent = seconds_since_cf_refresh()
    grace = _cf_refresh_reuse_grace_seconds()
    if recent is not None and recent < grace:
        if get_cf_cookies_value() or _extract_config_cf_clearance():
            return False, "cf_refresh_recent"
    if is_cf_clearance_usable():
        return False, "clearance_reusable"
    clearance = _extract_config_cf_clearance()
    if not clearance:
        return True, "clearance_missing"
    return True, "clearance_expired"


def _reused_cf_context_from_config() -> Dict[str, Any]:
    from app.services.cf_refresh.config import get_cf_cookies_value, get_cf_clearance_value

    cf_cookies = get_cf_cookies_value()
    clearance = get_cf_clearance_value()
    cookie_source = cf_cookies or (f"cf_clearance={clearance}" if clearance else "")
    cookies = _cookie_string_to_playwright(cookie_source)
    if not cookies:
        return {}
    return {
        "cookies": cookies,
        "user_agent": str(get_config("proxy.user_agent") or "").strip(),
        "cf_clearance": clearance,
        "browser": str(get_config("proxy.browser") or "").strip(),
        "cf_cookies": cf_cookies,
        "reused": True,
    }


async def _sync_cf_proxy_config(cf_context: Dict[str, Any]) -> None:
    if not cf_context or cf_context.get("reused"):
        return
    try:
        from app.core.config import config

        proxy_update: Dict[str, Any] = {}
        if cf_context.get("cf_cookies"):
            proxy_update["cf_cookies"] = cf_context["cf_cookies"]
        if cf_context.get("cf_clearance"):
            proxy_update["cf_clearance"] = cf_context["cf_clearance"]
        if cf_context.get("user_agent"):
            proxy_update["user_agent"] = cf_context["user_agent"]
        if cf_context.get("browser"):
            proxy_update["browser"] = cf_context["browser"]
        if proxy_update:
            await config.update({"proxy": proxy_update})
    except Exception as exc:
        logger.warning(f"Browser probe CF config sync skipped: {exc}")

def _serialize_session_cookies_json(probe_data: Dict[str, Any]) -> str:
    """将 probe 返回的 cookies 数组序列化为配置项可保存的 JSON 字符串。"""
    cookies = probe_data.get("cookies") if isinstance(probe_data, dict) else None
    if isinstance(cookies, list) and cookies:
        normalized: list[dict[str, Any]] = []
        for item in cookies:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            entry: dict[str, Any] = {
                "name": name,
                "value": str(item.get("value") or ""),
                "domain": str(item.get("domain") or ".grok.com").strip() or ".grok.com",
                "path": str(item.get("path") or "/").strip() or "/",
                "secure": item.get("secure") is not False,
                "httpOnly": bool(item.get("httpOnly")),
            }
            same_site = str(item.get("sameSite") or "").strip()
            if same_site:
                entry["sameSite"] = same_site
            expires = item.get("expirationDate", item.get("expires"))
            if isinstance(expires, (int, float)) and expires == expires:
                entry["expirationDate"] = expires
            normalized.append(entry)
        if normalized:
            return json.dumps(normalized, ensure_ascii=False, indent=2)

    cookie_header = str(probe_data.get("cookie_header") or "").strip() if isinstance(probe_data, dict) else ""
    fallback = _cookie_string_to_playwright(cookie_header)
    if fallback:
        return json.dumps(fallback, ensure_ascii=False, indent=2)
    return ""



async def _sync_statsig_pair_config(probe_data: Dict[str, Any]) -> None:
    """probe 捕获到 seed/hex 后写回 proxy 配置，供纯算法复用。"""
    if not probe_data:
        return
    seed, hx = _extract_statsig_pair_from_probe(probe_data)
    if not seed or not hx:
        if not _has_captured_app_chat_headers(probe_data):
            return
        seed, hx = _extract_statsig_pair_from_probe(probe_data)
        if not seed or not hx:
            logger.info("Browser probe statsig pair sync skipped: pair not captured")
            return
    seed, hx = _extract_statsig_pair_from_probe(probe_data)
    if not seed or not hx:
        logger.info("Browser probe statsig pair sync skipped: pair not captured")
        return
    await _record_statsig_pair_meta(
        probe_data,
        reason=str(probe_data.get("__refresh_reason") or "probe"),
    )
    current_seed = str(get_config("proxy.statsig_seed", "") or "").strip()
    current_hex = str(get_config("proxy.statsig_hex", "") or "").strip()
    if not _should_persist_statsig_pair(current_seed, current_hex, seed, hx):
        logger.info("Browser probe statsig pair sync skipped: unchanged")
        return
    try:
        from app.core.config import config

        await config.update(
            {
                "proxy": {
                    "statsig_seed": seed,
                    "statsig_hex": hx,
                    "statsig_pure_enabled": True,
                }
            }
        )
        logger.info(
            "Browser probe statsig pair config synced: "
            f"seed_len={len(seed)}, hex_len={len(hx)}"
        )
    except Exception as exc:
        logger.warning(f"Browser probe statsig pair config sync skipped: {exc}")


async def _sync_session_cookies_config(probe_data: Dict[str, Any]) -> None:
    """probe 刷新成功后，将当前浏览器会话 cookies 写回配置。"""
    if not probe_data or not _has_captured_app_chat_headers(probe_data):
        return
    cookies_json = _serialize_session_cookies_json(probe_data)
    if not cookies_json:
        logger.warning("Browser probe session cookies config sync skipped: empty cookies payload")
        return
    current = str(get_config("cloakbrowser.session_cookies_json", "") or "").strip()
    if current == cookies_json.strip():
        logger.info("Browser probe session cookies config sync skipped: unchanged")
        return
    try:
        from app.core.config import config

        await config.update({"cloakbrowser": {"session_cookies_json": cookies_json}})
        logger.info(
            "Browser probe session cookies config synced: "
            f"cookie_count={len(json.loads(cookies_json))}"
        )
    except Exception as exc:
        logger.warning(f"Browser probe session cookies config sync skipped: {exc}")



async def _prepare_cf_for_probe(*, force: bool = False) -> Dict[str, Any]:
    if not _cf_before_probe_enabled():
        return {}
    should_refresh, reason = _should_refresh_cf_for_probe(force=force)
    if should_refresh:
        logger.info(f"Browser probe CF refresh required: reason={reason}")
        cf_context = await _resolve_cf_for_probe()
        if cf_context:
            _clear_probe_cf_failure()
            await _sync_cf_proxy_config(cf_context)
        return cf_context
    reused = _reused_cf_context_from_config()
    if reused:
        logger.info(
            "Browser probe CF refresh skipped: "
            f"reason={reason}, source=cf_refresh_config, cookies={len(reused.get('cookies') or [])}"
        )
        return reused
    logger.warning(
        f"Browser probe CF refresh fallback: reason={reason}, but reusable cookies unavailable"
    )
    return await _resolve_cf_for_probe()


def _keep_bridge_alive() -> bool:
    return bool(get_config("cloakbrowser.keep_bridge_alive", True))


def _cookie_string_to_playwright(cookie_str: str, domain: str = ".grok.com") -> list[dict[str, Any]]:
    cookies: list[dict[str, Any]] = []
    for part in str(cookie_str or "").split(";"):
        item = part.strip()
        if not item or "=" not in item:
            continue
        name, _, value = item.partition("=")
        name = name.strip()
        value = value.strip()
        if not name:
            continue
        cookies.append(
            {
                "name": name,
                "value": value,
                "domain": domain,
                "path": "/",
                "secure": True,
            }
        )
    return cookies


async def _resolve_cf_for_probe() -> Dict[str, Any]:
    from app.services.cf_refresh.solver import solve_cf_challenge

    logger.info("Browser probe CF refresh via FlareSolverr started")
    result = await solve_cf_challenge()
    if not result:
        logger.warning("Browser probe CF refresh via FlareSolverr failed")
        return {}
    cookies = _cookie_string_to_playwright(str(result.get("cookies") or ""))
    if not cookies:
        logger.warning("Browser probe CF refresh returned no cookies")
        return {}
    logger.info(
        "Browser probe CF refresh succeeded: "
        f"cookies={len(cookies)}, clearance={'yes' if result.get('cf_clearance') else 'no'}"
    )
    return {
        "cookies": cookies,
        "user_agent": str(result.get("user_agent") or "").strip(),
        "cf_clearance": str(result.get("cf_clearance") or "").strip(),
        "browser": str(result.get("browser") or "").strip(),
        "cf_cookies": str(result.get("cookies") or "").strip(),
    }


async def _ensure_bridge_started(cf_cookies: list | None = None) -> None:
    if await bridge_healthcheck():
        return
    await start_bridge(cf_cookies=cf_cookies)


async def _stop_bridge_after_refresh() -> None:
    try:
        await stop_bridge()
    except Exception as exc:
        logger.warning(f"Stop browser bridge after refresh failed: {exc}")


def _request_sync(sso: str, payload: Dict[str, Any], conversation_id: str = "") -> str:
    body = json.dumps(
        {
            "sso": sso,
            "payload": payload,
            "conversation_id": conversation_id,
        }
    ).encode("utf-8")
    req = urllib_request.Request(
        f"{_bridge_base_url()}/api/chat",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=_bridge_timeout()) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except HTTPError as exc:
        payload_text = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(payload_text)
        except Exception:
            parsed = {}
        code = str(parsed.get("code") or "bridge_error")
        raise UpstreamException(
            message=str(parsed.get("error") or f"Browser bridge failed, {exc.code}"),
            details={
                "status": exc.code,
                "bridge_code": code,
                "body": payload_text,
            },
            status_code=exc.code,
        ) from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise UpstreamException(
            message=f"Browser bridge unavailable: {exc}",
            details={
                "status": 503,
                "bridge_code": "bridge_unavailable",
                "error": str(exc),
            },
            status_code=503,
        ) from exc


async def _sync_browser_chat_session_config(sso: str) -> None:
    """浏览器桥对话成功后，将当前浏览器会话状态写回配置。"""
    try:
        data = await asyncio.to_thread(_session_request_sync, sso)
        if not data:
            return
        _cache_session(sso or _PROFILE_CACHE_KEY, data)
        await _sync_session_cookies_config(data)
        await _sync_statsig_pair_config(data)
    except Exception as exc:
        logger.warning(f"Browser chat session config sync skipped: {exc}")


def _session_request_sync(sso: str = "") -> Dict[str, Any]:
    suffix = f"?sso={quote(sso)}" if sso else ""
    req = urllib_request.Request(f"{_bridge_base_url()}/api/session{suffix}", method="GET")
    try:
        with urllib_request.urlopen(req, timeout=_bridge_probe_timeout()) as resp:
            payload_text = resp.read().decode("utf-8", errors="replace")
            data = json.loads(payload_text) if payload_text else {}
            return data if isinstance(data, dict) else {}
    except HTTPError as exc:
        payload_text = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(payload_text)
        except Exception:
            parsed = {}
        raise UpstreamException(
            message=str(parsed.get("error") or f"Browser session fetch failed, {exc.code}"),
            details={"status": exc.code, "bridge_code": str(parsed.get("code") or "bridge_error")},
            status_code=exc.code,
        ) from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise UpstreamException(
            message=f"Browser bridge unavailable: {exc}",
            details={"status": 503, "bridge_code": "bridge_unavailable", "error": str(exc)},
            status_code=503,
        ) from exc



def _probe_request_sync_with_retry(
    sso: str = "",
    force: bool = False,
    *,
    probe_cookies: list | None = None,
    max_attempts: int = 8,
) -> Dict[str, Any]:
    """probe 可能与上一轮刷新或 chat 争用同一 page，遇到 page_busy 时短暂排队重试。"""
    last_exc: UpstreamException | None = None
    for attempt in range(max_attempts):
        try:
            return _probe_request_sync(sso, force, probe_cookies=probe_cookies)
        except UpstreamException as exc:
            last_exc = exc
            code = str((exc.details or {}).get("bridge_code") or "")
            status = int((exc.details or {}).get("status") or exc.status_code or 0)
            if code == "page_busy" or status == 429:
                wait_s = min(2.0 + attempt * 0.75, 8.0)
                logger.info(
                    f"Browser probe bridge busy, retry {attempt + 1}/{max_attempts} after {wait_s:.1f}s"
                )
                time.sleep(wait_s)
                continue
            raise
    if last_exc:
        raise last_exc
    return {}


def _probe_request_sync(
    sso: str = "",
    force: bool = False,
    *,
    probe_cookies: list | None = None,
) -> Dict[str, Any]:
    payload: dict[str, Any] = {}
    if sso:
        payload["sso"] = sso
    if force:
        payload["force"] = True
    if probe_cookies:
        payload["cookies"] = probe_cookies
    body = json.dumps(payload).encode("utf-8")
    req = urllib_request.Request(
        f"{_bridge_base_url()}/api/probe",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=_bridge_probe_timeout()) as resp:
            payload_text = resp.read().decode("utf-8", errors="replace")
            data = json.loads(payload_text) if payload_text else {}
            return data if isinstance(data, dict) else {}
    except HTTPError as exc:
        payload_text = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(payload_text)
        except Exception:
            parsed = {}
        raise UpstreamException(
            message=str(parsed.get("error") or f"Browser session probe failed, {exc.code}"),
            details={
                "status": exc.code,
                "bridge_code": str(parsed.get("code") or "bridge_error"),
                "body": payload_text,
            },
            status_code=exc.code,
        ) from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise UpstreamException(
            message=f"Browser bridge unavailable: {exc}",
            details={"status": 503, "bridge_code": "bridge_unavailable", "error": str(exc)},
            status_code=503,
        ) from exc


def _has_captured_app_chat_headers(data: Dict[str, Any]) -> bool:
    request_headers = data.get("request_headers") if isinstance(data, dict) else None
    return bool(
        data
        and data.get("x_statsig_id")
        and isinstance(request_headers, dict)
        and request_headers
    )


def _normalize_probe_snapshot(data: Dict[str, Any]) -> Dict[str, Any]:
    request_headers = data.get("request_headers") if isinstance(data, dict) else None
    if not isinstance(request_headers, dict):
        request_headers = {}
    statsig = str(data.get("x_statsig_id") or request_headers.get("x-statsig-id") or "").strip()
    if not statsig or not request_headers:
        return {}
    seed = str(data.get("statsig_seed") or "").strip()
    hx = str(data.get("statsig_hex") or "").strip()
    out = {
        "request_headers": request_headers,
        "x_statsig_id": statsig,
        "user_agent": str(data.get("user_agent") or "").strip(),
        "captured_at": data.get("captured_at") or "",
        "saved_at": time.time(),
    }
    if seed and hx:
        out["statsig_seed"] = seed
        out["statsig_hex"] = hx
    return out


def _load_global_probe() -> Dict[str, Any]:
    global _PROBE_CACHE_LOADED
    if not _global_probe_enabled():
        return {}
    cached = _SESSION_CACHE.get(_GLOBAL_PROBE_KEY) or {}
    if cached:
        return cached
    if _PROBE_CACHE_LOADED:
        return {}
    _PROBE_CACHE_LOADED = True
    path = _probe_cache_path()
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning(f"Browser global probe cache load failed: {exc}")
        return {}
    if not isinstance(data, dict):
        return {}
    ttl = _probe_cache_ttl_seconds()
    saved_at = float(data.get("saved_at") or 0)
    if ttl > 0 and saved_at > 0 and time.time() - saved_at > ttl:
        logger.info("Browser global probe cache expired")
        return {}
    probe = _normalize_probe_snapshot(data)
    if probe:
        _SESSION_CACHE[_GLOBAL_PROBE_KEY] = probe
        logger.info(
            "Browser global probe cache loaded: "
            f"statsig=yes, header_keys={len(probe.get('request_headers') or {})}"
        )
    return probe


def get_cached_global_probe() -> Dict[str, Any]:
    """Return persisted or in-memory global probe without contacting the browser bridge."""
    return _load_global_probe()


def _save_global_probe(data: Dict[str, Any]) -> Dict[str, Any]:
    if not _global_probe_enabled():
        return {}
    probe = _normalize_probe_snapshot(data)
    if not probe:
        return {}
    _SESSION_CACHE[_GLOBAL_PROBE_KEY] = probe
    path = _probe_cache_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(path.suffix + ".tmp")
        tmp_path.write_text(json.dumps(probe, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp_path.replace(path)
        logger.info(
            "Browser global probe cache saved: "
            f"statsig=yes, header_keys={len(probe.get('request_headers') or {})}"
        )
    except Exception as exc:
        logger.warning(f"Browser global probe cache save failed: {exc}")
    return probe


def _clear_global_probe_cache() -> None:
    global _PROBE_CACHE_LOADED
    _SESSION_CACHE.pop(_GLOBAL_PROBE_KEY, None)
    _PROBE_CACHE_LOADED = False
    try:
        _probe_cache_path().unlink(missing_ok=True)
    except Exception as exc:
        logger.warning(f"Browser global probe cache delete failed: {exc}")


def _clear_session_probe_cache() -> None:
    """Drop stale per-session probe headers so the next request merges the fresh global probe."""
    for key in list(_SESSION_CACHE.keys()):
        if key == _GLOBAL_PROBE_KEY:
            continue
        _SESSION_CACHE.pop(key, None)


def _merge_global_probe(data: Dict[str, Any]) -> Dict[str, Any]:
    if not data or _has_captured_app_chat_headers(data):
        return data
    probe = _load_global_probe()
    if not probe:
        return data
    merged = dict(data)
    merged["request_headers"] = probe.get("request_headers") or {}
    merged["x_statsig_id"] = probe.get("x_statsig_id") or ""
    if not merged.get("user_agent") and probe.get("user_agent"):
        merged["user_agent"] = probe.get("user_agent")
    merged["probe_source"] = "global"
    return merged


def _cache_session(key: str, data: Dict[str, Any]) -> Dict[str, Any]:
    if not data:
        return data
    now = time.time()
    data["_cached_at"] = now
    if _has_captured_app_chat_headers(data):
        _save_global_probe(data)
    _SESSION_CACHE[key] = data
    sso = _extract_raw_sso(str(data.get("sso") or ""))
    if sso:
        _SESSION_CACHE[sso] = data
    return data


def get_browser_session(token: str, max_age_seconds: int = 120, force_refresh: bool = False) -> Dict[str, Any]:
    sso = _extract_raw_sso(token)
    if not sso or not bridge_enabled() or not get_config("cloakbrowser.sync_session", True):
        return {}
    cached = _SESSION_CACHE.get(sso) or {}
    now = time.time()
    if (not force_refresh) and cached and (now - float(cached.get("_cached_at", 0))) <= max_age_seconds:
        return cached
    if not force_refresh:
        cached_probe = _cached_probe_session_payload()
        if cached_probe:
            logger.info("Browser session sync skipped live bridge fetch: using cached global probe")
            return cached_probe
    data = _session_request_sync(sso)
    if data:
        data = _merge_global_probe(data)
        _cache_session(sso, data)
        logger.info(
            "Browser session synced: "
            f"cookie_len={len(str(data.get('cookie_header') or ''))}, "
            f"ua={'yes' if data.get('user_agent') else 'no'}, "
            f"statsig={'yes' if data.get('x_statsig_id') else 'no'}, "
            f"probe_source={data.get('probe_source') or 'session'}"
        )
    else:
        logger.warning("Browser session sync returned empty payload")
    return data


def get_browser_profile_session(max_age_seconds: int = 120, force_refresh: bool = False) -> Dict[str, Any]:
    if not bridge_enabled() or not get_config("cloakbrowser.sync_session", True):
        return {}
    cached = _SESSION_CACHE.get(_PROFILE_CACHE_KEY) or {}
    now = time.time()
    if (not force_refresh) and cached and (now - float(cached.get("_cached_at", 0))) <= max_age_seconds:
        return cached
    if not force_refresh:
        cached_probe = _cached_probe_session_payload()
        if cached_probe:
            logger.info("Browser profile session sync skipped live bridge fetch: using cached global probe")
            return cached_probe
    data = _session_request_sync("")
    if data:
        data = _merge_global_probe(data)
        _cache_session(_PROFILE_CACHE_KEY, data)
        logger.info(
            "Browser profile session synced: "
            f"sso={'yes' if data.get('sso') else 'no'}, "
            f"cookie_len={len(str(data.get('cookie_header') or ''))}, "
            f"ua={'yes' if data.get('user_agent') else 'no'}, "
            f"statsig={'yes' if data.get('x_statsig_id') else 'no'}, "
            f"probe_source={data.get('probe_source') or 'session'}"
        )
    else:
        logger.warning("Browser profile session sync returned empty payload")
    return data


def refresh_browser_probe(
    token: str = "",
    wait: bool = True,
    reason: str = "manual",
    *,
    probe_cookies: list | None = None,
) -> Dict[str, Any]:
    sso = _extract_raw_sso(token)
    if not bridge_enabled():
        return {}
    acquired = _PROBE_REFRESH_LOCK.acquire(blocking=wait)
    if not acquired:
        logger.info(f"Browser probe refresh skipped: reason={reason}, another refresh is already running")
        return {}
    try:
        try:
            logger.info(
                "Browser probe bridge /api/probe request started: "
                f"reason={reason}, sso={'yes' if sso else 'no'}, "
                f"force=yes, cookies={len(probe_cookies or [])}"
            )
            probe_data = _probe_request_sync_with_retry(sso, force=True, probe_cookies=probe_cookies)
        except UpstreamException as exc:
            if str((exc.details or {}).get("bridge_code") or "") == "cloudflare_blocked":
                _mark_probe_cf_failure()
            raise
        if _has_captured_app_chat_headers(probe_data):
            _clear_probe_cf_failure()
        if probe_data:
            _clear_global_probe_cache()
            _clear_session_probe_cache()
            key = sso or _PROFILE_CACHE_KEY
            _cache_session(key, probe_data)
            logger.info(
                f"Browser probe force refreshed: reason={reason}, "
                f"sso={'yes' if sso else 'no'}, "
                f"cookie_len={len(str(probe_data.get('cookie_header') or ''))}, "
                f"ua={'yes' if probe_data.get('user_agent') else 'no'}, "
                f"statsig={'yes' if probe_data.get('x_statsig_id') else 'no'}, "
                f"header_keys={len((probe_data.get('request_headers') or {}) if isinstance(probe_data.get('request_headers'), dict) else {})}"
            )
        return probe_data
    finally:
        _PROBE_REFRESH_LOCK.release()


async def refresh_browser_probe_managed(
    token: str = "",
    wait: bool = True,
    shutdown_after: bool | None = None,
    reason: str = "manual",
) -> Dict[str, Any]:
    """Start bridge on demand, refresh probe once, then optionally stop it."""
    if shutdown_after is None:
        shutdown_after = not _keep_bridge_alive()
    last_exc: UpstreamException | None = None
    try:
        for attempt in range(2):
            force_cf = attempt > 0
            cf_context = await _prepare_cf_for_probe(force=force_cf)
            probe_cookies = cf_context.get("cookies") if cf_context else None
            cf_refreshed = bool(cf_context and not cf_context.get("reused"))
            logger.info(
                "Browser probe managed refresh requested: "
                f"reason={reason}, attempt={attempt + 1}, "
                f"shutdown_after={'yes' if shutdown_after else 'no'}, "
                f"cf_refreshed={'yes' if cf_refreshed else 'no'}, "
                f"cf_cookies={'yes' if probe_cookies else 'no'}, "
                f"use_proxy={'yes' if _use_system_proxy() and get_config('proxy.base_proxy_url') else 'no'}"
            )
            bridge_running = await bridge_healthcheck()
            await _ensure_bridge_started(probe_cookies if not bridge_running else None)
            try:
                probe_data = await asyncio.to_thread(
                    refresh_browser_probe,
                    token,
                    wait,
                    reason,
                    probe_cookies=probe_cookies,
                )
                if isinstance(probe_data, dict):
                    probe_data["__refresh_reason"] = reason
                await _sync_session_cookies_config(probe_data)
                await _sync_statsig_pair_config(probe_data)
                await _clear_manual_statsig_if_browser_captured(probe_data)
                return probe_data
            except UpstreamException as exc:
                last_exc = exc
                if (
                    attempt == 0
                    and str((exc.details or {}).get("bridge_code") or "") == "cloudflare_blocked"
                ):
                    _mark_probe_cf_failure()
                    logger.warning(
                        "Browser probe blocked by Cloudflare, retrying once with FlareSolverr refresh"
                    )
                    continue
                raise
        if last_exc:
            raise last_exc
        return {}
    finally:
        if shutdown_after:
            await _stop_bridge_after_refresh()


def wait_for_browser_probe_refresh(timeout_seconds: float = 8.0) -> bool:
    """Wait briefly when a background probe refresh is already preparing fresher headers."""
    if not bridge_enabled() or not get_config("cloakbrowser.sync_session", True):
        return True
    try:
        timeout = max(float(timeout_seconds or 0), 0.0)
    except Exception:
        timeout = 8.0
    acquired = _PROBE_REFRESH_LOCK.acquire(timeout=timeout)
    if not acquired:
        logger.warning(f"Browser probe refresh wait timed out after {timeout:.1f}s")
        return False
    _PROBE_REFRESH_LOCK.release()
    return True


async def warmup_browser_session(token: str) -> Dict[str, Any]:
    sso = _extract_raw_sso(token)
    data = await asyncio.to_thread(get_browser_session, token, 120, False)
    if not sso or _has_captured_app_chat_headers(data):
        return data
    return data


async def _collect_configured_tokens() -> list[str]:
    try:
        from app.services.token.manager import get_token_manager

        manager = await get_token_manager()
        tokens: list[str] = []
        for pool in manager.pools.values():
            for info in pool.list():
                token = str(getattr(info, "token", "") or "").strip()
                if token:
                    tokens.append(token)
        return tokens
    except Exception as exc:
        logger.warning(f"Browser session prewarm token scan failed: {exc}")
        return []


async def prewarm_browser_sessions() -> None:
    if not bridge_enabled() or not get_config("cloakbrowser.sync_session", True):
        return
    if not get_config("cloakbrowser.prewarm_on_start", True):
        return

    if _has_reusable_probe_source():
        logger.info(
            "Browser session prewarm: prewarm_on_start enabled, "
            "ignore reusable probe cache and open browser on startup"
        )

    mode = str(get_config("cloakbrowser.prewarm_mode", "session") or "session").strip().lower()
    # 启动预热开启时，即使 prewarm_mode=session 也执行 probe，确保拉起可见浏览器并刷新 x-statsig-id
    run_probe_prewarm = _global_probe_enabled()
    if run_probe_prewarm:
        logger.info("Browser session prewarm started: mode=probe, strategy=single_global_probe")
        try:
            if get_config("cloakbrowser.profile_session", True):
                await asyncio.to_thread(get_browser_profile_session, 0, True)
            probe_data = await refresh_browser_probe_managed("", True, None, reason="prewarm")
            logger.info(
                "Browser session prewarm completed: "
                f"strategy=single_global_probe, statsig={'yes' if (probe_data or {}).get('x_statsig_id') else 'no'}"
            )
        except Exception as exc:
            logger.warning(
                "Browser global probe prewarm skipped: "
                f"{exc}. 应用将继续启动，并在首次真实对话时再尝试获取 probe。"
            )
        return

    configured_tokens = await _collect_configured_tokens()
    tokens = list(dict.fromkeys(_extract_raw_sso(token) for token in configured_tokens))
    tokens = [token for token in tokens if token]

    if get_config("cloakbrowser.profile_session", True):
        try:
            profile_data = await asyncio.to_thread(get_browser_profile_session, 0, True)
            profile_sso = _extract_raw_sso(str((profile_data or {}).get("sso") or ""))
            if profile_sso and profile_sso not in tokens:
                tokens.append(profile_sso)
        except Exception as exc:
            logger.warning(f"Browser profile session prewarm failed: {exc}")

    if not tokens:
        logger.info("Browser session prewarm skipped: no configured or profile sso token")
        return

    concurrency = max(int(get_config("cloakbrowser.prewarm_concurrency", 1) or 1), 1)
    semaphore = asyncio.Semaphore(concurrency)
    logger.info(f"Browser session prewarm started: tokens={len(tokens)}, mode={mode}")

    async def _one(token: str) -> None:
        async with semaphore:
            try:
                if mode == "probe":
                    await warmup_browser_session(token)
                else:
                    await asyncio.to_thread(get_browser_session, token, 0, True)
            except Exception as exc:
                logger.warning(f"Browser session prewarm failed for token: {exc}")

    await asyncio.gather(*[_one(token) for token in tokens])
    logger.info("Browser session prewarm completed")


async def request_browser_bridge(
    token: str,
    payload: Dict[str, Any],
    conversation_id: str = "",
) -> AsyncIterator[str]:
    sso = _extract_raw_sso(token)
    if not sso:
        raise UpstreamException(
            message="Browser bridge requires a valid sso token",
            details={"status": 401, "bridge_code": "sso_unavailable"},
            status_code=401,
        )

    logger.info("BrowserBridge: forwarding Grok app-chat via real browser")
    body = await asyncio.to_thread(_request_sync, sso, payload, conversation_id)
    await _sync_browser_chat_session_config(sso)
    for raw_line in body.splitlines():
        line = str(raw_line or "").strip()
        if line:
            yield line
