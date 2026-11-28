"""HTTP 202, observable progress and crash/ownership boundaries with a fake provider."""

import copy
import subprocess
import sys
import threading
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from test_youtube_draft_publish import Harness, Request, video

from backend.app.api.youtube_models import DraftPublishInput
from backend.app.core.operation_store import OperationStore
from backend.app.services.youtube_publish_jobs import YouTubePublishRunner


@pytest.fixture
def job_harness(tmp_path):
    harness = Harness(tmp_path)
    runner = harness.client.app.state.youtube_publish_runner
    runner.runtime.credential_loader = lambda identity: (harness.context, object())
    runner.start()
    yield harness, runner
    runner.shutdown()


def submit(harness, payload, request_id="request"):
    return harness.client.post("/api/v1/youtube/drafts/publish-jobs", json={**payload, "request_id": request_id})


def wait_terminal(harness, operation_id):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        op = harness.store.get("owner-one", operation_id)
        if op["state"] not in {"prepared", "running"}:
            return op
        threading.Event().wait(0.01)
    pytest.fail("job did not finish")


def block_second(harness, runner):
    entered, release = threading.Event(), threading.Event()
    original = harness.provider.factory

    def factory(*args, **kwargs):
        service = original(*args, **kwargs)
        resource = service.videos()
        update = resource.update

        def blocked_update(**params):
            request = update(**params)

            def call():
                if params["body"]["id"] == "two":
                    entered.set()
                    if not release.wait(5):
                        raise TimeoutError()
                return request.execute()

            return Request(call)

        resource.update = blocked_update
        service.videos = lambda: resource
        return service

    runner.runtime.client_factory = factory
    return entered, release


def test_202_and_first_success_are_visible_while_second_provider_call_is_blocked(job_harness):
    h, runner = job_harness
    entered, release = block_second(h, runner)
    payload, _ = h.preview(h.prepare(people=("Alice", "Alice")))
    try:
        response = submit(h, payload)
        assert response.status_code == 202, response.text
        op_id = response.json()["operation_id"]
        assert len(response.json()["progress"]["rows"]) == 2
        assert entered.wait(3)
        before_reads = len(h.provider.reads)
        observed = h.client.get(f"/api/v1/operations/{op_id}").json()
        assert observed["state"] == "running"
        assert [row["status"] for row in observed["progress"]["rows"]] == ["succeeded", "running"]
        assert len(h.provider.reads) == before_reads
        assert h.client.post(f"/api/v1/operations/{op_id}/reconcile-youtube").status_code == 409
        assert submit(h, payload).json()["operation_id"] == op_id
        found = h.client.get("/api/v1/youtube/drafts/publish-jobs/by-request/request")
        assert found.status_code == 200 and found.json()["id"] == op_id
    finally:
        release.set()
    op = wait_terminal(h, op_id)
    assert op["state"] == "completed"
    assert len(h.provider.writes) == 2
    assert op["progress"]["counts"]["succeeded"] == 2


def test_timeout_keeps_all_rows_and_unchanged_is_not_a_write(job_harness):
    h, _ = job_harness
    h.provider.videos_by_id["three"] = video("three")
    h.provider.members.append("three")
    h.provider.videos_by_id["one"]["snippet"].update(title="Applied title", description="Applied description")
    h.provider.videos_by_id["one"]["status"]["privacyStatus"] = "public"
    h.provider.failures[("primary", "two")] = "timeout_absent"
    payload, _ = h.preview(h.prepare(people=("Alice", "Alice", "Alice")))
    response = submit(h, payload)
    assert response.status_code == 202, response.text
    op = wait_terminal(h, response.json()["operation_id"])
    assert [row["status"] for row in op["progress"]["rows"]] == ["unchanged", "needs_reconciliation", "succeeded"]
    assert sum(op["progress"]["counts"].values()) == 3
    assert [body["id"] for _, _, body in h.provider.writes] == ["two", "three"]


