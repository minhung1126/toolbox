from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.app.api import weverse_uploader as api
from backend.app.core.weverse_upload_store import WeverseUploadStore
from backend.app.main import create_app
from backend.app.services.weverse_captions import caption_plan, public_task, upload_captions
from backend.app.services.weverse_uploader_service import execute_upload_task


class Captions:
    def __init__(self, *, items=None, failure=None):
        self.items = items or []
        self.failure = failure
        self.inserts = []
        self.operation = None

    def captions(self):
        return self

    def list(self, **kwargs):
        self.operation = "list"
        return self

    def insert(self, **kwargs):
        self.inserts.append(kwargs)
        self.operation = "insert"
        return self

    def execute(self):
        if self.operation == "list":
            return {"items": self.items}
        if self.failure:
            raise self.failure
        return {"id": "caption-new"}


def inputs(tmp_path):
    path = tmp_path / "en.vtt"
    path.write_text("WEBVTT")
    subtitles = [{"filename": path.name, "full_path": str(path), "bcp47": "en", "label": "English"}]
    return subtitles, caption_plan(subtitles)


def run(provider, subtitles, results, reconcile=False):
    snapshots = []
    outcome = upload_captions(
        provider,
        "video-existing",
        subtitles,
        results,
        checkpoint=lambda patch: snapshots.append(deepcopy(patch)),
        check_stopping=lambda: None,
        reconcile=reconcile,
    )
    return outcome, snapshots


def test_caption_timeout_is_checkpointed_and_does_not_leak_provider_error(tmp_path):
    subtitles, results = inputs(tmp_path)
    provider = Captions(failure=TimeoutError("secret credential"))
    outcome, snapshots = run(provider, subtitles, results)
    assert outcome[0]["status"] == "unknown"
    assert any(patch.get("caption_results", [{}])[0].get("status") == "unknown" for patch in snapshots)
    assert "secret credential" not in str(outcome)
    assert len(provider.inserts) == 1
    # An empty read might be eventually consistent: it must not cause a duplicate.
    run(provider, subtitles, outcome, reconcile=True)
    assert len(provider.inserts) == 1


def test_retry_reconciles_committed_caption_without_inserting(tmp_path):
    subtitles, results = inputs(tmp_path)
    results[0]["status"] = "unknown"
    provider = Captions(items=[{"id": "already-committed", "snippet": {"language": "en", "name": "English"}}])
    outcome, _ = run(provider, subtitles, results, reconcile=True)
    assert outcome[0]["caption_id"] == "already-committed"
    assert outcome[0]["reconciled"]
    assert provider.inserts == []


def test_retry_skips_uploaded_tracks_and_uploads_only_missing(tmp_path):
    subtitles, results = inputs(tmp_path)
    results.insert(
        0, {"filename": "ko.vtt", "language": "ko", "name": "Korean", "status": "uploaded", "caption_id": "old"}
    )
    provider = Captions()
    outcome, _ = run(provider, subtitles, results, reconcile=True)
    assert len(provider.inserts) == 1
    assert provider.inserts[0]["body"]["snippet"]["videoId"] == "video-existing"
    assert all(item["status"] == "uploaded" for item in outcome)


def test_caption_only_worker_never_creates_video_and_preserves_partial_result(tmp_path):
    subtitles, results = inputs(tmp_path)
    provider = Captions(failure=RuntimeError("private provider details"))
    store = WeverseUploadStore(tmp_path / "tasks.json")
    store.create_task("owner", {"task_id": "retry", "status": "pending", "video_id": "known"})
    execute_upload_task(
        "owner",
        "retry",
        object(),
        "",
        "title",
        "",
        "private",
        subtitles,
        store=store,
        service_factory=lambda _: provider,
        existing_video_id="known",
        caption_results=results,
    )
    task = store.get_task("owner", "retry")
    assert task["status"] == "completed"
    assert task["failed_captions"][0]["status"] == "unknown"
    assert "private provider details" not in str(task)


def test_legacy_provider_errors_are_sanitized_without_mutating_store():
    original = {"error_message": "secret", "current_step": "secret", "failed_captions": [{"error": "token"}]}
    assert "secret" not in str(public_task(original))
    assert "token" not in str(public_task(original))
    assert original["error_message"] == "secret"


