"""Sheets and Data Tools Plugin for the Toolbox Platform.

Provides Google Sheets operations, metadata inspection, and structure replication.
"""

from typing import Optional

from fastapi import APIRouter, FastAPI

from backend.app.api.sheets import router as sheets_router
from backend.app.tools.base import ToolMetadata, ToolPlugin, ToolRoute


class SheetsToolsPlugin(ToolPlugin):
    """Toolbox plugin providing Google Sheets operations and structure replication."""

    def __init__(self) -> None:
        self._metadata = ToolMetadata(
            id="sheets-tools",
            name="Sheets & Data Tools",
            title="試算表與資料服務",
            description="唯讀 Google 試算表，篩選人物與欄位後複製文字到剪貼簿。",
            category="資料處理",
            icon="FileSpreadsheet",
            version="1.0.0",
            status="active",
            entry_url="/sheets/copy",
            routes=[
                ToolRoute(
                    path="/sheets/copy",
                    label="Sheet 內容複製",
                    description="在工作表或試算表間批次複製結構與內容",
                ),
                ToolRoute(
                    path="/sheets/settings",
                    label="Sheet 設定",
                    description="管理 Google 試算表存取授權與預設試算表來源",
                    required_scopes=[],
                ),
            ],
            required_scopes=["sheets_readonly"],
            tags=["google-sheets", "spreadsheet", "copy", "data"],
        )
        self._router: Optional[APIRouter] = sheets_router

    @property
    def metadata(self) -> ToolMetadata:
        return self._metadata

    @property
    def router(self) -> Optional[APIRouter]:
        return self._router

    async def on_startup(self, app: FastAPI) -> None:
        account_state_store = app.state.account_state_store

        account_state_store.register_setting_keys(["default_spreadsheet_id"])
        account_state_store.register_work_state_keys(["sheet_copy"])

    async def on_shutdown(self, app: FastAPI) -> None:
        pass
