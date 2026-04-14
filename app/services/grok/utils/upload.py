"""
Upload service.

Upload service for assets.grok.com.
"""

import base64
import hashlib
import io
import mimetypes
import re
from pathlib import Path
from typing import AsyncIterator, Optional, Tuple
from urllib.parse import urlparse

import aiofiles
from curl_cffi.requests import AsyncSession

from app.core.config import get_config
from app.core.exceptions import AppException, UpstreamException, ValidationException
from app.core.logger import logger
from app.core.storage import DATA_DIR
from app.services.reverse.assets_upload import AssetsUploadReverse
from app.services.grok.utils.locks import _get_upload_semaphore, _file_lock


class UploadService:
    """Assets upload service."""

    def __init__(self):
        self._session: Optional[AsyncSession] = None
        self._chunk_size = 64 * 1024

    async def create(self) -> AsyncSession:
        """Create or reuse a session."""
        if self._session is None:
            self._session = AsyncSession()
        return self._session

    async def close(self):
        """Close the session."""
        if self._session:
            await self._session.close()
            self._session = None

    @staticmethod
    def _normalize_image_to_jpeg(filename: str, b64: str, mime: str) -> Tuple[str, str, str]:
        """所有图片统一净化并重编码为 JPEG，消除源图指纹差异。"""
        safe_mime = str(mime or "").lower().strip()
        if not safe_mime.startswith("image/"):
            return filename, b64, mime

        try:
            from PIL import Image, ImageOps
        except Exception as e:
            raise ValidationException(f"Pillow is required for image conversion: {e}")

        try:
            raw = base64.b64decode(re.sub(r"\s+", "", b64), validate=True)
        except Exception:
            raise ValidationException("Invalid image base64 content")

        try:
            with Image.open(io.BytesIO(raw)) as img:
                img = ImageOps.exif_transpose(img)
                width, height = img.size
                if img.mode in ("RGBA", "LA"):
                    bg = Image.new("RGB", img.size, (255, 255, 255))
                    alpha = img.split()[-1]
                    bg.paste(img.convert("RGBA"), mask=alpha)
                    out_img = bg
                else:
                    out_img = img.convert("RGB")

                # 先做一次无元数据净化，避免源图中异常 profile/块影响上游解析
                sanitized = Image.new("RGB", out_img.size)
                sanitized.paste(out_img)

                out = io.BytesIO()
                # 使用更保守的 baseline JPEG 参数，减少兼容性问题
                sanitized.save(
                    out,
                    format="JPEG",
                    quality=92,
                    optimize=False,
                    progressive=False,
                    subsampling=2,
                )
                jpeg_b64 = base64.b64encode(out.getvalue()).decode()
                base_name = (filename or "file").rsplit(".", 1)[0]
                jpeg_name = f"{base_name}.jpg"
                logger.info(
                    "Upload image normalized to JPEG: "
                    f"from={safe_mime}, src_name={filename}, dst_name={jpeg_name}, "
                    f"size={width}x{height}, out_len={len(jpeg_b64)}, profile=baseline-jpeg"
                )
                return jpeg_name, jpeg_b64, "image/jpeg"
        except Exception as e:
            raise ValidationException(f"Image conversion to JPEG failed: {e}")

    @staticmethod
    def _reencode_jpeg_with_profile(
        b64: str, *, quality: int, optimize: bool, progressive: bool, subsampling: int
    ) -> str:
        """按指定 profile 重编码 JPEG，用于上游 400/403 兜底。"""
        try:
            from PIL import Image, ImageOps
        except Exception as e:
            raise ValidationException(f"Pillow is required for image conversion: {e}")

        try:
            raw = base64.b64decode(re.sub(r"\s+", "", b64), validate=True)
        except Exception:
            raise ValidationException("Invalid image base64 content")

        try:
            with Image.open(io.BytesIO(raw)) as img:
                img = ImageOps.exif_transpose(img).convert("RGB")
                out = io.BytesIO()
                img.save(
                    out,
                    format="JPEG",
                    quality=max(1, min(quality, 100)),
                    optimize=optimize,
                    progressive=progressive,
                    subsampling=subsampling,
                )
                return base64.b64encode(out.getvalue()).decode()
        except Exception as e:
            raise ValidationException(f"Image conversion to JPEG failed: {e}")

    @staticmethod
    def _inspect_image_payload(b64: str) -> Tuple[int, int, int]:
        """解析图片负载，返回 (宽, 高, 字节大小)。"""
        try:
            from PIL import Image
        except Exception as e:
            raise ValidationException(f"Pillow is required for image inspection: {e}")

        try:
            raw = base64.b64decode(re.sub(r"\s+", "", b64), validate=True)
        except Exception:
            raise ValidationException("Invalid image base64 content")

        try:
            with Image.open(io.BytesIO(raw)) as img:
                width, height = img.size
            return width, height, len(raw)
        except Exception as e:
            raise ValidationException(f"Image inspect failed: {e}")

    @staticmethod
    def _extract_upstream_rejection_hint(exc: Exception) -> str:
        text_parts = [str(exc or "")]
        details = getattr(exc, "details", None)
        if isinstance(details, dict):
            text_parts.extend(
                [
                    str(details.get("hint") or ""),
                    str(details.get("body") or ""),
                    str(details.get("error") or ""),
                ]
            )
        merged = " | ".join(part for part in text_parts if part).lower()
        if "content is moderated" in merged or "content-moderated" in merged:
            return "Content is moderated [WKE=file:content-moderated]"
        if "just a moment" in merged or "cf-challenge" in merged or "cloudflare" in merged:
            return "Cloudflare challenge page"
        return ""

    @staticmethod
    def _is_url(value: str) -> bool:
        """Check if the value is a URL."""
        try:
            parsed = urlparse(value)
            return bool(
                parsed.scheme and parsed.netloc and parsed.scheme in ["http", "https"]
            )
        except Exception:
            return False

    @staticmethod
    def _infer_mime(filename: str, fallback: str = "application/octet-stream") -> str:
        mime, _ = mimetypes.guess_type(filename)
        return mime or fallback

    @staticmethod
    def _is_loopback_host(hostname: str) -> bool:
        host = str(hostname or "").strip().lower()
        return host in {"127.0.0.1", "localhost", "::1"}

    @staticmethod
    def _resolve_internal_file_ref(url: str) -> Optional[Tuple[str, str]]:
        """识别本站 /v1/files 路径，直接回源本地缓存文件。"""
        try:
            parsed = urlparse(url)
        except Exception:
            return None

        path = str(parsed.path or "").strip()
        if not path.startswith("/v1/files/"):
            return None

        parts = path.strip("/").split("/", 3)
        if len(parts) < 4:
            return None

        app_url = str(get_config("app.app_url") or "").strip()
        app_host = ""
        if app_url:
            try:
                app_host = str(urlparse(app_url).hostname or "").strip().lower()
            except Exception:
                app_host = ""

        req_host = str(parsed.hostname or "").strip().lower()
        if req_host and not (
            UploadService._is_loopback_host(req_host)
            or (app_host and req_host == app_host)
        ):
            return None

        local_type = parts[2]
        name = parts[3].replace("/", "-")
        if not local_type or not name:
            return None
        return local_type, name

    @staticmethod
    async def _encode_b64_stream(chunks: AsyncIterator[bytes]) -> str:
        parts = []
        remain = b""
        async for chunk in chunks:
            if not chunk:
                continue
            chunk = remain + chunk
            keep = len(chunk) % 3
            if keep:
                remain = chunk[-keep:]
                chunk = chunk[:-keep]
            else:
                remain = b""
            if chunk:
                parts.append(base64.b64encode(chunk).decode())
        if remain:
            parts.append(base64.b64encode(remain).decode())
        return "".join(parts)

    async def _read_local_file(self, local_type: str, name: str) -> Tuple[str, str, str]:
        base_dir = DATA_DIR / "tmp"
        if local_type == "video":
            local_dir = base_dir / "video"
            mime = "video/mp4"
        else:
            local_dir = base_dir / "image"
            suffix = Path(name).suffix.lower()
            if suffix == ".png":
                mime = "image/png"
            elif suffix == ".webp":
                mime = "image/webp"
            elif suffix == ".gif":
                mime = "image/gif"
            else:
                mime = "image/jpeg"

        local_path = local_dir / name
        lock_name = f"ul_local_{hashlib.sha1(str(local_path).encode()).hexdigest()[:16]}"
        lock_timeout = max(1, int(get_config("asset.upload_timeout")))
        async with _file_lock(lock_name, timeout=lock_timeout):
            if not local_path.exists():
                raise ValidationException(f"Local file not found: {local_path}")
            if not local_path.is_file():
                raise ValidationException(f"Invalid local file: {local_path}")

            async def _iter_file() -> AsyncIterator[bytes]:
                async with aiofiles.open(local_path, "rb") as f:
                    while True:
                        chunk = await f.read(self._chunk_size)
                        if not chunk:
                            break
                        yield chunk

            b64 = await self._encode_b64_stream(_iter_file())
        filename = name or "file"
        return filename, b64, mime

    async def parse_b64(self, url: str) -> Tuple[str, str, str]:
        """Fetch URL content and return (filename, base64, mime)."""
        try:
            if self._is_url(url):
                internal_ref = self._resolve_internal_file_ref(url)
                if internal_ref:
                    local_type, name = internal_ref
                    logger.debug(
                        "Upload parse_b64 resolved internal file URL locally: type={}, name={}",
                        local_type,
                        name,
                    )
                    return await self._read_local_file(local_type, name)

            lock_name = f"ul_url_{hashlib.sha1(url.encode()).hexdigest()[:16]}"
            timeout = float(get_config("asset.upload_timeout"))
            proxy_url = get_config("proxy.base_proxy_url")
            proxies = {"http": proxy_url, "https": proxy_url} if proxy_url else None

            lock_timeout = max(1, int(get_config("asset.upload_timeout")))
            async with _file_lock(lock_name, timeout=lock_timeout):
                session = await self.create()
                response = await session.get(
                    url,
                    timeout=timeout,
                    proxies=proxies,
                    stream=True,
                )
                if response.status_code >= 400:
                    raise UpstreamException(
                        message=f"Failed to fetch: {response.status_code}",
                        details={"url": url, "status": response.status_code},
                    )

                filename = url.split("/")[-1].split("?")[0] or "download"
                content_type = response.headers.get(
                    "content-type", ""
                ).split(";")[0].strip()
                if not content_type:
                    content_type = self._infer_mime(filename)
                if hasattr(response, "aiter_content"):
                    try:
                        b64 = await self._encode_b64_stream(response.aiter_content())
                    except Exception:
                        # 某些响应对象虽存在 aiter_content，但底层未进入 stream 模式；回退读取 content。
                        b64 = base64.b64encode(response.content).decode()
                else:
                    b64 = base64.b64encode(response.content).decode()

                logger.debug(f"Fetched: {url}")
                return filename, b64, content_type
        except Exception as e:
            if isinstance(e, AppException):
                raise
            logger.error("Fetch failed: {} - {}", url, str(e))
            raise UpstreamException(f"Fetch failed: {str(e)}", details={"url": url})

    @staticmethod
    def format_b64(data_uri: str) -> Tuple[str, str, str]:
        """Format data URI to (filename, base64, mime)."""
        if not data_uri.startswith("data:"):
            raise ValidationException("Invalid file input: not a data URI")

        try:
            header, b64 = data_uri.split(",", 1)
        except ValueError:
            raise ValidationException("Invalid data URI format")

        if ";base64" not in header:
            raise ValidationException("Invalid data URI: missing base64 marker")

        mime = header[5:].split(";", 1)[0] or "application/octet-stream"
        b64 = re.sub(r"\s+", "", b64)
        if not mime or not b64:
            raise ValidationException("Invalid data URI: empty content")
        ext = mime.split("/")[-1] if "/" in mime else "bin"
        return f"file.{ext}", b64, mime

    async def check_format(self, file_input: str) -> Tuple[str, str, str]:
        """Check file input format and return (filename, base64, mime)."""
        if not isinstance(file_input, str) or not file_input.strip():
            raise ValidationException("Invalid file input: empty content")

        if self._is_url(file_input):
            return await self.parse_b64(file_input)

        if file_input.startswith("data:"):
            return self.format_b64(file_input)

        raise ValidationException("Invalid file input: must be URL or base64")

    async def upload_file(self, file_input: str, token: str) -> Tuple[str, str]:
        """
        Upload file to Grok.

        Args:
            file_input: str, the file input.
            token: str, the SSO token.

        Returns:
            Tuple[str, str]: The file ID and URI.
        """
        async with _get_upload_semaphore():
            filename, b64, mime = await self.check_format(file_input)
            filename, b64, mime = self._normalize_image_to_jpeg(filename, b64, mime)

            logger.debug(
                f"Upload prepare: filename={filename}, type={mime}, size={len(b64)}"
            )

            if not b64:
                raise ValidationException("Invalid file input: empty content")
            if str(mime).lower().startswith("image/"):
                width, height, raw_size = self._inspect_image_payload(b64)
                logger.info(
                    "Upload image stats before request: "
                    f"filename={filename}, mime={mime}, resolution={width}x{height}, "
                    f"pixels={width * height}, bytes={raw_size}, b64_len={len(b64)}"
                )

            session = await self.create()
            try:
                response = await AssetsUploadReverse.request(
                    session,
                    token,
                    filename,
                    mime,
                    b64,
                )
                result = response.json()
                file_id = result.get("fileMetadataId", "")
                file_uri = result.get("fileUri", "")
                logger.info(f"Upload success: {filename} -> {file_id}")
                return file_id, file_uri
            except UpstreamException as e:
                status = None
                if e.details and "status" in e.details:
                    status = e.details.get("status")
                body = (e.details or {}).get("body", "")
                hint = (e.details or {}).get("hint", "")
                normalized_hint = self._extract_upstream_rejection_hint(e) or hint
                logger.warning(
                    "Upload image upstream rejected: "
                    "filename={}, status={}, hint={}, body={}",
                    filename,
                    status,
                    normalized_hint or "-",
                    body or "-",
                )
                if normalized_hint == "Content is moderated [WKE=file:content-moderated]":
                    raise ValidationException(
                        message="图片内容触发审核限制，无法上传。请更换图片后重试。",
                        param="image",
                        code="content_moderated",
                    )
                if mime != "image/jpeg" or status not in (400, 403):
                    raise

                # 部分图片会被上游以 400/403 拒绝，切换 JPEG profile 再试一次。
                fallback_profiles = [
                    {
                        "quality": 98,
                        "optimize": False,
                        "progressive": False,
                        "subsampling": 0,
                    },
                    {
                        "quality": 95,
                        "optimize": False,
                        "progressive": False,
                        "subsampling": 2,
                    },
                ]
                last_error = e
                for idx, profile in enumerate(fallback_profiles, start=1):
                    try:
                        b64_retry = self._reencode_jpeg_with_profile(b64, **profile)
                        logger.warning(
                            "Upload image fallback re-encode retry: "
                            "attempt={}, status={}, profile={}, out_len={}",
                            idx,
                            status,
                            profile,
                            len(b64_retry),
                        )
                        response = await AssetsUploadReverse.request(
                            session,
                            token,
                            filename,
                            mime,
                            b64_retry,
                        )
                        result = response.json()
                        file_id = result.get("fileMetadataId", "")
                        file_uri = result.get("fileUri", "")
                        logger.info(
                            f"Upload success after fallback retry: {filename} -> {file_id}"
                        )
                        return file_id, file_uri
                    except UpstreamException as retry_error:
                        last_error = retry_error
                        continue
                raise last_error


__all__ = ["UploadService"]
