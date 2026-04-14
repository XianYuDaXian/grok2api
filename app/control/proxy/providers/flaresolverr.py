"""FlareSolverr-backed managed clearance provider."""

import asyncio
import json
import re
from urllib import request as urllib_request
from urllib.error import HTTPError, URLError

from app.platform.logging.logger import logger
from app.platform.config.snapshot import get_config
from ..models import ClearanceBundle, ClearanceMode


def _extract_all_cookies(cookies: list[dict]) -> str:
    return "; ".join(f"{c.get('name')}={c.get('value')}" for c in cookies)


def _extract_cookie_value(cookies: list[dict], name: str) -> str:
    for c in cookies:
        if c.get("name") == name:
            return c.get("value") or ""
    return ""


def _browser_profile(user_agent: str) -> str:
    m = re.search(r"Chrome/(\d+)", user_agent)
    return f"chrome{m.group(1)}" if m else "chrome120"


class FlareSolverrClearanceProvider:
    """Refresh CF clearance bundles via a FlareSolverr instance."""

    async def refresh_bundle(
        self,
        *,
        affinity_key: str,
        proxy_url:    str,
    ) -> ClearanceBundle | None:
        cfg = get_config()
        mode = ClearanceMode.parse(cfg.get_str("proxy.clearance.mode", "none"))
        if mode != ClearanceMode.FLARESOLVERR:
            return None
        fs_url      = cfg.get_str("proxy.clearance.flaresolverr_url", "")
        timeout_sec = cfg.get_int("proxy.clearance.timeout_sec", 60)
        if not fs_url:
            return None

        result = await self._solve(
            fs_url      = fs_url,
            proxy_url   = proxy_url,
            timeout_sec = timeout_sec,
        )
        if not result:
            logger.warning(
                "flaresolverr clearance refresh failed: affinity={} proxy={}",
                affinity_key, proxy_url or "<direct>",
            )
            return None

        return ClearanceBundle(
            bundle_id    = f"flaresolverr:{affinity_key}",
            cf_cookies   = result.get("cookies", ""),
            user_agent   = result.get("user_agent", ""),
            affinity_key = affinity_key,
        )

    async def _solve(
        self,
        *,
        fs_url:      str,
        proxy_url:   str,
        timeout_sec: int,
    ) -> dict[str, str] | None:
        payload: dict = {
            "cmd":        "request.get",
            "url":        "https://grok.com",
            "maxTimeout": timeout_sec * 1000,
        }
        if proxy_url:
            payload["proxy"] = {"url": proxy_url}

        body    = json.dumps(payload).encode()
        request = urllib_request.Request(
            f"{fs_url.rstrip('/')}/v1",
            data    = body,
            method  = "POST",
            headers = {"Content-Type": "application/json"},
        )

        try:
            def _post() -> dict:
                with urllib_request.urlopen(request, timeout=timeout_sec + 30) as resp:
                    return json.loads(resp.read().decode())

            result = await asyncio.to_thread(_post)
            if result.get("status") != "ok":
                logger.warning(
                    "flaresolverr returned non-ok status: status={} message={}",
                    result.get("status"), result.get("message", ""),
                )
                return None

            solution = result.get("solution", {})
            cookies  = solution.get("cookies", [])
            if not cookies:
                logger.warning("flaresolverr returned no cookies")
                return None

            ua = solution.get("userAgent", "") or ""
            return {
                "cookies":    _extract_all_cookies(cookies),
                "user_agent": ua,
                "browser":    _browser_profile(ua),
            }

        except HTTPError as exc:
            body_text = exc.read().decode("utf-8", "replace")[:300]
            logger.warning("flaresolverr http request failed: status={} body={}", exc.code, body_text)
        except URLError as exc:
            logger.warning("flaresolverr connection failed: reason={}", exc.reason)
        except Exception as exc:
            logger.warning("flaresolverr request failed: error={}", exc)

        return None


__all__ = ["FlareSolverrClearanceProvider"]
