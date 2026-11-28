from types import SimpleNamespace

from fastapi.testclient import TestClient

from backend.app.api.photo_curator import _sanitize_md
from backend.app.core.dependencies import require_login_credentials
from backend.app.main import create_app


def _authed_client():
    return TestClient(create_app(dependency_overrides={require_login_credentials: lambda: SimpleNamespace(valid=True)}))


def test_photo_curator_endpoints_require_authentication():
    client = TestClient(create_app())
    assert client.get("/api/v1/photo-curator/presets").status_code == 401
    assert client.post("/api/v1/photo-curator/checklist", json={}).status_code == 401


def test_photo_curator_presets_api():
    client = _authed_client()
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


def test_photo_curator_checklist_api():
    client = _authed_client()
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
    resp = client.post("/api/v1/photo-curator/checklist", json=payload, headers={"Origin": "http://localhost:3000"})
    assert resp.status_code == 200
    data = resp.json()
    assert "markdown_checklist" in data
    assert "【Post 1】空間大景" in data["markdown_checklist"]
    assert "01_COVER_room.jpg" in data["markdown_checklist"]
    assert "發布時間預計在週日晚間 8 點。" in data["markdown_checklist"]


def test_photo_curator_sanitizes_newlines_and_enforces_bounds():
    assert _sanitize_md("hello\r\n## injected `code`") == "hello## injected 'code'"

    client = _authed_client()
    resp_posts = client.post(
        "/api/v1/photo-curator/checklist",
        json={"posts": [{"post_index": 1} for _ in range(11)]},
    )
    assert resp_posts.status_code == 422

    resp_long_filename = client.post(
        "/api/v1/photo-curator/checklist",
        json={"unassigned_filenames": ["a" * 501]},
    )
    assert resp_long_filename.status_code == 422

    resp_too_many_unassigned = client.post(
        "/api/v1/photo-curator/checklist",
        json={"unassigned_filenames": [f"{i}.jpg" for i in range(501)]},
    )
    assert resp_too_many_unassigned.status_code == 422

    resp_too_many_photos = client.post(
        "/api/v1/photo-curator/checklist",
        json={"posts": [{"post_index": 1, "photo_count": 501}]},
    )
    assert resp_too_many_photos.status_code == 422

    resp_too_many_filenames = client.post(
        "/api/v1/photo-curator/checklist",
        json={"posts": [{"post_index": 1, "photo_filenames": [f"{i}.jpg" for i in range(501)]}]},
    )
    assert resp_too_many_filenames.status_code == 422
