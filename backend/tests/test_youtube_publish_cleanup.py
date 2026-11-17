import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from googleapiclient.errors import HttpError
from httplib2 import Response

from backend.app.core.dependencies import require_youtube_context
from backend.app.core.youtube_context import YouTubeRequestContext
from backend.app.core.youtube_quota_limiter import YouTubeQuotaLimiter
from backend.app.main import create_app
from backend.app.services.google_clients import google_client_context
from backend.app.services.youtube_errors import YouTubeQuotaUnavailable
from backend.app.services.youtube_service import remove_playlist_item


def provider_error(status, reason):
    return HttpError(
        Response({"status": str(status)}), json.dumps({"error": {"errors": [{"reason": reason}]}}).encode()
    )


class PlaylistProvider:
    def __init__(self):
        self.items = [self.item("item-1", "video-1")]
        self.delete_outcomes = []
        self.lookup_outcomes = []
        self.calls = []
        self.public = set()
        self.update_error = None
        self.retain_deleted_items = False

    @staticmethod
    def item(item_id, video_id):
        return {"id": item_id, "contentDetails": {"videoId": video_id}, "snippet": {"title": video_id}}

    def playlistItems(self):
        return self

    def list(self, **kwargs):
        def execute():
            self.calls.append(("playlistItems.list", kwargs))
            if "id" in kwargs:
                outcome = self.lookup_outcomes.pop(0) if self.lookup_outcomes else None
                if isinstance(outcome, Exception):
                    raise outcome
                if outcome is not None:
                    return outcome
                return {"items": [{"id": item["id"]} for item in self.items if item["id"] == kwargs["id"]]}
            return {"items": list(self.items)}

        return SimpleNamespace(execute=execute)

    def delete(self, *, id):
        def execute():
            self.calls.append(("playlistItems.delete", {"id": id}))
            outcome = self.delete_outcomes.pop(0) if self.delete_outcomes else None
            if isinstance(outcome, Exception):
                raise outcome
            if not self.retain_deleted_items:
                self.items = [item for item in self.items if item["id"] != id]
            if outcome == "lost_response":
                raise TimeoutError("response lost after delete")
            return {}

        return SimpleNamespace(execute=execute)

    def videos(self):
        def list_videos(**kwargs):
            def execute():
                self.calls.append(("videos.list", kwargs))
                return {
                    "items": [
                        {
                            "id": video_id,
                            "snippet": {
                                "channelId": "channel",
                                "title": video_id,
                                "publishedAt": "2026-01-01T00:00:00Z",
                            },
                            "status": {"privacyStatus": "public" if video_id in self.public else "private"},
                        }
                        for video_id in kwargs["id"].split(",")
                    ]
                }

            return SimpleNamespace(execute=execute)

        def update(**kwargs):
            def execute():
                self.calls.append(("videos.update", kwargs))
                if self.update_error:
                    raise self.update_error
                video_id = kwargs["body"]["id"]
                self.public.add(video_id)
                return {"id": video_id, "status": {"privacyStatus": "public"}}

            return SimpleNamespace(execute=execute)

        return SimpleNamespace(list=list_videos, update=update)


@pytest.fixture
def cleanup_environment(tmp_path, monkeypatch):
    provider = PlaylistProvider()
    limiter = YouTubeQuotaLimiter(tmp_path / "quota.json", configured_limit=10000, safety_buffer_units=0)
    context = YouTubeRequestContext(
        slot="primary", credentials=object(), quota_limiter=limiter, owner_sub="cleanup-user", channel_id="channel"
    )
    delays = []
    monkeypatch.setattr("backend.app.services.youtube_service.sleep", delays.append)
    return SimpleNamespace(provider=provider, context=context, delays=delays)


def remove_item(env, item_id="item-1"):
    with google_client_context(lambda *_args, **_kwargs: env.provider):
        return remove_playlist_item(env.context, item_id)


def method_calls(env, method):
    return [kwargs for name, kwargs in env.provider.calls if name == method]


def client_for(env, **adapters):
    return TestClient(
        create_app(
            google_client_factory=lambda *_args, **_kwargs: env.provider,
            youtube_workflow_adapters=adapters,
            dependency_overrides={require_youtube_context: lambda: env.context},
        )
    )


