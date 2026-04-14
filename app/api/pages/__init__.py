"""Legacy page router preserved for local compatibility."""

from fastapi import APIRouter

from app.api.pages.admin import router as admin_router
from app.api.pages.public import router as public_router

router = APIRouter()
router.include_router(admin_router)
router.include_router(public_router)

__all__ = ["router"]
