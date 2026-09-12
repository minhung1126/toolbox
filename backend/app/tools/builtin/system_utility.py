"""System Utility Plugin for the Toolbox Platform.

Provides diagnostic endpoints, health checks, environment inspection, and
deployment metadata.
"""

from backend.app.tools.base import ToolMetadata, ToolPlugin, ToolRoute


class SystemUtilityPlugin(ToolPlugin):
    """Toolbox plugin exposing system status, deployment version, and diagnostic info."""

    def __init__(self) -> None:
        self._metadata = ToolMetadata(
            id="system-utility",
            name="System Utility",
            title="系統維運與安全控制",
            description="即時監控 Toolbox API 健康狀態、OAuth 憑證遮罩維護、登入白名單與 Commit 部署版本。",
            category="系統管理",
            icon="Shield",
            version="1.0.0",
            status="active",
            entry_url="/system/settings",
            routes=[
                ToolRoute(
                    path="/system/settings",
                    label="系統安全與憑證設定",
                    description="管理系統密鑰、Google OAuth 憑證與登入白名單",
                ),
                ToolRoute(
                    path="/system/info", label="系統與部署資訊", description="檢視執行環境參數、快取與 Commit SHA"
                ),
                ToolRoute(path="/system/health", label="API 健康度檢查", description="檢查 API 就緒狀態與憑證設定"),
            ],
            required_scopes=[],
            tags=["system", "health", "diagnostics", "deployment"],
        )

    @property
    def metadata(self) -> ToolMetadata:
        return self._metadata
