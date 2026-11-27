"""Exercise the real HTTP, signing, provider writer, quota and durable journal boundaries."""

import copy
import json
from dataclasses import replace
from types import SimpleNamespace

import httplib2
import pytest
from fastapi.testclient import TestClient
from googleapiclient.errors import HttpError
from itsdangerous import TimestampSigner

from backend.app.api.youtube_models import DraftPublishInput
from backend.app.core.dependencies import require_account_subject, require_sheets_credentials, require_youtube_context
from backend.app.core.operation_store import OperationStore
from backend.app.core.youtube_context import YouTubeRequestContext
from backend.app.core.youtube_quota_limiter import YouTubeQuotaLimiter
from backend.app.main import create_app


class Request:
    def __init__(self, call):
        self.call = call

    def execute(self):
        return self.call()


def video(video_id, *, title="Original", description="Original description", privacy="private"):
    return {
        "id": video_id,
        "snippet": {
            "channelId": "channel-one",
            "title": title,
            "description": description,
            "categoryId": "22",
            "tags": ["keep", "tag"],
            "defaultLanguage": "zh-TW",
            "defaultAudioLanguage": "ko",
            "localized": {"title": "read-only"},
            "publishedAt": "2026-01-01T00:00:00Z",
        },
        "status": {
            "privacyStatus": privacy,
            "license": "creativeCommon",
            "embeddable": False,
            "publicStatsViewable": False,
            "selfDeclaredMadeForKids": False,
            "containsSyntheticMedia": True,
            "publishAt": "2026-12-01T00:00:00Z",
            "uploadStatus": "processed",
            "madeForKids": False,
        },
    }


class Provider:
    def __init__(self):
        self.videos_by_id = {"one": video("one"), "two": video("two")}
        self.members = ["one", "two"]
        self.writes, self.reads = [], []
        self.deletes = []
        self.failures = {}

    def factory(self, service, version, *, credentials):
        assert (service, version) == ("youtube", "v3")
        provider, slot = self, credentials

        class Resource:
            def list(self, **kwargs):
                def read():
                    provider.reads.append((slot, kwargs))
                    if "playlistId" in kwargs:
                        return {
                            "items": [
                                {"id": f"item-{key}", "contentDetails": {"videoId": key}} for key in provider.members
                            ]
                        }
                    if kwargs["id"].startswith("item-"):
                        return {
                            "items": [
                                {"id": kwargs["id"], "contentDetails": {"videoId": key}}
                                for key in provider.members
                                if kwargs["id"] == f"item-{key}"
                            ]
                        }
                    ids = kwargs["id"].split(",")
                    return {
                        "items": copy.deepcopy(
                            [provider.videos_by_id[key] for key in ids if key in provider.videos_by_id]
                        )
                    }

                return Request(read)

            def update(self, *, part, body):
                def write():
                    provider.writes.append((slot, part, copy.deepcopy(body)))
                    failure = provider.failures.get((slot, body["id"]))
                    if failure in {"forbidden", "quotaExceeded"}:
                        raise HttpError(
                            httplib2.Response({"status": "403"}),
                            json.dumps({"error": {"errors": [{"reason": failure}]}}).encode(),
                        )
                    if failure == "timeout_absent":
                        raise TimeoutError("response lost before observable commit")
                    target = provider.videos_by_id[body["id"]]
                    for field in ("snippet", "status"):
                        if field in body:
                            target[field].update(body[field])
                    if failure == "timeout_committed":
                        raise TimeoutError("response lost after commit")
                    if failure == "incomplete_response":
                        return {"id": body["id"]}
                    return copy.deepcopy(target)

                return Request(write)

            def delete(self, *, id):
                def remove():
                    provider.deletes.append(id)
                    provider.members.remove(id.removeprefix("item-"))

                return Request(remove)

        return SimpleNamespace(videos=lambda: Resource(), playlistItems=lambda: Resource())


