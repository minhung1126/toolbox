"""Photo Curator Plugin for the Toolbox Platform.

Provides a dedicated 3-part post visual curation workbench for social media creators,
focusing on Instagram carousel balance, unassigned photo tracking, cover coordination,
and structured batch export.
"""

from typing import Optional

from fastapi import APIRouter

from backend.app.api.photo_curator import router as photo_curator_router
from backend.app.tools.base import ToolMetadata, ToolPlugin, ToolRoute


class PhotoCuratorPlugin(ToolPlugin):
    """Toolbox plugin providing 3-part social media photo curation."""

    def __init__(self) -> None:
        self._metadata = ToolMetadata(
            id="photo-curator",
            name="Photo Curator",
            title="Instagram 貼文排版",
            description="照片批次分組與 Instagram 貼文三部曲排版工作台，支援照片分流、防漏分配池、首圖橫排預覽與打包匯出。",
            category="日常生產力",
            icon="Instagram",
            version="1.0.0",
            status="active",
            entry_url="/photo-curator",
            routes=[
                ToolRoute(
                    path="/photo-curator", label="Instagram 貼文排版", description="照片分組與 IG 三連排排版工作台"
                ),
            ],
            required_scopes=[],
            tags=["photo", "instagram", "layout", "carousel", "triptych", "productivity"],
        )
        self._router = photo_curator_router

    @property
    def metadata(self) -> ToolMetadata:
        return self._metadata

    @property
    def router(self) -> Optional[APIRouter]:
        return self._router