def publish(client):
    preview = client.post("/api/v1/youtube/cleanup-preview", json={"playlist_id": "playlist-1"})
    assert preview.status_code == 200, preview.text
    preview = preview.json()
    return client.post(
        "/api/v1/youtube/publish-and-cleanup",
        json={
            "playlist_id": "playlist-1",
            "preview_token": preview["preview_token"],
            "preview_snapshot": preview["preview_snapshot"],
        },
    )


def test_cleanup_confirms_removal_and_charges_all_requests(cleanup_environment):
    env = cleanup_environment
    assert remove_item(env) == {"deleted_playlist_item_id": "item-1"}
    assert env.provider.items == []
    assert len(method_calls(env, "playlistItems.delete")) == 1
    assert len(method_calls(env, "playlistItems.list")) == 2
    assert env.context.quota_limiter.get_usage()["estimated_used_units"] == 52
    assert env.delays == []


def test_cleanup_skips_an_already_removed_item_without_spending_delete_quota(cleanup_environment):
    env = cleanup_environment
    env.provider.items = []
    assert remove_item(env)["already_removed"] is True
    assert method_calls(env, "playlistItems.delete") == []
    assert env.context.quota_limiter.get_usage()["estimated_used_units"] == 1


def test_cleanup_reconciles_a_lost_delete_response_without_repeating_the_write(cleanup_environment):
    env = cleanup_environment
    env.provider.delete_outcomes = ["lost_response"]
    assert remove_item(env)["reconciled"] is True
    assert len(method_calls(env, "playlistItems.delete")) == 1
    assert env.context.quota_limiter.get_usage()["estimated_used_units"] == 52


@pytest.mark.parametrize(
    "error",
    [
        TimeoutError(),
        provider_error(503, "backendError"),
        provider_error(429, "rateLimitExceeded"),
        provider_error(403, "userRateLimitExceeded"),
    ],
)
def test_cleanup_retries_transient_failures_only_after_confirming_the_item_remains(cleanup_environment, error):
    env = cleanup_environment
    env.provider.delete_outcomes = [error]
    remove_item(env)
    assert [name for name, _ in env.provider.calls] == [
        "playlistItems.list",
        "playlistItems.delete",
        "playlistItems.list",
        "playlistItems.delete",
        "playlistItems.list",
    ]
    assert env.provider.items == []
    assert env.delays == [0.5]
    assert env.context.quota_limiter.get_usage()["estimated_used_units"] == 103


def test_cleanup_retries_confirmation_reads_without_repeating_a_successful_delete(cleanup_environment):
    env = cleanup_environment
    env.provider.lookup_outcomes = [None, TimeoutError(), {"items": [{"id": "item-1"}]}, {"items": []}]
    remove_item(env)
    assert len(method_calls(env, "playlistItems.delete")) == 1
    assert env.delays == [0.5, 1.0]
    assert env.context.quota_limiter.get_usage()["estimated_used_units"] == 54


def test_cleanup_polls_stale_reads_without_repeating_an_acknowledged_delete(cleanup_environment):
    env = cleanup_environment
    env.provider.lookup_outcomes = [None, {"items": [{"id": "item-1"}]}, {"items": []}]
    remove_item(env)
    assert len(method_calls(env, "playlistItems.delete")) == 1
    assert env.delays == [0.5]


def test_cleanup_has_bounded_retries_when_deletion_does_not_commit(cleanup_environment):
    env = cleanup_environment
    env.provider.delete_outcomes = [TimeoutError()] * 3
    with pytest.raises(RuntimeError, match="尚未確認移出"):
        remove_item(env)
    assert len(method_calls(env, "playlistItems.delete")) == 3
    assert env.delays == [0.5, 1.0]


@pytest.mark.parametrize(
    "status,reason", [(400, "invalidParameter"), (401, "authError"), (403, "forbidden"), (403, "quotaExceeded")]
)
def test_cleanup_does_not_retry_permission_invalid_request_or_quota_errors(cleanup_environment, status, reason):
    env = cleanup_environment
    env.provider.delete_outcomes = [provider_error(status, reason)]
    with pytest.raises(YouTubeQuotaUnavailable if reason == "quotaExceeded" else HttpError):
        remove_item(env)
    assert len(method_calls(env, "playlistItems.delete")) == 1
    assert env.delays == []


