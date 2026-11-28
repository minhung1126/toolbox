"""Regression tests for GitHub Issue #33 (operations reconciliation, retries, duplicate reads, channel binding)."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from googleapiclient.errors import HttpError
from httplib2 import Response as Httplib2Response

from backend.app.api.youtube_models import BatchUpdateInput, VideoAssignment, VideoMetadataUpdateInput
from backend.app.api.youtube_workflow_dependencies import create_youtube_workflow_service
from backend.app.core.dependencies import require_account_subject, require_sheets_credentials, require_youtube_context
from backend.app.core.operation_store import OperationStore
from backend.app.core.preview import build_preview_token, verify_preview_token
from backend.app.core.youtube_context import YouTubeRequestContext
from backend.app.core.youtube_quota_limiter import YouTubeQuotaLimiter
from backend.app.main import create_app
from backend.app.services.operation_journal import start_operation


def _http_error(status: int, reason: str) -> HttpError:
    return HttpError(
        Httplib2Response({"status": str(status)}),
        json.dumps({"error": {"errors": [{"reason": reason}], "message": "provider body"}}).encode(),
    )


class FakeYouTubeProvider:
    def __init__(self, *, channel_id: str = "channel-1"):
        self.channel_id = channel_id
        self.videos_by_id: dict[str, dict] = {
            "vid-1": {
                "id": "vid-1",
                "snippet": {
                    "channelId": channel_id,
                    "title": "Old Title",
                    "description": "Old Desc",
                    "categoryId": "22",
                },
                "status": {"privacyStatus": "private"},
            },
            "vid-2": {
                "id": "vid-2",
                "snippet": {
                    "channelId": channel_id,
                    "title": "Old Title 2",
                    "description": "Old Desc 2",
                    "categoryId": "22",
                },
                "status": {"privacyStatus": "private"},
            },
        }
        self.playlist_items: list[dict] = [
            {"id": "pl-item-1", "contentDetails": {"videoId": "vid-1"}, "snippet": {"title": "Old Title"}},
            {"id": "pl-item-2", "contentDetails": {"videoId": "vid-2"}, "snippet": {"title": "Old Title 2"}},
        ]
        self.writes: list[tuple[str, dict]] = []
        self.update_exception: Exception | None = None
        self.update_failures: dict[str, Exception] = {}
        self.read_exception: Exception | None = None
        self.retain_deletes = False
        self.skip_commit = False
        self.skip_commit_ids: set[str] = set()
        self.sheet_values: dict[str, list[list[str]]] = {}

    def videos(self):
        provider = self

        def list_videos(**kwargs):
            def execute():
                if provider.read_exception is not None:
                    raise provider.read_exception
                ids = [v for v in kwargs.get("id", "").split(",") if v]
                return {"items": [provider.videos_by_id[vid] for vid in ids if vid in provider.videos_by_id]}

            return SimpleNamespace(execute=execute)

        def update(**kwargs):
            def execute():
                body = kwargs["body"]
                provider.writes.append((kwargs.get("part", ""), body))
                vid = body["id"]
                if vid in provider.update_failures:
                    raise provider.update_failures[vid]
                if provider.update_exception is not None:
                    raise provider.update_exception
                if not provider.skip_commit and vid not in provider.skip_commit_ids and vid in provider.videos_by_id:
                    if "snippet" in body:
                        provider.videos_by_id[vid]["snippet"].update(body["snippet"])
                    if "status" in body:
                        provider.videos_by_id[vid]["status"].update(body["status"])
                return provider.videos_by_id[vid]

            return SimpleNamespace(execute=execute)

        return SimpleNamespace(list=list_videos, update=update)

    def playlistItems(self):
        provider = self

        def list_items(**kwargs):
            def execute():
                if provider.read_exception is not None:
                    raise provider.read_exception
                if "id" in kwargs:
                    return {
                        "items": [{"id": item["id"]} for item in provider.playlist_items if item["id"] == kwargs["id"]]
                    }
                return {"items": list(provider.playlist_items)}

            return SimpleNamespace(execute=execute)

        def delete(*, id):
            def execute():
                provider.writes.append(("delete", {"id": id}))
                if not provider.retain_deletes:
                    provider.playlist_items = [item for item in provider.playlist_items if item["id"] != id]
                return {}

            return SimpleNamespace(execute=execute)

        return SimpleNamespace(list=list_items, delete=delete)

    def spreadsheets(self):
        provider = self

        def get_values(*, spreadsheetId, range, **_kwargs):
            def execute():
                rows = provider.sheet_values.get(spreadsheetId, [])
                if range.endswith("!1:1"):
                    return {"values": [rows[0]] if rows else []}
                return {"values": rows}

            return SimpleNamespace(execute=execute)

        return SimpleNamespace(values=lambda: SimpleNamespace(get=get_values))


def _make_context(tmp_path, *, limit=10_000, buffer=0, channel_id="channel-1", owner="owner-1"):
    limiter = YouTubeQuotaLimiter(tmp_path / f"quota_{owner}.json", configured_limit=limit, safety_buffer_units=buffer)
    return YouTubeRequestContext(
        slot="primary",
        credentials=object(),
        quota_limiter=limiter,
        owner_sub=owner,
        channel_id=channel_id,
    )


def _make_client(store: OperationStore, provider: FakeYouTubeProvider, context: YouTubeRequestContext, adapters=None):
    app = create_app(
        operation_store=store,
        google_client_factory=lambda *_args, **_kwargs: provider,
        youtube_workflow_adapters=adapters or {},
        dependency_overrides={
            require_youtube_context: lambda: context,
            require_account_subject: lambda: context.owner_sub,
            require_sheets_credentials: lambda: object(),
        },
    )
    return TestClient(app)


def test_single_video_metadata_reconcile_matched_and_unmatched_and_0_write_retry(tmp_path):
    store = OperationStore(tmp_path / "ops.sqlite3")
    provider = FakeYouTubeProvider()
    # Set limit=10 so videos.list (1 unit) succeeds but videos.update (50 units) hits local safety cap (429)
    context = _make_context(tmp_path, limit=10, buffer=0)
    client = _make_client(store, provider, context)

    # 1. Quota 429 before write -> failed_before_write, 0 writes
    payload = {"video_id": "vid-1", "title": "New Title", "description": "Line1\r\nLine2"}
    r1 = client.post("/api/v1/youtube/video-metadata", json=payload)
    assert r1.status_code == 429
    op_id_1 = r1.headers["X-Operation-Id"]
    assert store.get(context.owner_sub, op_id_1)["state"] == "failed_before_write"
    assert provider.writes == []

    # 2. Retry same input WITHOUT request_id once quota recovers -> must succeed (not 409!)
    # Raise limit in the same quota file
    (tmp_path / "quota_owner-1.json").unlink()
    context_ok = _make_context(tmp_path, limit=10_000, buffer=0)
    client_ok = _make_client(store, provider, context_ok)
    provider.update_exception = TimeoutError("lost response")
    provider.skip_commit = True
    r_timeout = client_ok.post("/api/v1/youtube/video-metadata", json=payload)
    assert r_timeout.status_code == 502

    ops = store.list(context.owner_sub)
    uncertain_op = next(op for op in ops if op["id"] != op_id_1)
    assert uncertain_op["state"] == "needs_reconciliation"

    # Retrying while needs_reconciliation must still return 409
    assert client_ok.post("/api/v1/youtube/video-metadata", json=payload).status_code == 409

    # 3. Reconcile when remote is still unchanged -> item marked failed, op resolved to partial, target unlocked
    rec_unmatched = client_ok.post(f"/api/v1/operations/{uncertain_op['id']}/reconcile-youtube")
    assert rec_unmatched.status_code == 200, rec_unmatched.text
    rec_data = rec_unmatched.json()
    assert rec_data["state"] == "partial"
    assert rec_data["items"][0]["state"] == "failed"

    # 4. Now remote eventually reflects intended title & normalized description -> 2nd reconcile completes & fills result
    provider.videos_by_id["vid-1"]["snippet"].update(title="New Title", description="Line1\nLine2")
    rec_matched = client_ok.post(f"/api/v1/operations/{uncertain_op['id']}/reconcile-youtube")
    assert rec_matched.status_code == 200, rec_matched.text
    matched_data = rec_matched.json()
    assert matched_data["state"] == "completed"
    assert matched_data["result"] is not None
    assert matched_data["result"]["title"] == "New Title"

    # 5. Idempotent replay without request_id returns completed result without executing another write
    before_writes = len(provider.writes)
    replay = client_ok.post("/api/v1/youtube/video-metadata", json=payload)
    assert replay.status_code == 200
    assert replay.json()["operation_id"] == uncertain_op["id"]
    assert len(provider.writes) == before_writes


def test_video_metadata_explicit_request_id_retry_and_whitespace_validation(tmp_path):
    store = OperationStore(tmp_path / "ops.sqlite3")
    provider = FakeYouTubeProvider()
    context = _make_context(tmp_path, limit=10, buffer=0)
    client = _make_client(store, provider, context)

    # Whitespace video_id/title rejected 400 without creating operation
    bad = client.post("/api/v1/youtube/video-metadata", json={"video_id": "   ", "title": "Valid"})
    assert bad.status_code == 400
    assert store.list(context.owner_sub) == []

    # Quota failure with explicit request_id="req-1"
    r1 = client.post(
        "/api/v1/youtube/video-metadata",
        json={"request_id": "req-1", "video_id": "vid-1", "title": "Updated", "description": "D"},
    )
    assert r1.status_code == 429

    # Same explicit request_id="req-1" keeps idempotency (409)
    assert (
        client.post(
            "/api/v1/youtube/video-metadata",
            json={"request_id": "req-1", "video_id": "vid-1", "title": "Updated", "description": "D"},
        ).status_code
        == 409
    )

    # New request_id="req-2" succeeds once quota recovers
    (tmp_path / "quota_owner-1.json").unlink()
    context_ok = _make_context(tmp_path, limit=10_000, buffer=0)
    client_ok = _make_client(store, provider, context_ok)
    r2 = client_ok.post(
        "/api/v1/youtube/video-metadata",
        json={"request_id": "req-2", "video_id": "vid-1", "title": "Updated", "description": "D"},
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["status"] == "succeeded"


def test_cleanup_only_reconcile_matched_false_resolves_to_partial_and_reconstructs_result(tmp_path):
    store = OperationStore(tmp_path / "ops.sqlite3")
    provider = FakeYouTubeProvider()
    provider.videos_by_id["vid-1"]["status"]["privacyStatus"] = "public"
    provider.retain_deletes = True
    context = _make_context(tmp_path)
    client = _make_client(store, provider, context)

    preview = client.post("/api/v1/youtube/cleanup-preview", json={"playlist_id": "PL-1"}).json()
    res = client.post(
        "/api/v1/youtube/publish-and-cleanup",
        json={
            "playlist_id": "PL-1",
            "preview_token": preview["preview_token"],
            "preview_snapshot": preview["preview_snapshot"],
        },
    )
    assert res.status_code == 200
    op_id = res.json()["operation_id"]

    # Remote still has pl-item-1 -> matched=False resolves needs_reconciliation -> partial + failed
    rec = client.post(f"/api/v1/operations/{op_id}/reconcile-youtube")
    assert rec.status_code == 200, rec.text
    body = rec.json()
    assert body["state"] == "partial"
    assert body["items"][0]["state"] == "failed"
    assert body["progress"]["rows"][0]["status"] == "failed"
    assert body["result"]["results"][0]["status"] == "failed"

    # Simulate crashed operation where result was None and item was removed remotely -> reconstructs result
    store.update(
        context.owner_sub,
        op_id,
        lambda op: (
            op.update(state="needs_reconciliation", result=None)
            or op["items"][0].update(state="needs_reconciliation")
            or op["progress"]["rows"][0].update(status="needs_reconciliation")
        ),
    )
    provider.playlist_items = [item for item in provider.playlist_items if item["id"] != "pl-item-1"]
    rec2 = client.post(f"/api/v1/operations/{op_id}/reconcile-youtube")
    assert rec2.status_code == 200, rec2.text
    assert rec2.json()["state"] == "completed"
    assert rec2.json()["result"]["completed"] is True


def test_reconcile_publish_progress_unblocks_and_rechecks_failed_rows_without_rechecking_pre_write_rejections(tmp_path):
    from test_youtube_draft_publish import Harness, video

    h = Harness(tmp_path)
    h.provider.videos_by_id["three"] = video("three")
    h.provider.members.append("three")
    h.provider.failures[("primary", "one")] = "timeout_absent"
    h.provider.failures[("primary", "two")] = "forbidden"

    draft = h.prepare(people=("Alice", "Alice", "Alice"))
    payload, _ = h.preview(draft)
    # Run via store directly with progress initialized (simulating job runner)
    op, _ = h.store.claim(
        "owner-one",
        "youtube.metadata_publish",
        BatchUpdateInput(
            request_id="req-progress",
            worksheet_name="Videos",
            title_column="Title",
            description_column="Description",
            assignments=[VideoAssignment(video_id="one", person="Alice")],
        ),
        channel_id="channel-one",
        progress_plan=payload["preview_snapshot"]["plan"],
    )
    h.store.update(
        "owner-one",
        op["id"],
        lambda document: (
            document.update(
                state="needs_reconciliation",
                items=[
                    {"index": 0, "phase": "metadata_publish", "remote_id": "one", "state": "needs_reconciliation"},
                    {"index": 1, "phase": "metadata_publish", "remote_id": "two", "state": "failed_before_write"},
                ],
            )
            or document["progress"]["rows"][0].update(
                status="needs_reconciliation", attempted_parts=["snippet", "status"]
            )
            or document["progress"]["rows"][1].update(status="failed", attempted_parts=["snippet", "status"])
        ),
    )

    # First reconcile with unchanged remote -> one becomes failed, op becomes partial, target unlocked
    rec1 = h.client.post(f"/api/v1/operations/{op['id']}/reconcile-youtube")
    assert rec1.status_code == 200, rec1.text
    assert rec1.json()["state"] == "partial"
    assert rec1.json()["progress"]["rows"][0]["status"] == "failed"
    h.store.assert_targets_available("owner-one", "channel-one", ["one"])

    # Now BOTH one and two match remotely; one (failed after write) re-checks to succeeded,
    # while two (failed_before_write) stays failed!
    for vid, idx in (("one", 0), ("two", 1)):
        h.provider.videos_by_id[vid]["snippet"].update(
            title=draft["edits"][idx]["title"], description=draft["edits"][idx]["description"]
        )
        h.provider.videos_by_id[vid]["status"]["privacyStatus"] = "public"
    rec2 = h.client.post(f"/api/v1/operations/{op['id']}/reconcile-youtube")
    assert rec2.status_code == 200, rec2.text
    rows = rec2.json()["progress"]["rows"]
    assert rows[0]["status"] == "succeeded"
    assert rows[1]["status"] == "failed"
    assert rec2.json()["state"] == "partial"


def test_reconcile_endpoints_map_quota_429_and_provider_502_503(tmp_path):
    store = OperationStore(tmp_path / "ops.sqlite3")
    provider = FakeYouTubeProvider()
    context = _make_context(tmp_path)
    client = _make_client(store, provider, context)

    # Seed an uncertain metadata operation
    op, _ = store.claim(
        context.owner_sub,
        "youtube.metadata_update",
        BatchUpdateInput(
            request_id="req-err",
            worksheet_name="Videos",
            title_column="Title",
            description_column="Desc",
            assignments=[VideoAssignment(video_id="vid-1", person="Alice")],
        ),
        channel_id=context.channel_id,
    )
    store.update(
        context.owner_sub,
        op["id"],
        lambda doc: doc.update(
            state="needs_reconciliation",
            items=[
                {
                    "index": 0,
                    "phase": "metadata",
                    "remote_id": "vid-1",
                    "state": "needs_reconciliation",
                    "intended": {"title": "New", "description": "D"},
                }
            ],
        ),
    )

    provider.read_exception = _http_error(503, "backendError")
    assert client.post(f"/api/v1/operations/{op['id']}/reconcile-youtube").status_code == 503

    provider.read_exception = TimeoutError("network timeout")
    assert client.post(f"/api/v1/operations/{op['id']}/reconcile-youtube").status_code == 502

    # Quota exhausted during read -> 429
    provider.read_exception = None
    (tmp_path / "quota_owner-1.json").unlink(missing_ok=True)
    blocked_context = _make_context(tmp_path, limit=10, buffer=9)
    blocked_context.quota_limiter.record("videos.list")
    blocked_client = _make_client(store, provider, blocked_context)
    assert blocked_client.post(f"/api/v1/operations/{op['id']}/reconcile-youtube").status_code == 429


def test_batch_metadata_update_reads_sheet_playlist_and_videos_once_and_checks_channel_id(tmp_path):
    counts = {"headers": 0, "rows": 0, "playlist": 0, "details": 0, "updates": []}

    def get_headers(*_args):
        counts["headers"] += 1
        return ["所屬團體", "人", "Title", "Desc"]

    def get_rows(*_args):
        counts["rows"] += 1
        return [{"所屬團體": "Team", "人": "Alice", "Title": "New", "Desc": "NewDesc"}]

    def fetch_pl(*_args):
        counts["playlist"] += 1
        return [
            {"id": "pi-1", "contentDetails": {"videoId": "vid-1"}},
            {"id": "pi-2", "contentDetails": {"videoId": "vid-other-channel"}},
        ]

    def fetch_details(_ctx, ids):
        counts["details"] += 1
        return [
            {
                "id": vid,
                "snippet": {
                    "channelId": "channel-1" if vid == "vid-1" else "other-channel",
                    "title": f"Old {vid}",
                    "description": "Old",
                    "categoryId": "22",
                },
            }
            for vid in ids
        ]

    def update_meta(_ctx, vid, title, desc, **_kw):
        counts["updates"].append((vid, title, desc))
        return {"id": vid}

    service = create_youtube_workflow_service(
        {
            "get_sheet_headers": get_headers,
            "get_all_rows_for_sheet": get_rows,
            "fetch_playlist_items": fetch_pl,
            "fetch_video_details": fetch_details,
            "update_single_video_metadata": update_meta,
            "build_preview_token": build_preview_token,
            "verify_preview_token": verify_preview_token,
        }
    )
    context = _make_context(tmp_path, channel_id="channel-1")
    payload = BatchUpdateInput(
        spreadsheet_url_or_id="sheet-1",
        playlist_id="PL-1",
        worksheet_name="Sheet1",
        title_column="Title",
        description_column="Desc",
        team="Team",
        assignments=[
            VideoAssignment(video_id="vid-1", person="Alice"),
            VideoAssignment(video_id="vid-other-channel", person="Alice"),
        ],
    )
    preview = service.create_batch_metadata_preview(payload, creds=context, sheet_creds=object())
    assert preview["plan"][0]["status"] == "ready"
    assert preview["plan"][1]["status"] == "skipped"

    counts["headers"] = counts["rows"] = counts["playlist"] = counts["details"] = 0
    payload.preview_token = preview["preview_token"]
    payload.preview_snapshot = preview["preview_snapshot"]
    result = service.run_batch_metadata_update(payload, creds=context, sheet_creds=object())

    # Each read path is invoked ONCE, not duplicated in _validate_batch_snapshot
    assert (counts["headers"], counts["rows"], counts["playlist"], counts["details"]) == (1, 1, 1, 1)
    assert result["results"][0]["status"] == "succeeded"
    assert result["results"][1]["status"] == "skipped"
    assert result["results"][1]["error"]["code"] == "youtube_channel_mismatch"
    assert counts["updates"] == [("vid-1", "New", "NewDesc")]

    # Mismatched channel context cannot reuse preview_token
    wrong_channel_ctx = _make_context(tmp_path, channel_id="channel-2")
    with pytest.raises(Exception) as caught:
        service.run_batch_metadata_update(payload, creds=wrong_channel_ctx, sheet_creds=object())
    assert getattr(caught.value, "status_code", None) == 409


def test_single_video_metadata_rejects_foreign_channel_video(tmp_path):
    store = OperationStore(tmp_path / "ops.sqlite3")
    provider = FakeYouTubeProvider(channel_id="foreign-channel")
    context = _make_context(tmp_path, channel_id="my-channel")
    client = _make_client(store, provider, context)

    resp = client.post(
        "/api/v1/youtube/video-metadata",
        json={"video_id": "vid-1", "title": "Hijack", "description": "Nope"},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "youtube_channel_mismatch"
    assert provider.writes == []


@pytest.mark.parametrize("retry_mode", ["omitted", "explicit"])
def test_video_metadata_retry_after_matched_false_reconcile_omitted_and_explicit_request_id(tmp_path, retry_mode):
    store = OperationStore(tmp_path / "ops.sqlite3")
    provider = FakeYouTubeProvider()
    context = _make_context(tmp_path, limit=10, buffer=0)
    client = _make_client(store, provider, context)

    payload = {"video_id": "vid-1", "title": "New Title", "description": "Line1\r\nLine2"}

    # 1. Quota 429 before write -> failed_before_write, 0 writes
    r1 = client.post("/api/v1/youtube/video-metadata", json=payload)
    assert r1.status_code == 429
    op_id_1 = r1.headers["X-Operation-Id"]
    assert store.get(context.owner_sub, op_id_1)["state"] == "failed_before_write"
    assert provider.writes == []

    # 2. Omitted-request_id retry once quota recovers -> write times out (502 needs_reconciliation)
    (tmp_path / "quota_owner-1.json").unlink()
    context_ok = _make_context(tmp_path, limit=10_000, buffer=0)
    client_ok = _make_client(store, provider, context_ok)
    provider.update_exception = TimeoutError("lost response")
    provider.skip_commit = True
    r_timeout = client_ok.post("/api/v1/youtube/video-metadata", json=payload)
    assert r_timeout.status_code == 502

    ops = store.list(context_ok.owner_sub)
    op2 = next(op for op in ops if op["id"] != op_id_1)
    assert op2["state"] == "needs_reconciliation"
    assert len(provider.writes) == 1

    # 3. Reconcile with unchanged remote -> matched=False resolves to partial, items[0] failed, target unlocked
    rec_unmatched = client_ok.post(f"/api/v1/operations/{op2['id']}/reconcile-youtube")
    assert rec_unmatched.status_code == 200, rec_unmatched.text
    rec_body = rec_unmatched.json()
    assert rec_body["state"] == "partial"
    assert rec_body["items"][0]["state"] == "failed"
    store.assert_targets_available(context_ok.owner_sub, context_ok.channel_id, ["vid-1"])

    # 4. Retry SAME (video_id, title, description) after partial zero-success reconcile -> succeeds (200)
    provider.update_exception = None
    provider.skip_commit = False
    retry_payload = payload if retry_mode == "omitted" else {**payload, "request_id": "req-after-partial"}
    r_retry = client_ok.post("/api/v1/youtube/video-metadata", json=retry_payload)
    assert r_retry.status_code == 200, r_retry.text
    retry_data = r_retry.json()
    op3_id = retry_data["operation_id"]
    assert op3_id not in {op_id_1, op2["id"]}
    assert retry_data["status"] == "succeeded"
    assert provider.videos_by_id["vid-1"]["snippet"]["title"] == "New Title"
    assert len(provider.writes) == 2

    # 5. Subsequent retry with same digest (omitted AND new explicit request_id) returns 200 idempotently, 0 extra writes
    replay_omitted = client_ok.post("/api/v1/youtube/video-metadata", json=payload)
    assert replay_omitted.status_code == 200
    assert replay_omitted.json()["operation_id"] == op3_id

    replay_explicit = client_ok.post(
        "/api/v1/youtube/video-metadata", json={**payload, "request_id": "req-after-completed"}
    )
    assert replay_explicit.status_code == 200
    assert replay_explicit.json()["operation_id"] == op3_id
    assert len(provider.writes) == 2


def test_partial_operation_with_success_not_bypassed_by_digest(tmp_path):
    store = OperationStore(tmp_path / "ops.sqlite3")
    provider = FakeYouTubeProvider()
    context = _make_context(tmp_path)
    client = _make_client(store, provider, context)

    # Case A: partial operation with >= 1 completed item
    batch_payload = BatchUpdateInput(
        request_id="req-batch-partial",
        worksheet_name="Videos",
        title_column="Title",
        description_column="Desc",
        assignments=[VideoAssignment(video_id="vid-1", person="A"), VideoAssignment(video_id="vid-2", person="B")],
    )
    op_batch, created = store.claim(
        context.owner_sub, "youtube.metadata_update", batch_payload, channel_id=context.channel_id
    )
    assert created is True
    store.update(
        context.owner_sub,
        op_batch["id"],
        lambda doc: doc.update(
            state="partial",
            items=[
                {"index": 0, "phase": "metadata", "remote_id": "vid-1", "state": "completed"},
                {"index": 1, "phase": "metadata", "remote_id": "vid-2", "state": "failed"},
            ],
            result={
                "results": [
                    {"video_id": "vid-1", "status": "succeeded"},
                    {"video_id": "vid-2", "status": "failed"},
                ]
            },
        ),
    )

    same_digest_omitted = BatchUpdateInput(
        worksheet_name="Videos",
        title_column="Title",
        description_column="Desc",
        assignments=[VideoAssignment(video_id="vid-1", person="A"), VideoAssignment(video_id="vid-2", person="B")],
    )
    assert (
        store.existing(context.owner_sub, "youtube.metadata_update", same_digest_omitted, context.channel_id)["id"]
        == (op_batch["id"])
    )
    claimed_op, claimed_new = store.claim(
        context.owner_sub, "youtube.metadata_update", same_digest_omitted, channel_id=context.channel_id
    )
    assert claimed_new is False
    assert claimed_op["id"] == op_batch["id"]

    same_digest_new_req = BatchUpdateInput(
        request_id="req-batch-new",
        worksheet_name="Videos",
        title_column="Title",
        description_column="Desc",
        assignments=[VideoAssignment(video_id="vid-1", person="A"), VideoAssignment(video_id="vid-2", person="B")],
    )
    with pytest.raises(Exception) as exc_info:
        start_operation(
            store, context.owner_sub, "youtube.metadata_update", same_digest_new_req, channel_id=context.channel_id
        )
    assert getattr(exc_info.value, "status_code", None) == 409

    # Case B: partial operation on /video-metadata where result["succeeded"] >= 1
    meta_payload = VideoMetadataUpdateInput(
        request_id="req-meta-partial", video_id="vid-1", title="Partial Title", description="Desc"
    )
    op_meta, created_meta = store.claim(
        context.owner_sub, "youtube.metadata_update", meta_payload, channel_id=context.channel_id
    )
    assert created_meta is True
    store.update(
        context.owner_sub,
        op_meta["id"],
        lambda doc: doc.update(
            state="partial",
            items=[{"index": 0, "phase": "metadata", "remote_id": "vid-1", "state": "failed"}],
            result={"succeeded": 1, "failed": 0},
        ),
    )

    # Both omitted request_id and new explicit request_id must be blocked with 409 (0 writes)
    resp_omitted = client.post(
        "/api/v1/youtube/video-metadata",
        json={"video_id": "vid-1", "title": "Partial Title", "description": "Desc"},
    )
    assert resp_omitted.status_code == 409
    assert resp_omitted.json()["detail"]["code"] == "operation_requires_reconciliation"

    resp_new_req = client.post(
        "/api/v1/youtube/video-metadata",
        json={"request_id": "req-meta-new", "video_id": "vid-1", "title": "Partial Title", "description": "Desc"},
    )
    assert resp_new_req.status_code == 409
    assert resp_new_req.json()["detail"]["code"] == "operation_requires_reconciliation"
    assert provider.writes == []


def test_explicit_request_id_replay_of_partial_operation_returns_existing(tmp_path):
    store = OperationStore(tmp_path / "ops.sqlite3")
    provider = FakeYouTubeProvider()
    context = _make_context(tmp_path)
    client = _make_client(store, provider, context)

    # 1. Timeout with explicit request_id="req-partial-orig" -> needs_reconciliation
    provider.update_exception = TimeoutError("lost")
    provider.skip_commit = True
    r1 = client.post(
        "/api/v1/youtube/video-metadata",
        json={"request_id": "req-partial-orig", "video_id": "vid-1", "title": "Title X", "description": "Desc X"},
    )
    assert r1.status_code == 502
    op1_id = r1.headers["X-Operation-Id"]

    # 2. Reconcile matched=False -> partial, items[0] failed
    rec = client.post(f"/api/v1/operations/{op1_id}/reconcile-youtube")
    assert rec.status_code == 200
    assert rec.json()["state"] == "partial"
    assert rec.json()["items"][0]["state"] == "failed"

    # 3. Replay exact same explicit request_id="req-partial-orig" -> returns existing op cleanly, no new write
    provider.update_exception = None
    provider.skip_commit = False
    payload_orig = VideoMetadataUpdateInput(
        request_id="req-partial-orig", video_id="vid-1", title="Title X", description="Desc X"
    )
    existing_op, created = store.claim(
        context.owner_sub, "youtube.metadata_update", payload_orig, channel_id=context.channel_id
    )
    assert created is False
    assert existing_op["id"] == op1_id
    assert existing_op["state"] == "partial"

    replay_http = client.post(
        "/api/v1/youtube/video-metadata",
        json={"request_id": "req-partial-orig", "video_id": "vid-1", "title": "Title X", "description": "Desc X"},
    )
    assert replay_http.status_code == 409
    assert replay_http.json()["detail"]["code"] == "operation_requires_reconciliation"
    assert len(store.list(context.owner_sub)) == 1
    assert len(provider.writes) == 1

    # 4. A NEW explicit request_id succeeds, while replaying "req-partial-orig" still maps to op1_id
    retry_new = client.post(
        "/api/v1/youtube/video-metadata",
        json={"request_id": "req-partial-retry", "video_id": "vid-1", "title": "Title X", "description": "Desc X"},
    )
    assert retry_new.status_code == 200, retry_new.text
    assert retry_new.json()["operation_id"] != op1_id
    assert len(provider.writes) == 2

    existing_after, created_after = store.claim(
        context.owner_sub, "youtube.metadata_update", payload_orig, channel_id=context.channel_id
    )
    assert created_after is False
    assert existing_after["id"] == op1_id
    assert len(provider.writes) == 2


def test_is_reconciled_zero_success_failure_guards_and_existing_skip(tmp_path):
    store = OperationStore(tmp_path / "ops.sqlite3")
    context = _make_context(tmp_path)

    # 1. Reconciled zero-success partial is skipped by existing()
    payload = VideoMetadataUpdateInput(
        request_id="req-zero-partial", video_id="vid-1", title="Zero Partial", description="Desc"
    )
    op, created = store.claim(context.owner_sub, "youtube.metadata_update", payload, channel_id=context.channel_id)
    assert created is True
    store.update(
        context.owner_sub,
        op["id"],
        lambda doc: doc.update(
            state="partial",
            items=[{"index": 0, "phase": "metadata", "remote_id": "vid-1", "state": "failed"}],
        ),
    )
    omitted_payload = VideoMetadataUpdateInput(video_id="vid-1", title="Zero Partial", description="Desc")
    assert store.existing(context.owner_sub, "youtube.metadata_update", omitted_payload, context.channel_id) is None
    assert store.existing(context.owner_sub, "youtube.metadata_update", payload, context.channel_id)["id"] == op["id"]

    # 2. outcome_unknown=True or progress row not_attempted/succeeded blocks bypass
    assert (
        OperationStore._is_reconciled_zero_success_failure(
            {
                "state": "partial",
                "outcome_unknown": True,
                "items": [{"state": "failed"}],
            }
        )
        is False
    )
    assert (
        OperationStore._is_reconciled_zero_success_failure(
            {
                "state": "partial",
                "items": [{"state": "failed"}],
                "progress": {"rows": [{"status": "failed"}, {"status": "not_attempted"}]},
            }
        )
        is False
    )
    assert (
        OperationStore._is_reconciled_zero_success_failure(
            {
                "state": "partial",
                "items": [{"state": "failed_before_write"}],
                "progress": {"rows": [{"status": "failed_before_write"}]},
                "result": {"results": [{"status": "failed"}], "succeeded": 0},
            }
        )
        is True
    )


def test_batch_metadata_update_reconcile_updates_result_and_idempotent_replay(tmp_path):
    store = OperationStore(tmp_path / "ops.sqlite3")
    provider = FakeYouTubeProvider()
    provider.sheet_values["sheet-1"] = [
        ["所屬團體", "人", "Title", "Desc"],
        ["Team", "Alice", "New Title 1", "New Desc 1"],
        ["Team", "Bob", "New Title 2", "New Desc 2"],
    ]
    context = _make_context(tmp_path)
    client = _make_client(store, provider, context)

    preview_req = {
        "spreadsheet_url_or_id": "sheet-1",
        "playlist_id": "PL-1",
        "worksheet_name": "Sheet1",
        "title_column": "Title",
        "description_column": "Desc",
        "team": "Team",
        "assignments": [
            {"video_id": "vid-1", "person": "Alice"},
            {"video_id": "vid-2", "person": "Bob"},
        ],
    }
    preview = client.post("/api/v1/youtube/batch-preview", json=preview_req)
    assert preview.status_code == 200, preview.text
    preview_data = preview.json()

    provider.update_failures["vid-2"] = TimeoutError("lost response")
    provider.skip_commit_ids.add("vid-2")

    batch_payload = {
        **preview_req,
        "request_id": "req-batch-reconcile",
        "preview_token": preview_data["preview_token"],
        "preview_snapshot": preview_data["preview_snapshot"],
    }
    res = client.post("/api/v1/youtube/batch-update", json=batch_payload)
    assert res.status_code == 200, res.text
    res_data = res.json()
    op_id = res_data["operation_id"]
    assert [row["status"] for row in res_data["results"]] == ["succeeded", "failed"]
    assert res_data["failed_count"] == 1
    assert store.get(context.owner_sub, op_id)["state"] == "needs_reconciliation"

    # Reconcile when vid-2 is still unchanged -> partial, result.completed=False, target unlocked
    rec1 = client.post(f"/api/v1/operations/{op_id}/reconcile-youtube")
    assert rec1.status_code == 200, rec1.text
    rec1_data = rec1.json()
    assert rec1_data["state"] == "partial"
    assert rec1_data["items"][1]["state"] == "failed"
    assert rec1_data["result"]["completed"] is False
    assert rec1_data["result"]["reconciled"] is True
    assert rec1_data["result"]["succeeded_count"] == 1
    assert rec1_data["result"]["failed_count"] == 1
    assert [row["status"] for row in rec1_data["result"]["results"]] == ["succeeded", "failed"]
    assert rec1_data["result"]["results"][1]["reason"] == "唯讀核對確認遠端尚未更新。"
    assert rec1_data["result"]["results"][1]["reconciled"] is True
    store.assert_targets_available(context.owner_sub, context.channel_id, ["vid-1", "vid-2"])

    # Now remote vid-2 reflects intended update -> reconcile completes & updates result rows/counts
    provider.videos_by_id["vid-2"]["snippet"].update(title="New Title 2", description="New Desc 2")
    rec2 = client.post(f"/api/v1/operations/{op_id}/reconcile-youtube")
    assert rec2.status_code == 200, rec2.text
    rec2_data = rec2.json()
    assert rec2_data["state"] == "completed"
    assert rec2_data["items"][1]["state"] == "completed"
    assert rec2_data["result"]["completed"] is True
    assert rec2_data["result"]["reconciled"] is True
    assert rec2_data["result"]["succeeded_count"] == 2
    assert rec2_data["result"]["failed_count"] == 0
    assert [row["status"] for row in rec2_data["result"]["results"]] == ["succeeded", "succeeded"]
    assert rec2_data["result"]["results"][1]["reason"] is None
    assert rec2_data["result"]["results"][1]["reconciled"] is True
    assert rec2_data["result"]["results"][1]["title"] == "New Title 2"
    assert "error" not in rec2_data["result"]["results"][1]

    # Idempotent replay with the same request_id returns the updated succeeded result with 0 extra writes
    before_writes = len(provider.writes)
    replay = client.post("/api/v1/youtube/batch-update", json=batch_payload)
    assert replay.status_code == 200, replay.text
    replay_data = replay.json()
    assert replay_data["operation_id"] == op_id
    assert replay_data["completed"] is True
    assert replay_data["succeeded_count"] == 2
    assert replay_data["failed_count"] == 0
    assert [row["status"] for row in replay_data["results"]] == ["succeeded", "succeeded"]
    assert len(provider.writes) == before_writes


def test_reconcile_publish_progress_handles_interrupted_running_row(tmp_path):
    from test_youtube_draft_publish import Harness

    h = Harness(tmp_path)
    draft = h.prepare(people=("Alice", "不編輯"))
    payload, _ = h.preview(draft)

    # Part A: Interrupted synchronous /drafts/publish crash mid-write with unmatched remote -> partial/failed + unlocked
    op1, _ = h.store.claim(
        "owner-one",
        "youtube.metadata_publish",
        BatchUpdateInput(
            request_id="req-running-unmatched",
            worksheet_name="Videos",
            title_column="Title",
            description_column="Description",
            assignments=[VideoAssignment(video_id="one", person="Alice")],
        ),
        channel_id="channel-one",
        progress_plan=payload["preview_snapshot"]["plan"],
    )
    h.store.update(
        "owner-one",
        op1["id"],
        lambda doc: (
            doc.update(
                state="running",
                items=[{"index": 0, "phase": "metadata_publish", "remote_id": "one", "state": "running"}],
            )
            or doc["progress"]["rows"][0].update(status="running", attempted_parts=["snippet", "status"])
        ),
    )
    with pytest.raises(Exception) as locked_err:
        h.store.assert_targets_available("owner-one", "channel-one", ["one"])
    assert getattr(locked_err.value, "status_code", None) == 409

    rec1 = h.client.post(f"/api/v1/operations/{op1['id']}/reconcile-youtube")
    assert rec1.status_code == 200, rec1.text
    rec1_data = rec1.json()
    assert rec1_data["state"] == "partial"
    assert rec1_data["items"][0]["state"] == "failed"
    assert rec1_data["progress"]["rows"][0]["status"] == "failed"
    assert rec1_data["result"]["completed"] is False
    assert rec1_data["result"]["failed_count"] == 1
    h.store.assert_targets_available("owner-one", "channel-one", ["one"])

    # Part B: Interrupted synchronous crash where remote actually committed -> running row transitions to succeeded
    op2, _ = h.store.claim(
        "owner-one",
        "youtube.metadata_publish",
        BatchUpdateInput(
            request_id="req-running-matched",
            worksheet_name="Videos",
            title_column="Title",
            description_column="Description",
            assignments=[VideoAssignment(video_id="one", person="Alice")],
        ),
        channel_id="channel-one",
        progress_plan=payload["preview_snapshot"]["plan"],
    )
    h.store.update(
        "owner-one",
        op2["id"],
        lambda doc: (
            doc.update(
                state="running",
                items=[{"index": 0, "phase": "metadata_publish", "remote_id": "one", "state": "running"}],
            )
            or doc["progress"]["rows"][0].update(status="running", attempted_parts=["snippet", "status"])
        ),
    )
    h.provider.videos_by_id["one"]["snippet"].update(
        title=draft["edits"][0]["title"], description=draft["edits"][0]["description"]
    )
    h.provider.videos_by_id["one"]["status"]["privacyStatus"] = "public"

    rec2 = h.client.post(f"/api/v1/operations/{op2['id']}/reconcile-youtube")
    assert rec2.status_code == 200, rec2.text
    rec2_data = rec2.json()
    assert rec2_data["state"] == "completed"
    assert rec2_data["items"][0]["state"] == "completed"
    assert rec2_data["progress"]["rows"][0]["status"] == "succeeded"
    assert rec2_data["result"]["completed"] is True
    assert rec2_data["result"]["succeeded_count"] == 1
    assert rec2_data["result"]["failed_count"] == 0
    h.store.assert_targets_available("owner-one", "channel-one", ["one"])


def test_reconcile_youtube_preserves_failed_before_write_and_handles_skipped_batch_rows(tmp_path):
    store = OperationStore(tmp_path / "ops.sqlite3")
    provider = FakeYouTubeProvider()
    provider.sheet_values["sheet-1"] = [
        ["所屬團體", "人", "Title", "Desc"],
        ["Team", "Alice", "New Title 1", "New Desc 1"],
    ]
    context = _make_context(tmp_path)
    client = _make_client(store, provider, context)

    # 1. Batch with 1 ready video (vid-1), 1 unedited assignment (vid-2 = 不編輯), and 1 sheet-skipped video (vid-3)
    provider.videos_by_id["vid-3"] = {
        "id": "vid-3",
        "snippet": {"channelId": context.channel_id, "title": "Old 3", "description": "Old 3", "categoryId": "22"},
        "status": {"privacyStatus": "private"},
    }
    provider.playlist_items.append(
        {"id": "pl-item-3", "contentDetails": {"videoId": "vid-3"}, "snippet": {"title": "Old 3"}}
    )
    preview_req = {
        "spreadsheet_url_or_id": "sheet-1",
        "playlist_id": "PL-1",
        "worksheet_name": "Sheet1",
        "title_column": "Title",
        "description_column": "Desc",
        "team": "Team",
        "assignments": [
            {"video_id": "vid-1", "person": "Alice"},
            {"video_id": "vid-2", "person": "不編輯"},
            {"video_id": "vid-3", "person": "MissingPerson"},
        ],
    }
    preview = client.post("/api/v1/youtube/batch-preview", json=preview_req).json()
    provider.update_failures["vid-1"] = TimeoutError("lost response")
    provider.skip_commit_ids.add("vid-1")
    res = client.post(
        "/api/v1/youtube/batch-update",
        json={
            **preview_req,
            "request_id": "req-batch-skipped",
            "preview_token": preview["preview_token"],
            "preview_snapshot": preview["preview_snapshot"],
        },
    )
    assert res.status_code == 200
    op_id = res.json()["operation_id"]

    # First reconcile with matched=False sets result.completed=False
    rec1 = client.post(f"/api/v1/operations/{op_id}/reconcile-youtube")
    assert rec1.status_code == 200
    assert rec1.json()["state"] == "partial"
    assert rec1.json()["result"]["completed"] is False

    # Second reconcile with matched=True must reach completed=True with both 不編輯 and skipped vid-3
    provider.videos_by_id["vid-1"]["snippet"].update(title="New Title 1", description="New Desc 1")
    rec2 = client.post(f"/api/v1/operations/{op_id}/reconcile-youtube")
    assert rec2.status_code == 200
    assert rec2.json()["state"] == "completed"
    assert rec2.json()["result"]["completed"] is True
    assert [row["status"] for row in rec2.json()["result"]["results"]] == ["succeeded", "skipped"]

    # 2. failed_before_write item must never flip to completed even when remote matches intended state
    op_fbw, _ = store.claim(
        context.owner_sub,
        "youtube.metadata_update",
        BatchUpdateInput(
            request_id="req-fbw",
            worksheet_name="Sheet1",
            title_column="Title",
            description_column="Desc",
            assignments=[VideoAssignment(video_id="vid-1", person="Alice")],
        ),
        channel_id=context.channel_id,
    )
    store.update(
        context.owner_sub,
        op_fbw["id"],
        lambda doc: doc.update(
            state="partial",
            items=[
                {
                    "index": 0,
                    "phase": "metadata",
                    "remote_id": "vid-1",
                    "state": "failed_before_write",
                    "intended": {"title": "New Title 1", "description": "New Desc 1"},
                }
            ],
            result={
                "operation": "youtube.metadata_update",
                "completed": False,
                "succeeded_count": 0,
                "skipped_count": 0,
                "failed_count": 0,
                "not_attempted_count": 1,
                "results": [{"video_id": "vid-1", "status": "not_attempted", "reason": "quota"}],
            },
        ),
    )
    rec_fbw = client.post(f"/api/v1/operations/{op_fbw['id']}/reconcile-youtube")
    assert rec_fbw.status_code == 200
    fbw_data = rec_fbw.json()
    assert fbw_data["state"] == "partial"
    assert fbw_data["items"][0]["state"] == "failed_before_write"
    assert fbw_data["result"]["completed"] is False
    assert fbw_data["result"]["results"][0]["status"] == "not_attempted"


def test_reconcile_publish_progress_transitions_queued_rows_to_not_attempted_and_unlocks_targets(tmp_path):
    from test_youtube_draft_publish import Harness

    h = Harness(tmp_path)
    draft = h.prepare(people=("Alice", "Alice"))
    payload, _ = h.preview(draft)

    # Case 1: Crash mid-loop with row 0 "running" and row 1 still "queued"
    op1, created1 = h.store.claim(
        "owner-one",
        "youtube.metadata_publish",
        BatchUpdateInput(
            request_id="req-queued-mid",
            worksheet_name="Videos",
            title_column="Title",
            description_column="Description",
            assignments=[
                VideoAssignment(video_id="one", person="Alice"),
                VideoAssignment(video_id="two", person="Alice"),
            ],
        ),
        channel_id="channel-one",
        progress_plan=payload["preview_snapshot"]["plan"],
    )
    assert created1 is True
    h.store.update(
        "owner-one",
        op1["id"],
        lambda doc: (
            doc.update(
                state="running",
                items=[{"index": 0, "phase": "metadata_publish", "remote_id": "one", "state": "running"}],
            )
            or doc["progress"]["rows"][0].update(status="running", attempted_parts=["snippet", "status"])
        ),
    )
    with pytest.raises(Exception) as locked_err:
        h.store.assert_targets_available("owner-one", "channel-one", ["one", "two"])
    assert getattr(locked_err.value, "status_code", None) == 409

    rec1 = h.client.post(f"/api/v1/operations/{op1['id']}/reconcile-youtube")
    assert rec1.status_code == 200, rec1.text
    d1 = rec1.json()
    assert d1["state"] == "partial"
    assert d1["progress"]["rows"][0]["status"] == "failed"
    assert d1["progress"]["rows"][1]["status"] == "not_attempted"
    assert d1["result"]["completed"] is False
    assert d1["result"]["failed_count"] == 1
    assert d1["result"]["not_attempted_count"] == 1
    # Both targets must be unlocked so future operations are not deadlocked
    h.store.assert_targets_available("owner-one", "channel-one", ["one", "two"])

    # Case 2: Crash before any write() (all rows still "queued", items == [])
    op2, created2 = h.store.claim(
        "owner-one",
        "youtube.metadata_publish",
        BatchUpdateInput(
            request_id="req-queued-all",
            worksheet_name="Videos-All-Queued",
            title_column="Title",
            description_column="Description",
            assignments=[
                VideoAssignment(video_id="one", person="Alice"),
                VideoAssignment(video_id="two", person="Alice"),
            ],
        ),
        channel_id="channel-one",
        progress_plan=payload["preview_snapshot"]["plan"],
    )
    assert created2 is True
    h.store.update("owner-one", op2["id"], lambda doc: doc.update(state="running"))

    rec2 = h.client.post(f"/api/v1/operations/{op2['id']}/reconcile-youtube")
    assert rec2.status_code == 200, rec2.text
    d2 = rec2.json()
    assert d2["state"] == "partial"
    assert [row["status"] for row in d2["progress"]["rows"]] == ["not_attempted", "not_attempted"]
    assert d2["result"]["completed"] is False
    assert d2["result"]["not_attempted_count"] == 2
    assert d2["reconciliation"] == {"provider_read": False, "matches_intent": False}
    h.store.assert_targets_available("owner-one", "channel-one", ["one", "two"])


def test_reconcile_cleanup_only_transitions_queued_rows_and_preserves_cleanup_retained(tmp_path):
    store = OperationStore(tmp_path / "ops.sqlite3")
    provider = FakeYouTubeProvider()
    provider.videos_by_id["vid-1"]["status"]["privacyStatus"] = "public"
    provider.videos_by_id["vid-2"]["status"]["privacyStatus"] = "public"
    context = _make_context(tmp_path)
    client = _make_client(store, provider, context)

    preview = client.post("/api/v1/youtube/cleanup-preview", json={"playlist_id": "PL-1"}).json()

    # Part A: Interrupted cleanup_only with row 0 "running" (in items) and row 1 "queued" (unattempted), result=None
    from pydantic import BaseModel

    class CleanupReq(BaseModel):
        request_id: str = "cleanup-queued-1"
        playlist_id: str = "PL-1"
        preview_token: str = preview["preview_token"]
        preview_snapshot: dict = preview["preview_snapshot"]

    op1, _ = store.claim(
        context.owner_sub,
        "youtube.publish_cleanup",
        CleanupReq(),
        channel_id=context.channel_id,
        progress_plan=[{**row, "status": "ready"} for row in preview["preview_snapshot"]["items"]],
    )
    store.update(
        context.owner_sub,
        op1["id"],
        lambda doc: (
            doc.update(
                state="running",
                items=[{"index": 0, "phase": "cleanup", "remote_id": "pl-item-1", "state": "running"}],
            )
            or doc["progress"]["rows"][0].update(status="running")
        ),
    )

    rec1 = client.post(f"/api/v1/operations/{op1['id']}/reconcile-youtube")
    assert rec1.status_code == 200, rec1.text
    d1 = rec1.json()
    assert d1["state"] == "partial"
    assert [row["status"] for row in d1["progress"]["rows"]] == ["failed", "not_attempted"]
    assert [row["status"] for row in d1["result"]["results"]] == ["failed", "not_attempted"]
    assert d1["result"]["failed_count"] == 1
    assert d1["result"]["not_attempted_count"] == 1
    assert d1["result"]["total_count"] == 2
    assert d1["result"]["completed"] is False

    # Part B: CleanupRetained (failed_before_write + "skipped") stays "skipped"/"failed_before_write" even if removed externally
    op2, _ = store.claim(
        context.owner_sub,
        "youtube.publish_cleanup",
        CleanupReq(request_id="cleanup-retained-1"),
        channel_id=context.channel_id,
        progress_plan=[{**row, "status": "ready"} for row in preview["preview_snapshot"]["items"]],
    )
    store.update(
        context.owner_sub,
        op2["id"],
        lambda doc: (
            doc.update(
                state="partial",
                items=[
                    {"index": 0, "phase": "cleanup", "remote_id": "pl-item-1", "state": "failed_before_write"},
                    {"index": 1, "phase": "cleanup", "remote_id": "pl-item-2", "state": "needs_reconciliation"},
                ],
                result={
                    "version": 2,
                    "mode": "cleanup_only",
                    "operation": "youtube.publish_cleanup",
                    "playlist_id": "PL-1",
                    "completed": False,
                    "results": [
                        {
                            "video_id": "vid-1",
                            "playlist_item_id": "pl-item-1",
                            "status": "skipped",
                            "reason": "retained",
                        },
                        {"video_id": "vid-2", "playlist_item_id": "pl-item-2", "status": "needs_reconciliation"},
                    ],
                },
            )
            or doc["progress"]["rows"][0].update(status="skipped", reason="retained")
            or doc["progress"]["rows"][1].update(status="needs_reconciliation")
        ),
    )
    # Remove BOTH playlist items externally
    provider.playlist_items = []
    rec2 = client.post(f"/api/v1/operations/{op2['id']}/reconcile-youtube")
    assert rec2.status_code == 200, rec2.text
    d2 = rec2.json()
    assert d2["items"][0]["state"] == "failed_before_write"
    assert d2["items"][1]["state"] == "completed"
    assert d2["progress"]["rows"][0]["status"] == "skipped"
    assert d2["progress"]["rows"][1]["status"] == "succeeded"
    assert d2["result"]["results"][0]["status"] == "skipped"
    assert d2["result"]["results"][1]["status"] == "succeeded"

    # Part C: Legacy cleanup_only with progress=None and result=None rebuilds from snapshot["items"]
    snapshot_mix = {
        **preview["preview_snapshot"],
        "items": [
            {**preview["preview_snapshot"]["items"][0], "candidate": True},
            {**preview["preview_snapshot"]["items"][1], "candidate": False, "reason": "not public"},
            {
                "playlist_id": "PL-1",
                "playlist_item_id": "pl-item-3",
                "video_id": "vid-3",
                "candidate": True,
            },
            {
                "playlist_id": "PL-1",
                "playlist_item_id": "pl-item-4",
                "video_id": "vid-4",
                "candidate": True,
            },
        ],
    }
    op3, _ = store.claim(
        context.owner_sub,
        "youtube.publish_cleanup",
        CleanupReq(request_id="cleanup-legacy-rebuild", preview_snapshot=snapshot_mix),
        channel_id=context.channel_id,
    )
    store.update(
        context.owner_sub,
        op3["id"],
        lambda doc: doc.update(
            state="partial",
            items=[
                {"index": 0, "phase": "cleanup", "remote_id": "pl-item-1", "state": "needs_reconciliation"},
                {"index": 1, "phase": "cleanup", "remote_id": "pl-item-3", "state": "failed_before_write"},
            ],
            result=None,
        ),
    )
    # pl-item-1 was removed externally, pl-item-3 (failed_before_write) was also removed externally
    rec3 = client.post(f"/api/v1/operations/{op3['id']}/reconcile-youtube")
    assert rec3.status_code == 200, rec3.text
    d3 = rec3.json()
    assert d3["state"] == "partial"
    assert d3["items"][1]["state"] == "failed_before_write"
    assert [row["video_id"] for row in d3["result"]["results"]] == ["vid-1", "vid-2", "vid-3", "vid-4"]
    assert [row["status"] for row in d3["result"]["results"]] == [
        "succeeded",
        "skipped",
        "skipped",
        "not_attempted",
    ]
    assert d3["result"]["completed"] is False


def test_reconcile_youtube_multi_attempt_failed_before_write_fallback_and_all_skipped(tmp_path):
    store = OperationStore(tmp_path / "ops.sqlite3")
    provider = FakeYouTubeProvider()
    context = _make_context(tmp_path)
    client = _make_client(store, provider, context)

    # 1. Batch [failed_before_write, needs_reconciliation] -> matched=False -> partial + reconciled=True; then matched=True -> completed
    op1, _ = store.claim(
        context.owner_sub,
        "youtube.metadata_update",
        BatchUpdateInput(
            request_id="req-multi-fbw-1",
            worksheet_name="Sheet1",
            title_column="Title",
            description_column="Desc",
            assignments=[VideoAssignment(video_id="vid-1", person="Alice")],
        ),
        channel_id=context.channel_id,
    )
    store.update(
        context.owner_sub,
        op1["id"],
        lambda doc: doc.update(
            state="needs_reconciliation",
            items=[
                {
                    "index": 0,
                    "phase": "metadata",
                    "remote_id": "vid-1",
                    "state": "failed_before_write",
                    "intended": {"title": "New Title 1", "description": "New Desc 1"},
                },
                {
                    "index": 1,
                    "phase": "metadata",
                    "remote_id": "vid-1",
                    "state": "needs_reconciliation",
                    "intended": {"title": "New Title 1", "description": "New Desc 1"},
                },
            ],
            result={
                "operation": "youtube.metadata_update",
                "completed": False,
                "succeeded_count": 0,
                "skipped_count": 0,
                "failed_count": 1,
                "results": [{"video_id": "vid-1", "status": "failed", "title": "Old Title", "description": "Old Desc"}],
            },
        ),
    )

    rec_unmatched = client.post(f"/api/v1/operations/{op1['id']}/reconcile-youtube")
    assert rec_unmatched.status_code == 200, rec_unmatched.text
    d_unmatched = rec_unmatched.json()
    assert d_unmatched["state"] == "partial"
    assert d_unmatched["result"]["completed"] is False
    assert d_unmatched["result"]["reconciled"] is True
    assert d_unmatched["result"]["results"][0]["status"] == "failed"
    assert d_unmatched["result"]["results"][0]["reconciled"] is True
    assert [it["state"] for it in d_unmatched["items"]] == ["failed_before_write", "failed"]

    provider.videos_by_id["vid-1"]["snippet"].update(title="New Title 1", description="New Desc 1")
    rec_matched = client.post(f"/api/v1/operations/{op1['id']}/reconcile-youtube")
    assert rec_matched.status_code == 200, rec_matched.text
    d_matched = rec_matched.json()
    assert d_matched["state"] == "completed"
    assert d_matched["result"]["completed"] is True
    assert d_matched["result"]["succeeded_count"] == 1
    assert d_matched["result"]["failed_count"] == 0
    assert d_matched["result"]["results"][0]["status"] == "succeeded"
    assert d_matched["result"]["results"][0]["title"] == "New Title 1"
    assert [it["state"] for it in d_matched["items"]] == ["failed_before_write", "completed"]

    # 2. [failed_before_write, completed] with result=None reconstructs single succeeded row
    op2, _ = store.claim(
        context.owner_sub,
        "youtube.metadata_update",
        BatchUpdateInput(
            request_id="req-multi-fbw-none",
            worksheet_name="Sheet1",
            title_column="Title",
            description_column="Desc",
            assignments=[VideoAssignment(video_id="vid-1", person="Alice")],
        ),
        channel_id=context.channel_id,
    )
    store.update(
        context.owner_sub,
        op2["id"],
        lambda doc: doc.update(
            state="running",
            items=[
                {
                    "index": 0,
                    "phase": "metadata",
                    "remote_id": "vid-1",
                    "state": "failed_before_write",
                    "intended": {"title": "New Title 1", "description": "New Desc 1"},
                },
                {
                    "index": 1,
                    "phase": "metadata",
                    "remote_id": "vid-1",
                    "state": "completed",
                    "intended": {"title": "New Title 1", "description": "New Desc 1"},
                },
            ],
            result=None,
        ),
    )
    rec_reconstruct = client.post(f"/api/v1/operations/{op2['id']}/reconcile-youtube")
    assert rec_reconstruct.status_code == 200, rec_reconstruct.text
    d_rec = rec_reconstruct.json()
    assert d_rec["state"] == "completed"
    assert d_rec["result"]["completed"] is True
    assert len(d_rec["result"]["results"]) == 1
    assert d_rec["result"]["results"][0]["status"] == "succeeded"

    # 3. [completed, failed_before_write] stays partial even when remote matches
    op3, _ = store.claim(
        context.owner_sub,
        "youtube.metadata_update",
        BatchUpdateInput(
            request_id="req-multi-latest-fbw",
            worksheet_name="Sheet1",
            title_column="Title",
            description_column="Desc",
            assignments=[VideoAssignment(video_id="vid-1", person="Alice")],
        ),
        channel_id=context.channel_id,
    )
    store.update(
        context.owner_sub,
        op3["id"],
        lambda doc: doc.update(
            state="partial",
            items=[
                {
                    "index": 0,
                    "phase": "metadata",
                    "remote_id": "vid-1",
                    "state": "completed",
                    "intended": {"title": "New Title 1", "description": "New Desc 1"},
                },
                {
                    "index": 1,
                    "phase": "metadata",
                    "remote_id": "vid-1",
                    "state": "failed_before_write",
                    "intended": {"title": "New Title 1", "description": "New Desc 1"},
                },
            ],
            result={
                "operation": "youtube.metadata_update",
                "completed": False,
                "results": [{"video_id": "vid-1", "status": "failed"}],
            },
        ),
    )
    rec_latest_fbw = client.post(f"/api/v1/operations/{op3['id']}/reconcile-youtube")
    assert rec_latest_fbw.status_code == 200, rec_latest_fbw.text
    assert rec_latest_fbw.json()["state"] == "partial"
    assert rec_latest_fbw.json()["result"]["completed"] is False

    # 4. Already-completed all-skipped metadata_update (items=[]) is not demoted to partial
    op4, _ = store.claim(
        context.owner_sub,
        "youtube.metadata_update",
        BatchUpdateInput(
            request_id="req-all-skipped",
            worksheet_name="Sheet1",
            title_column="Title",
            description_column="Desc",
            assignments=[VideoAssignment(video_id="vid-1", person="不編輯")],
        ),
        channel_id=context.channel_id,
    )
    store.update(
        context.owner_sub,
        op4["id"],
        lambda doc: doc.update(
            state="completed",
            items=[],
            result={
                "operation": "youtube.metadata_update",
                "completed": True,
                "succeeded_count": 0,
                "skipped_count": 1,
                "failed_count": 0,
                "results": [{"video_id": "vid-1", "status": "skipped"}],
            },
        ),
    )
    rec_all_skipped = client.post(f"/api/v1/operations/{op4['id']}/reconcile-youtube")
    assert rec_all_skipped.status_code == 200, rec_all_skipped.text
    assert rec_all_skipped.json()["state"] == "completed"
    assert rec_all_skipped.json()["result"]["completed"] is True


def test_reconcile_draft_publish_legacy_non_progress_preserves_not_attempted_fbw_and_state_consistency(tmp_path):
    from test_youtube_draft_publish import Harness

    h = Harness(tmp_path)
    draft = h.prepare(people=("Alice", "Alice"))
    payload, _ = h.preview(draft)

    # Case 1: Legacy op with result: vid-1 succeeded, vid-2 not_attempted + failed_before_write,
    # even when vid-2 matches remotely -> stays partial, result.completed=False, row not promoted, reconciled=True
    op1, _ = h.store.claim(
        "owner-one",
        "youtube.metadata_publish",
        BatchUpdateInput(
            request_id="req-legacy-fbw",
            worksheet_name="Videos",
            title_column="Title",
            description_column="Description",
            assignments=[
                VideoAssignment(video_id="one", person="Alice"),
                VideoAssignment(video_id="two", person="Bob"),
            ],
        ),
        channel_id="channel-one",
    )
    h.store.update(
        "owner-one",
        op1["id"],
        lambda doc: doc.update(
            state="partial",
            plan={**doc["plan"], "preview_snapshot": payload["preview_snapshot"]},
            items=[
                {"index": 0, "phase": "metadata_publish", "remote_id": "one", "state": "completed"},
                {"index": 1, "phase": "metadata_publish", "remote_id": "two", "state": "failed_before_write"},
            ],
            result={
                "operation": "youtube.metadata_publish",
                "completed": False,
                "results": [
                    {"video_id": "one", "status": "succeeded"},
                    {"video_id": "two", "status": "not_attempted", "reason": "quota"},
                ],
            },
        ),
    )
    for vid, idx in (("one", 0), ("two", 1)):
        h.provider.videos_by_id[vid]["snippet"].update(
            title=draft["edits"][idx]["title"], description=draft["edits"][idx]["description"]
        )
        h.provider.videos_by_id[vid]["status"]["privacyStatus"] = "public"

    rec1 = h.client.post(f"/api/v1/operations/{op1['id']}/reconcile-youtube")
    assert rec1.status_code == 200, rec1.text
    d1 = rec1.json()
    assert d1["state"] == "partial"
    assert d1["result"]["completed"] is False
    assert d1["result"]["reconciled"] is True
    assert d1["items"][1]["state"] == "failed_before_write"
    assert d1["result"]["results"][1]["status"] == "not_attempted"

    # Case 2: Legacy op with missing/empty preview_snapshot["plan"] and result=None -> state="partial" AND result.completed=False
    op2, _ = h.store.claim(
        "owner-one",
        "youtube.metadata_publish",
        BatchUpdateInput(
            request_id="req-legacy-empty-plan",
            worksheet_name="Videos",
            title_column="Title",
            description_column="Description",
            assignments=[VideoAssignment(video_id="one", person="Alice")],
        ),
        channel_id="channel-one",
    )
    h.store.update(
        "owner-one",
        op2["id"],
        lambda doc: doc.update(
            state="needs_reconciliation",
            items=[{"index": 0, "phase": "metadata_publish", "remote_id": "one", "state": "needs_reconciliation"}],
            result=None,
        ),
    )
    rec2 = h.client.post(f"/api/v1/operations/{op2['id']}/reconcile-youtube")
    assert rec2.status_code == 200, rec2.text
    d2 = rec2.json()
    assert d2["state"] == "partial"
    assert d2["result"]["completed"] is False
    assert d2["items"][0]["state"] == "failed"


def test_reconcile_cleanup_only_corrupt_or_empty_results_cannot_complete_failed_operation(tmp_path):
    store = OperationStore(tmp_path / "ops.sqlite3")
    provider = FakeYouTubeProvider()
    provider.videos_by_id["vid-1"]["status"]["privacyStatus"] = "public"
    provider.videos_by_id["vid-2"]["status"]["privacyStatus"] = "public"
    context = _make_context(tmp_path)
    client = _make_client(store, provider, context)

    preview = client.post("/api/v1/youtube/cleanup-preview", json={"playlist_id": "PL-1"}).json()

    from pydantic import BaseModel

    class CleanupReq(BaseModel):
        request_id: str
        playlist_id: str = "PL-1"
        preview_token: str = preview["preview_token"]
        preview_snapshot: dict = preview["preview_snapshot"]

    for req_id, raw_result in (
        (
            "cleanup-corrupt-results",
            {"version": 2, "mode": "cleanup_only", "completed": False, "results": "corrupt"},
        ),
        (
            "cleanup-empty-results",
            {"version": 2, "mode": "cleanup_only", "completed": True, "results": []},
        ),
    ):
        op, _ = store.claim(
            context.owner_sub,
            "youtube.publish_cleanup",
            CleanupReq(request_id=req_id),
            channel_id=context.channel_id,
            progress_plan=[{**row, "status": "ready"} for row in preview["preview_snapshot"]["items"]],
        )
        store.update(
            context.owner_sub,
            op["id"],
            lambda doc, res=raw_result: (
                doc.update(
                    state="needs_reconciliation",
                    items=[{"index": 0, "phase": "cleanup", "remote_id": "pl-item-1", "state": "needs_reconciliation"}],
                    result=dict(res),
                )
                or doc["progress"]["rows"][0].update(status="needs_reconciliation")
            ),
        )

        rec = client.post(f"/api/v1/operations/{op['id']}/reconcile-youtube")
        assert rec.status_code == 200, rec.text
        data = rec.json()
        assert data["state"] == "partial"
        assert data["items"][0]["state"] == "failed"
        assert [row["status"] for row in data["progress"]["rows"]] == ["failed", "not_attempted"]
        assert data["result"]["completed"] is False
        assert data["result"]["reconciled"] is True
        assert [row["status"] for row in data["result"]["results"]] == ["failed", "not_attempted"]
        assert data["result"]["failed_count"] == 1
        assert data["result"]["not_attempted_count"] == 1

    # Also verify no-progress fallback cannot vacuously complete on corrupt/empty results
    op_no_prog, _ = store.claim(
        context.owner_sub,
        "youtube.publish_cleanup",
        CleanupReq(request_id="cleanup-no-prog-corrupt"),
        channel_id=context.channel_id,
    )
    store.update(
        context.owner_sub,
        op_no_prog["id"],
        lambda doc: doc.update(
            state="needs_reconciliation",
            items=[{"index": 0, "phase": "cleanup", "remote_id": "pl-item-1", "state": "needs_reconciliation"}],
            result={"version": 2, "mode": "cleanup_only", "completed": True, "results": "corrupt"},
        ),
    )
    rec_no_prog = client.post(f"/api/v1/operations/{op_no_prog['id']}/reconcile-youtube")
    assert rec_no_prog.status_code == 200, rec_no_prog.text
    d_no_prog = rec_no_prog.json()
    assert d_no_prog["state"] == "partial"
    assert d_no_prog["items"][0]["state"] == "failed"
    assert d_no_prog["result"]["completed"] is False
    assert d_no_prog["result"]["reconciled"] is True


def test_reconcile_draft_publish_legacy_active_plan_empty_or_corrupt_results_and_empty_items(tmp_path):
    from test_youtube_draft_publish import Harness

    h = Harness(tmp_path)
    draft = h.prepare(people=("Alice", "不編輯"))
    payload, _ = h.preview(draft)

    # Make remote "one" match intended title/description/public even though zero write attempts occurred
    h.provider.videos_by_id["one"]["snippet"].update(
        title=draft["edits"][0]["title"],
        description=draft["edits"][0]["description"],
    )
    h.provider.videos_by_id["one"]["status"]["privacyStatus"] = "public"

    for req_id, raw_results in (("req-legacy-empty-res", []), ("req-legacy-corrupt-res", "corrupt")):
        op, _ = h.store.claim(
            "owner-one",
            "youtube.metadata_publish",
            BatchUpdateInput(
                request_id=req_id,
                worksheet_name="Videos",
                title_column="Title",
                description_column="Description",
                assignments=[VideoAssignment(video_id="one", person="Alice")],
            ),
            channel_id="channel-one",
        )
        h.store.update(
            "owner-one",
            op["id"],
            lambda doc, results_val=raw_results: doc.update(
                state="partial",
                plan={**doc["plan"], "preview_snapshot": payload["preview_snapshot"]},
                items=[],
                result={
                    "operation": "youtube.metadata_publish",
                    "completed": True,
                    "results": results_val,
                },
            ),
        )
        rec = h.client.post(f"/api/v1/operations/{op['id']}/reconcile-youtube")
        assert rec.status_code == 200, rec.text
        data = rec.json()
        assert data["state"] == "partial"
        assert data["result"]["completed"] is False
        assert data["result"]["reconciled"] is True


def test_reconcile_youtube_batch_empty_items_corrupt_or_empty_results_cannot_complete(tmp_path):
    store = OperationStore(tmp_path / "ops.sqlite3")
    provider = FakeYouTubeProvider()
    context = _make_context(tmp_path)
    client = _make_client(store, provider, context)

    for req_id, raw_results in (("req-batch-empty", []), ("req-batch-corrupt", "corrupt")):
        op, _ = store.claim(
            context.owner_sub,
            "youtube.metadata_update",
            BatchUpdateInput(
                request_id=req_id,
                worksheet_name="Sheet1",
                title_column="Title",
                description_column="Desc",
                assignments=[VideoAssignment(video_id="vid-1", person="Alice")],
            ),
            channel_id=context.channel_id,
        )
        store.update(
            context.owner_sub,
            op["id"],
            lambda doc, results_val=raw_results: doc.update(
                state="partial",
                items=[],
                result={
                    "operation": "youtube.metadata_update",
                    "completed": True,
                    "results": results_val,
                },
            ),
        )
        rec = client.post(f"/api/v1/operations/{op['id']}/reconcile-youtube")
        assert rec.status_code == 200, rec.text
        data = rec.json()
        assert data["state"] == "partial"
        assert data["result"]["completed"] is False


def test_reconcile_youtube_batch_missing_active_assignment_cannot_complete_via_stale_result_flag(tmp_path):
    store = OperationStore(tmp_path / "ops.sqlite3")
    provider = FakeYouTubeProvider()
    provider.videos_by_id["vid-1"]["snippet"].update(title="New Title 1", description="New Desc 1")
    context = _make_context(tmp_path)
    client = _make_client(store, provider, context)

    op, _ = store.claim(
        context.owner_sub,
        "youtube.metadata_update",
        BatchUpdateInput(
            request_id="req-batch-seen-lt-expected",
            worksheet_name="Sheet1",
            title_column="Title",
            description_column="Desc",
            assignments=[
                VideoAssignment(video_id="vid-1", person="Alice"),
                VideoAssignment(video_id="vid-2", person="Bob"),
            ],
        ),
        channel_id=context.channel_id,
    )
    store.update(
        context.owner_sub,
        op["id"],
        lambda doc: doc.update(
            state="partial",
            items=[
                {
                    "index": 0,
                    "phase": "metadata",
                    "remote_id": "vid-1",
                    "state": "completed",
                    "intended": {"title": "New Title 1", "description": "New Desc 1"},
                }
            ],
            result={
                "operation": "youtube.metadata_update",
                "completed": True,
                "results": [{"video_id": "vid-1", "status": "succeeded"}],
            },
        ),
    )

    rec = client.post(f"/api/v1/operations/{op['id']}/reconcile-youtube")
    assert rec.status_code == 200, rec.text
    data = rec.json()
    assert data["state"] == "partial"
    assert data["result"]["completed"] is False
    assert data["reconciliation"]["matches_intent"] is False


def test_reconcile_youtube_batch_non_dict_result_entry_forces_partial(tmp_path):
    store = OperationStore(tmp_path / "ops.sqlite3")
    provider = FakeYouTubeProvider()
    provider.videos_by_id["vid-1"]["snippet"].update(title="New Title 1", description="New Desc 1")
    context = _make_context(tmp_path)
    client = _make_client(store, provider, context)

    op, _ = store.claim(
        context.owner_sub,
        "youtube.metadata_update",
        BatchUpdateInput(
            request_id="req-batch-non-dict-result",
            worksheet_name="Sheet1",
            title_column="Title",
            description_column="Desc",
            assignments=[VideoAssignment(video_id="vid-1", person="Alice")],
        ),
        channel_id=context.channel_id,
    )
    store.update(
        context.owner_sub,
        op["id"],
        lambda doc: doc.update(
            state="partial",
            items=[
                {
                    "index": 0,
                    "phase": "metadata",
                    "remote_id": "vid-1",
                    "state": "completed",
                    "intended": {"title": "New Title 1", "description": "New Desc 1"},
                }
            ],
            result={
                "operation": "youtube.metadata_update",
                "completed": True,
                "results": ["bad-entry", {"video_id": "vid-1", "status": "succeeded"}],
            },
        ),
    )

    rec = client.post(f"/api/v1/operations/{op['id']}/reconcile-youtube")
    assert rec.status_code == 200, rec.text
    data = rec.json()
    assert data["state"] == "partial"
    assert data["result"]["completed"] is False
    assert data["reconciliation"]["matches_intent"] is False


def test_reconcile_cleanup_only_handles_corrupt_progress_rows(tmp_path):
    store = OperationStore(tmp_path / "ops.sqlite3")
    provider = FakeYouTubeProvider()
    provider.videos_by_id["vid-1"]["status"]["privacyStatus"] = "public"
    context = _make_context(tmp_path)
    client = _make_client(store, provider, context)

    preview = client.post("/api/v1/youtube/cleanup-preview", json={"playlist_id": "PL-1"}).json()
    # Simulate pl-item-1 already removed remotely so only corrupt progress prevents completion
    provider.playlist_items = [item for item in provider.playlist_items if item["id"] != "pl-item-1"]

    from pydantic import BaseModel

    class CleanupReq(BaseModel):
        request_id: str
        playlist_id: str = "PL-1"
        preview_token: str = preview["preview_token"]
        preview_snapshot: dict = preview["preview_snapshot"]

    for req_id, corrupt_progress, raw_result in (
        (
            "cleanup-progress-not-list-with-result",
            {"rows": "corrupt"},
            {
                "version": 2,
                "mode": "cleanup_only",
                "completed": True,
                "results": [{"playlist_item_id": "pl-item-1", "video_id": "vid-1", "status": "succeeded"}],
            },
        ),
        (
            "cleanup-progress-not-list-no-result",
            {"rows": "corrupt"},
            None,
        ),
        (
            "cleanup-progress-non-dict-row-with-result",
            {
                "rows": [
                    "bad-progress-row",
                    {
                        "video_id": "vid-1",
                        "playlist_item_id": "pl-item-1",
                        "status": "needs_reconciliation",
                    },
                ]
            },
            {
                "version": 2,
                "mode": "cleanup_only",
                "completed": True,
                "results": [{"playlist_item_id": "pl-item-1", "video_id": "vid-1", "status": "succeeded"}],
            },
        ),
        (
            "cleanup-progress-non-dict-row-no-result",
            {
                "rows": [
                    "bad-progress-row",
                    {
                        "video_id": "vid-1",
                        "playlist_item_id": "pl-item-1",
                        "status": "needs_reconciliation",
                    },
                ]
            },
            None,
        ),
    ):
        op, _ = store.claim(
            context.owner_sub,
            "youtube.publish_cleanup",
            CleanupReq(request_id=req_id),
            channel_id=context.channel_id,
        )
        store.update(
            context.owner_sub,
            op["id"],
            lambda doc, prog=corrupt_progress, res=raw_result: doc.update(
                state="needs_reconciliation",
                items=[{"index": 0, "phase": "cleanup", "remote_id": "pl-item-1", "state": "needs_reconciliation"}],
                progress=dict(prog),
                result=dict(res) if isinstance(res, dict) else None,
            ),
        )

        rec = client.post(f"/api/v1/operations/{op['id']}/reconcile-youtube")
        assert rec.status_code == 200, rec.text
        data = rec.json()
        assert data["state"] == "partial"
        assert data["result"]["completed"] is False