def test_changed_input_and_full_queue_do_not_create_unexecutable_jobs(job_harness):
    h, runner = job_harness
    runner.capacity = threading.BoundedSemaphore(1)
    entered, release = block_second(h, runner)
    payload, _ = h.preview(h.prepare(people=("Alice", "Alice")))
    try:
        response = submit(h, payload)
        assert response.status_code == 202
        assert entered.wait(3)
        changed = copy.deepcopy(payload)
        changed["edits"][0]["title"] = "changed"
        assert submit(h, changed).status_code == 409
        changed["request_id"] = "different"
        full = h.client.post("/api/v1/youtube/drafts/publish-jobs", json=changed)
        assert full.status_code == 503 and full.headers["Retry-After"] == "5"
        assert len(h.store.list("owner-one")) == 1
    finally:
        release.set()


def test_new_previews_and_sync_api_share_atomic_video_target_protection(job_harness):
    h, runner = job_harness
    entered, release = block_second(h, runner)
    first, _ = h.preview(h.prepare(people=("Alice", "Alice")))
    second, _ = h.preview(h.prepare(people=("Alice", "Alice")))
    try:
        assert submit(h, first).status_code == 202
        assert entered.wait(3)
        assert submit(h, second, "second").status_code == 409
        assert h.publish(second).status_code == 409
    finally:
        release.set()


def test_exclusive_runner_and_restart_recover_only_state_without_replay(job_harness):
    h, runner = job_harness
    other = YouTubePublishRunner(OperationStore(h.store.path), runner.runtime)
    with pytest.raises(RuntimeError, match="one process"):
        other.start()
    contender = """
import sys
from pathlib import Path
from backend.app.core.operation_store import OperationStore
from backend.app.services.youtube_publish_jobs import YouTubePublishRunner

runner = YouTubePublishRunner(OperationStore(Path(sys.argv[1])), runtime=None)
try:
    runner.start()
except RuntimeError as error:
    assert "one process" in str(error)
else:
    runner.shutdown()
    raise AssertionError("A second process acquired the active runner lock")
"""
    result = subprocess.run(
        [sys.executable, "-c", contender, str(h.store.path)],
        cwd=Path(__file__).resolve().parents[2],
        capture_output=True,
        timeout=15,
        check=False,
    )
    assert result.returncode == 0, result.stderr.decode(errors="replace")
    runner.shutdown()
    h.provider.videos_by_id["three"] = video("three")
    h.provider.members.append("three")
    payload, _ = h.preview(h.prepare(people=("Alice", "Alice", "Alice")))
    op, _ = h.store.claim(
        "owner-one",
        "youtube.metadata_publish",
        DraftPublishInput(**payload),
        channel_id="channel-one",
        progress_plan=payload["preview_snapshot"]["plan"],
        executor_id="lost",
        acceptance={},
    )
    h.store.progress_row("owner-one", op["id"], "one", status="succeeded", confirmation="provider_response")
    h.store.progress_row("owner-one", op["id"], "two", status="running")
    other.start()
    try:
        recovered = h.store.get("owner-one", op["id"])
        assert [row["status"] for row in recovered["progress"]["rows"]] == [
            "succeeded",
            "needs_reconciliation",
            "not_attempted",
        ]
        assert h.provider.writes == []
        with pytest.raises(HTTPException):
            h.store.assert_targets_available("owner-one", "channel-one", ["two"])
    finally:
        other.shutdown()


def test_two_apps_use_their_own_provider_and_credentials(tmp_path):
    harnesses = [Harness(tmp_path / name) for name in ("one", "two")]
    runners = [h.client.app.state.youtube_publish_runner for h in harnesses]
    for index, (h, runner) in enumerate(zip(harnesses, runners)):
        h.rows[0]["Title"] = f"app-{index}"
        runner.runtime.credential_loader = lambda identity, context=h.context: (context, object())
        runner.start()
    try:
        for h in harnesses:
            payload, _ = h.preview(h.prepare())
            response = submit(h, payload)
            assert response.status_code == 202, response.text
            wait_terminal(h, response.json()["operation_id"])
        assert [h.provider.writes[0][2]["snippet"]["title"] for h in harnesses] == ["app-0", "app-1"]
    finally:
        for runner in runners:
            runner.shutdown()


