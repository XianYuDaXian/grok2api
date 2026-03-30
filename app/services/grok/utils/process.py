"""
响应处理器基类和通用工具
"""

import asyncio
import time
from typing import Any, AsyncGenerator, Optional, AsyncIterable, List, TypeVar, Dict

import orjson

from app.core.config import get_config
from app.core.logger import logger
from app.core.exceptions import StreamIdleTimeoutError
from app.services.grok.utils.download import DownloadService


T = TypeVar("T")


def _is_http2_error(e: Exception) -> bool:
    """检查是否为 HTTP/2 流错误"""
    err_str = str(e).lower()
    return "http/2" in err_str or "curl: (92)" in err_str or "stream" in err_str


def _normalize_line(line: Any) -> Optional[str]:
    """规范化流式响应行，兼容 SSE data 前缀与空行"""
    if line is None:
        return None
    if isinstance(line, (bytes, bytearray)):
        text = line.decode("utf-8", errors="ignore")
    else:
        text = str(line)
    text = text.strip()
    if not text:
        return None
    if text.startswith("data:"):
        text = text[5:].strip()
    if text == "[DONE]":
        return None
    return text


def _is_intermediate_image_url(url: Any) -> bool:
    text = str(url or "").strip().lower()
    return text.endswith("-part-0/image.jpg")


def extract_image_entries(response_or_model: Any) -> List[Dict[str, str]]:
    """统一提取 app-chat / modelResponse 中的图片条目。"""
    entries: List[Dict[str, str]] = []
    seen: set[str] = set()

    def add(url: Any, *, title: str = "", source: str = ""):
        text = str(url or "").strip()
        if not text or _is_intermediate_image_url(text) or text in seen:
            return
        seen.add(text)
        entries.append(
            {
                "url": text,
                "title": str(title or "").strip(),
                "source": str(source or "").strip(),
            }
        )

    def walk_model_response(value: Any):
        if isinstance(value, dict):
            for key, item in value.items():
                if key in {"generatedImageUrls", "imageUrls", "imageURLs"}:
                    if isinstance(item, list):
                        for url in item:
                            if isinstance(url, str):
                                add(url, source="model_response")
                    elif isinstance(item, str):
                        add(item, source="model_response")
                    continue
                walk_model_response(item)
        elif isinstance(value, list):
            for item in value:
                walk_model_response(item)

    def collect_card_json(raw_json: str, *, source: str):
        try:
            card = orjson.loads(raw_json)
        except orjson.JSONDecodeError:
            return
        if not isinstance(card, dict):
            return
        image = card.get("image") or {}
        title = str(image.get("title") or "").strip()
        add(image.get("original") or image.get("link") or image.get("thumbnail"), title=title, source=source)
        image_chunk = card.get("image_chunk") or {}
        chunk_title = str(image_chunk.get("imageTitle") or title or "").strip()
        add(image_chunk.get("imageUrl") or image_chunk.get("thumbnailImageUrl"), title=chunk_title, source=source)

    if not isinstance(response_or_model, dict):
        return entries

    if "result" in response_or_model or "cardAttachment" in response_or_model or "modelResponse" in response_or_model:
        resp = response_or_model.get("result", {}).get("response", response_or_model)
    else:
        resp = response_or_model

    if not isinstance(resp, dict):
        return entries

    model_response = resp.get("modelResponse") or resp if "message" in resp else {}
    if isinstance(model_response, dict):
        walk_model_response(model_response)
        for raw in model_response.get("cardAttachmentsJson") or []:
            if isinstance(raw, str) and raw.strip():
                collect_card_json(raw, source="card_attachments_json")

    card = resp.get("cardAttachment") or {}
    json_data = card.get("jsonData")
    if isinstance(json_data, str) and json_data.strip():
        collect_card_json(json_data, source="card_attachment")

    return entries


def _collect_images(obj: Any) -> List[str]:
    """兼容旧入口：返回统一提图器中的 URL 列表。"""
    return [item["url"] for item in extract_image_entries(obj)]


async def _with_idle_timeout(
    iterable: AsyncIterable[T],
    idle_timeout: float,
    model: str = "",
    first_item_timeout: Optional[float] = None,
) -> AsyncGenerator[T, None]:
    """
    包装异步迭代器，添加空闲超时检测

    Args:
        iterable: 原始异步迭代器
        idle_timeout: 空闲超时时间(秒)，0 表示禁用
        model: 模型名称(用于日志)
    """
    try:
        idle_timeout = float(idle_timeout or 0)
    except (ValueError, TypeError):
        idle_timeout = 0.0

    try:
        first_item_timeout = float(first_item_timeout or 0) if first_item_timeout is not None else 0.0
    except (ValueError, TypeError):
        first_item_timeout = 0.0

    if idle_timeout <= 0:
        async for item in iterable:
            yield item
        return

    iterator = iterable.__aiter__()

    async def _maybe_aclose(it):
        aclose = getattr(it, "aclose", None)
        if not aclose:
            return
        try:
            await aclose()
        except Exception:
            pass

    got_first_item = False
    while True:
        try:
            current_timeout = idle_timeout
            if (not got_first_item) and first_item_timeout and first_item_timeout > 0:
                current_timeout = first_item_timeout
            item = await asyncio.wait_for(iterator.__anext__(), timeout=current_timeout)
            got_first_item = True
            yield item
        except asyncio.TimeoutError:
            logger.warning(
                f"Stream idle timeout after {current_timeout}s",
                extra={
                    "model": model,
                    "idle_timeout": current_timeout,
                    "first_item_timeout": first_item_timeout,
                    "got_first_item": got_first_item,
                },
            )
            await _maybe_aclose(iterator)
            raise StreamIdleTimeoutError(current_timeout)
        except asyncio.CancelledError:
            await _maybe_aclose(iterator)
            raise
        except StopAsyncIteration:
            break


class BaseProcessor:
    """基础处理器"""

    def __init__(self, model: str, token: str = ""):
        self.model = model
        self.token = token
        self.created = int(time.time())
        self.app_url = get_config("app.app_url")
        self._dl_service: Optional[DownloadService] = None

    def _get_dl(self) -> DownloadService:
        """获取下载服务实例（复用）"""
        if self._dl_service is None:
            self._dl_service = DownloadService()
        return self._dl_service

    async def close(self):
        """释放下载服务资源"""
        if self._dl_service:
            await self._dl_service.close()
            self._dl_service = None

    async def process_url(self, path: str, media_type: str = "image") -> str:
        """处理资产 URL"""
        dl_service = self._get_dl()
        return await dl_service.resolve_url(path, self.token, media_type)


__all__ = [
    "BaseProcessor",
    "_with_idle_timeout",
    "_normalize_line",
    "_collect_images",
    "_is_http2_error",
]