def test_cleanup_tolerates_a_concurrent_removal(cleanup_environment):
    env = cleanup_environment
    env.provider.delete_outcomes = [provider_error(404, "playlistItemNotFound")]
    assert remove_item(env)["already_removed"] is True
    assert len(method_calls(env, "playlistItems.list")) == 1


@pytest.mark.parametrize("item_id", [None, ""])
def test_cleanup_never_reports_a_missing_item_id_as_success(cleanup_environment, item_id):
    with pytest.raises(ValueError, match="缺少"):
        remove_item(cleanup_environment, item_id)
    assert cleanup_environment.provider.calls == []


def test_cleanup_rejects_incomplete_confirmation_responses(cleanup_environment):
    env = cleanup_environment
    env.provider.lookup_outcomes = [None, {}]
    with pytest.raises(RuntimeError, match="回應不完整"):
        remove_item(env)
    assert len(method_calls(env, "playlistItems.delete")) == 1


def test_signed_preview_cleans_all_nonconsecutive_duplicate_entries(cleanup_environment):
    env = cleanup_environment
    env.provider.items = [
        env.provider.item("item-1", "video-1"),
        env.provider.item("item-2", "video-2"),
        env.provider.item("item-3", "video-1"),
    ]
    env.provider.public.update({"video-1", "video-2"})
    client = client_for(env)
    response = publish(client)
    assert response.status_code == 200, response.text
    assert response.json()["completed"] is True
    assert response.json()["succeeded_count"] == 3
    assert env.provider.items == []
    assert [call["id"] for call in method_calls(env, "playlistItems.delete")] == ["item-1", "item-2", "item-3"]
    assert len(method_calls(env, "videos.update")) == 0


def test_cleanup_unknown_preserves_item_and_reconcile_does_not_require_public(cleanup_environment):
    env = cleanup_environment
    env.provider.public.add("video-1")
    env.provider.retain_deleted_items = True
    client = client_for(env)
    response = publish(client)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["completed"] is False
    assert result["needs_reconciliation_count"] == 1
    assert result["results"][0]["playlist_item_id"] == "item-1"
    env.provider.items = []
    env.provider.public.clear()
    reconciled = client.post(f"/api/v1/operations/{result['operation_id']}/reconcile-youtube")
    assert reconciled.status_code == 200, reconciled.text
    assert reconciled.json()["state"] == "completed"
    assert method_calls(env, "videos.update") == []


def test_a_failed_duplicate_does_not_prevent_cleaning_other_entries(cleanup_environment):
    env = cleanup_environment
    env.provider.public.add("video-1")
    env.provider.items.append(env.provider.item("item-2", "video-1"))
    env.provider.delete_outcomes = [provider_error(403, "forbidden")]
    response = publish(client_for(env))
    assert response.status_code == 200, response.text
    assert response.json()["completed"] is False
    assert response.json()["failed_count"] == 1
    assert response.json()["succeeded_count"] == 1
    assert [item["id"] for item in env.provider.items] == ["item-1"]
    assert method_calls(env, "videos.update") == []


def test_private_video_is_retained_without_any_video_update(cleanup_environment):
    env = cleanup_environment
    response = publish(client_for(env))
    assert response.status_code == 200, response.text
    assert response.json()["skipped_count"] == 1
    assert method_calls(env, "playlistItems.delete") == []
    assert method_calls(env, "videos.update") == []


def test_quota_fallback_after_delete_only_checks_membership_on_the_second_slot(cleanup_environment, tmp_path):
    env = cleanup_environment
    env.provider.public.add("video-1")
    # Preview (2) + preflight (1) + existence (1) + guard (2) + deletion (50)
    # leave no quota for the final confirmation on the first slot.
    primary = YouTubeQuotaLimiter(tmp_path / "primary.json", configured_limit=56, safety_buffer_units=0)
    env.context = YouTubeRequestContext(
        slot="primary", credentials=object(), quota_limiter=primary, owner_sub="cleanup-user", channel_id="channel"
    )
    secondary = YouTubeRequestContext(
        slot="secondary",
        credentials=object(),
        quota_limiter=YouTubeQuotaLimiter(
            tmp_path / "secondary.json", slot="secondary", configured_limit=1000, safety_buffer_units=0
        ),
        owner_sub="cleanup-user",
        channel_id="channel",
    )
    client = client_for(env, _switch_youtube_context=lambda *_args, **_kwargs: secondary)
    response = publish(client)
    assert response.status_code == 200, response.text
    assert response.json()["completed"] is True
    assert response.json()["results"][0]["youtube_slot"] == "secondary"
    assert len(method_calls(env, "playlistItems.delete")) == 1
    assert secondary.quota_limiter.get_usage()["estimated_used_units"] == 1


