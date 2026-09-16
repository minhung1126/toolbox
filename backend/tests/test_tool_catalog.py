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
