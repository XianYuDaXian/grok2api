"""
Reverse interface: download asset.
"""

import urllib.parse
from typing import Any
from pathlib import Path
from curl_cffi.requests import AsyncSession

from app.core.logger import logger
from app.core.config import get_config
from app.core.exceptions import UpstreamException
from app.services.token.service import TokenService
from app.services.reverse.utils.headers import build_headers
from app.services.reverse.utils.retry import retry_on_status

DOWNLOAD_API = "https://assets.grok.com"

_CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
}


class AssetsDownloadReverse:
    """assets.grok.com/{path} reverse interface."""

    @staticmethod
    async def request(session: AsyncSession, token: str, file_path: str) -> Any:
        """Download asset from Grok.

        Args:
            session: AsyncSession, the session to use for the request.
            token: str, the SSO token.
            file_path: str, the path of the file to download.

        Returns:
            Any: The response from the request.
        """
        try:
            # Normalize path
            if not file_path.startswith("/"):
                file_path = f"/{file_path}"
            url = f"{DOWNLOAD_API}{file_path}"

            # Get proxies
            base_proxy = (get_config("proxy.base_proxy_url") or "").strip()
            asset_proxy = (get_config("proxy.asset_proxy_url") or "").strip()
            proxy_url = asset_proxy or base_proxy
            proxies = {"http": proxy_url, "https": proxy_url} if proxy_url else None

            # Guess content type by extension for Accept/Sec-Fetch-Dest
            content_type = _CONTENT_TYPES.get(Path(urllib.parse.urlparse(file_path).path).suffix.lower())

            # Build headers
            headers = build_headers(
                cookie_token=token,
                content_type=content_type,
                origin="https://assets.grok.com",
                referer="https://grok.com/",
            )
            ## Align with browser download navigation headers
            headers["Cache-Control"] = "no-cache"
            headers["Pragma"] = "no-cache"
            headers["Priority"] = "u=0, i"
            headers["Sec-Fetch-Mode"] = "navigate"
            headers["Sec-Fetch-User"] = "?1"
            headers["Upgrade-Insecure-Requests"] = "1"

            # Curl Config
            timeout = get_config("asset.download_timeout")
            browser = get_config("proxy.browser")

            async def _single_get(*, use_impersonate: bool, use_proxy: bool):
                kwargs = {
                    "headers": headers,
                    "timeout": timeout,
                    "allow_redirects": True,
                    "stream": True,
                }
                if use_proxy and proxies:
                    kwargs["proxies"] = proxies
                if use_impersonate and browser:
                    kwargs["impersonate"] = browser
                response = await session.get(url, **kwargs)
                if response.status_code != 200:
                    logger.error(
                        f"AssetsDownloadReverse: Download failed, {response.status_code}",
                        extra={"error_type": "UpstreamException"},
                    )
                    raise UpstreamException(
                        message=f"AssetsDownloadReverse: Download failed, {response.status_code}",
                        details={"status": response.status_code},
                    )
                return response

            async def _do_request():
                try:
                    return await _single_get(use_impersonate=True, use_proxy=True)
                except Exception as first_err:
                    # TLS/握手类问题常出现在代理或浏览器指纹组合，降级直连重试一次。
                    logger.warning(
                        "AssetsDownloadReverse primary request failed, fallback direct: "
                        f"error={first_err}"
                    )
                    return await _single_get(use_impersonate=False, use_proxy=False)

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
                        await TokenService.record_fail(token, status, "assets_download_auth_failed")
                    except Exception:
                        pass
                raise

            # Handle other non-upstream exceptions
            logger.error(
                f"AssetsDownloadReverse: Download failed, {str(e)}",
                extra={"error_type": type(e).__name__},
            )
            raise UpstreamException(
                message=f"AssetsDownloadReverse: Download failed, {str(e)}",
                details={"status": 502, "error": str(e)},
            )


__all__ = ["AssetsDownloadReverse"]
