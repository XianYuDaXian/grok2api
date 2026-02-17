import asyncio
import re
import time
import uuid
from typing import Optional, List, Dict, Any

import orjson
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, Field

from app.core.auth import verify_public_key
from app.core.logger import logger
from app.services.grok.services.video import VideoService
from app.services.grok.services.model import ModelService
from app.api.v1.public_api import imagine as imagine_public_api
from app.services.grok.utils.cache import CacheService

router = APIRouter()

VIDEO_SESSION_TTL = 600
_VIDEO_SESSIONS: dict[str, dict] = {}
_VIDEO_SESSIONS_LOCK = asyncio.Lock()
_VENDOR_CACHE: dict[str, bytes] = {}
_VENDOR_LOCK = asyncio.Lock()

_VIDEO_RATIO_MAP = {
    "1280x720": "16:9",
    "720x1280": "9:16",
    "1792x1024": "3:2",
    "1024x1792": "2:3",
    "1024x1024": "1:1",
    "16:9": "16:9",
    "9:16": "9:16",
    "3:2": "3:2",
    "2:3": "2:3",
    "1:1": "1:1",
}

_FFMPEG_VENDOR_SOURCES = {
    "ffmpeg-core.js": [
        "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
        "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
    ],
    "ffmpeg-core.wasm": [
        "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm",
        "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm",
    ],
    # 某些版本没有 worker 文件，允许返回 404 由前端自动降级。
    "ffmpeg-core.worker.js": [
        "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.worker.js",
        "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.worker.js",
    ],
}

_VENDOR_CONTENT_TYPE = {
    "ffmpeg-core.js": "application/javascript; charset=utf-8",
    "ffmpeg-core.worker.js": "application/javascript; charset=utf-8",
    "ffmpeg-core.wasm": "application/wasm",
}


def _extract_parent_post_id_from_url(url: str) -> str:
    text = str(url or "").strip()
    if not text:
        return ""
    if re.fullmatch(r"[0-9a-fA-F-]{32,36}", text):
        return text
    for pattern in (
        r"/generated/([0-9a-fA-F-]{32,36})(?:/|$)",
        r"/imagine-public/images/([0-9a-fA-F-]{32,36})(?:\.jpg|/|$)",
        r"/images/([0-9a-fA-F-]{32,36})(?:\.jpg|/|$)",
    ):
        match = re.search(pattern, text)
        if match:
            return match.group(1)
    matches = re.findall(r"([0-9a-fA-F-]{32,36})", text)
    return matches[-1] if matches else ""


def _build_imagine_public_url(parent_post_id: str) -> str:
    return f"https://imagine-public.x.ai/imagine-public/images/{parent_post_id}.jpg"


def _mask_token(token: str) -> str:
    raw = str(token or "").replace("sso=", "")
    if len(raw) <= 12:
        return raw or "-"
    return f"{raw[:6]}...{raw[-6:]}"


async def _clean_sessions(now: float) -> None:
    expired = [
        key
        for key, info in _VIDEO_SESSIONS.items()
        if now - float(info.get("created_at") or 0) > VIDEO_SESSION_TTL
    ]
    for key in expired:
        _VIDEO_SESSIONS.pop(key, None)


async def _new_session(
    prompt: str,
    aspect_ratio: str,
    video_length: int,
    resolution_name: str,
    preset: str,
    image_url: Optional[str],
    parent_post_id: Optional[str],
    source_image_url: Optional[str],
    reasoning_effort: Optional[str],
) -> str:
    task_id = uuid.uuid4().hex
    now = time.time()
    async with _VIDEO_SESSIONS_LOCK:
        await _clean_sessions(now)
        _VIDEO_SESSIONS[task_id] = {
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "video_length": video_length,
            "resolution_name": resolution_name,
            "preset": preset,
            "image_url": image_url,
            "parent_post_id": parent_post_id,
            "source_image_url": source_image_url,
            "reasoning_effort": reasoning_effort,
            "created_at": now,
        }
    return task_id


async def _get_session(task_id: str) -> Optional[dict]:
    if not task_id:
        return None
    now = time.time()
    async with _VIDEO_SESSIONS_LOCK:
        await _clean_sessions(now)
        info = _VIDEO_SESSIONS.get(task_id)
        if not info:
            return None
        created_at = float(info.get("created_at") or 0)
        if now - created_at > VIDEO_SESSION_TTL:
            _VIDEO_SESSIONS.pop(task_id, None)
            return None
        return dict(info)


async def _drop_session(task_id: str) -> None:
    if not task_id:
        return
    async with _VIDEO_SESSIONS_LOCK:
        _VIDEO_SESSIONS.pop(task_id, None)


async def _drop_sessions(task_ids: List[str]) -> int:
    if not task_ids:
        return 0
    removed = 0
    async with _VIDEO_SESSIONS_LOCK:
        for task_id in task_ids:
            if task_id and task_id in _VIDEO_SESSIONS:
                _VIDEO_SESSIONS.pop(task_id, None)
                removed += 1
    return removed


