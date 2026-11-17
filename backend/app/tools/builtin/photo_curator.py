"""Photo Curator Plugin for the Toolbox Platform.

Provides a visual curation workbench for 3, 6, or 9 social media posts,
focusing on Instagram carousel balance, unassigned photo tracking, cover coordination,
and structured batch export.
"""

from typing import Optional

from fastapi import APIRouter

from backend.app.api.photo_curator import router as photo_curator_router
from backend.app.tools.base import ToolMetadata, ToolPlugin, ToolRoute


class PhotoCuratorPlugin(ToolPlugin):
    """Toolbox plugin providing social media photo grid curation."""

    def __init__(self) -> None:
        self._metadata = ToolMetadata(
            id="photo-curator",
            name="Photo Curator",
            title="Instagram 貼文排版",
            description="在本機安排首圖排版與輪播順序，編排為 3／6／9 篇貼文，輸出 ZIP、對照表及可攜排版專案；不自動發布 Instagram。",
            category="日常生產力",
            icon="Instagram",
            version="1.0.0",
            status="active",
            entry_url="/photo-curator",
            routes=[
                ToolRoute(
                    path="/photo-curator", label="Instagram 貼文排版", description="照片分組與 IG 3、6、9 格排版工作台"
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
