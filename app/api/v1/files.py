"""
文件服务 API 路由
"""

import aiofiles.os
from urllib.parse import unquote
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.logger import logger
from app.core.storage import DATA_DIR

router = APIRouter(tags=["Files"])

# 缓存根目录
BASE_DIR = DATA_DIR / "tmp"
IMAGE_DIR = BASE_DIR / "image"
VIDEO_DIR = BASE_DIR / "video"


def _normalize_cached_filename(filename: str) -> str:
    """
    规范化客户端传入文件名，兼容尾部误带反斜杠等情况。
    """
    value = (filename or "").strip()
    # 尝试解码一次，兼容 %5C 这类编码
    try:
        value = unquote(value)
    except Exception:
        pass
    value = value.strip().strip('"').strip("'").rstrip("\\/")
    # 将路径分隔符统一扁平化到缓存命名规则
    value = value.replace("\\", "-").replace("/", "-")
    return value


@router.get("/image/{filename:path}")
async def get_image(filename: str):
    """
    获取图片文件
    """
    filename = _normalize_cached_filename(filename)

    file_path = IMAGE_DIR / filename

    if await aiofiles.os.path.exists(file_path):
        if await aiofiles.os.path.isfile(file_path):
            content_type = "image/jpeg"
            if file_path.suffix.lower() == ".png":
                content_type = "image/png"
            elif file_path.suffix.lower() == ".webp":
                content_type = "image/webp"

            # 增加缓存头，支持高并发场景下的浏览器/CDN缓存
            return FileResponse(
                file_path,
                media_type=content_type,
                headers={"Cache-Control": "public, max-age=31536000, immutable"},
            )

    logger.warning(f"Image not found: {filename}")
    raise HTTPException(status_code=404, detail="Image not found")


@router.get("/video/{filename:path}")
async def get_video(filename: str):
    """
    获取视频文件
    """
    filename = _normalize_cached_filename(filename)

    file_path = VIDEO_DIR / filename

    if await aiofiles.os.path.exists(file_path):
        if await aiofiles.os.path.isfile(file_path):
            return FileResponse(
                file_path,
                media_type="video/mp4",
                headers={"Cache-Control": "public, max-age=31536000, immutable"},
            )

    logger.warning(f"Video not found: {filename}")
    raise HTTPException(status_code=404, detail="Video not found")