def test_retry_claim_is_atomic_and_account_scoped(tmp_path):
    store = WeverseUploadStore(tmp_path / "tasks.json")
    parent = store.create_task("owner", {"task_id": "parent", "status": "completed"})

    def claim(index):
        try:
            store.create_caption_retry("owner", "parent", parent["updated_at"], {"task_id": f"child-{index}"})
            return True
        except ValueError:
            return False

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sum(pool.map(claim, [1, 2])) == 1
    with pytest.raises(ValueError):
        store.create_caption_retry("other", "parent", parent["updated_at"], {"task_id": "intruder"})


def test_retry_http_rejects_cross_owner_stale_and_wrong_channel_then_queues_child(tmp_path):
    store = WeverseUploadStore(tmp_path / "tasks.json")
    _, results = inputs(tmp_path)
    parent = store.create_task(
        "owner",
        {
            "task_id": "parent",
            "status": "completed",
            "title": "Title",
            "video_id": "known",
            "video_url": "https://youtu.be/known",
            "channel_id": "channel",
            "caption_results": results,
        },
    )
    queued = []
    worker = SimpleNamespace(store=store, enqueue=lambda **kw: queued.append(kw), is_task_running=lambda *_: False)
    context = SimpleNamespace(owner_sub="other", channel_id="channel", credentials=object())
    app = create_app(upload_worker=worker, dependency_overrides={api.require_video_uploader_context: lambda: context})
    client = TestClient(app)

    def post(revision):
        return client.post(
            "/api/v1/weverse-uploader/tasks/parent/retry-captions",
            data={"expected_updated_at": revision},
            files={"subtitles": ("en.vtt", b"WEBVTT", "text/vtt")},
            headers={"Origin": "http://localhost:3000"},
        )

    assert post(parent["updated_at"]).status_code == 404
    context.owner_sub = "owner"
    context.channel_id = "wrong"
    assert post(parent["updated_at"]).status_code == 409
    context.channel_id = "channel"
    assert post("stale").status_code == 409
    response = post(parent["updated_at"])
    assert response.status_code == 200
    assert queued[0]["existing_video_id"] == "known"
    assert queued[0]["video_path"] == ""
    assert store.get_task("owner", "parent")["retry_task_id"] == response.json()["task_id"]
    assert post(parent["updated_at"]).status_code == 409
    assert len(queued) == 1


def test_unverifiable_remote_listing_never_inserts(tmp_path):
    subtitles, results = inputs(tmp_path)

    class InvalidListing(Captions):
        def execute(self):
            return {"items": [{"id": "private-track", "snippet": {}}]}

    provider = InvalidListing()
    with pytest.raises(ValueError):
        run(provider, subtitles, results, reconcile=True)
    assert provider.inserts == []


def test_persistence_failure_before_caption_insert_prevents_provider_write(tmp_path):
    subtitles, results = inputs(tmp_path)
    provider = Captions()

    def fail_before_insert(patch):
        if patch.get("caption_results"):
            raise OSError("disk unavailable")

    with pytest.raises(OSError):
        upload_captions(
            provider, "known", subtitles, results, checkpoint=fail_before_insert, check_stopping=lambda: None
        )
    assert provider.inserts == []


def test_restart_preserves_per_caption_evidence(tmp_path):
    store = WeverseUploadStore(tmp_path / "tasks.json")
    _, results = inputs(tmp_path)
    results[0]["status"] = "unknown"
    store.create_task(
        "owner", {"task_id": "task", "status": "uploading_captions", "video_id": "known", "caption_results": results}
    )
    assert store.mark_active_tasks_interrupted() == 1
    task = store.get_task("owner", "task")
    assert task["status"] == "interrupted"
    assert task["caption_results"][0]["status"] == "unknown"
    assert task["video_id"] == "known"


@pytest.mark.parametrize("video_id", [None, "", {"invalid": "id"}])
def test_unverifiable_video_response_is_never_reported_as_completed(tmp_path, video_id):
    video = tmp_path / "video.mp4"
    video.write_bytes(b"video")

    class InvalidVideo:
        def videos(self):
            return self

        def insert(self, **kwargs):
            return self

        def next_chunk(self):
            return None, {"id": video_id}

        def captions(self):
            pytest.fail("No caption write without a verified video ID")

    store = WeverseUploadStore(tmp_path / "tasks.json")
    store.create_task("owner", {"task_id": "task", "status": "pending"})
    execute_upload_task(
        "owner",
        "task",
        object(),
        str(video),
        "Title",
        "",
        "private",
        [],
        store=store,
        service_factory=lambda _: InvalidVideo(),
    )
    assert store.get_task("owner", "task")["status"] == "failed"
