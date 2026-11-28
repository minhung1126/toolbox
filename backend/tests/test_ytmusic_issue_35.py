"""Regression tests for GitHub Issue #35 (YTMusic auth, reconcile, yt-dlp safety, validation & token security)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from ytmusicapi.auth.types import AuthType

from backend.app.core.config import Settings
from backend.app.core.credential_store import CredentialStore
from backend.app.core.dependencies import require_ytmusic_context
from backend.app.core.operation_store import OperationStore
from backend.app.core.runtime_config import RuntimeConfig
from backend.app.core.session_store import SessionStore
from backend.app.core.system_secrets import SystemSecretsManager
from backend.app.core.youtube_context import YouTubeRequestContext
from backend.app.core.youtube_quota_limiter import YouTubeQuotaLimiter
from backend.app.main import create_app
from backend.app.services.google_auth import LOGIN_SCOPES
from backend.app.services.playlist_sort_service import fetch_playlist_items_for_sort
from backend.app.services.ytmusic_service import (
    enrich_tracks_with_ytdlp_fallback,
    get_ytdlp_video_date,
)
from backend.app.services.ytmusic_tokens import (
    MAX_CUSTOM_TOKEN_LENGTH,
    YtmusicTokenInputError,
    parse_custom_token_input,
)


def _setup_authenticated_app(tmp_path, *, with_custom_token=True, ytmusic_client_factory=None, google_factory=None):
    subject = "ytmusic-user"
    runtime = RuntimeConfig(tmp_path / "runtime.json")
    secrets = SystemSecretsManager(tmp_path)
    config = Settings(
        _env_file=None,
        runtime_store=runtime,
        secrets_store=secrets,
        ENVIRONMENT="development",
        PUBLIC_BASE_URL="http://localhost:8000",
        ALLOWED_GOOGLE_EMAILS=f"{subject}@example.test",
    )
    sessions = SessionStore(tmp_path / "sessions.json")
    creds = CredentialStore(tmp_path / "creds.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)
    creds.save_google_connection(
        {
            "token": "login-tok",
            "refresh_token": "login-refresh",
            "token_uri": "https://oauth2.googleapis.com/token",
            "client_id": "client-id",
            "client_secret": "client-secret",
            "scopes": list(LOGIN_SCOPES),
            "user": {"sub": subject, "email": f"{subject}@example.test"},
        },
        owner_sub=subject,
    )
    if with_custom_token:
        creds.save_ytmusic_custom_token("SID=s1; HSID=h1; SAPISID=sapi1", owner_sub=subject)
    session_id = sessions.create(
        {"credential_provider": "google_login", "user": {"sub": subject, "email": f"{subject}@example.test"}}
    )
    ops = OperationStore(tmp_path / "ops.sqlite3")
    app = create_app(
        app_settings=config,
        session_store=sessions,
        credential_store=creds,
        operation_store=ops,
        ytmusic_client_factory=ytmusic_client_factory,
        google_client_factory=google_factory,
    )
    client = TestClient(app)
    client.cookies.set(config.session_cookie_name, session_id)
    return app, client, creds, ops, subject, config


def test_custom_token_user_can_list_preview_apply_and_reconcile_without_youtube_oauth(tmp_path):
    class FakeYTMusic:
        auth_type = AuthType.BROWSER

        def __init__(self, **_kwargs):
            self.playlist = [
                {"videoId": "vidB1234567", "setVideoId": "set-b", "title": "B Song", "artists": [{"name": "B"}]},
                {"videoId": "vidA1234567", "setVideoId": "set-a", "title": "A Song", "artists": [{"name": "A"}]},
            ]

        def get_library_playlists(self, limit=None):
            return [{"playlistId": "PL-1", "title": "My List", "count": 2, "public": False}]

        def get_playlist(self, playlist_id, limit=None):
            return {"tracks": list(self.playlist)}

        def edit_playlist(self, *, playlistId, moveItem):
            target_id, succ_id = moveItem
            idx_t = next(i for i, t in enumerate(self.playlist) if t["setVideoId"] == target_id)
            item = self.playlist.pop(idx_t)
            idx_s = next(i for i, t in enumerate(self.playlist) if t["setVideoId"] == succ_id)
            self.playlist.insert(idx_s, item)
            return "STATUS_SUCCEEDED"

    ytm = FakeYTMusic()
    _, client, _, _, _, _ = _setup_authenticated_app(tmp_path, ytmusic_client_factory=lambda **_kw: ytm)

    playlists = client.get("/api/v1/playlist-sort/playlists")
    assert playlists.status_code == 200, playlists.text
    assert playlists.json()["playlists"][0]["id"] == "PL-1"

    preview = client.post(
        "/api/v1/playlist-sort/preview",
        json={"playlist_id": "PL-1", "sort_keys": [{"field": "title", "direction": "asc"}]},
    )
    assert preview.status_code == 200, preview.text
    token = preview.json()["preview_token"]
    assert preview.json()["quota_estimate"]["engine"] == "ytmusic_innertube"

    applied = client.post(
        "/api/v1/playlist-sort/apply",
        json={
            "request_id": "sort-req-1",
            "playlist_id": "PL-1",
            "sort_keys": [{"field": "title", "direction": "asc"}],
            "preview_token": token,
            "mode": "in_place",
        },
    )
    assert applied.status_code == 200, applied.text
    assert applied.json()["succeeded"] == 1
    op_id = applied.json()["operation_id"]

    # Calling use_youtube_api=True without YouTube OAuth returns 403, not 500
    forced_api = client.post(
        "/api/v1/playlist-sort/apply",
        json={
            "playlist_id": "PL-1",
            "sort_keys": [{"field": "title", "direction": "asc"}],
            "preview_token": token,
            "use_youtube_api": True,
        },
    )
    assert forced_api.status_code == 403

    rec = client.post(f"/api/v1/operations/{op_id}/reconcile-music")
    assert rec.status_code == 200, rec.text
    assert rec.json()["state"] == "completed"


def test_require_ytmusic_context_preserves_429_and_503_from_youtube_fallback(tmp_path, monkeypatch):
    from backend.app.core import dependencies as deps
    from backend.app.core.error_contract import http_error

    _, client, _, _, _, _ = _setup_authenticated_app(tmp_path, with_custom_token=False)

    def raise_429(*_args, **_kwargs):
        raise http_error(429, "youtube_quota_no_available_slot", "quota exhausted")

    monkeypatch.setattr(deps, "_resolve_youtube_context", raise_429)
    r429 = client.get("/api/v1/playlist-sort/playlists")
    assert r429.status_code == 429
    assert r429.json()["detail"]["code"] == "youtube_quota_no_available_slot"

    def raise_503_storage(*_args, **_kwargs):
        raise http_error(503, "youtube_quota_storage_unavailable", "storage unavailable")

    monkeypatch.setattr(deps, "_resolve_youtube_context", raise_503_storage)
    r503 = client.get("/api/v1/playlist-sort/playlists")
    assert r503.status_code == 503
    assert r503.json()["detail"]["code"] == "youtube_quota_storage_unavailable"

    def raise_503_unconfigured(*_args, **_kwargs):
        raise http_error(503, "youtube_slot_not_configured", "not configured")

    monkeypatch.setattr(deps, "_resolve_youtube_context", raise_503_unconfigured)
    r403 = client.get("/api/v1/playlist-sort/playlists")
    assert r403.status_code == 403
    assert r403.json()["detail"]["code"] == "ytmusic_scope_required"


def test_reconcile_music_matches_video_id_sequence_without_set_video_id_and_populates_result(tmp_path):
    ops = OperationStore(tmp_path / "ops.sqlite3")
    creds = CredentialStore(tmp_path / "creds.json")
    limiter = YouTubeQuotaLimiter(tmp_path / "quota.json", configured_limit=10_000, safety_buffer_units=0)
    context = YouTubeRequestContext(
        slot="primary", credentials=object(), quota_limiter=limiter, owner_sub="owner-music"
    )

    # Simulate YTMusic tracks WITHOUT real setVideoId (synthetic IDs) sorted via Data API
    current_tracks = [
        {"videoId": "vidB1234567", "title": "B"},
        {"videoId": "vidA1234567", "title": "A"},
    ]

    class FakeYTM:
        auth_type = AuthType.UNAUTHORIZED

        def get_playlist(self, *_args, **_kwargs):
            return {"tracks": list(current_tracks)}

    provider = MagicMock()
    provider.playlistItems().list().execute.return_value = {
        "items": [
            {
                "id": "DATA_B",
                "snippet": {"resourceId": {"videoId": "vidB1234567"}, "title": "B", "position": 0, "publishedAt": ""},
            },
            {
                "id": "DATA_A",
                "snippet": {"resourceId": {"videoId": "vidA1234567"}, "title": "A", "position": 1, "publishedAt": ""},
            },
        ]
    }
    provider.videos().list().execute.return_value = {"items": []}

    def fail_then_succeed(**kwargs):
        raise TimeoutError("lost network")

    provider.playlistItems().update().execute.side_effect = fail_then_succeed

    app = create_app(
        operation_store=ops,
        credential_store=creds,
        ytmusic_client_factory=lambda **_kw: FakeYTM(),
        google_client_factory=lambda *_a, **_kw: provider,
        dependency_overrides={require_ytmusic_context: lambda: context},
    )
    client = TestClient(app)

    preview = client.post(
        "/api/v1/playlist-sort/preview",
        json={"playlist_id": "PL-SYN", "sort_keys": [{"field": "title", "direction": "asc"}]},
    ).json()

    # Apply encounters write timeout -> needs_reconciliation (recorded via operation store)
    apply_res = client.post(
        "/api/v1/playlist-sort/apply",
        json={
            "request_id": "sync-1",
            "playlist_id": "PL-SYN",
            "sort_keys": [{"field": "title", "direction": "asc"}],
            "preview_token": preview["preview_token"],
            "mode": "in_place",
            "use_youtube_api": True,
        },
    )
    assert apply_res.status_code == 200
    op = ops.list("owner-music")[0]
    assert op["state"] == "needs_reconciliation"

    # Simulate crashed operation without result so reconcile-music backfills op["result"] too
    ops.update("owner-music", op["id"], lambda doc: doc.update(result=None))

    # 1. Remote still [B, A] -> reconcile marks failed + partial
    rec1 = client.post(f"/api/v1/operations/{op['id']}/reconcile-music")
    assert rec1.status_code == 200, rec1.text
    assert rec1.json()["state"] == "partial"

    # 2. Remote now [A, B] (synthetic indices shifted to vidA_0, vidB_1) -> matches by video_id sequence!
    current_tracks[:] = [
        {"videoId": "vidA1234567", "title": "A"},
        {"videoId": "vidB1234567", "title": "B"},
    ]
    rec2 = client.post(f"/api/v1/operations/{op['id']}/reconcile-music")
    assert rec2.status_code == 200, rec2.text
    assert rec2.json()["state"] == "completed"
    assert rec2.json()["result"] is not None
    assert rec2.json()["result"]["operation"] == "playlist_sort"

    # 3. Idempotent request_id replay succeeds without 409
    replay = client.post(
        "/api/v1/playlist-sort/apply",
        json={
            "request_id": "sync-1",
            "playlist_id": "PL-SYN",
            "sort_keys": [{"field": "title", "direction": "asc"}],
            "preview_token": preview["preview_token"],
            "mode": "in_place",
            "use_youtube_api": True,
        },
    )
    assert replay.status_code == 200
    assert replay.json()["operation_id"] == op["id"]


def test_reconcile_music_still_checks_set_video_id_when_real_ids_present(tmp_path):
    ops = OperationStore(tmp_path / "ops.sqlite3")
    creds = CredentialStore(tmp_path / "creds.json")
    context = YouTubeRequestContext(
        slot="primary", credentials=None, quota_limiter=SimpleNamespace(), owner_sub="owner-set"
    )
    # Two items with the SAME video_id but swapped setVideoIds
    remote_tracks = [
        {"videoId": "vidSame1234", "setVideoId": "set-1", "title": "First"},
        {"videoId": "vidSame1234", "setVideoId": "set-2", "title": "Second"},
    ]

    class FakeYTM:
        auth_type = AuthType.BROWSER

        def get_playlist(self, *_args, **_kwargs):
            return {"tracks": remote_tracks}

    from pydantic import BaseModel

    class DummyPlan(BaseModel):
        request_id: str = "set-req"
        playlist_id: str = "PL-SET"
        mode: str = "in_place"
        validated_order: list[dict] = [
            {"playlist_item_id": "set-2", "video_id": "vidSame1234", "has_set_video_id": True},
            {"playlist_item_id": "set-1", "video_id": "vidSame1234", "has_set_video_id": True},
        ]

    op, _ = ops.claim("owner-set", "youtube.playlist_sort", DummyPlan())
    ops.update(
        "owner-set",
        op["id"],
        lambda doc: doc.update(
            state="needs_reconciliation",
            items=[{"index": 0, "phase": "ytmusic_move", "remote_id": "set-2", "state": "needs_reconciliation"}],
        ),
    )
    app = create_app(
        operation_store=ops,
        credential_store=creds,
        ytmusic_client_factory=lambda **_kw: FakeYTM(),
        dependency_overrides={require_ytmusic_context: lambda: context},
    )
    rec = TestClient(app).post(f"/api/v1/operations/{op['id']}/reconcile-music")
    assert rec.status_code == 200
    assert rec.json()["state"] == "partial"


def test_ytdlp_disabled_when_flag_false_and_validates_id_and_never_caches_empty(monkeypatch):
    import backend.app.services.playlist_sort_service as pss
    import backend.app.services.ytmusic_service as yms

    called_enrich = []
    monkeypatch.setattr(pss, "enrich_tracks_with_ytdlp_fallback", lambda *a, **kw: called_enrich.append(True) or a[0])
    monkeypatch.setattr(
        pss,
        "fetch_ytmusic_playlist_tracks",
        lambda **_kw: [
            {"playlist_item_id": "1", "video_id": "dQw4w9WgXcQ", "title": "V", "album": "影片", "year": None}
        ],
    )
    ctx = YouTubeRequestContext(slot="primary", credentials=None, quota_limiter=SimpleNamespace(), owner_sub="u1")
    res = fetch_playlist_items_for_sort(ctx, "PL-1", use_ytdlp_fallback=False)
    assert len(res) == 1
    assert called_enrich == []

    # Test get_ytdlp_video_date URL validation & no-empty-cache behavior
    get_ytdlp_video_date.cache_clear()
    extract_calls = []

    class FakeYDL:
        def __init__(self, _opts):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def extract_info(self, url, download=False):
            extract_calls.append(url)
            if len(extract_calls) == 1:
                raise RuntimeError("transient network failure")
            return {"upload_date": "20240115", "release_date": "20240115"}

    monkeypatch.setattr(yms, "yt_dlp", SimpleNamespace(YoutubeDL=FakeYDL))

    # Malicious / invalid video IDs rejected before calling YoutubeDL
    assert get_ytdlp_video_date("https://evil.example/watch?v=123") == {}
    assert get_ytdlp_video_date("short") == {}
    assert extract_calls == []

    # Transient failure returns {} WITHOUT caching {}
    assert get_ytdlp_video_date("dQw4w9WgXcQ") == {}
    # Next call retries and succeeds using full watch URL
    meta = get_ytdlp_video_date("dQw4w9WgXcQ")
    assert meta["release_date"] == "2024-01-15"
    assert extract_calls == [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    ]
    # Subsequent call hits cache (no 3rd extract_info)
    assert get_ytdlp_video_date("dQw4w9WgXcQ")["year"] == 2024
    assert len(extract_calls) == 2


def test_enrich_tracks_caps_candidates_with_high_priority_first(monkeypatch):
    import backend.app.services.ytmusic_service as yms

    called_ids = []
    monkeypatch.setattr(
        yms,
        "get_ytdlp_video_date",
        lambda vid, **_kw: called_ids.append(vid) or {"release_date": "2023-01-01", "year": 2023},
    )
    tracks = [{"video_id": f"same_{i:02d}", "year": 2023, "release_date": None} for i in range(40)] + [
        {"video_id": f"miss_{i:02d}", "year": None, "release_date": None} for i in range(20)
    ]
    enrich_tracks_with_ytdlp_fallback(tracks, check_same_year=True)
    # Default cap is 50: all 20 high-priority (missing year) + first 30 low-priority (same year)
    assert len(called_ids) == 50
    assert sum(vid.startswith("miss_") for vid in called_ids) == 20
    assert sum(vid.startswith("same_") for vid in called_ids) == 30


def test_sort_endpoints_validate_fields_directions_modes_lengths_and_sorted_item_ids(tmp_path):
    class FakeYTM:
        auth_type = AuthType.BROWSER

        def get_playlist(self, *_args, **_kwargs):
            return {
                "tracks": [
                    {"videoId": "vid11111111", "setVideoId": "id-1", "title": "A"},
                    {"videoId": "vid22222222", "setVideoId": "id-2", "title": "B"},
                ]
            }

    _, client, _, _, _, _ = _setup_authenticated_app(tmp_path, ytmusic_client_factory=lambda **_kw: FakeYTM())

    assert (
        client.post(
            "/api/v1/playlist-sort/preview",
            json={"playlist_id": "PL-1", "sort_keys": [{"field": "bogus", "direction": "asc"}]},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/playlist-sort/preview",
            json={"playlist_id": "PL-1", "sort_keys": [{"field": "title", "direction": "sideways"}]},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/playlist-sort/preview",
            json={"playlist_id": "PL-1", "sort_keys": [{"field": "title", "direction": "asc"}] * 17},
        ).status_code
        == 422
    )

    preview = client.post(
        "/api/v1/playlist-sort/preview",
        json={"playlist_id": "PL-1", "sort_keys": [{"field": "title", "direction": "asc"}]},
    ).json()

    assert (
        client.post(
            "/api/v1/playlist-sort/apply",
            json={
                "playlist_id": "PL-1",
                "sort_keys": [],
                "preview_token": preview["preview_token"],
                "mode": "invalid_mode",
            },
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/playlist-sort/apply",
            json={
                "playlist_id": "PL-1",
                "sort_keys": [],
                "preview_token": preview["preview_token"],
                "sorted_item_ids": ["id-1", "id-1"],
            },
        ).status_code
        == 422
    )

    mismatch = client.post(
        "/api/v1/playlist-sort/apply",
        json={
            "playlist_id": "PL-1",
            "sort_keys": [],
            "preview_token": preview["preview_token"],
            "sorted_item_ids": ["id-1", "unknown-id"],
        },
    )
    assert mismatch.status_code == 400
    assert mismatch.json()["detail"]["code"] == "invalid_sorted_item_ids"


def test_custom_token_parser_requires_sapisid_and_auth_endpoint_enforces_auth_before_parse(tmp_path, monkeypatch):
    # 1. dummy_sapisid fallback removed
    with pytest.raises(YtmusicTokenInputError):
        parse_custom_token_input("x=1; y=2")
    with pytest.raises(YtmusicTokenInputError):
        parse_custom_token_input("SID=abc; HSID=def")
    with pytest.raises(YtmusicTokenInputError):
        parse_custom_token_input("SID=abc; SAPISID=" + ("x" * (MAX_CUSTOM_TOKEN_LENGTH + 1)))

    # 2. Unauthenticated request returns 401 BEFORE parsing invalid/oversized token
    app, client, _, _, _, config = _setup_authenticated_app(tmp_path, with_custom_token=False)
    unauth_client = TestClient(app)
    r_unauth = unauth_client.post(
        "/api/v1/auth/ytmusic/custom-token",
        json={"token": "x=1; y=2"},
        headers={"Origin": "http://localhost:8000"},
    )
    assert r_unauth.status_code == 401

    oversized_token = "A" * (MAX_CUSTOM_TOKEN_LENGTH + 1)
    r_unauth_huge = unauth_client.post(
        "/api/v1/auth/ytmusic/custom-token",
        json={"token": oversized_token},
        headers={"Origin": "http://localhost:8000"},
    )
    assert r_unauth_huge.status_code == 401

    r_unauth_validate_huge = unauth_client.post(
        "/api/v1/auth/ytmusic/custom-token/validate",
        json={"token": oversized_token},
        headers={"Origin": "http://localhost:8000"},
    )
    assert r_unauth_validate_huge.status_code == 401

    r_unauth_delete = unauth_client.delete(
        "/api/v1/auth/ytmusic/custom-token",
        headers={"Origin": "http://localhost:8000"},
    )
    assert r_unauth_delete.status_code == 401

    # 3. Authenticated oversized token rejected with 422
    r_huge = client.post(
        "/api/v1/auth/ytmusic/custom-token",
        json={"token": oversized_token},
        headers={"Origin": "http://localhost:8000"},
    )
    assert r_huge.status_code == 422

    # 4. Internal parse error never leaks raw exception text
    def boom(_token):
        raise RuntimeError("SECRET_COOKIE_VALUE_DO_NOT_LEAK")

    monkeypatch.setattr("backend.app.services.ytmusic_service.parse_custom_token_input", boom)
    r_err = client.post(
        "/api/v1/auth/ytmusic/custom-token",
        json={"token": "SID=abc; SAPISID=sapi"},
        headers={"Origin": "http://localhost:8000"},
    )
    assert r_err.status_code == 400
    assert r_err.json()["detail"]["code"] == "invalid_token"
    assert "SECRET_COOKIE_VALUE_DO_NOT_LEAK" not in r_err.text
