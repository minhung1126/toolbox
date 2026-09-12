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
            description="簡潔風格便利貼，支援多便籤文字編輯、備註標記、一鍵複製與最後編輯時間追蹤。",
            category="生產力工具",
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
