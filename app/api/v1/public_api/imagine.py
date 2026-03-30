import asyncio
import base64
import binascii
import contextlib
import io
import re
import time
import uuid
from typing import Optional, List, Dict, Any
from urllib.parse import urlparse

import orjson
from curl_cffi.requests import AsyncSession
from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.auth import verify_public_key, get_public_api_key, is_public_enabled
from app.core.config import get_config
from app.core.exceptions import AppException
from app.core.logger import logger
from app.api.v1.image import resolve_aspect_ratio
from app.services.grok.services.image import ImageGenerationService
from app.services.grok.services.image_edit import ImageEditService
from app.services.grok.services.model import ModelService
from app.services.reverse.media_post import MediaPostReverse
from app.services.token.manager import get_token_manager

router = APIRouter()

IMAGINE_SESSION_TTL = 600
_IMAGINE_SESSIONS: dict[str, dict] = {}
_IMAGINE_SESSIONS_LOCK = asyncio.Lock()
_RATIO_ALLOWED = {"16:9", "9:16", "3:2", "2:3", "1:1"}


def _validate_parent_post_id(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="parent_post_id cannot be empty")
    if not re.fullmatch(r"[0-9a-fA-F-]{32,36}", raw):
        raise HTTPException(status_code=400, detail="parent_post_id format is invalid")
    return raw


def _build_imagine_public_url(parent_post_id: str) -> str:
    return f"https://imagine-public.x.ai/imagine-public/images/{parent_post_id}.jpg"


async def _pick_imagine_parent_token(token_mgr, model_id: str, parent_post_id: str) -> str | None:
    """图片 parentPostId 编辑统一使用当前请求可用 token。"""
    for pool_name in ModelService.pool_candidates_for_model(model_id):
        token = token_mgr.get_token(pool_name)
        if token:
            logger.info(
                "Imagine edit selected pool token: "
                f"parent_post_id={parent_post_id}, pool={pool_name}, token={_mask_token(token)}"
            )
            return token
    return None


def _is_local_proxy_image_url(url: str) -> bool:
    raw = str(url or "").strip().lower()
    return (
        "/v1/files/image/" in raw
        or raw.startswith("http://127.0.0.1:")
        or raw.startswith("http://localhost:")
        or raw.startswith("https://127.0.0.1:")
        or raw.startswith("https://localhost:")
    )


async def _fetch_media_post_info(token: str, parent_post_id: str) -> dict[str, Any]:
    post_id = _extract_parent_post_id_from_url(parent_post_id)
    if not post_id or not token:
        return {}
    try:
        async with AsyncSession() as session:
            response = await MediaPostReverse.get(session, token, post_id)
            data = response.json() if hasattr(response, "json") else {}
        return data.get("post", {}) if isinstance(data, dict) else {}
    except Exception as e:
        logger.warning(
            "Imagine edit media_post/get failed: "
            f"parent_post_id={post_id}, error={e}"
        )
        return {}


async def _canonicalize_parent_source_image_url(
    token: str,
    parent_post_id: str,
    source_image_url: str = "",
) -> str:
    raw = str(source_image_url or "").strip()
    if raw and "imagine-public.x.ai/imagine-public/share-images/" in raw:
        return raw
    if raw.startswith("http://") or raw.startswith("https://"):
        if not _is_local_proxy_image_url(raw):
            return raw
    elif raw and not raw.startswith("/users/") and not raw.startswith("users/"):
        return raw
    post = await _fetch_media_post_info(token, parent_post_id)
    media_url = str(post.get("mediaUrl") or "").strip()
    if media_url:
        return media_url
    thumb_url = str(post.get("thumbnailImageUrl") or "").strip()
    if thumb_url:
        return thumb_url
    return raw or _build_imagine_public_url(parent_post_id)


def _extract_parent_post_id_from_url(url: str) -> str:
    text = str(url or "").strip()
    if not text:
        return ""
    if re.fullmatch(r"[0-9a-fA-F-]{32,36}", text):
        return text

    # 优先匹配真正的图片产物 ID，避免误取 /users/<user_id>。
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


def _to_assets_url(path: str) -> str:
    raw = str(path or "").strip()
    if not raw:
        return ""
    if not raw.startswith("/"):
        raw = f"/{raw}"
    return f"https://assets.grok.com{raw}"


def _resolve_source_image_url(
    image_url: str,
    parent_post_id: str = "",
    fallback_source_image_url: str = "",
) -> str:
    raw = str(image_url or "").strip() or str(fallback_source_image_url or "").strip()
    if raw:
        if raw.startswith("http://") or raw.startswith("https://"):
            parsed = urlparse(raw)
            host = (parsed.netloc or "").lower()
            path = parsed.path or ""
            if "assets.grok.com" in host and path:
                return _to_assets_url(path)
            if "imagine-public.x.ai" in host:
                return raw
            marker = "/v1/files/image/"
            if marker in path:
                suffix = path.split(marker, 1)[1]
                return _to_assets_url(suffix)
            if path.startswith("/users/"):
                return _to_assets_url(path)
            return raw
        if raw.startswith("/v1/files/image/"):
            suffix = raw.split("/v1/files/image/", 1)[1]
            return _to_assets_url(suffix)
        if raw.startswith("/users/") or raw.startswith("users/"):
            return _to_assets_url(raw)
        if raw.startswith("/imagine-public/images/"):
            return f"https://imagine-public.x.ai{raw}"

    parsed_parent = _extract_parent_post_id_from_url(parent_post_id)
    if parsed_parent:
        return _build_imagine_public_url(parsed_parent)
    return ""


