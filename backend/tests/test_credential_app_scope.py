import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier

import pytest
from fastapi import Request
from fastapi.testclient import TestClient

from backend.app.core.config import settings
from backend.app.core.credential_store import CredentialStore, CredentialStoreMiddleware, get_credential_store
from backend.app.core.session_store import SessionStore
from backend.app.main import create_app
from backend.app.services import google_auth


def token(value, minutes=60):
    return {
        "token": value,
        "refresh_token": "refresh-token",
        "token_uri": "https://oauth2.googleapis.com/token",
        "client_id": "test-client",
        "client_secret": "test-secret",
        "scopes": ["openid"],
        "expiry": (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat(),
        "user": {"sub": "same-user", "email": "admin@example.test"},
    }


def client_for(tmp_path, name, store):
    sessions = SessionStore(tmp_path / f"{name}-sessions.json")
    session_id = sessions.create({"credential_provider": "google_login", "user": token("")["user"]})
    app = create_app(session_store=sessions, credential_store=store)
    client = TestClient(app)
    client.cookies.set(settings.session_cookie_name, session_id)
    return app, client


def test_service_disconnect_and_custom_token_are_app_scoped(tmp_path, monkeypatch):
    monkeypatch.setattr(type(settings), "is_google_email_allowed", lambda self, email: True)
    stores = [CredentialStore(tmp_path / f"{i}.json") for i in range(2)]
    clients = []
    for i, store in enumerate(stores):
        store.save_google_connection(token(f"login-{i}"), owner_sub="same-user")
        store.save_sheets_connection(token(f"sheets-{i}"), owner_sub="same-user")
        _, client = client_for(tmp_path, str(i), store)
        clients.append(client)
    assert clients[0].post("/api/v1/auth/sheets/disconnect").status_code == 200
    assert stores[0].get_sheets_credentials("same-user") is None
    assert stores[1].get_sheets_credentials("same-user")["token"] == "sheets-1"
    browser_token = '{"cookie":"SAPISID=test","x-goog-authuser":"0"}'
    assert clients[0].post("/api/v1/auth/ytmusic/custom-token", json={"token": browser_token}).status_code == 200
    assert stores[0].get_ytmusic_custom_token("same-user") == browser_token
    assert stores[1].get_ytmusic_custom_token("same-user") is None
    assert clients[1].delete("/api/v1/auth/ytmusic/custom-token").status_code == 200
    assert stores[0].get_ytmusic_custom_token("same-user") == browser_token
    assert clients[0].delete("/api/v1/auth/ytmusic/custom-token").status_code == 200
    assert stores[0].get_ytmusic_custom_token("same-user") is None


def test_playlist_preview_uses_each_apps_credential_repository(tmp_path, monkeypatch):
    from types import SimpleNamespace

    from backend.app.api import playlist_sort
    from backend.app.core.dependencies import require_ytmusic_context

    stores = [CredentialStore(tmp_path / f"playlist-{index}.json") for index in range(2)]
    stores[0].save_ytmusic_custom_token("browser-token", owner_sub="same-user")
    context = SimpleNamespace(owner_sub="same-user", slot="primary")
    items = [
        {"playlist_item_id": "v1_0", "video_id": "v1", "title": "B", "position": 0, "has_set_video_id": True},
        {"playlist_item_id": "v2_1", "video_id": "v2", "title": "A", "position": 1, "has_set_video_id": True},
    ]
    monkeypatch.setattr(playlist_sort, "fetch_playlist_items_for_sort", lambda *_args, **_kwargs: items)
    clients = [
        TestClient(
            create_app(
                credential_store=store,
                dependency_overrides={require_ytmusic_context: lambda: context},
            )
        )
        for store in stores
    ]
    responses = [
        client.post(
            "/api/v1/playlist-sort/preview",
            json={"playlist_id": "playlist-1", "sort_keys": [{"field": "title", "direction": "asc"}]},
        )
        for client in clients
    ]
    assert [response.status_code for response in responses] == [200, 200]
    assert [response.json()["quota_estimate"]["engine"] for response in responses] == [
        "ytmusic_innertube",
        "youtube_data_api_v3",
    ]
    monkeypatch.setattr(playlist_sort, "verify_preview_token", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(
        playlist_sort,
        "apply_sort_to_playlist",
        lambda *_args, **kwargs: {"allow_quota_fallback": kwargs["allow_quota_fallback"]},
    )
    apply_responses = [
        client.post(
            "/api/v1/playlist-sort/apply",
            json={"playlist_id": "playlist-1", "sort_keys": [], "preview_token": "signed-preview"},
        )
        for client in clients
    ]
    assert [response.status_code for response in apply_responses] == [200, 200]
    assert [response.json()["allow_quota_fallback"] for response in apply_responses] == [False, True]


def test_playlist_api_does_not_expose_provider_exception_text(tmp_path, monkeypatch):
    from types import SimpleNamespace

    from backend.app.api import playlist_sort
    from backend.app.core.dependencies import require_ytmusic_context

    def fail_provider(*_args, **_kwargs):
        raise RuntimeError("access_token=private-provider-value")

    monkeypatch.setattr(playlist_sort, "fetch_user_playlists", fail_provider)
    monkeypatch.setattr(playlist_sort, "fetch_playlist_items_for_sort", fail_provider)
    app = create_app(
        credential_store=CredentialStore(tmp_path / "playlist-errors.json"),
        dependency_overrides={require_ytmusic_context: lambda: SimpleNamespace(owner_sub="same-user", slot="primary")},
    )
    client = TestClient(app)
    responses = [
        client.get("/api/v1/playlist-sort/playlists"),
        client.post("/api/v1/playlist-sort/preview", json={"playlist_id": "playlist-1", "sort_keys": []}),
    ]
    assert [response.status_code for response in responses] == [500, 500]
    assert [response.json()["detail"]["code"] for response in responses] == [
        "playlist_fetch_failed",
        "PREVIEW_FAILED",
    ]
    assert all("access_token=private-provider-value" not in response.text for response in responses)


def test_playlist_provider_uses_explicit_store_without_credential_context(tmp_path, monkeypatch):
    from types import SimpleNamespace

    from backend.app.core.dependencies import require_ytmusic_context
    from backend.app.services import ytmusic_service

    store = CredentialStore(tmp_path / "explicit-playlist-token.json")
    store.save_ytmusic_custom_token(
        "SID=abc12345; HSID=def67890; SAPISID=ghi13579; SSID=xyz24680", owner_sub="same-user"
    )
    monkeypatch.setattr(ytmusic_service, "get_credential_store", lambda *_args: pytest.fail("Implicit store used"))
    factory_calls = []

    def factory(**kwargs):
        factory_calls.append(kwargs)
        return SimpleNamespace(get_library_playlists=lambda **_kwargs: [{"playlistId": "owned", "title": "Owned"}])

    app = create_app(
        credential_store=store,
        ytmusic_client_factory=factory,
        dependency_overrides={
            require_ytmusic_context: lambda: SimpleNamespace(owner_sub="same-user", credentials=object())
        },
    )
    response = TestClient(app).get("/api/v1/playlist-sort/playlists")

    assert response.status_code == 200
    assert response.json()["playlists"][0]["id"] == "owned"
    assert len(factory_calls) == 1
    assert "SAPISID=ghi13579" in factory_calls[0]["auth"]["cookie"]


def test_refresh_uses_and_persists_only_injected_credentials(tmp_path, monkeypatch):
    stores = [CredentialStore(tmp_path / f"{i}.json") for i in range(2)]
    for i, store in enumerate(stores):
        store.save_google_connection(token(f"old-{i}", minutes=1), owner_sub="same-user")

    def refresh(self, request):
        self.token = f"refreshed-{self.token}"
        self.expiry = datetime.now(timezone.utc) + timedelta(hours=1)

    monkeypatch.setattr(google_auth.Credentials, "refresh", refresh)
    app, client = client_for(tmp_path, "refresh", stores[0])

    @app.get("/refresh-probe")
    def probe(request: Request):
        credentials = google_auth.get_login_credentials(request.cookies.get(settings.session_cookie_name))
        return {"token": credentials.token}

    app.router.routes.insert(0, app.router.routes.pop())
    assert client.get("/refresh-probe").json() == {"token": "refreshed-old-0"}
    assert stores[1].get_google_credentials("same-user")["token"] == "old-1"
    assert CredentialStore(tmp_path / "0.json").get_google_credentials("same-user")["token"] == "refreshed-old-0"
    assert "refreshed-old-0" not in (tmp_path / "0.json").read_text(encoding="utf-8")


def test_overlapping_sync_requests_keep_credential_writes_isolated(tmp_path):
    barrier = Barrier(2)
    clients = []
    stores = [CredentialStore(tmp_path / f"{i}.json") for i in range(2)]
    for i, store in enumerate(stores):
        app, client = client_for(tmp_path, str(i), store)

        @app.post("/credential-probe/{value}")
        def probe(value: str):
            get_credential_store().save_google_connection(token(value), owner_sub="same-user")
            barrier.wait(timeout=5)
            return {"token": get_credential_store().get_google_credentials("same-user")["token"]}

        app.router.routes.insert(0, app.router.routes.pop())
        clients.append(client)
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(client.post, f"/credential-probe/{i}") for i, client in enumerate(clients)]
        assert [future.result().json() for future in futures] == [{"token": "0"}, {"token": "1"}]


def test_credential_context_resets_after_failure_and_preserves_fallback(tmp_path):
    store = CredentialStore(tmp_path / "failed.json")
    fallback = get_credential_store()

    async def fail(scope, receive, send):
        assert get_credential_store() is store
        raise RuntimeError("failed request")

    async def check_reset():
        with pytest.raises(RuntimeError, match="failed request"):
            await CredentialStoreMiddleware(fail, store)({"type": "http"}, None, None)
        assert get_credential_store() is fallback
        assert get_credential_store(store) is store

    asyncio.run(check_reset())
