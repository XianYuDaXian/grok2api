"""
Reverse interface: upload asset.
"""

import asyncio
import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any
from curl_cffi.requests import AsyncSession

from app.core.logger import logger
from app.core.config import get_config
from app.core.exceptions import UpstreamException
from app.services.token.service import TokenService
from app.services.reverse.utils.headers import build_headers
from app.services.reverse.utils.retry import retry_on_status

UPLOAD_API = "https://grok.com/rest/app-chat/upload-file"


class AssetsUploadReverse:
    """/rest/app-chat/upload-file reverse interface."""

    @dataclass
    class _SimpleResponse:
        status_code: int
        headers: dict[str, str]
        text: str

        def json(self):
            return json.loads(self.text or "{}")

    @staticmethod
    def _compact_body(text: str, limit: int = 320) -> str:
        body = (text or "").strip().replace("\n", " ")
        if len(body) > limit:
            return f"{body[:limit]}...(len={len(body)})"
        return body

    @staticmethod
    def _extract_error_hint(text: str) -> str:
        if not text:
            return ""
        lowered = text.lower()
        if "content is moderated" in lowered or "content-moderated" in lowered:
            return "Content is moderated [WKE=file:content-moderated]"
        if "<title>just a moment...</title>" in lowered or "cf-challenge" in lowered:
            return "Cloudflare challenge page"

        def _collect_strings(node: Any, out: list[str]) -> None:
            if len(out) >= 8:
                return
            if isinstance(node, str):
                value = node.strip()
                if value:
                    out.append(value)
                return
            if isinstance(node, dict):
                preferred = ("message", "error", "detail", "reason", "msg", "code")
                for key in preferred:
                    if key in node:
                        _collect_strings(node.get(key), out)
                for value in node.values():
                    _collect_strings(value, out)
                return
            if isinstance(node, list):
                for value in node:
                    _collect_strings(value, out)

        try:
            parsed = json.loads(text)
        except Exception:
            plain = text.strip()
            return plain[:300] if plain else ""

        messages: list[str] = []
        _collect_strings(parsed, messages)
        deduped: list[str] = []
        seen: set[str] = set()
        for item in messages:
            if item in seen:
                continue
            seen.add(item)
            deduped.append(item)
        joined = " | ".join(deduped[:4])
        return joined[:300]

    @staticmethod
    async def _urllib_post(
        url: str, headers: dict[str, str], payload: dict[str, Any], timeout: int, proxy_url: str
    ) -> "AssetsUploadReverse._SimpleResponse":
        """使用标准库 urllib 兜底上传，绕过 curl_cffi 异常。"""
        body = json.dumps(payload).encode("utf-8")
        opener = None
        if proxy_url:
            opener = urllib.request.build_opener(
                urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url})
            )
        req = urllib.request.Request(url=url, data=body, headers=headers, method="POST")

        def _do_post():
            def _read_http_error(err: urllib.error.HTTPError):
                status = int(getattr(err, "code", 500) or 500)
                hdrs = {}
                try:
                    hdrs = {
                        str(k).lower(): str(v)
                        for k, v in dict((err.headers or {}).items()).items()
                    }
                except Exception:
                    hdrs = {}
                try:
                    body = err.read().decode("utf-8", errors="replace")
                except Exception:
                    body = ""
                return status, hdrs, body

            if opener is not None:
                try:
                    with opener.open(req, timeout=timeout) as resp:
                        status = int(getattr(resp, "status", 200) or 200)
                        raw_headers = {
                            str(k).lower(): str(v)
                            for k, v in dict(resp.headers.items()).items()
                        }
                        text = resp.read().decode("utf-8", errors="replace")
                        return status, raw_headers, text
                except urllib.error.HTTPError as e:
                    return _read_http_error(e)
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    status = int(getattr(resp, "status", 200) or 200)
                    raw_headers = {
                        str(k).lower(): str(v) for k, v in dict(resp.headers.items()).items()
                    }
                    text = resp.read().decode("utf-8", errors="replace")
                    return status, raw_headers, text
            except urllib.error.HTTPError as e:
                return _read_http_error(e)

        status, raw_headers, text = await asyncio.to_thread(_do_post)
        return AssetsUploadReverse._SimpleResponse(
            status_code=status,
            headers=raw_headers,
            text=text,
        )

    @staticmethod
    async def request(session: AsyncSession, token: str, fileName: str, fileMimeType: str, content: str) -> Any:
        """Upload asset to Grok.

        Args:
            session: AsyncSession, the session to use for the request.
            token: str, the SSO token.
            fileName: str, the name of the file.
            fileMimeType: str, the MIME type of the file.
            content: str, the content of the file.

        Returns:
            Any: The response from the request.
        """
        try:
            # Get proxies
            base_proxy = get_config("proxy.base_proxy_url")
            assert_proxy = get_config("proxy.asset_proxy_url")
            if assert_proxy:
                proxies = {"http": assert_proxy, "https": assert_proxy}
                proxy_url = assert_proxy
            else:
                proxies = {"http": base_proxy, "https": base_proxy}
                proxy_url = base_proxy

            # Build headers
            headers = build_headers(
                cookie_token=token,
                content_type="application/json",
                origin="https://grok.com",
                referer="https://grok.com/",
            )

            # Build payload
            payload = {
                "fileName": fileName,
                "fileMimeType": fileMimeType,
                "content": content,
            }
            logger.info(
                "AssetsUpload request prepared: "
                f"fileName={fileName}, fileMimeType={fileMimeType}, content_len={len(content or '')}"
            )

            # Curl Config
            timeout = get_config("asset.upload_timeout")
            browser = get_config("proxy.browser")

            async def _do_request():
                try:
                    try:
                        response = await session.post(
                            UPLOAD_API,
                            headers=headers,
                            json=payload,
                            proxies=proxies,
                            timeout=timeout,
                            impersonate=browser,
                        )
                    except Exception as first_err:
                        logger.warning(
                            "AssetsUploadReverse primary request failed, fallback direct: "
                            "error={}",
                            str(first_err),
                        )
                        try:
                            response = await session.post(
                                UPLOAD_API,
                                headers=headers,
                                json=payload,
                                timeout=timeout,
                            )
                        except Exception as second_err:
                            logger.warning(
                                "AssetsUploadReverse direct curl request failed, "
                                "fallback urllib: error={}",
                                str(second_err),
                            )
                            response = await AssetsUploadReverse._urllib_post(
                                url=UPLOAD_API,
                                headers=headers,
                                payload=payload,
                                timeout=timeout,
                                proxy_url=proxy_url,
                            )
                    if response.status_code != 200:
                        body_raw = ""
                        try:
                            body_raw = response.text or ""
                        except Exception:
                            body_raw = ""
                        body_preview = AssetsUploadReverse._compact_body(body_raw)
                        error_hint = AssetsUploadReverse._extract_error_hint(body_raw)
                        logger.error(
                            "AssetsUploadReverse: Upload failed, "
                            "status={}, hint={}, body={}",
                            response.status_code,
                            error_hint or "-",
                            body_preview or "-",
                            extra={"error_type": "UpstreamException"},
                        )
                        raise UpstreamException(
                            message=f"AssetsUploadReverse: Upload failed, {response.status_code}",
                            details={
                                "status": response.status_code,
                                "body": body_preview,
                                "hint": error_hint,
                            },
                        )
                    return response
                except UpstreamException:
                    raise
                except Exception as inner_err:
                    err_msg = str(inner_err)
                    # 这类异常在实际环境里多为瞬时网络/上游抖动，按可重试处理。
                    if "curl: (35)" in err_msg or '"code"' in err_msg:
                        logger.warning(
                            "AssetsUpload transient exception, mark as retryable: "
                            "{}",
                            err_msg,
                        )
                        last_fallback_error: UpstreamException | None = None
                        # 部分 '"code"' 异常不会走到上面的降级分支，这里再强制兜底一次。
                        try:
                            response = await session.post(
                                UPLOAD_API,
                                headers=headers,
                                json=payload,
                                timeout=timeout,
                            )
                            if response.status_code == 200:
                                logger.info(
                                    "AssetsUpload recovered by forced direct fallback after transient error"
                                )
                                return response
                            body_raw = ""
                            try:
                                body_raw = response.text or ""
                            except Exception:
                                body_raw = ""
                            body_preview = AssetsUploadReverse._compact_body(body_raw)
                            error_hint = AssetsUploadReverse._extract_error_hint(body_raw)
                            raise UpstreamException(
                                message=f"AssetsUpload forced direct failed: {response.status_code}",
                                details={
                                    "status": response.status_code,
                                    "body": body_preview,
                                    "hint": error_hint,
                                },
                            )
                        except Exception as forced_direct_err:
                            if isinstance(forced_direct_err, UpstreamException):
                                last_fallback_error = forced_direct_err
                                logger.warning(
                                    "AssetsUpload forced direct fallback failed, "
                                    "status={}, hint={}, body={}",
                                    forced_direct_err.details.get("status"),
                                    forced_direct_err.details.get("hint") or "-",
                                    forced_direct_err.details.get("body") or "-",
                                )
                            else:
                                logger.warning(
                                    "AssetsUpload forced direct fallback failed, "
                                    "error={}",
                                    str(forced_direct_err),
                                )

                        try:
                            response = await AssetsUploadReverse._urllib_post(
                                url=UPLOAD_API,
                                headers=headers,
                                payload=payload,
                                timeout=timeout,
                                proxy_url=proxy_url,
                            )
                            if response.status_code == 200:
                                logger.info(
                                    "AssetsUpload recovered by forced urllib fallback after transient error"
                                )
                                return response
                            body_raw = response.text or ""
                            body_preview = AssetsUploadReverse._compact_body(body_raw)
                            error_hint = AssetsUploadReverse._extract_error_hint(body_raw)
                            raise UpstreamException(
                                message=f"AssetsUpload forced urllib failed: {response.status_code}",
                                details={
                                    "status": response.status_code,
                                    "body": body_preview,
                                    "hint": error_hint,
                                },
                            )
                        except Exception as forced_urllib_err:
                            if isinstance(forced_urllib_err, UpstreamException):
                                last_fallback_error = forced_urllib_err
                                logger.warning(
                                    "AssetsUpload forced urllib fallback failed, "
                                    "status={}, hint={}, body={}",
                                    forced_urllib_err.details.get("status"),
                                    forced_urllib_err.details.get("hint") or "-",
                                    forced_urllib_err.details.get("body") or "-",
                                )
                            else:
                                logger.warning(
                                    "AssetsUpload forced urllib fallback failed, "
                                    "error={}",
                                    str(forced_urllib_err),
                                )

                        if last_fallback_error is not None:
                            raise last_fallback_error
                        raise UpstreamException(
                            message=f"AssetsUpload transient failure: {err_msg}",
                            details={"status": 403, "error": err_msg},
                        )
                    raise

            return await retry_on_status(_do_request)

        except Exception as e:
            # Handle upstream exception
            if isinstance(e, UpstreamException):
                status = None
                if e.details and "status" in e.details:
                    status = e.details["status"]
                else:
                    status = getattr(e, "status_code", None)
                if status == 401:
                    try:
                        await TokenService.mark_invalid(token, "assets_upload_auth_failed")
                    except Exception:
                        pass
                elif status == 429:
                    try:
                        await TokenService.mark_rate_limited(token)
                    except Exception:
                        pass
                raise

            # Handle other non-upstream exceptions
            logger.error(
                "AssetsUploadReverse: Upload failed, {}",
                str(e),
                extra={"error_type": type(e).__name__},
            )
            raise UpstreamException(
                message=f"AssetsUploadReverse: Upload failed, {str(e)}",
                details={"status": 502, "error": str(e)},
            )


__all__ = ["AssetsUploadReverse"]
