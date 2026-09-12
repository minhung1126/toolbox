from fastapi import APIRouter
from fastapi.testclient import TestClient

from backend.app import main
from backend.app.tools.base import ToolMetadata, ToolPlugin, ToolRoute
from backend.app.tools.builtin import register_builtin_tools
from backend.app.tools.registry import ToolRegistry, tool_registry


def test_builtin_tools_are_registered():
    """Verify built-in tools (creator-tools, system-utility) are properly registered."""
    register_builtin_tools()
    metadata = tool_registry.list_metadata()
    tool_ids = {m.id for m in metadata}

    assert "creator-tools" in tool_ids
    assert "sheets-tools" in tool_ids
    assert "sticky-notes" in tool_ids
    assert "youtube-integrations" in tool_ids
    assert "system-utility" in tool_ids

    creator_tool = tool_registry.get("creator-tools")
    assert creator_tool is not None
    assert creator_tool.metadata.name == "Creator Tools"
    assert len(creator_tool.metadata.routes) > 0

    sheets_tool = tool_registry.get("sheets-tools")
    assert sheets_tool is not None
    assert len(sheets_tool.metadata.routes) > 0

    integrations_tool = tool_registry.get("youtube-integrations")
    assert integrations_tool is not None
    assert len(integrations_tool.metadata.routes) > 0


def test_custom_tool_registration_and_lifecycle():
    """Verify dynamic registration, router mounting, and unregistration of custom tools."""
    registry = ToolRegistry()

    class DemoPlugin(ToolPlugin):
        def __init__(self):
            self.startup_called = False
            self.shutdown_called = False

        @property
        def metadata(self) -> ToolMetadata:
            return ToolMetadata(
                id="demo-plugin",
                name="Demo Plugin",
                title="展示外掛",
                description="Testing plugin lifecycle",
                entry_url="/demo",
                routes=[ToolRoute(path="/demo", label="Demo")],
            )

        @property
        def router(self) -> APIRouter:
            r = APIRouter(prefix="/demo")

            @r.get("/hello")
            def hello():
                return {"msg": "hello"}

            return r

        async def on_startup(self, app):
            self.startup_called = True

        async def on_shutdown(self, app):
            self.shutdown_called = True

    plugin = DemoPlugin()
    registry.register(plugin)

    assert registry.get("demo-plugin") is plugin
    meta = registry.get_metadata("demo-plugin")
    assert meta is not None
    assert meta.id == "demo-plugin"

    # Test router mounting
    test_app = main.FastAPI()
    parent_router = APIRouter()
    registry.mount_routers(parent_router)
    test_app.include_router(parent_router)
    client = TestClient(test_app)
    res = client.get("/demo/hello")
    assert res.status_code == 200
    assert res.json() == {"msg": "hello"}

    # Test health check
    health = registry.health_check()
    assert health["demo-plugin"]["status"] == "ok"

    # Test unregister
    unregistered = registry.unregister("demo-plugin")
    assert unregistered is plugin
    assert registry.get("demo-plugin") is None


def test_tools_catalog_api():
    """Verify GET /api/v1/tools and GET /api/v1/tools/{tool_id} return expected data."""
    client = TestClient(main.app)

    res = client.get("/api/v1/tools")
    assert res.status_code == 200
    data = res.json()
    assert data["platform"] == "Toolbox"
    assert data["total_tools"] >= 2
    tool_ids = [t["id"] for t in data["tools"]]
    assert "creator-tools" in tool_ids

    # Detail query
    res_detail = client.get("/api/v1/tools/creator-tools")
    assert res_detail.status_code == 200
    detail_data = res_detail.json()
    assert detail_data["found"] is True
    assert detail_data["tool"]["id"] == "creator-tools"
    assert "routes" in detail_data["tool"]

    # Missing tool query
    res_missing = client.get("/api/v1/tools/non-existent-tool")
    assert res_missing.status_code == 200
    assert res_missing.json()["found"] is False
