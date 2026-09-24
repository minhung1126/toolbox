from types import SimpleNamespace

from fastapi.testclient import TestClient

from backend.app.core.dependencies import (
    get_authenticated_session,
    require_account_subject,
    require_video_uploader_context,
)
from backend.app.core.notes_store import NotesStore
from backend.app.core.weverse_upload_store import WeverseUploadStore
from backend.app.main import create_app
from backend.app.services.weverse_uploader_service import UploadWorker


def test_factory_isolates_repositories_workers_and_provider_calls(tmp_path):
    calls = []

    class Provider:
        def videos(self):
            return self

        def insert(self, **request):
            calls.append(request["body"]["snippet"]["title"])
            return self

        def next_chunk(self):
            return None, {"id": "provider-video"}

    def configured_app(name):
        root = tmp_path / name
        worker = UploadWorker(WeverseUploadStore(root / "uploads.json"), service_factory=lambda _: Provider())
        application = create_app(
            notes_store=NotesStore(root / "notes.json"),
            upload_worker=worker,
            dependency_overrides={
                require_account_subject: lambda: "same-user",
                get_authenticated_session: lambda: SimpleNamespace(subject="same-user"),
                require_video_uploader_context: lambda: SimpleNamespace(owner_sub="same-user", credentials=object()),
            },
        )
        return application, worker

    first_app, first_worker = configured_app("first")
    second_app, second_worker = configured_app("second")
    first, second = TestClient(first_app), TestClient(second_app)
    video = tmp_path / "sample.mp4"
    video.write_bytes(b"fake video; provider never opens a network connection")
    try:
        assert first.post("/api/v1/notes", json={"content": "First only"}).status_code == 200
        assert second.get("/api/v1/notes").json()["total"] == 0
        response = first.post(
            "/api/v1/weverse-uploader/upload-from-path", json={"video_path": str(video), "title": "Test"}
        )
        assert response.status_code == 200
        assert first_worker.shutdown() == 0
        task_id = response.json()["task_id"]
        task = first.get(f"/api/v1/weverse-uploader/tasks/{task_id}").json()["task"]
        assert task["status"] == "completed"
        assert task["video_id"] == "provider-video"
        assert second.get(f"/api/v1/weverse-uploader/tasks/{task_id}").status_code == 404
        assert second.get("/api/v1/weverse-uploader/history").json()["tasks"] == []
        assert calls == ["Test"]
        assert first_app.state.tool_registry is not second_app.state.tool_registry
    finally:
        first_worker.shutdown()
        second_worker.shutdown()


def test_factory_keeps_workflow_adapters_per_app():
    from starlette.requests import Request

    from backend.app.api.youtube_workflow_dependencies import get_youtube_workflow_service

    first_provider, second_provider = object(), object()
    first = create_app(youtube_workflow_adapters={"fetch_playlist_items": first_provider})
    second = create_app(youtube_workflow_adapters={"fetch_playlist_items": second_provider})
    first_service = get_youtube_workflow_service(Request({"type": "http", "app": first}))
    second_service = get_youtube_workflow_service(Request({"type": "http", "app": second}))
    assert first_service.dependencies["fetch_playlist_items"] is first_provider
    assert second_service.dependencies["fetch_playlist_items"] is second_provider