def _normalize_ratio(value: Optional[str]) -> str:
    raw = (value or "").strip()
    return _VIDEO_RATIO_MAP.get(raw, "")


def _validate_image_url(image_url: str) -> None:
    value = (image_url or "").strip()
    if not value:
        return
    if value.startswith("data:"):
        return
    if value.startswith("http://") or value.startswith("https://"):
        return
    raise HTTPException(
        status_code=400,
        detail="image_url must be a URL or data URI (data:<mime>;base64,...)",
    )


def _validate_parent_post_id(parent_post_id: str) -> str:
    value = (parent_post_id or "").strip()
    if not value:
        return ""
    if not re.fullmatch(r"[0-9a-fA-F-]{32,36}", value):
        raise HTTPException(status_code=400, detail="parent_post_id format is invalid")
    return value


class VideoStartRequest(BaseModel):
    prompt: Optional[str] = ""
    aspect_ratio: Optional[str] = "3:2"
    video_length: Optional[int] = 6
    resolution_name: Optional[str] = "480p"
    preset: Optional[str] = "normal"
    concurrent: Optional[int] = Field(1, ge=1, le=4)
    image_url: Optional[str] = None
    parent_post_id: Optional[str] = None
    source_image_url: Optional[str] = None
    reasoning_effort: Optional[str] = None
    edit_context: Optional[Dict[str, Any]] = None


@router.post("/video/start", dependencies=[Depends(verify_public_key)])
async def public_video_start(data: VideoStartRequest):
    prompt = (data.prompt or "").strip()

    aspect_ratio = _normalize_ratio(data.aspect_ratio)
    if not aspect_ratio:
        raise HTTPException(
            status_code=400,
            detail="aspect_ratio must be one of ['16:9','9:16','3:2','2:3','1:1']",
        )

    video_length = int(data.video_length or 6)
    if video_length not in (6, 10, 15):
        raise HTTPException(
            status_code=400, detail="video_length must be 6, 10, or 15 seconds"
        )

    resolution_name = str(data.resolution_name or "480p")
    if resolution_name not in ("480p", "720p"):
        raise HTTPException(
            status_code=400,
            detail="resolution_name must be one of ['480p','720p']",
        )

    preset = str(data.preset or "normal")
    if preset not in ("fun", "normal", "spicy", "custom"):
        raise HTTPException(
            status_code=400,
            detail="preset must be one of ['fun','normal','spicy','custom']",
        )
    concurrent = int(data.concurrent or 1)
    if concurrent < 1 or concurrent > 4:
        raise HTTPException(status_code=400, detail="concurrent must be between 1 and 4")

    image_url = (data.image_url or "").strip() or None
    if image_url:
        _validate_image_url(image_url)
    parent_post_id = _validate_parent_post_id(data.parent_post_id or "")
    source_image_url = (data.source_image_url or "").strip() or None
    if parent_post_id:
        # parentPostId 链路强制使用 imagine-public，避免误用 assets.grok.com。
        source_image_url = _build_imagine_public_url(parent_post_id)
    elif source_image_url:
        _validate_image_url(source_image_url)

    if parent_post_id and image_url:
        raise HTTPException(
            status_code=400, detail="image_url and parent_post_id cannot be used together"
        )
    if not prompt and not image_url and not parent_post_id:
        raise HTTPException(
            status_code=400,
            detail="Prompt cannot be empty when no image_url/parent_post_id is provided",
        )

    reasoning_effort = (data.reasoning_effort or "").strip() or None
    if reasoning_effort:
        allowed = {"none", "minimal", "low", "medium", "high", "xhigh"}
        if reasoning_effort not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"reasoning_effort must be one of {sorted(allowed)}",
            )
    edit_context = data.edit_context or {}
    if not isinstance(edit_context, dict):
        raise HTTPException(status_code=400, detail="edit_context must be an object")
    # 限制 edit_context 仅用于审计字段，避免日志/请求体膨胀。
    if len(orjson.dumps(edit_context)) > 8192:
        raise HTTPException(status_code=400, detail="edit_context too large")
    if edit_context:
        logger.info(
            "Public video edit context: "
            f"source_video_url={str(edit_context.get('source_video_url') or '')[:120]}, "
            f"splice_at_ms={edit_context.get('splice_at_ms')}, "
            f"frame_index={edit_context.get('frame_index')}, "
            f"round={edit_context.get('round')}"
        )

    task_ids: List[str] = []
    for _ in range(concurrent):
        task_id = await _new_session(
            prompt,
            aspect_ratio,
            video_length,
            resolution_name,
            preset,
            image_url,
            parent_post_id,
            source_image_url,
            reasoning_effort,
        )
        task_ids.append(task_id)

    return {
        "task_id": task_ids[0],
        "task_ids": task_ids,
        "concurrent": concurrent,
        "aspect_ratio": aspect_ratio,
        "parent_post_id": parent_post_id,
    }


