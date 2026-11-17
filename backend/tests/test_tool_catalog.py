import re
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.main import app


def test_tool_catalog_lists_registered_tools():
    client = TestClient(app)
    response = client.get(
        "/api/v1/tools",
        headers={"Origin": "http://localhost:3000"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["platform"] == "Toolbox"
    assert data["total_tools"] >= 1
    tool_ids = [t["id"] for t in data["tools"]]
    assert "creator-tools" in tool_ids
    assert "sheets-tools" in tool_ids
    assert "sticky-notes" in tool_ids
    assert "youtube-integrations" in tool_ids
    assert "system-utility" in tool_ids
    assert "youtube-music" in tool_ids


def test_tool_catalog_get_tool_detail():
    client = TestClient(app)
    response = client.get(
        "/api/v1/tools/creator-tools",
        headers={"Origin": "http://localhost:3000"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["found"] is True
    assert data["tool"]["name"] == "Creator Tools"
    assert len(data["tool"]["routes"]) > 0


def test_tool_catalog_get_ytmusic_detail():
    client = TestClient(app)
    response = client.get(
        "/api/v1/tools/youtube-music",
        headers={"Origin": "http://localhost:3000"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["found"] is True
    assert data["tool"]["name"] == "YouTube Music"
    assert data["tool"]["category"] == "YouTube Music"
    assert data["tool"]["entry_url"] == "/ytmusic/playlist-sort"


def test_tool_catalog_not_found():
    client = TestClient(app)
    response = client.get(
        "/api/v1/tools/non-existent-tool",
        headers={"Origin": "http://localhost:3000"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["found"] is False


def test_backend_tool_catalog_matches_frontend_manifest_contract():
    """Keep plugin IDs and declared routes aligned with frontend navigation paths."""
    repository_root = Path(__file__).resolve().parents[2]
    paths_source = (repository_root / "frontend/src/routes/paths.js").read_text(encoding="utf-8")

    manifest_paths = sorted((repository_root / "frontend/src/features").rglob("manifest.js"))
    frontend_module_ids = []
    for manifest_path in manifest_paths:
        manifest_source = manifest_path.read_text(encoding="utf-8")
        match = re.search(r"const manifest = \{\s*id: ['\"]([^'\"]+)['\"]", manifest_source)
        assert match is not None, f"Frontend feature manifest has no top-level id: {manifest_path}"
        frontend_module_ids.append(match.group(1))
    assert frontend_module_ids, "Frontend feature manifests were not found."
    assert len(frontend_module_ids) == len(set(frontend_module_ids)), "Frontend feature IDs must be unique."
    frontend_module_ids = set(frontend_module_ids)
    paths_match = re.search(
        r"export const PATHS = Object\.freeze\(\{(?P<paths>.*?)\n\}\);",
        paths_source,
        flags=re.DOTALL,
    )
    assert paths_match is not None, "Frontend route constants are missing or have changed shape."
    frontend_paths = set(re.findall(r"(?m)^\s*[^:/\n]+:\s*['\"](/[^'\"]*)['\"]", paths_match.group("paths")))

    response = TestClient(app).get("/api/v1/tools")
    assert response.status_code == 200
    tools = response.json()["tools"]
    backend_module_ids = {tool["id"] for tool in tools}
    backend_paths = {
        path for tool in tools for path in [tool["entry_url"], *(route["path"] for route in tool["routes"])]
    }

    scope_contract = {
        "creator-tools": ["youtube", "sheets_readonly"],
        "youtube-music": ["youtube"],
        "sheets-tools": ["sheets_readonly"],
        "youtube-integrations": ["youtube"],
    }

    assert backend_module_ids == frontend_module_ids
    assert backend_paths <= frontend_paths, f"Frontend is missing backend tool routes: {backend_paths - frontend_paths}"
    assert {tool["id"]: tool["required_scopes"] for tool in tools if tool["required_scopes"]} == scope_contract

    routes_by_tool = {tool["id"]: {route["path"]: route for route in tool["routes"]} for tool in tools}
    assert routes_by_tool["creator-tools"]["/youtube/drafts/videos"]["required_scopes"] == [
        "youtube",
        "sheets_readonly",
    ]
    assert routes_by_tool["creator-tools"]["/youtube/publish-cleanup"]["required_scopes"] == ["youtube"]
    assert routes_by_tool["youtube-music"]["/ytmusic/settings"]["required_scopes"] == []
    assert routes_by_tool["sheets-tools"]["/sheets/settings"]["required_scopes"] == []
    assert routes_by_tool["youtube-integrations"]["/youtube/settings/connections"]["required_scopes"] == []


def test_tool_capability_copy_matches_runtime_and_does_not_promise_missing_writes():
    """Metadata copy stays aligned without a second tool registry."""
    tools = {tool["id"]: tool for tool in TestClient(app).get("/api/v1/tools").json()["tools"]}
    root = Path(__file__).resolve().parents[2]
    for manifest in (root / "frontend/src/features").rglob("manifest.js"):
        source = manifest.read_text(encoding="utf-8")
        tool_id = re.search(r"^  id: '([^']+)'", source, re.M)[1]
        description = re.search(r"^  description:\s*'([^']+)'", source, re.M)[1]
        assert description == tools[tool_id]["description"]
    assert tools["sheets-tools"]["required_scopes"] == ["sheets_readonly"]
    assert "剪貼簿" in tools["sheets-tools"]["description"]
    assert "立即公開" in tools["creator-tools"]["description"]
    assert "排程" not in tools["creator-tools"]["description"]
    readme = (root / "README.md").read_text(encoding="utf-8")
    assert "**Google Drive 批次上傳**" not in readme
    assert "**Google Sheets 雙向連動**" not in readme
    capabilities = (root / "docs/TOOL_CAPABILITIES.md").read_text(encoding="utf-8")
    for tool_id in tools:
        assert f"| {tool_id} |" in capabilities
