from fastapi import APIRouter, Depends

from backend.app.api.auth import router as auth_router
from backend.app.api.settings import router as settings_router
from backend.app.api.system import router as system_router
from backend.app.core.request_protection import enforce_api_rate_limit, require_same_origin
from backend.app.tools.builtin import register_builtin_tools
from backend.app.tools.catalog import router as catalog_router
from backend.app.tools.registry import tool_registry


def create_api_router(registry):
    router = APIRouter(
        prefix="/api/v1",
        dependencies=[Depends(enforce_api_rate_limit), Depends(require_same_origin)],
    )
    router.include_router(auth_router)
    router.include_router(system_router)
    router.include_router(settings_router)
    router.include_router(catalog_router)
    registry.mount_routers(router)
    return router


register_builtin_tools()
api_router = create_api_router(tool_registry)
