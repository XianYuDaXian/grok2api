"""
Local cache utilities.
"""

import json
import re
from typing import Any, Dict

from app.core.storage import DATA_DIR

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"}
CHAT_UPLOAD_PREFIX = "chat-upload-"


class CacheService:
    """Local cache service."""

    def __init__(self):
        base_dir = DATA_DIR / "tmp"
        self.image_dir = base_dir / "image"
        self.video_dir = base_dir / "video"
        self.image_dir.mkdir(parents=True, exist_ok=True)
        self.video_dir.mkdir(parents=True, exist_ok=True)

    def _cache_dir(self, media_type: str):
        return self.image_dir if media_type in {"image", "chat_upload"} else self.video_dir

    def _allowed_exts(self, media_type: str):
        return IMAGE_EXTS if media_type in {"image", "chat_upload"} else VIDEO_EXTS

    def _matches_media_type(self, media_type: str, file_path) -> bool:
        if not file_path.is_file():
            return False
        if file_path.suffix.lower() not in self._allowed_exts(media_type):
            return False
        if media_type == "chat_upload":
            return file_path.name.startswith(CHAT_UPLOAD_PREFIX)
        if media_type == "image":
            return not file_path.name.startswith(CHAT_UPLOAD_PREFIX)
        return True

    def _media_meta_dir(self):
        return DATA_DIR / "tmp" / "media-meta"

    def _load_video_metadata(self) -> dict[str, dict[str, Any]]:
        meta_dir = self._media_meta_dir()
        if not meta_dir.exists():
            return {}

        metadata_by_post_id: dict[str, dict[str, Any]] = {}
        for file_path in meta_dir.glob("*.json"):
            try:
                payload = json.loads(file_path.read_text(encoding="utf-8"))
            except Exception:
                continue
            if not isinstance(payload, dict):
                continue
            if str(payload.get("media_type") or "").strip().lower() != "video":
                continue
            post_id = str(payload.get("post_id") or "").strip()
            if not post_id:
                continue
            metadata_by_post_id[post_id] = payload
        return metadata_by_post_id

    def _write_video_metadata(self, post_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        post_text = str(post_id or "").strip()
        if not post_text:
            raise ValueError("post_id is required")
        meta_dir = self._media_meta_dir()
        meta_dir.mkdir(parents=True, exist_ok=True)
        metadata_path = meta_dir / f"{post_text}.json"
        metadata_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return payload

    @staticmethod
    def _extract_post_id_from_name(name: str) -> str:
        text = str(name or "").strip()
        if not text:
            return ""
        match = re.search(
            r"generated-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})-",
            text,
        )
        if match:
            return match.group(1)
        all_matches = re.findall(
            r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
            text,
        )
        return all_matches[-1] if all_matches else ""

    def get_stats(self, media_type: str = "image") -> Dict[str, Any]:
        cache_dir = self._cache_dir(media_type)
        if not cache_dir.exists():
            return {"count": 0, "size_mb": 0.0}

        files = [f for f in cache_dir.glob("*") if self._matches_media_type(media_type, f)]
        total_size = sum(f.stat().st_size for f in files)
        return {"count": len(files), "size_mb": round(total_size / 1024 / 1024, 2)}

    def list_files(
        self, media_type: str = "image", page: int = 1, page_size: int = 1000
    ) -> Dict[str, Any]:
        cache_dir = self._cache_dir(media_type)
        if not cache_dir.exists():
            return {"total": 0, "page": page, "page_size": page_size, "items": []}

        files = [f for f in cache_dir.glob("*") if self._matches_media_type(media_type, f)]

        items = []
        for f in files:
            try:
                stat = f.stat()
                items.append(
                    {
                        "name": f.name,
                        "size_bytes": stat.st_size,
                        "mtime_ms": int(stat.st_mtime * 1000),
                    }
                )
            except Exception:
                continue

        items.sort(key=lambda x: x["mtime_ms"], reverse=True)

        total = len(items)
        start = max(0, (page - 1) * page_size)
        paged = items[start : start + page_size]

        metadata_by_post_id = self._load_video_metadata() if media_type == "video" else {}

        for item in paged:
            file_media_type = "image" if media_type == "chat_upload" else media_type
            item["view_url"] = f"/v1/files/{file_media_type}/{item['name']}"
            if media_type in {"image", "chat_upload"}:
                item["preview_url"] = item["view_url"]
            if media_type != "video":
                continue
            post_id = self._extract_post_id_from_name(item["name"])
            if not post_id:
                continue
            metadata = metadata_by_post_id.get(post_id)
            if not metadata:
                continue
            item["post_id"] = str(metadata.get("post_id") or "").strip()
            item["share_link"] = str(metadata.get("share_link") or "").strip()
            item["original_post_id"] = str(metadata.get("original_post_id") or "").strip()
            item["media_url"] = str(metadata.get("media_url") or "").strip()
            item["thumbnail_url"] = str(metadata.get("thumbnail_url") or "").strip()
            item["local_url"] = str(metadata.get("local_url") or "").strip()
            item["display_name"] = str(metadata.get("display_name") or "").strip()

        return {"total": total, "page": page, "page_size": page_size, "items": paged}

    def update_video_display_name(
        self,
        *,
        post_id: str = "",
        share_link: str = "",
        name: str = "",
        display_name: str = "",
    ) -> Dict[str, Any]:
        resolved_post_id = str(post_id or "").strip()
        if not resolved_post_id and share_link:
            match = re.search(
                r"/imagine/post/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})",
                str(share_link or "").strip(),
            )
            if match:
                resolved_post_id = match.group(1)
        if not resolved_post_id and name:
            resolved_post_id = self._extract_post_id_from_name(name)
        if not resolved_post_id:
            raise ValueError("Unable to resolve post_id")

        metadata_by_post_id = self._load_video_metadata()
        payload = dict(metadata_by_post_id.get(resolved_post_id) or {})
        payload["post_id"] = resolved_post_id
        payload["media_type"] = str(payload.get("media_type") or "video").strip() or "video"
        safe_display_name = str(display_name or "").strip()
        if safe_display_name:
            payload["display_name"] = safe_display_name
        else:
            payload.pop("display_name", None)
        self._write_video_metadata(resolved_post_id, payload)
        return {
            "post_id": resolved_post_id,
            "display_name": str(payload.get("display_name") or "").strip(),
            "share_link": str(payload.get("share_link") or "").strip(),
            "metadata_path": str(self._media_meta_dir() / f"{resolved_post_id}.json"),
        }

    def delete_file(self, media_type: str, name: str) -> Dict[str, Any]:
        cache_dir = self._cache_dir(media_type)
        file_path = cache_dir / name.replace("/", "-")

        if file_path.exists() and self._matches_media_type(media_type, file_path):
            try:
                file_path.unlink()
                return {"deleted": True}
            except Exception:
                pass
        return {"deleted": False}

    def clear(self, media_type: str = "image") -> Dict[str, Any]:
        cache_dir = self._cache_dir(media_type)
        if not cache_dir.exists():
            return {"count": 0, "size_mb": 0.0}

        files = [f for f in cache_dir.glob("*") if self._matches_media_type(media_type, f)]
        total_size = sum(f.stat().st_size for f in files if f.is_file())
        count = 0

        for f in files:
            if f.is_file():
                try:
                    f.unlink()
                    count += 1
                except Exception:
                    pass

        return {"count": count, "size_mb": round(total_size / 1024 / 1024, 2)}


__all__ = ["CacheService"]
