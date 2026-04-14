"""Shared local media storage paths."""

from pathlib import Path

from app.platform.paths import data_path


def _files_dir() -> Path:
    return data_path("files")


def image_files_dir() -> Path:
    """Return the local image storage directory."""
    path = _files_dir() / "images"
    path.mkdir(parents=True, exist_ok=True)
    return path


def video_files_dir() -> Path:
    """Return the local video storage directory."""
    path = _files_dir() / "videos"
    path.mkdir(parents=True, exist_ok=True)
    return path


__all__ = ["image_files_dir", "video_files_dir"]
