"""Local media cache management — stats, list, clear, delete."""

from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.platform.errors import AppError, ErrorKind
from app.platform.storage import image_files_dir, video_files_dir

router = APIRouter(prefix="/cache", tags=["Admin - Cache"])

# ---------------------------------------------------------------------------
# Lightweight local media cache service.
# ---------------------------------------------------------------------------
_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
_VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"}


class ClearCacheRequest(BaseModel):
    type: Literal["image", "video"] = "image"


class DeleteCacheItemRequest(BaseModel):
    type: Literal["image", "video"] = "image"
    name: str


class DeleteCacheItemsRequest(BaseModel):
    type: Literal["image", "video"] = "image"
    names: list[str]


def _dir(media_type: str) -> Path:
    return image_files_dir() if media_type == "image" else video_files_dir()


def _exts(media_type: str):
    return _IMAGE_EXTS if media_type == "image" else _VIDEO_EXTS


def _stats(media_type: str) -> dict[str, Any]:
    d = _dir(media_type)
    if not d.exists():
        return {"count": 0, "size_mb": 0.0}
    allowed = _exts(media_type)
    files = [f for f in d.glob("*") if f.is_file() and f.suffix.lower() in allowed]
    total_size = sum(f.stat().st_size for f in files)
    return {"count": len(files), "size_mb": round(total_size / 1024 / 1024, 2)}


def _list_files(media_type: str, page: int, page_size: int) -> dict[str, Any]:
    d = _dir(media_type)
    if not d.exists():
        return {"total": 0, "page": page, "page_size": page_size, "items": []}
    allowed = _exts(media_type)
    files = sorted(
        (f for f in d.glob("*") if f.is_file() and f.suffix.lower() in allowed),
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    )
    total = len(files)
    start = (page - 1) * page_size
    chunk = files[start : start + page_size]
    items = []
    for f in chunk:
        st = f.stat()
        items.append({
            "name": f.name,
            "size_bytes": st.st_size,
            "modified_at": st.st_mtime,
        })
    return {"total": total, "page": page, "page_size": page_size, "items": items}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("")
async def cache_stats():
    return {
        "local_image": _stats("image"),
        "local_video": _stats("video"),
    }


@router.get("/list")
async def list_local(
    cache_type: Literal["image", "video"] = "image",
    type_: Literal["image", "video"] | None = Query(default=None, alias="type"),
    page: int = 1,
    page_size: int = 1000,
):
    media_type = type_ or cache_type
    return {"status": "success", **_list_files(media_type, page, page_size)}


@router.post("/clear")
async def clear_local(req: ClearCacheRequest):
    d = _dir(req.type)
    allowed = _exts(req.type)
    removed = 0
    for f in d.glob("*"):
        if f.is_file() and f.suffix.lower() in allowed:
            f.unlink(missing_ok=True)
            removed += 1
    return {"status": "success", "result": {"removed": removed}}


@router.post("/item/delete")
async def delete_local_item(req: DeleteCacheItemRequest):
    if not req.name:
        raise AppError(
            "Missing file name",
            kind=ErrorKind.VALIDATION,
            code="missing_file_name",
            status=400,
        )
    target = _dir(req.type) / req.name
    if not target.is_file():
        raise AppError(
            "File not found",
            kind=ErrorKind.VALIDATION,
            code="file_not_found",
            status=404,
        )
    target.unlink(missing_ok=True)
    return {"status": "success", "result": {"deleted": req.name}}


@router.post("/items/delete")
async def delete_local_items(req: DeleteCacheItemsRequest):
    names = [name.strip() for name in req.names if name and name.strip()]
    if not names:
        raise AppError(
            "Missing file names",
            kind=ErrorKind.VALIDATION,
            code="missing_file_names",
            status=400,
        )

    cache_dir = _dir(req.type)
    deleted = 0
    missing = 0

    for name in names:
        target = cache_dir / name
        if target.is_file():
            target.unlink(missing_ok=True)
            deleted += 1
        else:
            missing += 1

    return {
        "status": "success",
        "result": {
            "deleted": deleted,
            "missing": missing,
        },
    }
