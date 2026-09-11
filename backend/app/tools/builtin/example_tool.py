"""Example Tool Plugin for the Toolbox Platform.

This file serves as a reference template for developers adding new tool modules
to the Toolbox platform.

To add a new tool:
1. Create a subclass of `ToolPlugin`.
2. Define its `ToolMetadata` (id, name, title, description, routes, etc.).
3. Optionally provide an `APIRouter` with endpoints.
4. Register the plugin via `tool_registry.register(MyToolPlugin())` in your module or `register_builtin_tools()`.
"""

from typing import Any, Dict, Optional

from fastapi import APIRouter

from backend.app.tools.base import ToolMetadata, ToolPlugin, ToolRoute


class ExampleToolPlugin(ToolPlugin):
    """Reference example tool showing how to structure a self-contained Toolbox module."""

    def __init__(self) -> None:
        self._metadata = ToolMetadata(
            id="example-tool",
            name="Example Tool",
            title="範例工具模組",
            description="用於展示如何快速開發並擴充新工具至 Toolbox 平台的標準範本。",
            category="開發者範本",
            icon="Code",
            version="1.0.0",
            status="beta",
            entry_url="/tools/example",
            routes=[
                ToolRoute(path="/tools/example", label="範例首頁", description="範例工具首頁"),
            ],
            required_scopes=[],
            tags=["example", "template", "developer"],
        )
        self._router: Optional[APIRouter] = None

    @property
    def metadata(self) -> ToolMetadata:
        return self._metadata

    @property
    def router(self) -> Optional[APIRouter]:
        if self._router is None:
            r = APIRouter(prefix="/example", tags=["Example Tool"])

            @r.get("/ping")
            def ping() -> Dict[str, Any]:
                return {"message": "pong from example tool", "status": "active"}

            self._router = r
        return self._router
