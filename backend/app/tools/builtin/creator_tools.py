"""Creator Tools Plugin for the Toolbox Platform.

Provides integration with Google Sheets, YouTube Video/Shorts drafts, and
automated quota management.
"""

from typing import Optional

from fastapi import APIRouter, FastAPI

from backend.app.api.sheets import router as sheets_router
from backend.app.api.youtube import router as youtube_router
from backend.app.tools.base import ToolMetadata, ToolPlugin, ToolRoute


class CreatorToolsPlugin(ToolPlugin):
    """Toolbox plugin encapsulating YouTube Creator Studio workflows."""

    def __init__(self) -> None:
        self._metadata = ToolMetadata(
            id="creator-tools",
            name="Creator Tools",
            title="影音創作工作流",
            description="YouTube 影片與 Shorts 專屬草稿批次維護、標題說明套用與排程發布自動化。",
            category="影音創作",
            icon="Youtube",
            version="1.2.0",
            status="active",
            entry_url="/dashboard",
            routes=[
                ToolRoute(
                    path="/youtube/drafts/videos",
                    label="Video 草稿管理",
                    description="讀取試算表並批次維護 Video 草稿標題與說明",
                ),
                ToolRoute(
                    path="/youtube/drafts/shorts",
                    label="Shorts 草稿管理",
                    description="讀取試算表並批次維護 Shorts 草稿標題與說明",
                ),
                ToolRoute(
                    path="/youtube/publish-cleanup",
                    label="發布並清理清單",
                    description="批次公開已排程影片並從工作清單移出",
                ),
            ],
            required_scopes=["youtube", "sheets_readonly"],
            tags=["youtube", "video", "shorts", "automation", "creator"],
        )
        self._router: Optional[APIRouter] = None

    @property
    def metadata(self) -> ToolMetadata:
        return self._metadata

    @property
    def router(self) -> APIRouter:
        if self._router is None:
            combined = APIRouter()
            combined.include_router(sheets_router)
            combined.include_router(youtube_router)
            self._router = combined
        return self._router

    async def on_startup(self, app: FastAPI) -> None:
        """Creator tools plugin startup hook."""
        pass

    async def on_shutdown(self, app: FastAPI) -> None:
        """Creator tools plugin shutdown hook."""
        pass
