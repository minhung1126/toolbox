"""Weverse Video Uploader Plugin for the Toolbox Platform."""

from typing import Optional

from fastapi import APIRouter

from backend.app.api.weverse_uploader import router as weverse_router
from backend.app.services.weverse_uploader_service import (
    recover_interrupted_upload_tasks,
    shutdown_upload_executor,
)
from backend.app.tools.base import ToolMetadata, ToolPlugin, ToolRoute


class WeverseUploaderPlugin(ToolPlugin):
    """Toolbox plugin providing local Weverse structured folder video and subtitle uploading to YouTube."""

    def __init__(self) -> None:
        self._metadata = ToolMetadata(
            id="weverse-uploader",
            name="Weverse Uploader",
            title="Weverse 影片上傳",
            description="本機 Weverse 結構化資料夾影音與 16 語系字幕自動辨識、複查調整與 YouTube 專屬頻道直傳發布。",
            category="影音創作",
            icon="UploadCloud",
            version="1.0.0",
            status="active",
            entry_url="/weverse-uploader",
            routes=[
                ToolRoute(
                    path="/weverse-uploader",
                    label="Weverse 影片上傳",
                    description="本機資料夾辨識、字幕複查與 YouTube 上傳工作台",
                ),
            ],
            required_scopes=["youtube"],
            tags=["weverse", "youtube", "video", "subtitle", "vtt", "upload", "creator"],
        )
        self._router = weverse_router

    @property
    def metadata(self) -> ToolMetadata:
        return self._metadata

    @property
    def router(self) -> Optional[APIRouter]:
        return self._router

    async def on_startup(self, app) -> None:
        del app
        recover_interrupted_upload_tasks()

    async def on_shutdown(self, app) -> None:
        del app
        shutdown_upload_executor()
