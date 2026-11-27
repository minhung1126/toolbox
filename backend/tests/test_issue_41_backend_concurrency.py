import asyncio
import copy
import inspect
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import google_auth_httplib2
import httplib2
import httpx
import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from google.auth.exceptions import RefreshError

from backend.app.api import playlist_sort
from backend.app.core import dependencies
from backend.app.core.config import Settings
from backend.app.core.credential_store import CredentialStore
from backend.app.core.operation_store import OperationStore
from backend.app.core.runtime_config import RuntimeConfig
from backend.app.core.session_store import SessionStore
from backend.app.core.system_secrets import SystemSecretsManager
from backend.app.main import create_app
from backend.app.services.google_auth import (
    GOOGLE_TOKEN_REFRESH_TIMEOUT_SECONDS,
    LOGIN_SCOPES,
    SHEETS_SCOPES,
    YOUTUBE_SCOPES,
    _TimeoutRefreshRequest,
    build_credentials_from_dict,
)
from backend.app.services.oauth_clients import OAuthClientFactories, get_refresh_request_factory


def _token_dict(*, scopes=None, minutes=60, value="access-1", refresh_token="refresh-1", sub="user-1"):
    return {
        "token": value,
        "refresh_token": refresh_token,
        "token_uri": "https://oauth2.googleapis.com/token",
        "client_id": "test-client",
        "client_secret": "test-secret",
        "scopes": scopes or list(YOUTUBE_SCOPES),
        "expiry": (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat(),
        "user": {"sub": sub, "email": f"{sub}@example.test"},
        "channel_id": "chan-1",
    }


def _make_settings(tmp_path):
    return Settings(
        _env_file=None,
        runtime_store=RuntimeConfig(tmp_path / "runtime.json"),
        secrets_store=SystemSecretsManager(tmp_path),
        GOOGLE_CLIENT_ID="test-client",
        GOOGLE_CLIENT_SECRET="test-secret",
        YOUTUBE_OAUTH_PRIMARY_CLIENT_ID="test-client",
        YOUTUBE_OAUTH_PRIMARY_CLIENT_SECRET="test-secret",
        YOUTUBE_OAUTH_SECONDARY_ENABLED=True,
        YOUTUBE_OAUTH_SECONDARY_CLIENT_ID="test-secondary-client",
        YOUTUBE_OAUTH_SECONDARY_CLIENT_SECRET="test-secondary-secret",
        ALLOWED_GOOGLE_EMAILS="user-1@example.test,user-2@example.test",
    )


def test_dependencies_and_playlist_sort_routes_are_sync():
    assert not inspect.iscoroutinefunction(dependencies.require_youtube_context)
    assert not inspect.iscoroutinefunction(dependencies.require_ytmusic_context)
    assert not inspect.iscoroutinefunction(playlist_sort.get_playlists)
    assert not inspect.iscoroutinefunction(playlist_sort.preview_sort)
    assert not inspect.iscoroutinefunction(playlist_sort._apply_sort)
    assert not inspect.iscoroutinefunction(playlist_sort.apply_sort)


def test_slow_youtube_dependencies_and_playlist_routes_do_not_block_event_loop(tmp_path, monkeypatch):
    config = _make_settings(tmp_path)
    store = CredentialStore(tmp_path / "creds.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)
    sessions = SessionStore(tmp_path / "sessions.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)
    ops = OperationStore(tmp_path / "ops.sqlite3")
    store.save_google_connection(_token_dict(scopes=LOGIN_SCOPES), owner_sub="user-1")
    store.save_youtube_connection(_token_dict(scopes=YOUTUBE_SCOPES), owner_sub="user-1", slot="primary")
    store.save_ytmusic_connection(_token_dict(scopes=YOUTUBE_SCOPES), owner_sub="user-1")
    session_id = sessions.create(
        {"credential_provider": "google_login", "user": {"sub": "user-1", "email": "user-1@example.test"}}
    )

    entered = threading.Event()
    release = threading.Event()

    def slow_fetch_items(*args, **kwargs):
        entered.set()
        assert release.wait(timeout=5)
        return [
            {"playlist_item_id": "item-1", "video_id": "v1", "title": "Song", "position": 0, "has_set_video_id": True}
        ]

    monkeypatch.setattr(playlist_sort, "fetch_playlist_items_for_sort", slow_fetch_items)
    monkeypatch.setattr(playlist_sort, "verify_preview_token", lambda *a, **k: True)
    monkeypatch.setattr(playlist_sort, "apply_sort_to_playlist", lambda *a, **k: {"status": "success", "succeeded": 1})

    original_choose = dependencies.choose_youtube_slot
    original_get_ytmusic = dependencies.get_ytmusic_credentials

    def slow_choose(*args, **kwargs):
        entered.set()
        assert release.wait(timeout=5)
        return original_choose(*args, **kwargs)

    def slow_get_ytmusic(*args, **kwargs):
        entered.set()
        assert release.wait(timeout=5)
        return original_get_ytmusic(*args, **kwargs)

    monkeypatch.setattr(playlist_sort, "fetch_user_playlists", lambda *a, **k: [{"id": "PL1", "title": "Song"}])

    app = create_app(
        app_settings=config,
        credential_store=store,
        session_store=sessions,
        operation_store=ops,
    )

    async def wait_until_entered(task: asyncio.Task) -> None:
        while not entered.is_set():
            if task.done():
                resp = task.result()
                raise AssertionError(f"Request finished before entering slow hook: status={resp.status_code}")
            await asyncio.sleep(0.01)

    async def exercise():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://localhost:8000",
            cookies={config.session_cookie_name: session_id},
        ) as client:
            # 1. Slow preview_sort must not block /api/v1/health
            entered.clear()
            release.clear()
            preview_task = asyncio.create_task(
                client.post(
                    "/api/v1/playlist-sort/preview",
                    json={"playlist_id": "PL1", "sort_keys": [{"field": "title", "direction": "asc"}]},
                )
            )
            await asyncio.wait_for(wait_until_entered(preview_task), timeout=3.0)
            health_resp = await asyncio.wait_for(client.get("/api/v1/health"), timeout=2.0)
            assert health_resp.status_code == 200
            release.set()
            preview_resp = await preview_task
            assert preview_resp.status_code == 200

            # 2. Slow apply_sort must not block /api/v1/health
            entered.clear()
            release.clear()
            apply_task = asyncio.create_task(
                client.post(
                    "/api/v1/playlist-sort/apply",
                    json={
                        "playlist_id": "PL1",
                        "sort_keys": [{"field": "title", "direction": "asc"}],
                        "preview_token": "tok",
                    },
                )
            )
            await asyncio.wait_for(wait_until_entered(apply_task), timeout=3.0)
            health_resp = await asyncio.wait_for(client.get("/api/v1/health"), timeout=2.0)
            assert health_resp.status_code == 200
            release.set()
            apply_resp = await apply_task
            assert apply_resp.status_code == 200

            # 3. Slow require_youtube_context must not block /api/v1/health
            entered.clear()
            release.clear()
            with pytest.MonkeyPatch.context() as mp:
                mp.setattr(dependencies, "choose_youtube_slot", slow_choose)
                yt_task = asyncio.create_task(
                    client.post("/api/v1/youtube/video-processing-status", json={"video_ids": ["v1"]})
                )
                await asyncio.wait_for(wait_until_entered(yt_task), timeout=3.0)
                health_resp = await asyncio.wait_for(client.get("/api/v1/health"), timeout=2.0)
                assert health_resp.status_code == 200
                release.set()
                yt_resp = await yt_task
                assert yt_resp.status_code == 200

            # 4. Slow require_ytmusic_context must not block /api/v1/health
            entered.clear()
            release.clear()
            with pytest.MonkeyPatch.context() as mp:
                mp.setattr(dependencies, "get_ytmusic_credentials", slow_get_ytmusic)
                ytmusic_task = asyncio.create_task(client.get("/api/v1/playlist-sort/playlists"))
                await asyncio.wait_for(wait_until_entered(ytmusic_task), timeout=3.0)
                health_resp = await asyncio.wait_for(client.get("/api/v1/health"), timeout=2.0)
                assert health_resp.status_code == 200
                release.set()
                ytmusic_resp = await ytmusic_task
                assert ytmusic_resp.status_code == 200

    asyncio.run(exercise())


def test_require_youtube_context_checks_auth_before_reading_body(tmp_path, monkeypatch):
    config = _make_settings(tmp_path)
    app = create_app(app_settings=config)
    body_read_calls = []
    original_safe_read = dependencies._safe_read_request_json

    async def spy_safe_read(request):
        body_read_calls.append(request.url.path)
        return await original_safe_read(request)

    monkeypatch.setattr(dependencies, "_safe_read_request_json", spy_safe_read)

    @app.post("/probe-yt-di")
    def probe_yt_di(context=Depends(dependencies.require_youtube_context)):
        return {"slot": context.slot}

    app.router.routes.insert(0, app.router.routes.pop())
    client = TestClient(app)
    resp = client.post("/probe-yt-di", content=b"{invalid-json", headers={"Content-Type": "application/json"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "login_required"
    assert body_read_calls == []


def test_per_key_refresh_allows_cross_user_concurrency_and_coalesces_same_key(tmp_path):
    config = _make_settings(tmp_path)
    store = CredentialStore(tmp_path / "creds.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)
    store.save_google_connection(
        _token_dict(scopes=LOGIN_SCOPES, minutes=-10, value="expired-u1", sub="user-1"), owner_sub="user-1"
    )
    store.save_google_connection(
        _token_dict(scopes=LOGIN_SCOPES, minutes=-10, value="expired-u2", sub="user-2"), owner_sub="user-2"
    )

    barrier = threading.Barrier(2)
    calls = []
    calls_lock = threading.Lock()

    def concurrent_transport(**kwargs):
        with calls_lock:
            calls.append(kwargs)
        barrier.wait(timeout=3)
        return SimpleNamespace(status=200, headers={}, data=b'{"access_token":"fresh-cross","expires_in":3600}')

    app = create_app(
        app_settings=config,
        credential_store=store,
        oauth_client_factories=OAuthClientFactories(refresh_request=lambda: concurrent_transport),
    )

    @app.get("/probe/{user_id}")
    def probe(user_id: str):
        tok = store.get_google_credentials(user_id)
        creds = build_credentials_from_dict(tok, credential_key="google", owner_sub=user_id)
        return {"token": creds.token}

    app.router.routes.insert(0, app.router.routes.pop())
    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(TestClient(app).get, "/probe/user-1")
        f2 = pool.submit(TestClient(app).get, "/probe/user-2")
        r1, r2 = f1.result(), f2.result()

    assert r1.json() == {"token": "fresh-cross"}
    assert r2.json() == {"token": "fresh-cross"}
    assert len(calls) == 2

    # Same user/key/slot coalesces to a single OAuth POST even under concurrent refreshes
    store.save_youtube_connection(
        _token_dict(scopes=YOUTUBE_SCOPES, minutes=-10, value="expired-yt", sub="user-1"),
        owner_sub="user-1",
        slot="primary",
    )
    same_key_calls = []
    refresh_started = threading.Event()
    allow_finish = threading.Event()

    def slow_single_transport(**kwargs):
        same_key_calls.append(kwargs)
        refresh_started.set()
        assert allow_finish.wait(timeout=3)
        return SimpleNamespace(status=200, headers={}, data=b'{"access_token":"coalesced-yt","expires_in":3600}')

    app_coalesce = create_app(
        app_settings=config,
        credential_store=store,
        oauth_client_factories=OAuthClientFactories(refresh_request=lambda: slow_single_transport),
    )

    @app_coalesce.get("/probe-yt")
    def probe_yt():
        tok = store.get_youtube_credentials("user-1", slot="primary")
        creds = build_credentials_from_dict(tok, credential_key="youtube", owner_sub="user-1", slot="primary")
        return {"token": creds.token}

    app_coalesce.router.routes.insert(0, app_coalesce.router.routes.pop())
    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(TestClient(app_coalesce).get, "/probe-yt")
        assert refresh_started.wait(timeout=3)
        f2 = pool.submit(TestClient(app_coalesce).get, "/probe-yt")
        time.sleep(0.05)
        allow_finish.set()
        assert f1.result().json() == {"token": "coalesced-yt"}
        assert f2.result().json() == {"token": "coalesced-yt"}
    assert len(same_key_calls) == 1


def test_sheets_fallback_uses_google_lock_bucket_and_coalesces(tmp_path):
    config = _make_settings(tmp_path)
    store = CredentialStore(tmp_path / "creds.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)
    store.save_google_connection(
        _token_dict(scopes=SHEETS_SCOPES, minutes=-10, value="expired-google", sub="user-1"), owner_sub="user-1"
    )

    calls = []
    started = threading.Event()
    release = threading.Event()

    def transport(**kwargs):
        calls.append(kwargs)
        started.set()
        assert release.wait(timeout=3)
        return SimpleNamespace(status=200, headers={}, data=b'{"access_token":"shared-google-fresh","expires_in":3600}')

    app = create_app(
        app_settings=config,
        credential_store=store,
        oauth_client_factories=OAuthClientFactories(refresh_request=lambda: transport),
    )

    @app.get("/probe/{cred_key}")
    def probe(cred_key: str):
        tok = store.get_google_credentials("user-1")
        creds = build_credentials_from_dict(tok, credential_key=cred_key, owner_sub="user-1")
        return {"token": creds.token}

    app.router.routes.insert(0, app.router.routes.pop())
    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(TestClient(app).get, "/probe/sheets")
        assert started.wait(timeout=3)
        f2 = pool.submit(TestClient(app).get, "/probe/google")
        time.sleep(0.05)
        release.set()
        assert f1.result().json() == {"token": "shared-google-fresh"}
        assert f2.result().json() == {"token": "shared-google-fresh"}
    assert len(calls) == 1
    assert store.get_google_credentials("user-1")["token"] == "shared-google-fresh"


def test_default_refresh_request_enforces_explicit_timeout():
    recorded = {}

    class FakeSession:
        def request(self, method, url, data=None, headers=None, timeout=None, **kwargs):
            recorded["timeout"] = timeout
            return SimpleNamespace(status_code=200, headers={}, content=b"{}")

        def close(self):
            pass

    req = _TimeoutRefreshRequest(session=FakeSession())
    req("https://oauth2.googleapis.com/token", method="POST", body=b"x", headers={})
    assert recorded["timeout"] == GOOGLE_TOKEN_REFRESH_TIMEOUT_SECONDS == 10


def test_authorized_http_implicit_and_401_refreshes_persist_rotated_tokens_and_respect_backoff(tmp_path):
    config = _make_settings(tmp_path)
    store = CredentialStore(tmp_path / "creds.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)
    store.save_youtube_connection(
        _token_dict(scopes=YOUTUBE_SCOPES, minutes=30, value="valid-initial", refresh_token="refresh-v1", sub="user-1"),
        owner_sub="user-1",
        slot="primary",
    )

    refresh_calls = []

    def oauth_transport(**kwargs):
        refresh_calls.append(kwargs)
        return SimpleNamespace(
            status=200,
            headers={},
            data=json.dumps(
                {"access_token": "rotated-access", "refresh_token": "refresh-v2", "expires_in": 3600}
            ).encode(),
        )

    app = create_app(
        app_settings=config,
        credential_store=store,
        oauth_client_factories=OAuthClientFactories(refresh_request=lambda: oauth_transport),
    )

    class FakeHttp:
        def __init__(self):
            self.seen_auth = []

        def request(self, uri, method="GET", body=None, headers=None, **kwargs):
            auth = (headers or {}).get("authorization") or (headers or {}).get("Authorization")
            self.seen_auth.append(auth)
            if auth == "Bearer valid-initial":
                return httplib2.Response({"status": "401"}), b'{"error":"unauthorized"}'
            return httplib2.Response({"status": "200"}), b'{"ok":true}'

    @app.get("/authorized-http-401")
    def probe_401():
        tok = store.get_youtube_credentials("user-1", slot="primary")
        creds = build_credentials_from_dict(tok, credential_key="youtube", owner_sub="user-1", slot="primary")
        http = google_auth_httplib2.AuthorizedHttp(creds, http=FakeHttp())
        resp, _ = http.request("https://www.googleapis.com/youtube/v3/channels")
        return {"status": resp.status, "token": creds.token}

    app.router.routes.insert(0, app.router.routes.pop())
    res = TestClient(app).get("/authorized-http-401").json()
    assert res == {"status": 200, "token": "rotated-access"}
    assert len(refresh_calls) == 1
    persisted = store.get_youtube_credentials("user-1", slot="primary")
    assert persisted["token"] == "rotated-access"
    assert persisted["refresh_token"] == "refresh-v2"

    # Simulate mid-task expiry during before_request when store is in refresh_failed cooldown
    store.mark_youtube_refresh_failed("temporary", owner_sub="user-1", slot="primary", requires_reauthorization=False)

    @app.get("/authorized-http-cooldown")
    def probe_cooldown():
        tok = store.get_youtube_credentials("user-1", slot="primary")
        creds = build_credentials_from_dict(tok, credential_key="youtube", owner_sub="user-1", slot="primary")
        creds.expiry = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=1)
        http = google_auth_httplib2.AuthorizedHttp(creds, http=FakeHttp())
        try:
            http.request("https://www.googleapis.com/youtube/v3/channels")
            return {"blocked": False}
        except RefreshError:
            return {"blocked": True}

    app.router.routes.insert(0, app.router.routes.pop())
    assert TestClient(app).get("/authorized-http-cooldown").json() == {"blocked": True}
    assert len(refresh_calls) == 1


def test_publish_job_runtime_scope_activates_oauth_client_context(tmp_path):
    config = _make_settings(tmp_path)
    store = CredentialStore(tmp_path / "creds.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)
    store.save_youtube_connection(
        _token_dict(scopes=YOUTUBE_SCOPES, minutes=-10, value="expired-job", sub="user-1"),
        owner_sub="user-1",
        slot="primary",
    )

    transport_calls = []

    def job_transport(**kwargs):
        transport_calls.append(kwargs)
        return SimpleNamespace(status=200, headers={}, data=b'{"access_token":"job-refreshed","expires_in":3600}')

    app = create_app(
        app_settings=config,
        credential_store=store,
        oauth_client_factories=OAuthClientFactories(refresh_request=lambda: job_transport),
    )
    runtime = app.state.youtube_publish_runner.runtime
    with runtime.scope():
        assert get_refresh_request_factory(None) is not None
        creds = build_credentials_from_dict(
            store.get_youtube_credentials("user-1", slot="primary"),
            credential_key="youtube",
            owner_sub="user-1",
            slot="primary",
        )
        assert creds.token == "job-refreshed"
    assert len(transport_calls) == 1
    assert store.get_youtube_credentials("user-1", slot="primary")["token"] == "job-refreshed"
    assert get_refresh_request_factory(None) is None


def test_managed_credentials_copy_preserves_persistence_metadata(tmp_path):
    config = _make_settings(tmp_path)
    store = CredentialStore(tmp_path / "creds.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)
    store.save_youtube_connection(
        _token_dict(scopes=YOUTUBE_SCOPES, minutes=30, value="valid-orig", refresh_token="refresh-v1", sub="user-1"),
        owner_sub="user-1",
        slot="primary",
    )

    def transport(**kwargs):
        return SimpleNamespace(
            status=200,
            headers={},
            data=json.dumps(
                {"access_token": "copied-refreshed", "refresh_token": "refresh-v2", "expires_in": 3600}
            ).encode(),
        )

    app = create_app(
        app_settings=config,
        credential_store=store,
        oauth_client_factories=OAuthClientFactories(refresh_request=lambda: transport),
    )

    @app.get("/probe-copy")
    def probe_copy():
        tok = store.get_youtube_credentials("user-1", slot="primary")
        creds = build_credentials_from_dict(tok, credential_key="youtube", owner_sub="user-1", slot="primary")

        shallow = copy.copy(creds)
        scoped_quota = creds.with_quota_project("quota-proj-1")
        for cloned in (shallow, scoped_quota):
            assert cloned._owner_sub == "user-1"
            assert cloned._credential_key == "youtube"
            assert cloned._slot == "primary"
            assert cloned._bound_store is store
            assert cloned._token_record["token"] == "valid-orig"
            assert cloned._token_record is not creds._token_record

        shallow.refresh()
        return {"token": shallow.token}

    app.router.routes.insert(0, app.router.routes.pop())
    res = TestClient(app).get("/probe-copy")
    assert res.status_code == 200
    assert res.json() == {"token": "copied-refreshed"}
    persisted = store.get_youtube_credentials("user-1", slot="primary")
    assert persisted["token"] == "copied-refreshed"
    assert persisted["refresh_token"] == "refresh-v2"


def test_refresh_managed_credentials_syncs_updated_scopes_from_store(tmp_path):
    config = _make_settings(tmp_path)
    store = CredentialStore(tmp_path / "creds.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)
    initial_scopes = list(YOUTUBE_SCOPES)
    store.save_youtube_connection(
        _token_dict(scopes=initial_scopes, minutes=30, value="valid-initial", refresh_token="refresh-v1", sub="user-1"),
        owner_sub="user-1",
        slot="primary",
    )

    app = create_app(app_settings=config, credential_store=store)

    @app.get("/probe-scope-sync")
    def probe_scope_sync():
        tok = store.get_youtube_credentials("user-1", slot="primary")
        creds = build_credentials_from_dict(tok, credential_key="youtube", owner_sub="user-1", slot="primary")
        assert list(creds.scopes) == initial_scopes

        # Simulate another request/thread saving a newly authorized token with expanded scopes
        expanded_scopes = [*initial_scopes, "https://www.googleapis.com/auth/userinfo.email"]
        store.save_youtube_connection(
            _token_dict(
                scopes=expanded_scopes,
                minutes=60,
                value="fresh-expanded",
                refresh_token="refresh-v2",
                sub="user-1",
            ),
            owner_sub="user-1",
            slot="primary",
        )
        creds.refresh()
        return {"token": creds.token, "scopes": list(creds.scopes)}

    app.router.routes.insert(0, app.router.routes.pop())
    res = TestClient(app).get("/probe-scope-sync")
    assert res.status_code == 200
    assert res.json()["token"] == "fresh-expanded"
    assert res.json()["scopes"] == [*initial_scopes, "https://www.googleapis.com/auth/userinfo.email"]