def _mask_token(token: str) -> str:
    raw = str(token or "").replace("sso=", "")
    if len(raw) <= 12:
        return raw or "-"
    return f"{raw[:6]}...{raw[-6:]}"


def _extract_parent_post_id_from_payload(payload: Dict[str, Any]) -> str:
    if not isinstance(payload, dict):
        return ""
    candidates = [
        payload.get("parent_post_id"),
        payload.get("parentPostId"),
        payload.get("image_id"),
        payload.get("imageId"),
        payload.get("url"),
        payload.get("image"),
    ]
    for value in candidates:
        parent_post_id = _extract_parent_post_id_from_url(str(value or ""))
        if parent_post_id:
            return parent_post_id
    return ""


def _decode_image_b64(compact_b64: str) -> bytes:
    """解码 base64 图片数据。"""
    try:
        return base64.b64decode(compact_b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="image_base64 format is invalid")


def _detect_image_mime(raw: bytes) -> str:
    """根据字节头判断真实图片 MIME。"""
    if raw.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if raw.startswith(b"RIFF") and len(raw) >= 12 and raw[8:12] == b"WEBP":
        return "image/webp"
    if raw.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    # 无法识别时维持 png 兼容行为
    return "image/png"


def _encode_jpeg_base64(raw: bytes) -> str:
    """将任意图片字节转为 JPEG base64。"""
    try:
        from PIL import Image, ImageOps
        with Image.open(io.BytesIO(raw)) as img:
            # 统一旋转方向（EXIF）并转 RGB，确保 JPEG 可保存
            img = ImageOps.exif_transpose(img)
            if img.mode in ("RGBA", "LA"):
                bg = Image.new("RGB", img.size, (255, 255, 255))
                alpha = img.split()[-1]
                bg.paste(img.convert("RGBA"), mask=alpha)
                out_img = bg
            elif img.mode == "P":
                out_img = img.convert("RGB")
            else:
                out_img = img.convert("RGB")

            out = io.BytesIO()
            out_img.save(out, format="JPEG", quality=92, optimize=True)
            return base64.b64encode(out.getvalue()).decode()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"image decode failed: {e}")


def _normalize_image_input(image_base64: str, image_url: str) -> str:
    raw_b64 = str(image_base64 or "").strip()
    raw_url = str(image_url or "").strip()
    if raw_b64:
        declared_mime = ""
        compact = raw_b64
        if raw_b64.startswith("data:"):
            try:
                header, payload = raw_b64.split(",", 1)
            except ValueError:
                raise HTTPException(status_code=400, detail="image_base64 format is invalid")
            compact = payload
            mime_part = header[5:].split(";", 1)[0].strip().lower()
            declared_mime = mime_part

        compact = re.sub(r"\s+", "", compact)
        if not compact:
            raise HTTPException(status_code=400, detail="image_base64 is empty")
        if not re.fullmatch(r"[A-Za-z0-9+/=_-]+", compact):
            raise HTTPException(status_code=400, detail="image_base64 format is invalid")

        raw = _decode_image_b64(compact)
        real_mime = _detect_image_mime(raw)
        if declared_mime and declared_mime != real_mime:
            logger.warning(
                "Imagine workbench image MIME mismatch corrected: "
                f"declared={declared_mime}, detected={real_mime}"
            )

        # 按需求：非 jpeg 一律转为 jpeg 再上传，规避上游对特定格式/元数据的 400。
        if real_mime != "image/jpeg":
            compact = _encode_jpeg_base64(raw)
            logger.info(
                "Imagine workbench image normalized to JPEG before upload: "
                f"source_mime={real_mime}, jpeg_b64_len={len(compact)}"
            )
            return f"data:image/jpeg;base64,{compact}"

        return f"data:image/jpeg;base64,{compact}"
    if raw_url:
        if raw_url.startswith("http://") or raw_url.startswith("https://"):
            return raw_url
        raise HTTPException(status_code=400, detail="image_url must be http(s) URL")
    raise HTTPException(
        status_code=400,
        detail="image_base64 or image_url is required for first edit",
    )


def _normalize_image_references(image_references: Optional[List[str]]) -> List[str]:
    refs = image_references or []
    if not isinstance(refs, list):
        raise HTTPException(status_code=400, detail="image_references must be a list")

    cleaned: List[str] = []
    for raw in refs:
        item = str(raw or "").strip()
        if not item:
            continue
        cleaned.append(item)

    if len(cleaned) > 5:
        raise HTTPException(status_code=400, detail="image_references supports at most 5 images")

    normalized: List[str] = []
    for item in cleaned:
        if item.startswith("data:"):
            normalized.append(_normalize_image_input(image_base64=item, image_url=""))
        else:
            normalized.append(_normalize_image_input(image_base64="", image_url=item))

    return normalized


