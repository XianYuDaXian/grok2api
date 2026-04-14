"""
Reverse interface: media post create/get.
"""

import asyncio
import json
import re
import urllib.request
from pathlib import Path
from dataclasses import dataclass
from typing import Any
from curl_cffi.requests import AsyncSession

from app.core.logger import logger
from app.core.config import get_config
from app.core.exceptions import UpstreamException
from app.core.storage import DATA_DIR
from app.services.token.service import TokenService
from app.services.reverse.utils.headers import build_headers
from app.services.reverse.utils.retry import retry_on_status

MEDIA_POST_API = "https://grok.com/rest/media/post/create"
MEDIA_POST_GET_API = "https://grok.com/rest/media/post/get"
MEDIA_POST_CREATE_LINK_API = "https://grok.com/rest/media/post/create-link"


class MediaPostReverse:
    """/rest/media/post/* reverse interface."""

    @dataclass
    class _SimpleResponse:
        status_code: int
        headers: dict[str, str]
        text: str

        def json(self):
            return json.loads(self.text or "{}")

    @staticmethod
    def _metadata_dir() -> Path:
        path = DATA_DIR / "tmp" / "media-meta"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @staticmethod
    async def write_metadata(post_id: str, metadata: dict[str, Any]) -> Path | None:
        post_text = str(post_id or "").strip()
        if not post_text or not isinstance(metadata, dict):
            return None
        metadata_path = MediaPostReverse._metadata_dir() / f"{post_text}.json"

        def _write() -> None:
            metadata_path.write_text(
                json.dumps(metadata, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

        await asyncio.to_thread(_write)
        return metadata_path

    @staticmethod
    async def capture_metadata(
        session: AsyncSession,
        token: str,
        post_id: str,
        *,
        media_type: str = "",
        local_url: str = "",
        thumbnail_url: str = "",
        extra: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        post_text = str(post_id or "").strip()
        if not post_text:
            return {}
        post_payload = {}
        share_payload = {}
        share_link = ""
        create_public_share_link = bool(get_config("asset.create_public_share_link", True))
        try:
            post_resp = await MediaPostReverse.get(session, token, post_text)
            post_payload = post_resp.json() if post_resp is not None else {}
        except Exception as e:
            logger.warning(f"MediaPost metadata get failed: post_id={post_text}, error={e}")
        if create_public_share_link:
            try:
                share_resp = await MediaPostReverse.create_link(session, token, post_text)
                share_payload = share_resp.json() if share_resp is not None else {}
                if isinstance(share_payload, dict):
                    share_link = str(share_payload.get("shareLink") or "").strip()
            except Exception as e:
                logger.warning(f"MediaPost metadata create-link failed: post_id={post_text}, error={e}")
        else:
            logger.info(
                "MediaPost metadata create-link skipped by config: post_id={}",
                post_text,
            )

        canonical_post_id = post_text
        if share_link:
            match = re.search(r"/imagine/post/([0-9a-fA-F-]{32,36})", share_link)
            if match:
                canonical_post_id = match.group(1)

        post = post_payload.get("post", {}) if isinstance(post_payload, dict) else {}
        metadata: dict[str, Any] = {
            "post_id": canonical_post_id,
            "share_link": share_link,
            "media_type": str(media_type or post.get("mediaType") or "").strip(),
            "media_url": str(post.get("mediaUrl") or "").strip(),
            "thumbnail_url": str(post.get("thumbnailImageUrl") or thumbnail_url or "").strip(),
            "mime_type": str(post.get("mimeType") or "").strip(),
            "original_post_id": str(post.get("originalPostId") or "").strip(),
            "original_ref_type": str(post.get("originalRefType") or "").strip(),
            "local_url": str(local_url or "").strip(),
            "user_id": str(post.get("userId") or "").strip(),
            "model_name": str(post.get("modelName") or "").strip(),
        }
        if extra:
            metadata.update(extra)
        path = await MediaPostReverse.write_metadata(canonical_post_id, metadata)
        if path:
            metadata["metadata_path"] = str(path)
        return metadata

    @staticmethod
    async def _urllib_post(
        url: str, headers: dict[str, str], payload: dict[str, Any], timeout: int, proxy_url: str
    ) -> "MediaPostReverse._SimpleResponse":
        body = json.dumps(payload).encode("utf-8")
        opener = None
        if proxy_url:
            opener = urllib.request.build_opener(
                urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url})
            )
        req = urllib.request.Request(url=url, data=body, headers=headers, method="POST")

        def _do_post():
            if opener is not None:
                with opener.open(req, timeout=timeout) as resp:
                    status = int(getattr(resp, "status", 200) or 200)
                    raw_headers = {
                        str(k).lower(): str(v) for k, v in dict(resp.headers.items()).items()
                    }
                    text = resp.read().decode("utf-8", errors="replace")
                    return status, raw_headers, text
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                status = int(getattr(resp, "status", 200) or 200)
                raw_headers = {
                    str(k).lower(): str(v) for k, v in dict(resp.headers.items()).items()
                }
                text = resp.read().decode("utf-8", errors="replace")
                return status, raw_headers, text

        status, raw_headers, text = await asyncio.to_thread(_do_post)
        return MediaPostReverse._SimpleResponse(
            status_code=status,
            headers=raw_headers,
            text=text,
        )

    @staticmethod
    async def request(
        session: AsyncSession,
        token: str,
        mediaType: str,
        mediaUrl: str,
        prompt: str = "",
    ) -> Any:
        """Create media post in Grok.

        Args:
            session: AsyncSession, the session to use for the request.
            token: str, the SSO token.
            mediaType: str, the media type.
            mediaUrl: str, the media URL.

        Returns:
            Any: The response from the request.
        """
        try:
            # Get proxies
            base_proxy = get_config("proxy.base_proxy_url")
            proxies = {"http": base_proxy, "https": base_proxy} if base_proxy else None
            proxy_url = base_proxy

            # Build headers
            headers = build_headers(
                cookie_token=token,
                content_type="application/json",
                origin="https://grok.com",
                referer="https://grok.com",
            )

            # Build payload
            payload = {"mediaType": mediaType}
            if mediaUrl:
                payload["mediaUrl"] = mediaUrl
            if prompt:
                payload["prompt"] = prompt
            logger.info(
                "MediaPost request prepared: "
                f"mediaType={mediaType}, has_media_url={bool(mediaUrl)}, prompt_len={len(prompt or '')}"
            )

            # Curl Config
            timeout = get_config("video.timeout")
            browser = get_config("proxy.browser")

            async def _do_request():
                try:
                    response = await session.post(
                        MEDIA_POST_API,
                        headers=headers,
                        json=payload,
                        timeout=timeout,
                        proxies=proxies,
                        impersonate=browser,
                    )
                except Exception as first_err:
                    logger.warning(
                        "MediaPostReverse primary request failed, fallback direct: "
                        f"error={first_err}"
                    )
                    try:
                        response = await session.post(
                            MEDIA_POST_API,
                            headers=headers,
                            json=payload,
                            timeout=timeout,
                        )
                    except Exception as second_err:
                        logger.warning(
                            "MediaPostReverse direct curl request failed, "
                            f"fallback urllib: error={second_err}"
                        )
                        response = await MediaPostReverse._urllib_post(
                            url=MEDIA_POST_API,
                            headers=headers,
                            payload=payload,
                            timeout=timeout,
                            proxy_url=proxy_url,
                        )

                if response.status_code != 200:
                    content = ""
                    try:
                        content = (response.text or "").strip().replace("\n", " ")
                    except Exception:
                        pass
                    if len(content) > 300:
                        content = f"{content[:300]}...(len={len(content)})"
                    logger.error(
                        "MediaPostReverse: Media post create failed, status={}, body={}",
                        response.status_code,
                        content or '-',
                        extra={"error_type": "UpstreamException"},
                    )
                    raise UpstreamException(
                        message=f"MediaPostReverse: Media post create failed, {response.status_code}",
                        details={"status": response.status_code, "body": content},
                    )

                return response

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
                        await TokenService.mark_invalid(token, "media_post_auth_failed")
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
                f"MediaPostReverse: Media post create failed, {str(e)}",
                extra={"error_type": type(e).__name__},
            )
            raise UpstreamException(
                message=f"MediaPostReverse: Media post create failed, {str(e)}",
                details={"status": 502, "error": str(e)},
            )

    @staticmethod
    async def get(session: AsyncSession, token: str, post_id: str) -> Any:
        """获取媒体 post 元信息。"""
        try:
            base_proxy = get_config("proxy.base_proxy_url")
            proxies = {"http": base_proxy, "https": base_proxy} if base_proxy else None
            proxy_url = base_proxy
            headers = build_headers(
                cookie_token=token,
                content_type="application/json",
                origin="https://grok.com",
                referer="https://grok.com",
            )
            payload = {"id": str(post_id or "").strip()}
            timeout = get_config("video.timeout")
            browser = get_config("proxy.browser")

            async def _do_request():
                try:
                    response = await session.post(
                        MEDIA_POST_GET_API,
                        headers=headers,
                        json=payload,
                        timeout=timeout,
                        proxies=proxies,
                        impersonate=browser,
                    )
                except Exception as first_err:
                    logger.warning(
                        "MediaPostReverse get primary request failed, fallback direct: "
                        f"error={first_err}"
                    )
                    try:
                        response = await session.post(
                            MEDIA_POST_GET_API,
                            headers=headers,
                            json=payload,
                            timeout=timeout,
                        )
                    except Exception as second_err:
                        logger.warning(
                            "MediaPostReverse get direct curl request failed, "
                            f"fallback urllib: error={second_err}"
                        )
                        response = await MediaPostReverse._urllib_post(
                            url=MEDIA_POST_GET_API,
                            headers=headers,
                            payload=payload,
                            timeout=timeout,
                            proxy_url=proxy_url,
                        )

                if response.status_code != 200:
                    content = ""
                    try:
                        content = (response.text or "").strip().replace("\n", " ")
                    except Exception:
                        pass
                    if len(content) > 300:
                        content = f"{content[:300]}...(len={len(content)})"
                    logger.error(
                        "MediaPostReverse: Media post get failed, status={}, body={}",
                        response.status_code,
                        content or '-',
                        extra={"error_type": "UpstreamException"},
                    )
                    raise UpstreamException(
                        message=f"MediaPostReverse: Media post get failed, {response.status_code}",
                        details={"status": response.status_code, "body": content},
                    )

                return response

            return await retry_on_status(_do_request)

        except Exception as e:
            if isinstance(e, UpstreamException):
                raise
            logger.error(
                f"MediaPostReverse: Media post get failed, {str(e)}",
                extra={"error_type": type(e).__name__},
            )
            raise UpstreamException(
                message=f"MediaPostReverse: Media post get failed, {str(e)}",
                details={"status": 502, "error": str(e)},
            )

    @staticmethod
    async def create_link(
        session: AsyncSession,
        token: str,
        post_id: str,
        source: str = "post-page",
        platform: str = "web",
    ) -> Any:
        """为媒体 post 创建 share link。"""
        try:
            base_proxy = get_config("proxy.base_proxy_url")
            proxies = {"http": base_proxy, "https": base_proxy} if base_proxy else None
            proxy_url = base_proxy
            headers = build_headers(
                cookie_token=token,
                content_type="application/json",
                origin="https://grok.com",
                referer=f"https://grok.com/imagine/post/{post_id}",
            )
            payload = {
                "postId": str(post_id or "").strip(),
                "source": str(source or "post-page").strip() or "post-page",
                "platform": str(platform or "web").strip() or "web",
            }
            timeout = get_config("video.timeout")
            browser = get_config("proxy.browser")
            logger.info(
                "MediaPost create-link request prepared: "
                f"post_id={payload['postId']}, source={payload['source']}, platform={payload['platform']}"
            )

            async def _do_request():
                try:
                    response = await session.post(
                        MEDIA_POST_CREATE_LINK_API,
                        headers=headers,
                        json=payload,
                        timeout=timeout,
                        proxies=proxies,
                        impersonate=browser,
                    )
                except Exception as first_err:
                    logger.warning(
                        "MediaPostReverse create-link primary request failed, fallback direct: "
                        f"error={first_err}"
                    )
                    try:
                        response = await session.post(
                            MEDIA_POST_CREATE_LINK_API,
                            headers=headers,
                            json=payload,
                            timeout=timeout,
                        )
                    except Exception as second_err:
                        logger.warning(
                            "MediaPostReverse create-link direct curl request failed, "
                            f"fallback urllib: error={second_err}"
                        )
                        response = await MediaPostReverse._urllib_post(
                            url=MEDIA_POST_CREATE_LINK_API,
                            headers=headers,
                            payload=payload,
                            timeout=timeout,
                            proxy_url=proxy_url,
                        )

                if response.status_code != 200:
                    content = ""
                    try:
                        content = (response.text or "").strip().replace("\n", " ")
                    except Exception:
                        pass
                    if len(content) > 300:
                        content = f"{content[:300]}...(len={len(content)})"
                    logger.error(
                        "MediaPostReverse: Media post create-link failed, status={}, body={}",
                        response.status_code,
                        content or '-',
                        extra={"error_type": "UpstreamException"},
                    )
                    raise UpstreamException(
                        message=f"MediaPostReverse: Media post create-link failed, {response.status_code}",
                        details={"status": response.status_code, "body": content},
                    )

                return response

            return await retry_on_status(_do_request)

        except Exception as e:
            if isinstance(e, UpstreamException):
                raise
            logger.error(
                f"MediaPostReverse: Media post create-link failed, {str(e)}",
                extra={"error_type": type(e).__name__},
            )
            raise UpstreamException(
                message=f"MediaPostReverse: Media post create-link failed, {str(e)}",
                details={"status": 502, "error": str(e)},
            )


__all__ = ["MediaPostReverse"]
