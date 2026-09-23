"""Unit tests for Weverse Video Uploader plugin, scanner, store, and APIs."""

from pathlib import Path

import pytest
from fastapi import Request
from fastapi.testclient import TestClient

from backend.app.api import auth
from backend.app.core.security import GOOGLE_OAUTH_STATE_SALT, sign_timed_data
from backend.app.core.weverse_upload_store import WeverseUploadStore
from backend.app.main import app
from backend.app.services.weverse_scanner import (
    clean_default_title,
    map_language,
    parse_browser_file_list,
    parse_subtitle_info,
    scan_local_path,
)
from backend.app.tools.builtin.weverse_uploader import WeverseUploaderPlugin
from backend.app.tools.registry import tool_registry


def test_weverse_uploader_plugin_metadata():
    plugin = WeverseUploaderPlugin()
    assert plugin.metadata.id == "weverse-uploader"
    assert plugin.metadata.name == "Weverse Uploader"
    assert plugin.metadata.title == "Weverse 影片上傳"
    assert plugin.metadata.category == "影音創作"
    assert plugin.metadata.entry_url == "/weverse-uploader"
    assert plugin.metadata.status == "active"
    assert tool_registry.get("weverse-uploader") is not None


def test_weverse_16_language_mappings():
    expected_mappings = {
        "ar": "ar",
        "de_DE": "de",
        "en_US": "en-US",
        "es_ES": "es",
        "fr_FR": "fr",
        "hi_IN": "hi",
        "id_ID": "id",
        "it_IT": "it",
        "ja_JP": "ja",
        "ko_KR": "ko",
        "pt_PT": "pt-PT",
        "ru_RU": "ru",
        "th_TH": "th",
        "vi_VN": "vi",
        "zh_CN": "zh-CN",
        "zh_TW": "zh-TW",
    }
    for raw_code, expected_bcp47 in expected_mappings.items():
        info = map_language(raw_code)
        assert info["bcp47"] == expected_bcp47, f"Failed for {raw_code}"
        assert info["raw_code"] == raw_code
        assert len(info["label"]) > 0

    # Custom language fallback
    custom = map_language("nl_BE")
    assert custom["bcp47"] == "nl-BE"
    assert "自訂語言" in custom["label"]


def test_parse_subtitle_info():
    res = parse_subtitle_info("20260923_LIVE_01.zh_TW.vtt", size=1024, full_path="/path/test.vtt")
    assert res is not None
    assert res["bcp47"] == "zh-TW"
    assert res["raw_lang"] == "zh_TW"
    assert "繁體中文" in res["label"]
    assert res["size_bytes"] == 1024
    assert res["enabled"] is True

    # Non-subtitle file
    assert parse_subtitle_info("video.mp4") is None


def test_clean_default_title():
    assert clean_default_title("20260923_Artist_Live_3-241665049.mp4") == "20260923 Artist Live 3-241665049"
    assert clean_default_title("simple_title") == "simple title"


def test_scan_local_path(tmp_path: Path):
    folder = tmp_path / "20260923_Live_3-241665049"
    folder.mkdir()

    # Create dummy video and subtitle files
    (folder / "20260923_Live_3-241665049.mp4").write_bytes(b"dummy video content")
    (folder / "20260923_Live_3-241665049.zh_TW.vtt").write_text(
        "WEBVTT\n1\n00:00.000 --> 00:01.000\n你好", encoding="utf-8"
    )
    (folder / "20260923_Live_3-241665049.ko_KR.vtt").write_text(
        "WEBVTT\n1\n00:00.000 --> 00:01.000\n안녕하세요", encoding="utf-8"
    )
    (folder / "20260923_Live_3-241665049.en_US.vtt").write_text(
        "WEBVTT\n1\n00:00.000 --> 00:01.000\nHello", encoding="utf-8"
    )

    # Scan the package directory directly
    res = scan_local_path(str(folder))
    assert res["packages_count"] == 1
    pkg = res["packages"][0]
    assert pkg["video"]["filename"] == "20260923_Live_3-241665049.mp4"
    assert len(pkg["subtitles"]) == 3
    sub_langs = {s["bcp47"] for s in pkg["subtitles"]}
    assert sub_langs == {"zh-TW", "ko", "en-US"}

    # Scan parent directory containing package directory
    parent_res = scan_local_path(str(tmp_path))
    assert parent_res["packages_count"] == 1
    assert parent_res["packages"][0]["video"]["filename"] == "20260923_Live_3-241665049.mp4"


