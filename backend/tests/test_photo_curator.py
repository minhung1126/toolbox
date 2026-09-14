from fastapi.testclient import TestClient

from backend.app.core.dependencies import require_account_subject
from backend.app.main import app
from backend.app.tools.builtin.photo_curator import PhotoCuratorPlugin
from backend.app.tools.registry import tool_registry


def test_photo_curator_plugin_metadata():
    plugin = PhotoCuratorPlugin()
    assert plugin.metadata.id == "photo-curator"
    assert plugin.metadata.name == "Photo Curator"
    assert plugin.metadata.status == "active"
    assert plugin.metadata.entry_url == "/photo-curator"
    assert tool_registry.get("photo-curator") is not None


def test_photo_curator_presets_api():
    client = TestClient(app)

    # 1. Unauthenticated request should return 401
    unauth_resp = client.get("/api/v1/photo-curator/presets", headers={"Origin": "http://localhost:3000"})
    assert unauth_resp.status_code == 401

    # 2. Authenticated request
    app.dependency_overrides[require_account_subject] = lambda: "mock_test_subject"
    try:
        resp = client.get("/api/v1/photo-curator/presets", headers={"Origin": "http://localhost:3000"})
        assert resp.status_code == 200
        presets = resp.json()
        assert isinstance(presets, list)
        assert len(presets) >= 3

        theme_perspective = next((p for p in presets if p["id"] == "theme-perspective"), None)
        assert theme_perspective is not None
        assert len(theme_perspective["buckets"]) == 3
        assert theme_perspective["buckets"][0]["default_theme"] == "空間大景"
        assert theme_perspective["buckets"][1]["default_theme"] == "人物穿搭"
        assert theme_perspective["buckets"][2]["default_theme"] == "細節美食"
    finally:
        app.dependency_overrides.clear()


def test_photo_curator_checklist_api():
    client = TestClient(app)
    payload = {
        "posts": [
            {
                "post_index": 1,
                "title": "空間大景",
                "cover_filename": "01_COVER_room.jpg",
                "photo_count": 2,
                "photo_filenames": ["01_COVER_room.jpg", "02_window.jpg"],
            },
            {
                "post_index": 2,
                "title": "人物穿搭",
                "cover_filename": "01_COVER_me.jpg",
                "photo_count": 1,
                "photo_filenames": ["01_COVER_me.jpg"],
            },
            {
                "post_index": 3,
                "title": "細節美食",
                "cover_filename": "01_COVER_cake.jpg",
                "photo_count": 1,
                "photo_filenames": ["01_COVER_cake.jpg"],
            },
        ],
        "notes": "發布時間預計在週日晚間 8 點。",
    }

    # 1. Unauthenticated request should return 401
    unauth_resp = client.post(
        "/api/v1/photo-curator/checklist",
        json=payload,
        headers={"Origin": "http://localhost:3000"},
    )
    assert unauth_resp.status_code == 401

    # 2. Authenticated request
    app.dependency_overrides[require_account_subject] = lambda: "mock_test_subject"
    try:
        resp = client.post(
            "/api/v1/photo-curator/checklist",
            json=payload,
            headers={"Origin": "http://localhost:3000"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "markdown_checklist" in data
        assert "【Post 1】空間大景" in data["markdown_checklist"]
        assert "01_COVER_room.jpg" in data["markdown_checklist"]
        assert "發布時間預計在週日晚間 8 點。" in data["markdown_checklist"]
    finally:
        app.dependency_overrides.clear()
