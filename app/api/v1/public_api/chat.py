"""Public Chat router (public_key protected)."""

import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from pydantic import BaseModel, Field

from app.core.auth import verify_public_key
from app.core.storage import DATA_DIR
from app.api.v1.chat import ChatCompletionRequest, chat_completions
from app.services.grok.utils.cache import CHAT_UPLOAD_PREFIX, CacheService

router = APIRouter(tags=["Public Chat"])
CHAT_UPLOAD_DIR = DATA_DIR / "tmp" / "image"
ALLOWED_IMAGE_SUFFIXES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
}


class ChatUploadDeleteRequest(BaseModel):
    files: list[str] = Field(default_factory=list, description="待删除的上传缓存文件名")


def _resolve_upload_suffix(upload: UploadFile) -> tuple[str, str]:
    filename = str(upload.filename or "").strip()
    suffix = Path(filename).suffix.lower()
    content_type = str(upload.content_type or "").strip().lower()
    if suffix in ALLOWED_IMAGE_SUFFIXES:
        return suffix, ALLOWED_IMAGE_SUFFIXES[suffix]
    mime_map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/bmp": ".bmp",
    }
    mapped = mime_map.get(content_type)
    if mapped:
        return mapped, content_type
    raise HTTPException(status_code=400, detail="仅支持 jpg/png/webp/gif/bmp 图片")


@router.post("/chat/completions", dependencies=[Depends(verify_public_key)])
async def public_chat_completions(request: ChatCompletionRequest, raw_request: Request):
    """Public chat completions endpoint."""
    return await chat_completions(request, raw_request)


@router.post("/chat/upload-image", dependencies=[Depends(verify_public_key)])
async def public_chat_upload_image(raw_request: Request, file: UploadFile = File(...)):
    """上传 Chat 图片到本地缓存，返回可持久化 URL。"""
    suffix, content_type = _resolve_upload_suffix(file)
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="图片内容为空")

    CHAT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"chat-upload-{uuid.uuid4().hex}{suffix}"
    target_path = CHAT_UPLOAD_DIR / filename

    async with aiofiles.open(target_path, "wb") as f:
        await f.write(payload)

    base_url = str(raw_request.base_url).rstrip("/")
    return {
        "status": "success",
        "filename": filename,
        "content_type": content_type,
        "size_bytes": len(payload),
        "path": f"/v1/files/image/{filename}",
        "url": f"{base_url}/v1/files/image/{filename}",
    }


@router.post("/chat/delete-upload-cache", dependencies=[Depends(verify_public_key)])
async def public_chat_delete_upload_cache(data: ChatUploadDeleteRequest):
    """按文件名删除 Chat 上传图片缓存。"""
    cache_service = CacheService()
    requested = []
    deleted = []
    missing = []

    for raw_name in data.files:
        safe_name = str(raw_name or "").strip().replace("/", "-")
        if not safe_name or not safe_name.startswith(CHAT_UPLOAD_PREFIX):
            continue
        if safe_name in requested:
            continue
        requested.append(safe_name)
        result = cache_service.delete_file("chat_upload", safe_name)
        if result.get("deleted"):
            deleted.append(safe_name)
        else:
            missing.append(safe_name)

    return {
        "status": "success",
        "requested": len(requested),
        "deleted": deleted,
        "missing": missing,
    }


__all__ = ["router"]
