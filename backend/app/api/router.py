from fastapi import APIRouter, Depends

from backend.app.api.auth import router as auth_router
from backend.app.api.settings import router as settings_router
from backend.app.api.sheets import router as sheets_router
from backend.app.api.system import router as system_router
from backend.app.api.youtube import router as youtube_router
from backend.app.api.youtube_uploads import router as youtube_uploads_router
from backend.app.core.request_protection import enforce_api_rate_limit, require_same_origin
from backend.app.tools.catalog import router as catalog_router

api_router = APIRouter(
    prefix="/api/v1",
    dependencies=[Depends(enforce_api_rate_limit), Depends(require_same_origin)],
)
api_router.include_router(auth_router)
api_router.include_router(system_router)
api_router.include_router(settings_router)
api_router.include_router(sheets_router)
api_router.include_router(youtube_router)
api_router.include_router(youtube_uploads_router)
api_router.include_router(catalog_router)