def test_scan_invalid_path(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        scan_local_path(str(tmp_path / "non_existent_folder_xyz"))


def test_parse_browser_file_list():
    files = [
        {"name": "test.mp4", "size": 5000000, "relative_path": "20260923_Live/test.mp4"},
        {"name": "test.zh_TW.vtt", "size": 15000, "relative_path": "20260923_Live/test.zh_TW.vtt"},
        {"name": "test.ja_JP.vtt", "size": 14000, "relative_path": "20260923_Live/test.ja_JP.vtt"},
    ]
    res = parse_browser_file_list(files)
    assert res["packages_count"] == 1
    pkg = res["packages"][0]
    assert pkg["video"]["filename"] == "test.mp4"
    assert len(pkg["subtitles"]) == 2
    assert pkg["subtitles"][0]["bcp47"] == "zh-TW"
    assert pkg["subtitles"][1]["bcp47"] == "ja"


def test_weverse_upload_store(tmp_path: Path):
    store = WeverseUploadStore(tmp_path / "test_uploads.json")
    user_sub = "test-user-123"

    task = {
        "task_id": "task-abc",
        "title": "Test Title",
        "status": "pending",
        "progress_percent": 0,
    }
    store.create_task(user_sub, task)

    saved = store.get_task(user_sub, "task-abc")
    assert saved is not None
    assert saved["title"] == "Test Title"

    store.update_task(user_sub, "task-abc", {"status": "completed", "progress_percent": 100})
    updated = store.get_task(user_sub, "task-abc")
    assert updated["status"] == "completed"
    assert updated["progress_percent"] == 100

    tasks = store.list_tasks(user_sub)
    assert len(tasks) == 1

    # Recent paths
    store.record_recent_path(user_sub, "C:\\downloads\\weverse")
    paths = store.get_recent_paths(user_sub)
    assert "C:\\downloads\\weverse" in paths


def test_unauthorized_upload_access():
    client = TestClient(app)
    # Origin required by CSRF protection
    headers = {"Origin": "http://localhost:3000"}

    # Attempt scanning without login
    scan_resp = client.post("/api/v1/weverse-uploader/scan", json={"folder_path": "C:\\temp"}, headers=headers)
    assert scan_resp.status_code == 401

    # Attempt uploading without login
    upload_resp = client.post(
        "/api/v1/weverse-uploader/upload-from-path",
        json={"video_path": "C:\\video.mp4", "title": "Test"},
        headers=headers,
    )
    assert upload_resp.status_code == 401


def test_video_uploader_oauth_callback_success(monkeypatch):
    payload = sign_timed_data(
        {
            "flow_type": auth.VIDEO_UPLOADER_FLOW,
            "state": "test-state",
            "code_verifier": "test-verifier",
            "session_id": "sess-video-1",
        },
        salt=GOOGLE_OAUTH_STATE_SALT,
    )
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/auth/callback",
            "headers": [(b"cookie", f"{auth.OAUTH_FLOW_COOKIE}={payload}".encode())],
            "query_string": b"code=test-code&state=test-state",
            "server": ("testserver", 80),
        }
    )
    monkeypatch.setattr(auth, "_validate_callback_session", lambda req, state: "owner-video-sub")
    saved_conns = []
    monkeypatch.setattr(
        auth.credential_store,
        "save_video_uploader_connection",
        lambda token_dict, owner_sub: saved_conns.append((token_dict, owner_sub)),
    )
    monkeypatch.setattr(
        auth,
        "exchange_code_for_tokens",
        lambda **kwargs: {"token": "uploader-token", "user": {"email": "artist@weverse.io"}},
    )
    response = auth.google_oauth_callback(request, code="test-code", state="test-state")
    assert response.status_code == 307
    assert "#video_uploader_auth_success=1" in response.headers["location"]
    assert len(saved_conns) == 1
    assert saved_conns[0][1] == "owner-video-sub"


def test_video_uploader_oauth_callback_error():
    payload = sign_timed_data(
        {
            "flow_type": auth.VIDEO_UPLOADER_FLOW,
            "state": "test-state",
            "code_verifier": "test-verifier",
            "session_id": "sess-video-1",
        },
        salt=GOOGLE_OAUTH_STATE_SALT,
    )
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/auth/callback",
            "headers": [(b"cookie", f"{auth.OAUTH_FLOW_COOKIE}={payload}".encode())],
            "query_string": b"error=access_denied",
            "server": ("testserver", 80),
        }
    )
    response = auth.google_oauth_callback(request, error="access_denied")
    assert response.status_code == 307
    assert "video_uploader_auth_error=" in response.headers["location"]
