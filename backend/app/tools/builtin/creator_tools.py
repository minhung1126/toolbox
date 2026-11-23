"""Creator Tools Plugin for the Toolbox Platform.

Provides integration with Google Sheets, YouTube Video/Shorts drafts, and
automated quota management.
"""

from typing import Optional

from fastapi import APIRouter, FastAPI

from backend.app.api.youtube import router as youtube_router
from backend.app.tools.base import ToolMetadata, ToolPlugin, ToolRoute


class CreatorToolsPlugin(ToolPlugin):
    """Toolbox plugin encapsulating YouTube Creator Studio workflows."""

    def __init__(self) -> None:
        self._metadata = ToolMetadata(
            id="creator-tools",
            name="Creator Tools",
            title="影音創作工作流",
            description="快速套用人物並建立草稿，編輯確認後公開，再獨立清理已公開的 To-Post 清單成員。",
            category="影音創作",
            icon="Youtube",
            version="1.2.0",
            status="active",
            entry_url="/dashboard",
            routes=[
                ToolRoute(
                    path="/youtube/drafts/videos/staged",
                    label="Video 編輯草稿並公開",
                    description="手動修改暫存標題與描述，最後確認編輯並公開",
                    required_scopes=["youtube", "sheets_readonly"],
                ),
                ToolRoute(
                    path="/youtube/drafts/shorts/staged",
                    label="Shorts 編輯草稿並公開",
                    description="手動修改暫存標題與描述，最後確認編輯並公開",
                    required_scopes=["youtube", "sheets_readonly"],
                ),
                ToolRoute(
                    path="/youtube/drafts/videos",
                    label="Video 快速套用",
                    description="讀取試算表，套用人物並建立 Video 草稿",
                    required_scopes=["youtube", "sheets_readonly"],
                ),
                ToolRoute(
                    path="/youtube/drafts/shorts",
                    label="Shorts 快速套用",
                    description="讀取試算表，套用人物並建立 Shorts 草稿",
                    required_scopes=["youtube", "sheets_readonly"],
                ),
                ToolRoute(
                    path="/youtube/publish-cleanup",
                    label="清理 To-Post",
                    description="核實影片已公開後，只移除 To-Post 清單成員",
                    required_scopes=["youtube"],
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
        return youtube_router

    async def on_startup(self, app: FastAPI) -> None:
        """Creator tools plugin startup hook."""
        account_state_store = app.state.account_state_store

        account_state_store.register_setting_keys(
            [
                "default_playlist_id",
                "youtube_active_slot",
                "youtube_routing_mode",
                "youtube_draft_video_config",
                "youtube_draft_shorts_config",
                "shared_team_person_filter",
            ]
        )
        account_state_store.register_work_state_keys(
            [
                "youtube_publish_cleaner",
                "youtube_draft_video",
                "youtube_draft_shorts",
            ]
        )

    async def on_shutdown(self, app: FastAPI) -> None:
        """Creator tools plugin shutdown hook."""
        pass
