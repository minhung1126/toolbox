"""YouTube Integrations & Quota Management Plugin for the Toolbox Platform.

Provides YouTube multi-slot connections, routing, and quota operations.
"""

from typing import Optional

from fastapi import APIRouter, FastAPI

from backend.app.tools.base import ToolMetadata, ToolPlugin, ToolRoute


class YouTubeIntegrationsPlugin(ToolPlugin):
    """Toolbox plugin providing YouTube slot connections, routing, and quota management."""

    def __init__(self) -> None:
        self._metadata = ToolMetadata(
            id="youtube-integrations",
            name="Integrations & Quota",
            title="API 整合與配額控管",
            description="YouTube 雙槽位頻道連線、智慧容錯路由分流、即時 API Quota 監控與預設計帳清單。",
            category="整合與配額",
            icon="Sliders",
            version="1.0.0",
            status="active",
            entry_url="/youtube/settings/connections",
            routes=[
                ToolRoute(
                    path="/youtube/settings/connections",
                    label="YouTube 授權設定",
                    description="管理主要與次要 YouTube 頻道連線",
                ),
                ToolRoute(
                    path="/youtube/settings/routing",
                    label="路由分流模式",
                    description="設定 YouTube 請求自動或手動槽位路由",
                ),
                ToolRoute(
                    path="/youtube/settings/quota",
                    label="YouTube 配額與計帳",
                    description="監控 YouTube API Quota 消耗與安全水位",
                ),
                ToolRoute(
                    path="/youtube/settings/playlist",
                    label="預設播放清單",
                    description="設定發布作業預設使用的 YouTube 播放清單",
                ),
            ],
            required_scopes=["youtube"],
            tags=["youtube", "quota", "routing", "integrations"],
        )

    @property
    def metadata(self) -> ToolMetadata:
        return self._metadata

    @property
    def router(self) -> Optional[APIRouter]:
        return None

    async def on_startup(self, app: FastAPI) -> None:
        pass

    async def on_shutdown(self, app: FastAPI) -> None:
        pass