class Harness:
    def __init__(self, tmp_path):
        self.provider = Provider()
        self.store = OperationStore(tmp_path / "operations.sqlite3")
        self.context = YouTubeRequestContext(
            slot="primary",
            credentials="primary",
            quota_limiter=YouTubeQuotaLimiter(
                tmp_path / "primary.json", configured_limit=10_000, safety_buffer_units=1
            ),
            owner_sub="owner-one",
            channel_id="channel-one",
            session_id="session",
            routing_mode="auto_primary",
        )
        self.secondary = replace(
            self.context,
            slot="secondary",
            credentials="secondary",
            quota_limiter=YouTubeQuotaLimiter(
                tmp_path / "secondary.json", configured_limit=10_000, safety_buffer_units=1, slot="secondary"
            ),
        )
        self.rows = [
            {"所屬團體": "Team", "人": "Alice", "Title": "Applied title", "Description": "Applied description"}
        ]
        self.headers = ["所屬團體", "人", "Title", "Description"]
        self.fallback = False
        self.client = self.new_client()

    def new_client(self):
        return TestClient(
            create_app(
                google_client_factory=self.provider.factory,
                operation_store=self.store,
                youtube_workflow_adapters={
                    "get_account_setting": lambda *_: "",
                    "get_sheet_headers": lambda *_: list(self.headers),
                    "get_all_rows_for_sheet": lambda *_: copy.deepcopy(self.rows),
                    "_switch_youtube_context": lambda context, **kwargs: (
                        self.secondary
                        if self.fallback and context.slot == "primary" and "secondary" not in kwargs["attempted_slots"]
                        else None
                    ),
                },
                dependency_overrides={
                    require_youtube_context: lambda: self.context,
                    require_sheets_credentials: lambda: object(),
                    require_account_subject: lambda: self.context.owner_sub,
                },
            )
        )

    def prepare(self, video_type="Video", people=("Alice", "不編輯")):
        response = self.client.post(
            "/api/v1/youtube/drafts/prepare",
            json={
                "spreadsheet_url_or_id": "sheet-one",
                "playlist_id": "PLdrafts_test",
                "video_type": video_type,
                "worksheet_name": "Videos",
                "title_column": "Title",
                "description_column": "Description",
                "team": "Team",
                "assignments": [
                    {"video_id": key, "person": person} for key, person in zip(self.provider.videos_by_id, people)
                ],
            },
        )
        assert response.status_code == 200, response.text
        stage = response.json()
        return {
            **stage,
            "edits": [
                {
                    "video_id": item["video_id"],
                    "title": item["newTitle"],
                    "description": item["newDescription"],
                    "skip": item["status"] == "skipped",
                }
                for item in stage["stage_snapshot"]["plan"]
            ],
        }

    def preview(self, payload):
        response = self.client.post("/api/v1/youtube/drafts/preview", json=payload)
        assert response.status_code == 200, response.text
        preview = response.json()
        return {
            **payload,
            "preview_token": preview["preview_token"],
            "preview_snapshot": preview["preview_snapshot"],
        }, preview

    def publish(self, payload):
        return self.client.post("/api/v1/youtube/drafts/publish", json=payload)


@pytest.fixture
def harness(tmp_path):
    return Harness(tmp_path)


@pytest.mark.parametrize("kind", ["Video", "Shorts"])
def test_stages_manual_content_without_writes_then_updates_and_publishes_once(harness, kind):
    draft = harness.prepare(kind)
    assert harness.provider.writes == []
    draft["edits"][0].update(title="My final manual title", description="line\n" * 900)
    payload, preview = harness.preview(draft)
    assert harness.provider.writes == []
    assert preview["quota"]["write_calls"] == 1
    assert preview["quota"]["write_units"] == 50
    assert preview["plan"][0]["parts"] == ["snippet", "status"]
    response = harness.publish(payload)
    assert response.status_code == 200, response.text
    result = response.json()
    assert [item["status"] for item in result["results"]] == ["succeeded", "skipped"]
    assert len(harness.provider.writes) == 1
    _, part, body = harness.provider.writes[0]
    assert part == "snippet,status"
    assert body["snippet"] == {
        "title": "My final manual title",
        "description": "line\n" * 900,
        "categoryId": "22",
        "tags": ["keep", "tag"],
        "defaultLanguage": "zh-TW",
        "defaultAudioLanguage": "ko",
    }
    assert body["status"] == {
        "privacyStatus": "public",
        "license": "creativeCommon",
        "embeddable": False,
        "publicStatsViewable": False,
        "selfDeclaredMadeForKids": False,
        "containsSyntheticMedia": True,
    }
    assert harness.provider.videos_by_id["two"]["status"]["privacyStatus"] == "private"
    methods = harness.context.quota_limiter.get_usage()["methods"]
    assert next(item for item in methods if item["method"] == "videos.update")["units"] == 50
    operation = harness.store.get("owner-one", result["operation_id"])
    intended = operation["items"][0]["intended"]
    assert intended["title"] == "My final manual title"
    assert intended["description"] == "line\n" * 900
    assert intended["privacyStatus"] == "public"
    assert intended["parts"] == ["snippet", "status"]
    assert intended["person_key"] == "Alice"
    assert intended["attempted_write"] is True
    # Restart/replay returns the recorded result without another provider call.
    harness.client = harness.new_client()
    assert harness.publish(payload).json()["operation_id"] == result["operation_id"]
    assert len(harness.provider.writes) == 1


