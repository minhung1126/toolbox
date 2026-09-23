"""Unit tests for Weverse Video Uploader plugin, scanner, store, and APIs."""

import asyncio
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException, Request
from fastapi.testclient import TestClient

from backend.app.api import auth
from backend.app.api import weverse_uploader as weverse_api
from backend.app.core.security import GOOGLE_OAUTH_STATE_SALT, sign_timed_data
from backend.app.core.weverse_upload_store import WeverseUploadStore, WeverseUploadStoreError
from backend.app.main import app
from backend.app.services import weverse_uploader_service as upload_service
from backend.app.services.weverse_scanner import (
    clean_default_title,
    map_language,
    parse_browser_file_list,
    parse_subtitle_info,
    scan_local_path,
)
from backend.app.tools.builtin import weverse_uploader as weverse_plugin_module
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


def test_weverse_upload_store_serializes_process_updates(tmp_path: Path):
    data_file = tmp_path / "process_uploads.json"
    store = WeverseUploadStore(data_file)
    worker_script = """
import sys
from pathlib import Path
from backend.app.core.weverse_upload_store import WeverseUploadStore

store = WeverseUploadStore(Path(sys.argv[1]))
worker_id = int(sys.argv[2])
for index in range(8):
    task_id = f"worker-{worker_id}-task-{index}"
    store.create_task("shared-user", {"task_id": task_id, "status": "pending"})
"""
    project_root = Path(__file__).resolve().parents[2]
    processes = [
        subprocess.Popen(
            [sys.executable, "-c", worker_script, str(data_file), str(worker_id)],
            cwd=project_root,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        for worker_id in range(4)
    ]

    try:
        results = [process.communicate(timeout=30) for process in processes]
    finally:
        for process in processes:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)

    failures = [
        (process.returncode, stdout, stderr)
        for process, (stdout, stderr) in zip(processes, results, strict=True)
        if process.returncode != 0
    ]
    assert failures == [], failures
    tasks = store.list_tasks("shared-user", limit=100)
    assert len(tasks) == 32
    assert {task["task_id"] for task in tasks} == {
        f"worker-{worker_id}-task-{index}" for worker_id in range(4) for index in range(8)
    }


def test_weverse_upload_store_marks_active_work_interrupted_without_retry(tmp_path: Path):
    store = WeverseUploadStore(tmp_path / "interrupted_uploads.json")
    active_statuses = ("pending", "uploading_video", "uploading_captions")
    for index, status in enumerate(active_statuses):
        store.create_task("user-one", {"task_id": f"active-{index}", "status": status})
    store.create_task("user-one", {"task_id": "completed", "status": "completed"})
    store.create_task("user-two", {"task_id": "failed", "status": "failed"})

    assert store.mark_active_tasks_interrupted() == 3

    for index in range(len(active_statuses)):
        task = store.get_task("user-one", f"active-{index}")
        assert task["status"] == "interrupted"
        assert "檢查 YouTube Studio" in task["current_step"]
        assert task["error_message"] == task["current_step"]
    assert store.get_task("user-one", "completed")["status"] == "completed"
    assert store.get_task("user-two", "failed")["status"] == "failed"
    assert store.mark_active_tasks_interrupted() == 0


def test_weverse_plugin_startup_runs_interrupted_task_reconciliation(monkeypatch):
    recovered = []
    monkeypatch.setattr(
        weverse_plugin_module,
        "recover_interrupted_upload_tasks",
        lambda: recovered.append(True) or 2,
    )

    asyncio.run(WeverseUploaderPlugin().on_startup(None))

    assert recovered == [True]


def test_weverse_upload_store_preserves_corrupted_data_and_fails_closed(tmp_path: Path):
    data_file = tmp_path / "corrupted_uploads.json"
    original = "{not valid JSON"
    data_file.write_text(original, encoding="utf-8")
    store = WeverseUploadStore(data_file)

    with pytest.raises(WeverseUploadStoreError, match="無法讀取"):
        store.create_task("test-user", {"task_id": "must-not-be-saved"})

    assert data_file.read_text(encoding="utf-8") == original


def test_weverse_upload_store_propagates_write_failure(tmp_path: Path, monkeypatch):
    from backend.app.core import weverse_upload_store as module

    store = WeverseUploadStore(tmp_path / "uploads.json")

    def fail_write(*args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(module, "atomic_write_json", fail_write)
    with pytest.raises(WeverseUploadStoreError, match="無法儲存"):
        store.create_task("test-user", {"task_id": "unsaved"})
    assert store.data_file.read_text(encoding="utf-8") == "{}"


def test_weverse_queue_failure_marks_task_failed_and_removes_uploaded_files(tmp_path: Path, monkeypatch):
    store = WeverseUploadStore(tmp_path / "queue_failure.json")
    task_id = "queue-failure"
    owner_sub = "test-user"
    store.create_task(owner_sub, {"task_id": task_id, "status": "pending"})
    upload_dir = tmp_path / "uploaded-files"
    upload_dir.mkdir()
    (upload_dir / "video.mp4").write_bytes(b"video")

    def reject_upload(**_kwargs):
        raise RuntimeError("executor is closed")

    monkeypatch.setattr(weverse_api, "weverse_upload_store", store)
    monkeypatch.setattr(weverse_api, "enqueue_upload_task", reject_upload)

    with pytest.raises(HTTPException) as error:
        weverse_api._enqueue_persisted_upload(
            owner_sub,
            task_id,
            credentials=object(),
            video_path=str(upload_dir / "video.mp4"),
            title="Test",
            description="",
            privacy_status="private",
            subtitles=[],
            temp_dir_to_clean=str(upload_dir),
        )

    assert error.value.status_code == 503
    assert error.value.detail["code"] == "upload_queue_unavailable"
    assert store.get_task(owner_sub, task_id)["status"] == "failed"
    assert not upload_dir.exists()


def test_upload_worker_is_created_on_demand_and_drained_by_plugin_shutdown(monkeypatch):
    import asyncio

    submitted = []
    shutdown = []

    class ExecutorStub:
        def __init__(self, **kwargs):
            self.options = kwargs

        def submit(self, function, **kwargs):
            submitted.append((function, kwargs))
            return "submitted"

        def shutdown(self, *, wait, cancel_futures):
            shutdown.append((wait, cancel_futures))

    monkeypatch.setattr(upload_service, "_upload_executor", None)
    monkeypatch.setattr(upload_service, "ThreadPoolExecutor", ExecutorStub)

    result = upload_service.enqueue_upload_task(
        owner_sub="test-user",
        task_id="task-1",
        credentials=object(),
        video_path="video.mp4",
        title="Test",
        description="",
        privacy_status="private",
        subtitles=[],
    )

    asyncio.run(WeverseUploaderPlugin().on_shutdown(None))

    assert result == "submitted"
    assert len(submitted) == 1
    assert shutdown == [(True, False)]
    assert upload_service._upload_executor is None


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
