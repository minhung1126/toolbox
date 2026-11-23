"""Sticky Notes Plugin for the Toolbox Platform.

Provides personal sticky notes with multi-card editing, remark tags,
one-click copy, and last edited timestamp tracking.
"""

from typing import Optional

from fastapi import APIRouter

from backend.app.api.notes import router as notes_router
from backend.app.tools.base import ToolMetadata, ToolPlugin, ToolRoute


class StickyNotesPlugin(ToolPlugin):
    """Toolbox plugin providing personal sticky notes management."""

    def __init__(self) -> None:
        self._metadata = ToolMetadata(
            id="sticky-notes",
            name="Sticky Notes",
            title="便利貼備忘錄",
            description="保存文字與變數模板，自動儲存、複製及匯出備份；未確認的儲存保留草稿並提供核對。",
            category="日常生產力",
            icon="StickyNote",
            version="1.0.0",
            status="active",
            entry_url="/notes",
            routes=[
                ToolRoute(path="/notes", label="便利貼", description="便利貼備忘看板"),
            ],
            required_scopes=[],
            tags=["notes", "memo", "productivity", "clipboard"],
        )
        self._router = notes_router

    @property
    def metadata(self) -> ToolMetadata:
        return self._metadata

    @property
    def router(self) -> Optional[APIRouter]:
        return self._router