@pytest.mark.parametrize(
    "title,description,privacy,parts",
    [
        ("Applied title", "Applied description", "private", ["status"]),
        ("Original", "Original description", "public", ["snippet"]),
        ("Applied title", "Applied description", "public", []),
    ],
)
def test_uses_minimum_necessary_parts_or_no_write(harness, title, description, privacy, parts):
    harness.provider.videos_by_id["one"] = video("one", title=title, description=description, privacy=privacy)
    payload, preview = harness.preview(harness.prepare())
    assert preview["plan"][0]["parts"] == parts
    assert preview["quota"]["write_units"] == (50 if parts else 0)
    assert harness.publish(payload).status_code == 200
    assert len(harness.provider.writes) == bool(parts)
    if parts:
        assert harness.provider.writes[0][1] == ",".join(parts)


@pytest.mark.parametrize(
    "mutation", ["manual", "skip", "stage", "account", "channel", "sheet", "playlist", "metadata", "type"]
)
def test_rejects_tampered_or_stale_plans_before_writing(harness, mutation):
    payload, _ = harness.preview(harness.prepare())
    if mutation == "manual":
        payload["edits"][0]["title"] = "tampered"
    if mutation == "skip":
        payload["edits"][1]["skip"] = False
        payload["edits"][1]["title"] = "do not publish"
    if mutation == "stage":
        payload["stage_snapshot"]["plan"][0]["newTitle"] = "tampered"
    if mutation == "account":
        harness.context = replace(harness.context, owner_sub="another-owner")
    if mutation == "channel":
        harness.context = replace(harness.context, channel_id="another-channel")
    if mutation == "sheet":
        harness.rows[0]["Title"] = "Sheet changed"
    if mutation == "playlist":
        harness.provider.members.reverse()
    if mutation == "metadata":
        harness.provider.videos_by_id["one"]["snippet"]["tags"] = ["changed after preview"]
    if mutation == "type":
        payload["stage_snapshot"]["video_type"] = "Shorts"
    response = harness.publish(payload)
    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "stale_preview"
    assert harness.provider.writes == []


def test_expired_final_preview_cannot_publish(harness, monkeypatch):
    timestamp = TimestampSigner.get_timestamp
    with monkeypatch.context() as patch:
        patch.setattr(TimestampSigner, "get_timestamp", lambda self: timestamp(self) - 1801)
        stage = harness.prepare()
        payload, _ = harness.preview(stage)
    assert harness.publish(payload).json()["detail"]["code"] == "stale_preview"
    assert harness.provider.writes == []


@pytest.mark.parametrize("patch", [{"title": " "}, {"title": "字" * 101}, {"description": "字" * 5001}])
def test_validates_final_fields_on_backend(harness, patch):
    draft = harness.prepare()
    draft["edits"][0].update(patch)
    assert harness.client.post("/api/v1/youtube/drafts/preview", json=draft).status_code == 422
    assert harness.provider.writes == []


@pytest.mark.parametrize("failure", ["timeout_committed", "incomplete_response"])
def test_reconciles_lost_response_using_all_three_fields_without_resending(harness, failure):
    harness.provider.failures[("primary", "one")] = failure
    payload, _ = harness.preview(harness.prepare())
    result = harness.publish(payload).json()
    assert result["results"][0]["status"] == "succeeded"
    assert result["results"][0]["reconciled"] is True
    assert len(harness.provider.writes) == 1
    assert harness.store.get("owner-one", result["operation_id"])["state"] == "completed"


