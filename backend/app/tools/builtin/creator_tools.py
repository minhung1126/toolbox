"""Creator Tools Plugin for the Toolbox Platform.

Provides integration with Google Sheets, YouTube Video/Shorts drafts, and
Google Drive upload pipelines with automatic quota management.
"""

from typing import Optional

from fastapi import APIRouter, FastAPI

from backend.app.api.sheets import router as sheets_router
from backend.app.api.youtube import router as youtube_router
from backend.app.api.youtube_uploads import router as youtube_uploads_router
from backend.app.services.youtube_upload_jobs import start_upload_worker, stop_upload_worker
from backend.app.tools.base import ToolMetadata, ToolPlugin, ToolRoute


class CreatorToolsPlugin(ToolPlugin):
    """Toolbox plugin encapsulating YouTube, Google Sheets, and Drive video workflows."""

    def __init__(self) -> None:
        self._metadata = ToolMetadata(
            id="creator-tools",
            name="Creator Tools",
            title="創作者工作流控制台",
            description="Google Sheets 整合、YouTube 影片/Shorts 草稿維護、Drive 斷點續傳背景上傳與配額自動分流。",
            category="媒體與影音",
            icon="Youtube",
            version="1.1.0",
            status="active",
            entry_url="/dashboard",
            routes=[
                ToolRoute(
                    path="/youtube/uploads/new",
                    label="Drive 上傳 YouTube",
                    description="從 Drive 批次上傳影片至 YouTube",
                ),
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
                ToolRoute(
                    path="/sheets/copy", label="Sheet 內容複製", description="在工作表或試算表間批次複製結構與內容"
                ),
                ToolRoute(
                    path="/youtube/settings/connections",
                    label="YouTube 授權設定",
                    description="管理主要與次要 YouTube 頻道連線",
                ),
                ToolRoute(
                    path="/youtube/settings/quota",
                    label="YouTube 配額與計帳",
                    description="監控 YouTube API Quota 消耗與自動分流",
                ),
            ],
            required_scopes=["sheets_readonly", "drive_readonly", "youtube"],
            tags=["youtube", "google-sheets", "google-drive", "automation", "creator"],
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
            combined.include_router(youtube_uploads_router)
            self._router = combined
        return self._router

    async def on_startup(self, app: FastAPI) -> None:
        """Start the background YouTube Drive upload worker."""
        start_upload_worker()

    async def on_shutdown(self, app: FastAPI) -> None:
        """Stop the background YouTube Drive upload worker."""
        stop_upload_worker()
