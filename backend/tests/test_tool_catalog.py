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
    frontend_catalog = (repository_root / "frontend/src/tools/catalog.js").read_text(encoding="utf-8")
    paths_source = (repository_root / "frontend/src/routes/paths.js").read_text(encoding="utf-8")

    frontend_module_ids = set(re.findall(r"(?m)^    id: ['\"]([^'\"]+)['\"],$", frontend_catalog))
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

    assert backend_module_ids == frontend_module_ids
    assert backend_paths <= frontend_paths, f"Frontend is missing backend tool routes: {backend_paths - frontend_paths}"