def test_queued_preview_expiry_and_shutdown_never_start_a_provider_write(job_harness):
    h, runner = job_harness
    first, _ = h.preview(h.prepare(people=("Alice", "不編輯")))
    second, _ = h.preview(h.prepare(people=("不編輯", "Alice")))
    entered, release = threading.Event(), threading.Event()
    calls = []

    def credentials(identity):
        calls.append(identity)
        if len(calls) == 1:
            entered.set()
            assert release.wait(3)
        return h.context, object()

    runner.runtime.credential_loader = credentials
    try:
        started = submit(h, first)
        assert started.status_code == 202
        assert entered.wait(2)
        queued = submit(h, second, "queued")
        assert queued.status_code == 202, queued.text
        queued_id = queued.json()["operation_id"]
        h.store.update("owner-one", queued_id, lambda op: op["acceptance"].update(preview_expires_at=0))
    finally:
        release.set()
    op = wait_terminal(h, queued_id)
    assert op["state"] == "failed_before_write"
    assert op["progress"]["counts"]["not_attempted"] == 1
    assert [body["id"] for _, _, body in h.provider.writes] == ["one"]
    runner.shutdown()
    new_payload = copy.deepcopy(second)
    new_payload["preview_token"] += "different"
    response = submit(h, new_payload, "shutdown")
    assert response.status_code == 503


def test_runner_lock_rejects_contention_and_releases_on_shutdown_with_nonempty_lock_file(tmp_path):
    store_path = tmp_path / "ops.sqlite3"
    store_path.with_suffix(".runner.lock").write_bytes(b"stale-lock-content\n")
    runner1 = YouTubePublishRunner(OperationStore(store_path), runtime=None)
    runner2 = YouTubePublishRunner(OperationStore(store_path), runtime=None)
    runner1.start()
    try:
        with pytest.raises(RuntimeError, match="one process"):
            runner2.start()
        assert runner2.file_lock is None
        assert runner2.accepting is False
    finally:
        runner1.shutdown()
    assert runner1.file_lock is None
    runner2.start()
    try:
        assert runner2.accepting is True
        assert runner2.file_lock is not None
    finally:
        runner2.shutdown()
    assert runner2.file_lock is None


def test_runner_releases_lock_when_startup_fails_after_locking(tmp_path, monkeypatch):
    store_path = tmp_path / "ops.sqlite3"
    runner1 = YouTubePublishRunner(OperationStore(store_path), runtime=None)

    def fail_recover():
        raise RuntimeError("recover failed")

    monkeypatch.setattr(runner1.store, "recover_lost_executor_jobs", fail_recover)
    with pytest.raises(RuntimeError, match="recover failed"):
        runner1.start()
    assert runner1.file_lock is None
    assert runner1.accepting is False

    runner2 = YouTubePublishRunner(OperationStore(store_path), runtime=None)
    runner2.start()
    try:
        assert runner2.accepting is True
        assert runner2.file_lock is not None
    finally:
        runner2.shutdown()
    assert runner2.file_lock is None


def test_publish_job_runtime_enforces_allowlist_in_http_development_mode(tmp_path):
    from backend.app.core.config import Settings
    from backend.app.core.credential_store import CredentialStore
    from backend.app.core.runtime_config import RuntimeConfig
    from backend.app.core.system_secrets import SystemSecretsManager
    from backend.app.services.youtube_publish_jobs import JobIdentity, PublishJobRuntime

    config = Settings(
        _env_file=None,
        runtime_store=RuntimeConfig(tmp_path / "runtime.json"),
        secrets_store=SystemSecretsManager(tmp_path),
        ENVIRONMENT="development",
        PUBLIC_BASE_URL="http://localhost:8000",
        ALLOWED_GOOGLE_EMAILS="admin@example.com",
    )
    assert config.allowlist_required is False
    creds = CredentialStore(tmp_path / "creds.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)
    creds.save_google_connection(
        {"token": "tok", "user": {"sub": "revoked-user", "email": "revoked@example.com"}},
        owner_sub="revoked-user",
    )
    runtime = PublishJobRuntime(
        config=config,
        credentials=creds,
        accounts=SimpleNamespace(),
        trackers=None,
        client_factory=None,
        service=None,
    )
    with pytest.raises(HTTPException) as exc:
        runtime.load_credentials(JobIdentity("revoked-user", "chan-1", "primary", "manual"))
    assert exc.value.status_code == 403
    assert exc.value.detail["code"] == "access_denied"