def test_unknown_write_survives_restart_and_blocks_new_previews_until_readonly_reconciliation(harness):
    harness.provider.failures[("primary", "one")] = "timeout_absent"
    draft = harness.prepare()
    payload, _ = harness.preview(draft)
    result = harness.publish(payload).json()
    assert result["results"][0]["status"] == "needs_reconciliation"
    assert harness.store.get("owner-one", result["operation_id"])["state"] == "needs_reconciliation"
    harness.client = harness.new_client()
    assert harness.publish(payload).status_code == 409
    another_stage = harness.prepare()
    blocked = harness.client.post("/api/v1/youtube/drafts/preview", json=another_stage)
    assert blocked.status_code == 409
    # Only matching the title must not mark the publish as complete, and
    # confirming remote is not yet public resolves the unknown write to partial/failed.
    remote = harness.provider.videos_by_id["one"]
    remote["snippet"].update(title=draft["edits"][0]["title"], description=draft["edits"][0]["description"])
    endpoint = f"/api/v1/operations/{result['operation_id']}/reconcile-youtube"
    checked = harness.client.post(endpoint).json()
    assert checked["state"] == "partial"
    assert checked["result"]["results"][0]["status"] == "failed"
    assert harness.client.post("/api/v1/youtube/drafts/preview", json=harness.prepare()).status_code == 200
    remote["status"]["privacyStatus"] = "public"
    checked = harness.client.post(endpoint).json()
    assert checked["state"] == "completed"
    assert checked["result"]["results"][0]["status"] == "succeeded"
    assert len(harness.provider.writes) == 1


def test_partial_success_retries_only_explicitly_failed_rows(harness):
    harness.provider.failures[("primary", "two")] = "forbidden"
    draft = harness.prepare(people=("Alice", "Alice"))
    payload, _ = harness.preview(draft)
    result = harness.publish(payload).json()
    assert [item["status"] for item in result["results"]] == ["succeeded", "failed"]
    del harness.provider.failures[("primary", "two")]
    draft["edits"][0]["skip"] = True
    retry, _ = harness.preview(draft)
    second = harness.publish(retry)
    assert second.status_code == 200, second.text
    assert [body["id"] for _, _, body in harness.provider.writes] == ["one", "two", "two"]


def test_quota_fallback_uses_same_channel_and_combined_request(harness):
    harness.fallback = True
    harness.provider.failures[("primary", "one")] = "quotaExceeded"
    payload, _ = harness.preview(harness.prepare())
    result = harness.publish(payload).json()
    assert result["results"][0]["status"] == "succeeded"
    assert [(slot, part) for slot, part, _ in harness.provider.writes] == [
        ("primary", "snippet,status"),
        ("secondary", "snippet,status"),
    ]


def test_unassigned_video_cannot_be_published_by_tampering_with_skip(harness):
    draft = harness.prepare()
    draft["edits"][1].update(skip=False, title="Should stay private")
    payload, preview = harness.preview(draft)
    assert preview["plan"][1]["status"] == "skipped"
    assert harness.publish(payload).status_code == 200
    assert harness.provider.videos_by_id["two"]["status"]["privacyStatus"] == "private"


def test_can_skip_invalid_text_without_discarding_it_or_publishing_the_video(harness):
    draft = harness.prepare()
    draft["edits"][0].update(title="字" * 101, description="字" * 5001, skip=True)
    payload, preview = harness.preview(draft)
    assert preview["quota"]["write_units"] == 0
    assert harness.publish(payload).status_code == 200
    assert harness.provider.writes == []