def _normalize_reference_items(reference_items: Optional[List[Dict[str, Any]]]) -> List[Dict[str, str]]:
    items = reference_items or []
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="reference_items must be a list")
    cleaned: List[Dict[str, str]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        image_url = str(item.get("image_url") or item.get("data") or "").strip()
        source_image_url = str(item.get("source_image_url") or "").strip()
        parent_post_id = str(item.get("parent_post_id") or "").strip()
        mention_alias = str(item.get("mention_alias") or "").strip()
        if not image_url and not source_image_url and not parent_post_id:
            continue
        cleaned.append(
            {
                "image_url": image_url,
                "source_image_url": source_image_url,
                "parent_post_id": parent_post_id,
                "mention_alias": mention_alias,
            }
        )
    if len(cleaned) > 5:
        raise HTTPException(status_code=400, detail="reference_items supports at most 5 images")
    return cleaned


async def _clean_sessions(now: float) -> None:
    expired = [
        key
        for key, info in _IMAGINE_SESSIONS.items()
        if now - float(info.get("created_at") or 0) > IMAGINE_SESSION_TTL
    ]
    for key in expired:
        _IMAGINE_SESSIONS.pop(key, None)


def _normalize_imagine_ratio(value: Optional[str]) -> str:
    """统一解析 imagine 比例参数，兼容 ratio 与 size 两种写法。"""
    raw = str(value or "").strip()
    if not raw:
        return "2:3"
    if raw in _RATIO_ALLOWED:
        return raw
    mapped = resolve_aspect_ratio(raw)
    return mapped if mapped in _RATIO_ALLOWED else "2:3"


def _parse_sse_chunk(chunk: str) -> Optional[Dict[str, Any]]:
    if not chunk:
        return None
    event = None
    data_lines: List[str] = []
    for raw in str(chunk).splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("event:"):
            event = line[6:].strip()
            continue
        if line.startswith("data:"):
            data_lines.append(line[5:].strip())
    if not data_lines:
        return None
    data_str = "\n".join(data_lines)
    if data_str == "[DONE]":
        return None
    try:
        payload = orjson.loads(data_str)
    except orjson.JSONDecodeError:
        return None
    if event and isinstance(payload, dict) and "type" not in payload:
        payload["type"] = event
    return payload


async def _new_session(prompt: str, aspect_ratio: str, nsfw: Optional[bool]) -> str:
    task_id = uuid.uuid4().hex
    now = time.time()
    async with _IMAGINE_SESSIONS_LOCK:
        await _clean_sessions(now)
        _IMAGINE_SESSIONS[task_id] = {
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "nsfw": nsfw,
            "created_at": now,
        }
    return task_id


async def _get_session(task_id: str) -> Optional[dict]:
    if not task_id:
        return None
    now = time.time()
    async with _IMAGINE_SESSIONS_LOCK:
        await _clean_sessions(now)
        info = _IMAGINE_SESSIONS.get(task_id)
        if not info:
            return None
        created_at = float(info.get("created_at") or 0)
        if now - created_at > IMAGINE_SESSION_TTL:
            _IMAGINE_SESSIONS.pop(task_id, None)
            return None
        return dict(info)


async def _drop_session(task_id: str) -> None:
    if not task_id:
        return
    async with _IMAGINE_SESSIONS_LOCK:
        _IMAGINE_SESSIONS.pop(task_id, None)


async def _drop_sessions(task_ids: List[str]) -> int:
    if not task_ids:
        return 0
    removed = 0
    async with _IMAGINE_SESSIONS_LOCK:
        for task_id in task_ids:
            if task_id and task_id in _IMAGINE_SESSIONS:
                _IMAGINE_SESSIONS.pop(task_id, None)
                removed += 1
    return removed


@router.websocket("/imagine/ws")
async def public_imagine_ws(websocket: WebSocket):
    session_id = None
    task_id = websocket.query_params.get("task_id")
    if task_id:
        info = await _get_session(task_id)
        if info:
            session_id = task_id

    ok = True
    if session_id is None:
        public_key = get_public_api_key()
        public_enabled = is_public_enabled()
        if not public_key:
            ok = public_enabled
        else:
            key = websocket.query_params.get("public_key")
            ok = key == public_key

    if not ok:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    stop_event = asyncio.Event()
    run_task: Optional[asyncio.Task] = None

    async def _send(payload: dict) -> bool:
        try:
            await websocket.send_text(orjson.dumps(payload).decode())
            return True
        except Exception:
            return False

    async def _stop_run():
        nonlocal run_task
        stop_event.set()
        if run_task and not run_task.done():
            run_task.cancel()
            try:
                await run_task
            except Exception:
                pass
        run_task = None
        stop_event.clear()

    async def _run(prompt: str, aspect_ratio: str, nsfw: Optional[bool]):
        model_id = "grok-imagine-1.0"
        model_info = ModelService.get(model_id)
        if not model_info or not model_info.is_image:
            await _send(
                {
                    "type": "error",
                    "message": "Image model is not available.",
                    "code": "model_not_supported",
                }
            )
            return

        token_mgr = await get_token_manager()
        run_id = uuid.uuid4().hex

        await _send(
            {
                "type": "status",
                "status": "running",
                "prompt": prompt,
                "aspect_ratio": aspect_ratio,
                "run_id": run_id,
            }
        )

        while not stop_event.is_set():
            try:
                await token_mgr.reload_if_stale()
                token = None
                for pool_name in ModelService.pool_candidates_for_model(
                    model_info.model_id
                ):
                    token = token_mgr.get_token(pool_name)
                    if token:
                        break

                if not token:
                    await _send(
                        {
                            "type": "error",
                            "message": "No available tokens. Please try again later.",
                            "code": "rate_limit_exceeded",
                        }
                    )
                    await asyncio.sleep(2)
                    continue

                result = await ImageGenerationService().generate(
                    token_mgr=token_mgr,
                    token=token,
                    model_info=model_info,
                    prompt=prompt,
                    n=6,
                    response_format="b64_json",
                    size="1024x1024",
                    aspect_ratio=aspect_ratio,
                    stream=False,
                    enable_nsfw=nsfw,
                )
                if result.stream:
                    async for chunk in result.data:
                        payload = _parse_sse_chunk(chunk)
                        if not payload:
                            continue
                        if isinstance(payload, dict):
                            payload.setdefault("run_id", run_id)
                        await _send(payload)
                else:
                    images = [img for img in result.data if img and img != "error"]
                    if images:
                        for img_b64 in images:
                            await _send(
                                {
                                    "type": "image",
                                    "b64_json": img_b64,
                                    "created_at": int(time.time() * 1000),
                                    "aspect_ratio": aspect_ratio,
                                    "run_id": run_id,
                                }
                            )
                    else:
                        await _send(
                            {
                                "type": "error",
                                "message": "Image generation returned empty data.",
                                "code": "empty_image",
                            }
                        )

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"Imagine stream error: {e}")
                await _send(
                    {
                        "type": "error",
                        "message": str(e),
                        "code": "internal_error",
                    }
                )
                await asyncio.sleep(1.5)

        await _send({"type": "status", "status": "stopped", "run_id": run_id})

    try:
        while True:
            try:
                raw = await websocket.receive_text()
            except (RuntimeError, WebSocketDisconnect):
                break

            try:
                payload = orjson.loads(raw)
            except Exception:
                await _send(
                    {
                        "type": "error",
                        "message": "Invalid message format.",
                        "code": "invalid_payload",
                    }
                )
                continue

            action = payload.get("type")
            if action == "start":
                prompt = str(payload.get("prompt") or "").strip()
                if not prompt:
                    await _send(
                        {
                            "type": "error",
                            "message": "Prompt cannot be empty.",
                            "code": "invalid_prompt",
                        }
                    )
                    continue
                aspect_ratio = _normalize_imagine_ratio(payload.get("aspect_ratio"))
                nsfw = payload.get("nsfw")
                if nsfw is not None:
                    nsfw = bool(nsfw)
                await _stop_run()
                run_task = asyncio.create_task(_run(prompt, aspect_ratio, nsfw))
            elif action == "stop":
                await _stop_run()
            else:
                await _send(
                    {
                        "type": "error",
                        "message": "Unknown action.",
                        "code": "invalid_action",
                    }
                )

    except WebSocketDisconnect:
        logger.debug("WebSocket disconnected by client")
    except Exception as e:
        logger.warning(f"WebSocket error: {e}")
    finally:
        await _stop_run()

        try:
            from starlette.websockets import WebSocketState
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.close(code=1000, reason="Server closing connection")
        except Exception as e:
            logger.debug(f"WebSocket close ignored: {e}")
        if session_id:
            await _drop_session(session_id)