@router.get("/video/sse")
async def public_video_sse(request: Request, task_id: str = Query("")):
    session = await _get_session(task_id)
    if not session:
        raise HTTPException(status_code=404, detail="Task not found")

    prompt = str(session.get("prompt") or "").strip()
    aspect_ratio = str(session.get("aspect_ratio") or "3:2")
    video_length = int(session.get("video_length") or 6)
    resolution_name = str(session.get("resolution_name") or "480p")
    preset = str(session.get("preset") or "normal")
    image_url = session.get("image_url")
    parent_post_id = str(session.get("parent_post_id") or "").strip()
    source_image_url = str(session.get("source_image_url") or "").strip() or None
    if parent_post_id:
        source_image_url = _build_imagine_public_url(parent_post_id)
    reasoning_effort = session.get("reasoning_effort")

    async def event_stream():
        try:
            preferred_token = None
            if parent_post_id:
                try:
                    preferred_token = await imagine_public_api._get_bound_image_token(
                        parent_post_id
                    )
                except Exception:
                    preferred_token = None
                if preferred_token:
                    logger.info(
                        "Public video token bound hit: "
                        f"parent_post_id={parent_post_id}, token={_mask_token(preferred_token)}"
                    )
                else:
                    logger.info(
                        "Public video token bound miss: "
                        f"parent_post_id={parent_post_id}"
                    )

            model_id = "grok-imagine-1.0-video"
            model_info = ModelService.get(model_id)
            if not model_info or not model_info.is_video:
                payload = {
                    "error": "Video model is not available.",
                    "code": "model_not_supported",
                }
                yield f"data: {orjson.dumps(payload).decode()}\n\n"
                yield "data: [DONE]\n\n"
                return

            if image_url:
                messages: List[Dict[str, Any]] = [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": image_url}},
                        ],
                    }
                ]
            else:
                messages = [{"role": "user", "content": prompt}]

            stream = await VideoService.completions(
                model_id,
                messages,
                stream=True,
                reasoning_effort=reasoning_effort,
                aspect_ratio=aspect_ratio,
                video_length=video_length,
                resolution=resolution_name,
                preset=preset,
                parent_post_id=parent_post_id or None,
                source_image_url=source_image_url,
                preferred_token=preferred_token,
            )

            async for chunk in stream:
                if await request.is_disconnected():
                    break
                yield chunk
        except Exception as e:
            logger.warning(f"Public video SSE error: {e}")
            payload = {"error": str(e), "code": "internal_error"}
            yield f"data: {orjson.dumps(payload).decode()}\n\n"
            yield "data: [DONE]\n\n"
        finally:
            await _drop_session(task_id)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


class VideoStopRequest(BaseModel):
    task_ids: List[str]


@router.post("/video/stop", dependencies=[Depends(verify_public_key)])
async def public_video_stop(data: VideoStopRequest):
    removed = await _drop_sessions(data.task_ids or [])
    return {"status": "success", "removed": removed}


@router.get("/video/vendor/{filename}")
async def public_video_vendor(filename: str):
    filename = str(filename or "").strip()
    if filename not in _FFMPEG_VENDOR_SOURCES:
        raise HTTPException(status_code=404, detail="vendor asset not found")

    async with _VENDOR_LOCK:
        cached = _VENDOR_CACHE.get(filename)
    if cached:
        return Response(
            content=cached,
            media_type=_VENDOR_CONTENT_TYPE.get(filename, "application/octet-stream"),
            headers={"Cache-Control": "public, max-age=86400"},
        )

    timeout = httpx.Timeout(connect=8.0, read=60.0, write=30.0, pool=8.0)
    last_error = None
    async with httpx.AsyncClient(timeout=timeout) as client:
        for url in _FFMPEG_VENDOR_SOURCES[filename]:
            try:
                resp = await client.get(url, follow_redirects=True)
                if resp.status_code == 200 and resp.content:
                    content = bytes(resp.content)
                    async with _VENDOR_LOCK:
                        _VENDOR_CACHE[filename] = content
                    logger.info(
                        f"Video vendor proxy loaded: {filename} <- {url} ({len(content)} bytes)"
                    )
                    return Response(
                        content=content,
                        media_type=_VENDOR_CONTENT_TYPE.get(
                            filename, "application/octet-stream"
                        ),
                        headers={"Cache-Control": "public, max-age=86400"},
                    )
                last_error = f"status={resp.status_code}"
            except Exception as e:
                last_error = str(e)

    if filename == "ffmpeg-core.worker.js":
        raise HTTPException(
            status_code=404,
            detail="optional worker asset not found",
        )
    raise HTTPException(
        status_code=502,
        detail=f"vendor fetch failed: {filename}, error={last_error or 'unknown'}",
    )


@router.get("/video/cache/list", dependencies=[Depends(verify_public_key)])
async def public_video_cache_list(page: int = 1, page_size: int = 100):
    page = max(1, int(page or 1))
    page_size = max(1, min(200, int(page_size or 100)))
    cache_service = CacheService()
    result = cache_service.list_files("video", page=page, page_size=page_size)
    return {"status": "success", **result}


__all__ = ["router"]
