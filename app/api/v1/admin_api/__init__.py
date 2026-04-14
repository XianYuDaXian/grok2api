"""Legacy admin API router (/v1/admin/*) preserved for local compatibility."""

from fastapi import APIRouter

from app.api.v1.admin_api.cache import router as cache_router
from app.api.v1.admin_api.config import router as config_router
from app.api.v1.admin_api.token import router as token_router

router = APIRouter()
router.include_router(cache_router)
router.include_router(config_router)
router.include_router(token_router)

__all__ = ["router"]