@router.get("/imagine/sse")
async def public_imagine_sse(
    request: Request,
    task_id: str = Query(""),
    prompt: str = Query(""),
    aspect_ratio: str = Query("2:3"),
):
    """Imagine 图片瀑布流（SSE 兜底）"""
    session = None
    if task_id:
        session = await _get_session(task_id)
        if not session:
            raise HTTPException(status_code=404, detail="Task not found")
    else:
        public_key = get_public_api_key()
        public_enabled = is_public_enabled()
        if not public_key:
            if not public_enabled:
                raise HTTPException(status_code=401, detail="Public access is disabled")
        else:
            key = request.query_params.get("public_key")
            if key != public_key:
                raise HTTPException(status_code=401, detail="Invalid authentication token")

    if session:
        prompt = str(session.get("prompt") or "").strip()
        ratio = _normalize_imagine_ratio(session.get("aspect_ratio"))
        nsfw = session.get("nsfw")
    else:
        prompt = (prompt or "").strip()
        if not prompt:
            raise HTTPException(status_code=400, detail="Prompt cannot be empty")
        ratio = _normalize_imagine_ratio(aspect_ratio)
        nsfw = request.query_params.get("nsfw")
        if nsfw is not None:
            nsfw = str(nsfw).lower() in ("1", "true", "yes", "on")

    async def event_stream():
        try:
            model_id = "grok-imagine-1.0"
            model_info = ModelService.get(model_id)
            if not model_info or not model_info.is_image:
                yield (
                    f"data: {orjson.dumps({'type': 'error', 'message': 'Image model is not available.', 'code': 'model_not_supported'}).decode()}\n\n"
                )
                return

            token_mgr = await get_token_manager()
            sequence = 0
            run_id = uuid.uuid4().hex

            yield (
                f"data: {orjson.dumps({'type': 'status', 'status': 'running', 'prompt': prompt, 'aspect_ratio': ratio, 'run_id': run_id}).decode()}\n\n"
            )

            while True:
                if await request.is_disconnected():
                    logger.info(
                        "Imagine SSE interrupted by client disconnect: "
                        f"task_id={task_id or '-'}, run_id={run_id}"
                    )
                    break
                if task_id:
                    session_alive = await _get_session(task_id)
                    if not session_alive:
                        break

                try:
                    await token_mgr.reload_if_stale()
                    token = None
                    for pool_name in ModelService.pool_candidates_for_model(
                        model_info.model_id
                    ):
                        token = token_mgr.get_token(pool_name)
                        if token:
                            break

                    if not token:
                        yield (
                            f"data: {orjson.dumps({'type': 'error', 'message': 'No available tokens. Please try again later.', 'code': 'rate_limit_exceeded'}).decode()}\n\n"
                        )
                        await asyncio.sleep(2)
                        continue

                    result = await ImageGenerationService().generate(
                        token_mgr=token_mgr,
                        token=token,
                        model_info=model_info,
                        prompt=prompt,
                        n=6,
                        response_format="b64_json",
                        size="1024x1024",
                        aspect_ratio=ratio,
                        stream=False,
                        enable_nsfw=nsfw,
                    )
                    if result.stream:
                        async for chunk in result.data:
                            payload = _parse_sse_chunk(chunk)
                            if not payload:
                                continue
                            if isinstance(payload, dict):
                                payload.setdefault("run_id", run_id)
                            yield f"data: {orjson.dumps(payload).decode()}\n\n"
                    else:
                        images = [img for img in result.data if img and img != "error"]
                        if images:
                            for img_b64 in images:
                                sequence += 1
                                payload = {
                                    "type": "image",
                                    "b64_json": img_b64,
                                    "sequence": sequence,
                                    "created_at": int(time.time() * 1000),
                                    "aspect_ratio": ratio,
                                    "run_id": run_id,
                                }
                                yield f"data: {orjson.dumps(payload).decode()}\n\n"
                        else:
                            yield (
                                f"data: {orjson.dumps({'type': 'error', 'message': 'Image generation returned empty data.', 'code': 'empty_image'}).decode()}\n\n"
                            )
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.warning(f"Imagine SSE error: {e}")
                    yield (
                        f"data: {orjson.dumps({'type': 'error', 'message': str(e), 'code': 'internal_error'}).decode()}\n\n"
                    )
                    await asyncio.sleep(1.5)

            yield (
                f"data: {orjson.dumps({'type': 'status', 'status': 'stopped', 'run_id': run_id}).decode()}\n\n"
            )
        finally:
            if task_id:
                await _drop_session(task_id)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.get("/imagine/config")
