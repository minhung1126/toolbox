from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from ytmusicapi.auth.types import AuthType

from backend.app.core.dependencies import require_ytmusic_context
from backend.app.main import create_app
from backend.app.services.ytmusic_clients import ytmusic_client_context
from backend.app.services.ytmusic_service import get_ytmusic_client, validate_ytmusic_custom_token

TOKEN = "SID=abc12345; HSID=def67890; SAPISID=ghi13579; SSID=xyz24680"


def test_playlist_endpoint_uses_app_factory_in_threadpool():
    barrier = Barrier(2)
    calls = []

    def client_for(name):
        def factory(**kwargs):
            calls.append((name, kwargs))
            barrier.wait(timeout=5)
            return SimpleNamespace(get_library_playlists=lambda **kw: [{"playlistId": name, "title": name}])

        app = create_app(
            ytmusic_client_factory=factory,
            dependency_overrides={require_ytmusic_context: lambda: SimpleNamespace(owner_sub=None, credentials=None)},
        )
        return TestClient(app)

    clients = [client_for(name) for name in ("first", "second")]
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(client.get, "/api/v1/playlist-sort/playlists?language=en&location=US") for client in clients
        ]
        responses = [future.result() for future in futures]
    assert [response.status_code for response in responses] == [200, 200]
    assert [response.json()["playlists"][0]["id"] for response in responses] == ["first", "second"]
    assert sorted(calls) == [(name, {"language": "en", "location": "US"}) for name in ("first", "second")]


def test_token_validation_and_authenticated_client_share_factory_without_cache():
    calls = []

    def factory(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(auth_type=AuthType.BROWSER, get_account_info=lambda: {"accountName": "test"})

    with ytmusic_client_context(factory):
        client = get_ytmusic_client(custom_token=TOKEN, language="en", location="US")
        result = validate_ytmusic_custom_token(TOKEN, language="en", location="US")
    assert client.auth_type == AuthType.BROWSER
    assert result["valid"] is True
    assert result["account_name"] == "test"
    assert len(calls) == 2
    assert all(call["language"] == "en" and call["location"] == "US" for call in calls)
    assert all("SAPISID=ghi13579" in call["auth"]["cookie"] for call in calls)


def test_factory_failure_restores_default_and_preserves_unauthenticated_fallback(monkeypatch):
    fallback = object()
    monkeypatch.setattr("backend.app.services.ytmusic_service.YTMusic", lambda **kwargs: fallback)
    calls = []

    def factory(**kwargs):
        calls.append(kwargs)
        if "auth" in kwargs:
            raise ValueError("invalid token")
        return "public-client"

    with ytmusic_client_context(factory):
        with pytest.raises(ValueError, match="invalid token"):
            get_ytmusic_client(custom_token=TOKEN)
        assert (
            get_ytmusic_client(SimpleNamespace(owner_sub=None, credentials=object()), custom_token=TOKEN)
            == "public-client"
        )
    assert get_ytmusic_client() is fallback
    assert len(calls) == 3
