from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from ytmusicapi.auth.types import AuthType

from backend.app.core.dependencies import require_ytmusic_context
from backend.app.main import create_app
from backend.app.services.playlist_sort_service import apply_sort_to_playlist
from backend.app.services.playlist_write_outcome import PlaylistWriteOutcomeUnknown
from backend.app.services.ytmusic_writer import YtmusicPlaylistWriter


class FakeWriteProvider:
    auth_type = AuthType.BROWSER

    def __init__(self, *, timeout_on_create=False, fail_move_at=0):
        self.created = []
        self.moves = []
        self.timeout_on_create = timeout_on_create
        self.fail_move_at = fail_move_at

    def create_playlist(self, *, title, description, privacy_status, video_ids):
        self.created.append((title, list(video_ids)))
        if self.timeout_on_create:
            raise TimeoutError("sensitive provider response")
        return "new-playlist"

    def edit_playlist(self, *, playlistId, moveItem):
        self.moves.append((playlistId, moveItem))
        if len(self.moves) == self.fail_move_at:
            raise TimeoutError("sensitive provider response")
        return "STATUS_SUCCEEDED"


@pytest.mark.parametrize("fallback", [False, True])
def test_create_committed_then_timeout_never_creates_again(monkeypatch, fallback):
    provider = FakeWriteProvider(timeout_on_create=True)
    data_api_calls = []
    monkeypatch.setattr(
        "backend.app.services.playlist_sort_service.get_youtube_service", lambda _: data_api_calls.append(1)
    )
    with pytest.raises(PlaylistWriteOutcomeUnknown):
        apply_sort_to_playlist(
            SimpleNamespace(owner_sub=None, credentials=None),
            "source",
            [{"video_id": "v1"}],
            mode="new_playlist",
            allow_quota_fallback=fallback,
            client_factory=lambda **_: provider,
        )
    assert provider.created == [("[已排序] source", ["v1"])]
    assert data_api_calls == []


def test_partial_move_then_timeout_stops_and_preserves_progress(monkeypatch):
    provider = FakeWriteProvider(fail_move_at=2)

    def unexpected_fallback(_):
        pytest.fail("Unknown writes must never switch provider")

    monkeypatch.setattr("backend.app.services.playlist_sort_service.get_youtube_service", unexpected_fallback)
    original = [{"playlist_item_id": key} for key in "abcd"]
    target = [original[index] for index in (1, 2, 3, 0)]
    with pytest.raises(PlaylistWriteOutcomeUnknown) as caught:
        apply_sort_to_playlist(
            SimpleNamespace(owner_sub=None, credentials=None),
            "source",
            target,
            original_items=original,
            allow_quota_fallback=True,
            client_factory=lambda **_: provider,
        )
    assert len(provider.moves) == 2
    assert caught.value.result["succeeded"] == 1
    assert "sensitive" not in str(caught.value.result)


@pytest.mark.parametrize("response", [None, {}, {"status": "STATUS_FAILED"}])
def test_unverifiable_move_response_requires_reconciliation(response):
    class Provider(FakeWriteProvider):
        def edit_playlist(self, **kwargs):
            return response

    original = [{"playlist_item_id": key} for key in "ab"]
    with pytest.raises(PlaylistWriteOutcomeUnknown):
        YtmusicPlaylistWriter(Provider()).sort_in_place("source", original[::-1], original)


def test_api_unknown_outcome_is_not_an_auth_fallback_prompt(monkeypatch):
    import backend.app.api.playlist_sort as route

    monkeypatch.setattr(route, "fetch_playlist_items_for_sort", lambda *args, **kwargs: [])
    monkeypatch.setattr(route, "verify_preview_token", lambda *args, **kwargs: True)

    def unknown(*args, **kwargs):
        raise PlaylistWriteOutcomeUnknown({"succeeded": 1})

    monkeypatch.setattr(route, "apply_sort_to_playlist", unknown)
    store = SimpleNamespace(get_ytmusic_custom_token=lambda _: "fake-token")
    context = SimpleNamespace(owner_sub="owner", slot="primary")
    app = create_app(credential_store=store, dependency_overrides={require_ytmusic_context: lambda: context})
    response = TestClient(app).post(
        "/api/v1/playlist-sort/apply", json={"playlist_id": "source", "sort_keys": [], "preview_token": "token"}
    )
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["code"] == "playlist_write_unknown"
    assert detail["retryable"] is False
    assert "已確認成功 1 首" in detail["message"]


def test_explicit_writer_dependencies_survive_background_workers():
    providers = [FakeWriteProvider(), FakeWriteProvider()]

    def run(provider):
        return YtmusicPlaylistWriter(provider).create_sorted("title", "description", [{"video_id": "v"}])

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, providers))
    assert all(result["succeeded"] == 1 for result in results)
    assert providers[0].created == providers[1].created == [("title", ["v"])]
    assert providers[0].created is not providers[1].created


@pytest.mark.parametrize("response", [None, {}, {"id": ""}])
def test_data_api_create_without_id_requires_reconciliation(monkeypatch, response):
    import backend.app.services.playlist_sort_service as service

    calls = []
    provider = SimpleNamespace(playlists=lambda: SimpleNamespace(insert=lambda **_: object()))
    monkeypatch.setattr(service, "get_youtube_service", lambda _: provider)
    monkeypatch.setattr(service, "_execute_with_quota", lambda *args: calls.append(args[1]) or response)
    with pytest.raises(PlaylistWriteOutcomeUnknown):
        apply_sort_to_playlist(
            SimpleNamespace(), "source", [{"video_id": "v"}], mode="new_playlist", use_youtube_api=True
        )
    assert calls == ["playlists.insert"]


def test_data_api_quota_exhaustion_after_create_returns_existing_playlist(monkeypatch):
    import backend.app.services.playlist_sort_service as service
    from backend.app.services.youtube_errors import YouTubeQuotaUnavailable

    calls = []
    provider = SimpleNamespace(
        playlists=lambda: SimpleNamespace(insert=lambda **_: object()),
        playlistItems=lambda: SimpleNamespace(insert=lambda **_: object()),
    )

    def execute(_request, method, _context):
        calls.append(method)
        if method == "playlists.insert":
            return {"id": "created-playlist"}
        if calls.count("playlistItems.insert") == 1:
            return {"id": "added-item"}
        raise YouTubeQuotaUnavailable(
            code="quota_unavailable",
            http_status=429,
            reason="quotaExceeded",
            method=method,
            bucket="write",
            reset_at="",
            confirmed_by_google=True,
            user_message="Quota exhausted",
        )

    monkeypatch.setattr(service, "get_youtube_service", lambda _: provider)
    monkeypatch.setattr(service, "_execute_with_quota", execute)
    result = apply_sort_to_playlist(
        SimpleNamespace(), "source", [{"video_id": key} for key in "abc"], mode="new_playlist", use_youtube_api=True
    )
    assert result["new_playlist_id"] == "created-playlist"
    assert result["succeeded"] == 1
    assert result["failed"] == len(result["failed_items"]) == 2
    assert calls == ["playlists.insert", "playlistItems.insert", "playlistItems.insert"]