def test_changing_only_a_duplicate_item_invalidates_the_signed_preview(cleanup_environment):
    env = cleanup_environment
    env.provider.items.append(env.provider.item("item-2", "video-1"))
    client = client_for(env)
    preview = client.post("/api/v1/youtube/cleanup-preview", json={"playlist_id": "playlist-1"}).json()
    assert len(preview["preview_snapshot"]["items"]) == 2
    env.provider.items[-1] = env.provider.item("replacement-item", "video-1")
    response = client.post(
        "/api/v1/youtube/publish-and-cleanup",
        json={
            "playlist_id": "playlist-1",
            "preview_token": preview["preview_token"],
            "preview_snapshot": preview["preview_snapshot"],
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "stale_preview"
    assert method_calls(env, "videos.update") == []
    assert method_calls(env, "playlistItems.delete") == []


def test_missing_playlist_item_id_stops_before_publishing(cleanup_environment):
    env = cleanup_environment
    env.provider.items[0]["id"] = ""
    response = client_for(env).post("/api/v1/youtube/cleanup-preview", json={"playlist_id": "playlist-1"})
    assert response.status_code == 400, response.text
    assert method_calls(env, "videos.update") == []
    assert method_calls(env, "playlistItems.delete") == []


def test_old_playlist_preview_token_is_rejected_without_writes(cleanup_environment):
    env = cleanup_environment
    client = client_for(env)
    old = client.post("/api/v1/youtube/playlist-items", json={"playlist_id": "playlist-1"}).json()
    response = client.post(
        "/api/v1/youtube/publish-and-cleanup",
        json={
            "playlist_id": "playlist-1",
            "preview_token": old["preview_token"],
            "preview_snapshot": old["preview_snapshot"],
        },
    )
    assert response.status_code == 409
    assert method_calls(env, "playlistItems.delete") == []
    assert method_calls(env, "videos.update") == []


def test_public_to_private_between_preview_and_delete_is_retained(cleanup_environment):
    env = cleanup_environment
    env.provider.public.add("video-1")
    client = client_for(env)
    preview = client.post("/api/v1/youtube/cleanup-preview", json={"playlist_id": "playlist-1"}).json()
    env.provider.public.clear()
    result = client.post(
        "/api/v1/youtube/publish-and-cleanup",
        json={
            "playlist_id": "playlist-1",
            "preview_token": preview["preview_token"],
            "preview_snapshot": preview["preview_snapshot"],
        },
    )
    assert result.status_code == 200, result.text
    assert result.json()["skipped_count"] == 1
    assert method_calls(env, "playlistItems.delete") == []


def test_every_internal_delete_retry_runs_fresh_public_guard(cleanup_environment):
    from backend.app.services.youtube_cleanup import CleanupRetained

    env = cleanup_environment
    env.provider.delete_outcomes = [TimeoutError()]
    guards = []

    def guard():
        guards.append(True)
        if len(guards) > 1:
            raise CleanupRetained("now private", "private")

    with google_client_context(lambda *_a, **_kw: env.provider), pytest.raises(CleanupRetained):
        remove_playlist_item(env.context, "item-1", pre_delete_guard=guard)
    assert len(guards) == 2
    assert len(method_calls(env, "playlistItems.delete")) == 1
    assert len(env.provider.items) == 1


def test_duplicate_items_recheck_privacy_after_each_delete(cleanup_environment):
    env = cleanup_environment
    env.provider.public.add("video-1")
    env.provider.items.append(env.provider.item("item-2", "video-1"))
    original = env.provider.delete

    def delete(**kwargs):
        request = original(**kwargs)

        def execute():
            response = request.execute()
            env.provider.public.clear()
            return response

        return SimpleNamespace(execute=execute)

    env.provider.delete = delete
    response = publish(client_for(env))
    assert response.status_code == 200, response.text
    assert [row["status"] for row in response.json()["results"]] == ["succeeded", "skipped"]
    assert len(method_calls(env, "playlistItems.delete")) == 1
    assert [item["id"] for item in env.provider.items] == ["item-2"]