def test_existing_cleanup_removes_newly_published_video_without_another_publish_write(harness):
    payload, _ = harness.preview(harness.prepare())
    assert harness.publish(payload).status_code == 200
    harness.provider.members = ["one"]
    loaded = harness.client.post("/api/v1/youtube/cleanup-preview", json={"playlist_id": "PLdrafts_test"})
    assert loaded.status_code == 200, loaded.text
    snapshot = loaded.json()
    response = harness.client.post(
        "/api/v1/youtube/publish-and-cleanup",
        json={
            "playlist_id": "PLdrafts_test",
            "preview_token": snapshot["preview_token"],
            "preview_snapshot": snapshot["preview_snapshot"],
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["succeeded_count"] == 1
    assert harness.provider.members == []
    assert harness.provider.deletes == ["item-one"]
    assert len(harness.provider.writes) == 1


def test_empty_running_plan_is_not_mistaken_for_a_completed_preflight(harness):
    draft = harness.prepare()
    payload, _ = harness.preview(draft)
    operation, _ = harness.store.claim(
        "owner-one", "youtube.metadata_publish", DraftPublishInput(**payload), channel_id="channel-one"
    )
    harness.store.update("owner-one", operation["id"], lambda op: op.update(state="running"))
    endpoint = f"/api/v1/operations/{operation['id']}/reconcile-youtube"
    assert harness.client.post(endpoint).status_code == 409
    assert harness.store.get("owner-one", operation["id"])["state"] == "running"
    harness.store.update("owner-one", operation["id"], lambda op: op.update(state="failed_before_write"))
    checked = harness.client.post(endpoint)
    assert checked.status_code == 200
    assert checked.json()["reconciliation"]["no_writes_attempted"] is True
    assert harness.provider.writes == []


def edit_status(harness, ids=("one", "two")):
    response = harness.client.post("/api/v1/youtube/edit-status", json={"video_ids": list(ids)})
    assert response.status_code == 200, response.text
    assert response.json()["channel_id"] == harness.context.channel_id
    return response.json()["statuses"]


@pytest.mark.parametrize("kind", ["Video", "Shorts"])
def test_edit_status_tracks_only_confirmed_writes_and_survives_restart(harness, kind):
    assert edit_status(harness) == {"one": "unknown", "two": "unknown"}
    draft = harness.prepare(kind, people=("Alice", "Alice"))
    draft["edits"][0]["title"] = "Manually staged only"
    payload, _ = harness.preview(draft)
    assert edit_status(harness) == {"one": "unknown", "two": "unknown"}
    assert not harness.provider.writes
    harness.provider.failures[("primary", "two")] = "forbidden"
    result = harness.publish(payload)
    assert result.status_code == 200
    assert edit_status(harness) == {"one": "applied", "two": "not_applied"}
    reads, writes = len(harness.provider.reads), len(harness.provider.writes)
    harness.store = OperationStore(harness.store.path)
    harness.client = harness.new_client()
    assert edit_status(harness) == {"one": "applied", "two": "not_applied"}
    assert (len(harness.provider.reads), len(harness.provider.writes)) == (reads, writes)
    # A newer failed attempt must not erase an earlier confirmed application.
    draft = harness.prepare(kind, people=("Alice", "不編輯"))
    draft["edits"][0]["title"] = "Second attempt"
    payload, _ = harness.preview(draft)
    harness.provider.failures[("primary", "one")] = "forbidden"
    assert harness.publish(payload).status_code == 200
    assert edit_status(harness)["one"] == "applied"
    original = harness.context
    harness.context = replace(original, channel_id="other-channel")
    assert edit_status(harness) == {"one": "unknown", "two": "unknown"}
    harness.context = replace(original, owner_sub="other-owner")
    assert edit_status(harness) == {"one": "unknown", "two": "unknown"}


def test_edit_status_unknown_until_reconciliation_and_keeps_skips_unknown(harness):
    draft = harness.prepare()
    payload, _ = harness.preview(draft)
    harness.provider.failures[("primary", "one")] = "timeout_absent"
    response = harness.publish(payload).json()
    assert response["results"][0]["status"] == "needs_reconciliation"
    assert edit_status(harness) == {"one": "unknown", "two": "unknown"}
    # The provider later confirms the exact intended final state through read-only reconciliation.
    harness.provider.videos_by_id["one"]["snippet"].update(
        title=draft["edits"][0]["title"], description=draft["edits"][0]["description"]
    )
    harness.provider.videos_by_id["one"]["status"]["privacyStatus"] = "public"
    writes = len(harness.provider.writes)
    checked = harness.client.post(f"/api/v1/operations/{response['operation_id']}/reconcile-youtube")
    assert checked.status_code == 200, checked.text
    assert edit_status(harness) == {"one": "applied", "two": "unknown"}
    assert len(harness.provider.writes) == writes


def test_edit_status_uses_all_history_and_requires_per_video_evidence(harness):
    payload, _ = harness.preview(harness.prepare())
    assert harness.publish(payload).status_code == 200
    # More than a page of later records, including legacy completed records with no evidence.
    for index in range(105):
        operation, _ = harness.store.claim(
            "owner-one",
            "youtube.metadata_update",
            SimpleNamespace(model_dump=lambda mode, index=index: {"request_id": str(index), "revision": index}),
            channel_id="channel-one",
        )
        harness.store.update(
            "owner-one",
            operation["id"],
            lambda op: op.update(
                state="completed", items=[{"remote_id": "two", "phase": "metadata", "state": "completed"}]
            ),
        )
    assert len(harness.store.list("owner-one")) == 100
    assert edit_status(harness) == {"one": "applied", "two": "unknown"}
    # Status never guesses from title, privacy or membership in To-Post.
    harness.provider.videos_by_id["two"]["snippet"]["title"] = "Applied title"
    harness.provider.videos_by_id["two"]["status"]["privacyStatus"] = "public"
    assert edit_status(harness)["two"] == "unknown"