async def public_imagine_config():
    return {
        "final_min_bytes": int(get_config("image.final_min_bytes") or 0),
        "medium_min_bytes": int(get_config("image.medium_min_bytes") or 0),
        "nsfw": bool(get_config("image.nsfw")),
    }


class ImagineStartRequest(BaseModel):
    prompt: str
    aspect_ratio: Optional[str] = "2:3"
    nsfw: Optional[bool] = None


@router.post("/imagine/start", dependencies=[Depends(verify_public_key)])
async def public_imagine_start(data: ImagineStartRequest):
    prompt = (data.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")
    ratio = _normalize_imagine_ratio(data.aspect_ratio)
    task_id = await _new_session(prompt, ratio, data.nsfw)
    return {"task_id": task_id, "aspect_ratio": ratio}


class ImagineEditRequest(BaseModel):
    prompt: str
    parent_post_id: str
    source_image_url: Optional[str] = None
    stream: Optional[bool] = False


@router.get("/imagine/parent-post", dependencies=[Depends(verify_public_key)])
async def public_imagine_parent_post(parent_post_id: str = Query(..., description="图片 parentPostId")):
    resolved_parent_post_id = _validate_parent_post_id(parent_post_id)
    model_id = "grok-imagine-1.0-edit"
    token_mgr = await get_token_manager()
    await token_mgr.reload_if_stale()
    token = await _pick_imagine_parent_token(token_mgr, model_id, resolved_parent_post_id)
    if not token:
        raise HTTPException(
            status_code=429,
            detail="No available tokens. Please try again later.",
        )
    post = await _fetch_media_post_info(token, resolved_parent_post_id)
    media_url = str(post.get("mediaUrl") or "").strip()
    thumbnail_url = str(post.get("thumbnailImageUrl") or "").strip()
    source_image_url = await _canonicalize_parent_source_image_url(
        token,
        resolved_parent_post_id,
        media_url or thumbnail_url,
    )
    return {
        "parent_post_id": resolved_parent_post_id,
        "media_url": media_url,
        "thumbnail_image_url": thumbnail_url,
        "source_image_url": source_image_url,
        "mime_type": str(post.get("mimeType") or "").strip(),
        "original_post_id": str(post.get("originalPostId") or "").strip(),
        "original_ref_type": str(post.get("originalRefType") or "").strip(),
    }


@router.post("/imagine/edit", dependencies=[Depends(verify_public_key)])
async def public_imagine_edit(data: ImagineEditRequest, request: Request):
    prompt = (data.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    parent_post_id = _validate_parent_post_id(data.parent_post_id)
    source_image_url = (data.source_image_url or "").strip()
    if source_image_url and not (
        source_image_url.startswith("http://") or source_image_url.startswith("https://")
    ):
        raise HTTPException(status_code=400, detail="source_image_url must be http(s) URL")
    if not source_image_url:
        source_image_url = _build_imagine_public_url(parent_post_id)

    model_id = "grok-imagine-1.0-edit"
    model_info = ModelService.get(model_id)
    if not model_info or not model_info.is_image_edit:
        raise HTTPException(status_code=503, detail="Image edit model is not available")

    token_mgr = await get_token_manager()
    await token_mgr.reload_if_stale()
    token = await _pick_imagine_parent_token(token_mgr, model_id, parent_post_id)
    if not token:
        raise HTTPException(
            status_code=429,
            detail="No available tokens. Please try again later.",
        )
    source_image_url = await _canonicalize_parent_source_image_url(
        token, parent_post_id, source_image_url
    )

    async def _run_once(
        progress_cb=None,
    ):
        started_at = time.time()
        result = await ImageEditService().edit_with_parent_post(
            token_mgr=token_mgr,
            token=token,
            model_info=model_info,
            prompt=prompt,
            parent_post_id=parent_post_id,
            source_image_url=source_image_url,
            response_format="url",
            stream=False,
            progress_cb=progress_cb,
        )
        images = result.data if isinstance(result.data, list) else []
        if not images:
            raise HTTPException(status_code=502, detail="Image edit returned no results")

        image_url = str(images[0])
        token_used = str(getattr(result, "token_used", "") or token)
        generated_parent_post_id = _extract_parent_post_id_from_url(image_url)
        current_parent_post_id = generated_parent_post_id or parent_post_id
        current_source_image_url = await _canonicalize_parent_source_image_url(
            token_used,
            current_parent_post_id,
            image_url,
        )
        elapsed_ms = int((time.time() - started_at) * 1000)
        return {
            "created": int(time.time()),
            "data": [{"url": image_url}],
            "parent_post_id": parent_post_id,
            "generated_parent_post_id": generated_parent_post_id,
            "current_parent_post_id": current_parent_post_id,
            "current_source_image_url": current_source_image_url,
            "elapsed_ms": elapsed_ms,
        }

    if data.stream:
        async def event_stream():
            queue: asyncio.Queue[dict] = asyncio.Queue()
            disconnect_event = asyncio.Event()
            client_disconnected = False

            async def progress_cb(event: str, payload: dict):
                item = {"event": event}
                if isinstance(payload, dict):
                    item.update(payload)
                await queue.put({"type": "progress", "payload": item})

            async def watch_disconnect():
                nonlocal client_disconnected
                while True:
                    if await request.is_disconnected():
                        client_disconnected = True
                        logger.info(
                            "Imagine edit stream interrupted by client disconnect: "
                            f"parent_post_id={parent_post_id}"
                        )
                        disconnect_event.set()
                        break
                    await asyncio.sleep(0.2)

            async def runner():
                try:
                    await queue.put(
                        {
                            "type": "progress",
                            "payload": {
                                "event": "request_accepted",
                                "progress": 4,
                                "message": "已接收编辑请求",
                            },
                        }
                    )
                    body = await _run_once(progress_cb=progress_cb)
                    await queue.put(
                        {
                            "type": "progress",
                            "payload": {
                                "event": "completed",
                                "progress": 100,
                                "message": "编辑完成 100%",
                            },
                        }
                    )
                    await queue.put({"type": "result", "payload": body})
                except asyncio.CancelledError:
                    logger.info(
                        "Imagine edit stream runner cancelled: "
                        f"parent_post_id={parent_post_id}"
                    )
                    raise
                except Exception as e:
                    message = str(e)
                    if not message:
                        message = "编辑失败，请稍后重试"
                    await queue.put(
                        {
                            "type": "error",
                            "payload": {
                                "message": message,
                            },
                        }
                    )
                finally:
                    await queue.put({"type": "done", "payload": {}})

            task = asyncio.create_task(runner())
            watch_task = asyncio.create_task(watch_disconnect())
            try:
                while True:
                    if disconnect_event.is_set():
                        break
                    try:
                        item = await asyncio.wait_for(queue.get(), timeout=0.2)
                    except asyncio.TimeoutError:
                        continue
                    item_type = item.get("type")
                    if item_type == "done":
                        break
                    payload = item.get("payload", {})
                    yield (
                        f"event: {item_type}\n"
                        f"data: {orjson.dumps(payload).decode()}\n\n"
                    )
            finally:
                disconnect_event.set()
                if not task.done():
                    if client_disconnected:
                        logger.info(
                            "Imagine edit stream cancel unfinished runner task: "
                            f"parent_post_id={parent_post_id}"
                        )
                    task.cancel()
                    with contextlib.suppress(Exception):
                        await task
                if not watch_task.done():
                    watch_task.cancel()
                    with contextlib.suppress(Exception):
                        await watch_task

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
        )

    try:
        return await _run_once(progress_cb=None)
    except AppException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception:
        raise HTTPException(status_code=500, detail="编辑失败，请稍后重试")


class ImagineStopRequest(BaseModel):
    task_ids: List[str]


@router.post("/imagine/stop", dependencies=[Depends(verify_public_key)])
async def public_imagine_stop(data: ImagineStopRequest):
    removed = await _drop_sessions(data.task_ids or [])
    return {"status": "success", "removed": removed}


class ImagineWorkbenchEditRequest(BaseModel):
    prompt: str
    parent_post_id: Optional[str] = ""
    source_image_url: Optional[str] = None
    image_base64: Optional[str] = None
    image_url: Optional[str] = None
    image_references: Optional[List[str]] = None
    reference_items: Optional[List[Dict[str, Any]]] = None
    stream: Optional[bool] = False


@router.post("/imagine/workbench/edit", dependencies=[Depends(verify_public_key)])
async def public_imagine_workbench_edit(data: ImagineWorkbenchEditRequest, request: Request):
    prompt = (data.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    model_id = "grok-imagine-1.0-edit"
    model_info = ModelService.get(model_id)
    if not model_info or not model_info.is_image_edit:
        raise HTTPException(status_code=503, detail="Image edit model is not available")

    token_mgr = await get_token_manager()
    await token_mgr.reload_if_stale()

    parent_post_id_raw = str(data.parent_post_id or "").strip()
    use_parent_mode = bool(parent_post_id_raw)
    parent_post_id = _validate_parent_post_id(parent_post_id_raw) if use_parent_mode else ""

    token = None
    if use_parent_mode:
        token = await _pick_imagine_parent_token(token_mgr, model_id, parent_post_id)

    if not token:
        for pool_name in ModelService.pool_candidates_for_model(model_id):
            token = token_mgr.get_token(pool_name)
            if token:
                break
    if not token:
        raise HTTPException(
            status_code=429,
            detail="No available tokens. Please try again later.",
        )
    reference_items = _normalize_reference_items(data.reference_items)

    if use_parent_mode:
        source_image_url = await _canonicalize_parent_source_image_url(
            token, parent_post_id, str(data.source_image_url or "").strip()
        )
    else:
        source_image_url = str(data.source_image_url or "").strip()

    async def _run_once(progress_cb=None):
        started_at = time.time()
        edit_service = ImageEditService()
        current_source_image_url_input = source_image_url

        effective_reference_items = list(reference_items)
        if use_parent_mode and not effective_reference_items:
            effective_reference_items.append(
                {
                    "parent_post_id": parent_post_id,
                    "source_image_url": current_source_image_url_input,
                    "image_url": current_source_image_url_input,
                    "mention_alias": "Image 1",
                }
            )

        image_inputs = _normalize_image_references(data.image_references)
        if image_inputs and not effective_reference_items:
            effective_reference_items = [
                {
                    "image_url": image_ref,
                    "source_image_url": image_ref,
                    "mention_alias": f"Image {index + 1}",
                }
                for index, image_ref in enumerate(image_inputs)
            ]

        if effective_reference_items:
            first_ref = effective_reference_items[0] if effective_reference_items else {}
            only_single_parent_ref = (
                len(effective_reference_items) == 1
                and bool(str(first_ref.get("parent_post_id") or "").strip())
            )
            if only_single_parent_ref:
                single_parent_post_id = str(first_ref.get("parent_post_id") or "").strip()
                single_source_image_url = str(
                    first_ref.get("source_image_url")
                    or first_ref.get("image_url")
                    or current_source_image_url_input
                    or ""
                ).strip()
                result = await edit_service.edit_with_parent_post(
                    token_mgr=token_mgr,
                    token=token,
                    model_info=model_info,
                    prompt=prompt,
                    parent_post_id=single_parent_post_id,
                    source_image_url=single_source_image_url,
                    response_format="url",
                    stream=False,
                    return_all_images=True,
                    progress_cb=progress_cb,
                )
                mode = "parent_post"
            else:
                for item in effective_reference_items:
                    ref_parent = _extract_parent_post_id_from_url(str(item.get("parent_post_id") or ""))
                    if ref_parent and not str(item.get("source_image_url") or "").strip():
                        item["parent_post_id"] = ref_parent
                        item["source_image_url"] = await _canonicalize_parent_source_image_url(
                            token,
                            ref_parent,
                            str(item.get("image_url") or "").strip(),
                        )
                        if not str(item.get("image_url") or "").strip():
                            item["image_url"] = item["source_image_url"]

                result = await edit_service.edit_with_reference_items(
                    token_mgr=token_mgr,
                    token=token,
                    model_info=model_info,
                    prompt=prompt,
                    reference_items=effective_reference_items,
                    root_parent_post_id=parent_post_id if use_parent_mode else "",
                    response_format="url",
                    stream=False,
                    return_all_images=True,
                    progress_cb=progress_cb,
                )
                mode = "parent_post" if use_parent_mode else "upload"
        elif use_parent_mode:
            if current_source_image_url_input and not (
                current_source_image_url_input.startswith("http://")
                or current_source_image_url_input.startswith("https://")
            ):
                raise HTTPException(
                    status_code=400, detail="source_image_url must be http(s) URL"
                )
            result = await edit_service.edit_with_parent_post(
                token_mgr=token_mgr,
                token=token,
                model_info=model_info,
                prompt=prompt,
                parent_post_id=parent_post_id,
                source_image_url=current_source_image_url_input,
                response_format="url",
                stream=False,
                return_all_images=True,
                progress_cb=progress_cb,
            )
            mode = "parent_post"
        else:
            image_input = _normalize_image_input(
                image_base64=str(data.image_base64 or ""),
                image_url=str(data.image_url or ""),
            )
            result = await edit_service.edit(
                token_mgr=token_mgr,
                token=token,
                model_info=model_info,
                prompt=prompt,
                images=[image_input],
                n=1,
                response_format="url",
                stream=False,
                return_all_images=True,
                progress_cb=progress_cb,
            )
            mode = "upload"

        images = result.data if isinstance(result.data, list) else []
        if not images:
            raise HTTPException(status_code=502, detail="Image edit returned no results")

        normalized_images = [str(item or "").strip() for item in images if str(item or "").strip()]
        if not normalized_images:
            raise HTTPException(status_code=502, detail="Image edit returned no results")

        image_url = normalized_images[0]
        token_used = str(getattr(result, "token_used", "") or token)
        generated_parent_post_id = _extract_parent_post_id_from_url(image_url)
        current_parent_post_id = generated_parent_post_id or parent_post_id
        current_source_image_url = await _canonicalize_parent_source_image_url(
            token_used,
            current_parent_post_id,
            image_url,
        )
        elapsed_ms = int((time.time() - started_at) * 1000)

        return {
            "created": int(time.time()),
            "data": [{"url": url} for url in normalized_images],
            "mode": mode,
            "input_parent_post_id": parent_post_id if use_parent_mode else "",
            "generated_parent_post_id": generated_parent_post_id,
            "current_parent_post_id": current_parent_post_id,
            "current_source_image_url": current_source_image_url,
            "elapsed_ms": elapsed_ms,
        }

    if data.stream:
        async def event_stream():
            queue: asyncio.Queue[dict] = asyncio.Queue()
            disconnect_event = asyncio.Event()
            client_disconnected = False

            async def progress_cb(event: str, payload: dict):
                item = {"event": event}
                if isinstance(payload, dict):
                    item.update(payload)
                await queue.put({"type": "progress", "payload": item})

            async def watch_disconnect():
                nonlocal client_disconnected
                while True:
                    if await request.is_disconnected():
                        client_disconnected = True
                        logger.info(
                            "Imagine workbench stream interrupted by client disconnect: "
                            f"mode={'parent_post' if use_parent_mode else 'upload'}, "
                            f"parent_post_id={parent_post_id or '-'}"
                        )
                        disconnect_event.set()
                        break
                    await asyncio.sleep(0.2)

            async def runner():
                try:
                    await queue.put(
                        {
                            "type": "progress",
                            "payload": {
                                "event": "request_accepted",
                                "progress": 4,
                                "message": "已接收编辑请求",
                            },
                        }
                    )
                    body = await _run_once(progress_cb=progress_cb)
                    await queue.put(
                        {
                            "type": "progress",
                            "payload": {
                                "event": "completed",
                                "progress": 100,
                                "message": "编辑完成 100%",
                            },
                        }
                    )
                    await queue.put({"type": "result", "payload": body})
                except asyncio.CancelledError:
                    logger.info(
                        "Imagine workbench stream runner cancelled: "
                        f"mode={'parent_post' if use_parent_mode else 'upload'}, "
                        f"parent_post_id={parent_post_id or '-'}"
                    )
                    raise
                except Exception as e:
                    message = str(e)
                    if not message:
                        message = "编辑失败，请稍后重试"
                    await queue.put(
                        {
                            "type": "error",
                            "payload": {
                                "message": message,
                            },
                        }
                    )
                finally:
                    await queue.put({"type": "done", "payload": {}})

            task = asyncio.create_task(runner())
            watch_task = asyncio.create_task(watch_disconnect())
            try:
                while True:
                    if disconnect_event.is_set():
                        break
                    try:
                        item = await asyncio.wait_for(queue.get(), timeout=0.2)
                    except asyncio.TimeoutError:
                        continue
                    item_type = item.get("type")
                    if item_type == "done":
                        break
                    payload = item.get("payload", {})
                    yield (
                        f"event: {item_type}\n"
                        f"data: {orjson.dumps(payload).decode()}\n\n"
                    )
            finally:
                disconnect_event.set()
                if not task.done():
                    if client_disconnected:
                        logger.info(
                            "Imagine workbench stream cancel unfinished runner task: "
                            f"mode={'parent_post' if use_parent_mode else 'upload'}, "
                            f"parent_post_id={parent_post_id or '-'}"
                        )
                    task.cancel()
                    with contextlib.suppress(Exception):
                        await task
                if not watch_task.done():
                    watch_task.cancel()
                    with contextlib.suppress(Exception):
                        await watch_task

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
        )

    try:
        return await _run_once(progress_cb=None)
    except AppException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception:
        raise HTTPException(status_code=500, detail="编辑失败，请稍后重试")
