"""
Embedded CloakBrowser chat bridge process manager.
"""

from __future__ import annotations

import asyncio
import json
import os
import socket
import subprocess
from pathlib import Path
from typing import Optional
from urllib import request as urllib_request

from app.core.config import get_config
from app.core.logger import logger
from .deps import ensure_bridge_dependencies

BASE_DIR = Path(__file__).resolve().parent
SERVER_FILE = BASE_DIR / "server.cjs"
LOG_DIR = BASE_DIR.parent.parent.parent / "logs"
LOG_FILE = LOG_DIR / "cloakbrowser_bridge.log"
PID_FILE = LOG_DIR / "cloakbrowser_bridge.pid"

_process: Optional[subprocess.Popen] = None


def _probe_cache_path() -> Path:
    configured = str(
        get_config("cloakbrowser.probe_cache_file", "data/cloakbrowser-probe.json")
        or "data/cloakbrowser-probe.json"
    ).strip()
    path = Path(configured)
    if not path.is_absolute():
        path = (BASE_DIR.parent.parent.parent / path).resolve()
    return path


def _load_cached_probe_for_env() -> dict:
    path = _probe_cache_path()
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning(f"Load cached probe for bridge env failed: {exc}")
        return {}
    if not isinstance(data, dict):
        return {}
    headers = data.get("request_headers") if isinstance(data.get("request_headers"), dict) else {}
    statsig = str(data.get("x_statsig_id") or headers.get("x-statsig-id") or "").strip()
    if not statsig or not headers:
        return {}
    return {
        "user_agent": str(data.get("user_agent", "") or ""),
        "request_headers": headers,
        "x_statsig_id": statsig,
    }


def bridge_url() -> str:
    host = str(get_config("cloakbrowser.bridge_host", "127.0.0.1") or "127.0.0.1").strip()
    port = int(get_config("cloakbrowser.bridge_port", 9081) or 9081)
    return f"http://{host}:{port}"


def _bridge_host_port() -> tuple[str, int]:
    host = str(get_config("cloakbrowser.bridge_host", "127.0.0.1") or "127.0.0.1").strip()
    port = int(get_config("cloakbrowser.bridge_port", 9081) or 9081)
    return host, port


def _enabled() -> bool:
    return bool(get_config("cloakbrowser.enabled", False))


def _node_command() -> list[str]:
    node_binary = str(get_config("cloakbrowser.node_binary", "node") or "node").strip()
    return [node_binary, str(SERVER_FILE)]


async def healthcheck(timeout: float = 2.0) -> bool:
    url = f"{bridge_url()}/health"

    def _get() -> bool:
        with urllib_request.urlopen(url, timeout=timeout) as resp:
            return int(resp.status) == 200

    try:
        return await asyncio.to_thread(_get)
    except Exception:
        return False


def _is_port_open(host: str, port: int) -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(1.0)
    try:
        return sock.connect_ex((host, port)) == 0
    finally:
        sock.close()


async def _kill_process_on_port() -> None:
    if os.name != "nt":
        return
    host, port = _bridge_host_port()
    if host not in {"127.0.0.1", "localhost"}:
        return
    if not _is_port_open("127.0.0.1", port):
        return
    cmd = (
        f"$connections = Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue; "
        f"if ($connections) {{ "
        f"$pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique; "
        f"foreach ($pidValue in $pids) {{ "
        f"try {{ Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue }} catch {{}} "
        f"}} }}"
    )
    await asyncio.to_thread(
        subprocess.run,
        ["powershell", "-NoProfile", "-Command", cmd],
        check=False,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )


async def _kill_process_from_pid_file() -> None:
    if not PID_FILE.exists():
        return
    try:
        pid = int(PID_FILE.read_text(encoding="utf-8").strip())
    except Exception:
        PID_FILE.unlink(missing_ok=True)
        return

    if os.name == "nt":
        cmd = f"try {{ Stop-Process -Id {pid} -Force -ErrorAction SilentlyContinue }} catch {{}}"
        await asyncio.to_thread(
            subprocess.run,
            ["powershell", "-NoProfile", "-Command", cmd],
            check=False,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    else:
        try:
            os.kill(pid, 15)
        except Exception:
            pass
    PID_FILE.unlink(missing_ok=True)


def _bridge_proxy_url() -> str:
    if not bool(get_config("cloakbrowser.use_system_proxy", True)):
        return ""
    return str(get_config("proxy.base_proxy_url", "") or "").strip()


def _bridge_user_agent() -> str:
    return str(get_config("proxy.user_agent", "") or "").strip()


async def start(cf_cookies: list | None = None) -> None:
    global _process
    if not _enabled():
        logger.info("CloakBrowser bridge disabled, skip start")
        return
    if _process and _process.poll() is None:
        return

    try:
        await ensure_bridge_dependencies()
    except Exception as exc:
        logger.error(f"CloakBrowser bridge dependency check failed: {exc}")
        raise

    await _kill_process_from_pid_file()
    await _kill_process_on_port()

    env = os.environ.copy()
    env["GROK_CLOAK_HOST"] = str(get_config("cloakbrowser.bridge_host", "127.0.0.1") or "127.0.0.1")
    env["GROK_CLOAK_PORT"] = str(int(get_config("cloakbrowser.bridge_port", 9081) or 9081))
    env["GROK_CLOAK_NAV_TIMEOUT_MS"] = str(int(get_config("cloakbrowser.nav_timeout_ms", 45000) or 45000))
    env["GROK_CLOAK_READY_TIMEOUT_MS"] = str(int(get_config("cloakbrowser.ready_timeout_ms", 30000) or 30000))
    env["GROK_CLOAK_REQUEST_TIMEOUT_MS"] = str(int(get_config("cloakbrowser.timeout", 120) or 120) * 1000)
    env["GROK_CLOAK_IDLE_PAGE_MS"] = str(int(get_config("cloakbrowser.idle_page_ms", 300000) or 300000))
    env["GROK_CLOAK_MAX_PAGES"] = str(int(get_config("cloakbrowser.max_pages", 4) or 4))
    env["GROK_CLOAK_HEADLESS"] = "true" if bool(get_config("cloakbrowser.headless", True)) else "false"
    env["GROK_CLOAK_PRIVATE_CHAT_URL"] = str(
        get_config("cloakbrowser.private_chat_url", "https://grok.com/")
        or "https://grok.com/"
    )
    env["GROK_CLOAK_PROBE_MESSAGE"] = str(
        get_config("cloakbrowser.probe_message", "你好") or "你好"
    )
    env["GROK_CLOAK_SESSION_COOKIES_JSON"] = str(
        get_config("cloakbrowser.session_cookies_json", "") or ""
    )
    probe = _load_cached_probe_for_env() or {}
    env["GROK_CLOAK_CACHED_PROBE_JSON"] = json.dumps(
        {
            "user_agent": str(probe.get("user_agent", "") or ""),
            "request_headers": probe.get("request_headers") or {},
            "x_statsig_id": str(probe.get("x_statsig_id", "") or ""),
        },
        ensure_ascii=False,
    )
    env["GROK_CLOAK_PROBE_CONSUME_UPSTREAM"] = (
        "true" if bool(get_config("cloakbrowser.probe_consume_upstream", False)) else "false"
    )
    env["GROK_CLOAK_MINIMAL_LOAD"] = (
        "true" if bool(get_config("cloakbrowser.minimal_page_load", True)) else "false"
    )
    env["GROK_CLOAK_RETAIN_STATIC_CACHE"] = (
        "true" if bool(get_config("cloakbrowser.retain_static_cache", True)) else "false"
    )
    env["GROK_CLOAK_CHAT_INPUT_TIMEOUT_MS"] = str(
        int(get_config("cloakbrowser.chat_input_timeout_ms", 15000) or 15000)
    )
    env["GROK_CLOAK_ALLOW_EXTENSIONS"] = (
        "true" if bool(get_config("cloakbrowser.allow_extensions", True)) else "false"
    )
    extension_paths = get_config("cloakbrowser.extension_paths", [])
    if isinstance(extension_paths, str):
        env["GROK_CLOAK_EXTENSION_PATHS"] = extension_paths.strip()
    elif isinstance(extension_paths, (list, tuple)):
        resolved_paths: list[str] = []
        for item in extension_paths:
            value = str(item or "").strip()
            if not value:
                continue
            path = Path(value)
            if not path.is_absolute():
                path = (BASE_DIR.parent.parent.parent / path).resolve()
            resolved_paths.append(str(path))
        env["GROK_CLOAK_EXTENSION_PATHS"] = ";".join(resolved_paths)
    else:
        env["GROK_CLOAK_EXTENSION_PATHS"] = ""

    proxy_url = _bridge_proxy_url()
    if proxy_url:
        env["GROK_CLOAK_PROXY_URL"] = proxy_url
    user_agent = _bridge_user_agent()
    if user_agent:
        env["GROK_CLOAK_USER_AGENT"] = user_agent
    if cf_cookies:
        env["GROK_CLOAK_CF_COOKIES_JSON"] = json.dumps(cf_cookies, ensure_ascii=False)
    try:
        cf_timeout = int(get_config("proxy.timeout", 60) or 60)
    except Exception:
        cf_timeout = 60
    env["GROK_CLOAK_CF_WAIT_TIMEOUT_MS"] = str(max(cf_timeout * 1000 + 30000, 90000))

    executable_path = str(get_config("cloakbrowser.executable_path", "") or "").strip()
    if executable_path:
        env["GROK_CLOAK_EXECUTABLE_PATH"] = executable_path

    profile_dir = str(get_config("cloakbrowser.profile_dir", "") or "").strip()
    if profile_dir:
        profile_path = Path(profile_dir)
        if not profile_path.is_absolute():
            profile_path = (BASE_DIR.parent.parent.parent / profile_path).resolve()
        env["GROK_CLOAK_PROFILE_DIR"] = str(profile_path)
    env["GROK_CLOAK_DIAG_DIR"] = str((LOG_DIR / "cloakbridge_diagnostics").resolve())

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_handle = LOG_FILE.open("a", encoding="utf-8")
    _process = subprocess.Popen(
        _node_command(),
        cwd=str(BASE_DIR),
        env=env,
        stdout=log_handle,
        stderr=log_handle,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    PID_FILE.write_text(str(_process.pid), encoding="utf-8")

    for _ in range(20):
        if await healthcheck():
            logger.info(f"Embedded CloakBrowser bridge ready: {bridge_url()}")
            return
        await asyncio.sleep(0.5)
    logger.warning("Embedded CloakBrowser bridge health check timed out")


async def stop() -> None:
    global _process
    process = _process
    _process = None
    if not process:
        return
    if process.poll() is not None:
        return
    process.terminate()
    try:
        await asyncio.to_thread(process.wait, 8)
    except Exception:
        try:
            process.kill()
        except Exception:
            pass
    PID_FILE.unlink(missing_ok=True)
