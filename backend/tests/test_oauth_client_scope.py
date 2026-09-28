from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import settings
from backend.app.core.credential_store import CredentialStore
from backend.app.main import create_app
from backend.app.services.google_auth import build_credentials_from_dict, create_oauth_flow, exchange_code_for_tokens
from backend.app.services.google_clients import google_client_context
from backend.app.services.oauth_clients import (
    OAuthClientFactories,
    get_oauth_flow_factory,
    get_refresh_request_factory,
    oauth_client_context,
)


def test_auth_url_uses_app_flow_factory_with_pkce_and_scopes(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "test-secret")
    calls = []

    def factory(config, **kwargs):
        calls.append((config, kwargs))
        return SimpleNamespace(
            code_verifier="test-verifier",
            authorization_url=lambda **kw: ("https://accounts.google.com/test", "test-state"),
        )

    client = TestClient(create_app(oauth_client_factories=OAuthClientFactories(flow=factory)))
    response = client.get("/api/v1/auth/url")
    assert response.status_code == 200
    assert response.json()["auth_url"] == "https://accounts.google.com/test"
    assert calls[0][1]["autogenerate_code_verifier"] is True
    assert "openid" in calls[0][1]["scopes"]
    with oauth_client_context(OAuthClientFactories(flow=factory)):
        create_oauth_flow(code_verifier="existing-verifier", purpose="sheets")
    assert calls[1][1]["code_verifier"] == "existing-verifier"
    assert calls[1][1]["autogenerate_code_verifier"] is False
    assert any("spreadsheets" in scope for scope in calls[1][1]["scopes"])


def test_concurrent_apps_keep_oauth_flow_factories_isolated(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "test-secret")
    barrier = Barrier(2)

    def make_client(name):
        def factory(config, **kwargs):
            assert config["web"]["client_id"] == "test-client"
            assert kwargs["autogenerate_code_verifier"] is True
            barrier.wait(timeout=5)
            return SimpleNamespace(
                code_verifier=f"{name}-verifier",
                authorization_url=lambda **kw: (f"https://accounts.google.com/{name}", f"{name}-state"),
            )

        return TestClient(create_app(oauth_client_factories=OAuthClientFactories(flow=factory)))

    first = make_client("first")
    second = make_client("second")
    with ThreadPoolExecutor(max_workers=2) as executor:
        first_response = executor.submit(first.get, "/api/v1/auth/url")
        second_response = executor.submit(second.get, "/api/v1/auth/url")
        responses = [first_response.result(), second_response.result()]

    assert [response.status_code for response in responses] == [200, 200]
    assert [response.json()["auth_url"] for response in responses] == [
        "https://accounts.google.com/first",
        "https://accounts.google.com/second",
    ]


def test_injected_transport_refreshes_real_credentials_and_persists_only_to_own_app(tmp_path):
    def make_client(name):
        store = CredentialStore(tmp_path / f"{name}.json")
        token = {
            "token": "expired",
            "refresh_token": "test-refresh-token",
            "token_uri": "https://oauth2.googleapis.com/token",
            "client_id": "test-client",
            "client_secret": "test-secret",
            "scopes": ["openid"],
            "expiry": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
            "user": {"sub": "same-user"},
        }
        store.save_google_connection(token, owner_sub="same-user")

        def request(**kwargs):
            assert kwargs["url"] == "https://oauth2.googleapis.com/token"
            assert kwargs["method"] == "POST"
            return SimpleNamespace(
                status=200,
                headers={},
                data=(' {"access_token":"' + name + '","expires_in":3600,"token_type":"Bearer"}').encode(),
            )

        app = create_app(
            credential_store=store,
            oauth_client_factories=OAuthClientFactories(refresh_request=lambda: request),
        )

        @app.get("/refresh-transport-probe")
        def probe():
            credentials = build_credentials_from_dict(token, owner_sub="same-user")
            return {"valid": credentials.valid}

        app.router.routes.insert(0, app.router.routes.pop())
        return TestClient(app), store

    first, first_store = make_client("first")
    second, second_store = make_client("second")
    assert first.get("/refresh-transport-probe").json() == {"valid": True}
    assert second_store.get_google_credentials("same-user")["token"] == "expired"
    assert second.get("/refresh-transport-probe").json() == {"valid": True}
    assert first_store.get_google_credentials("same-user")["token"] == "first"
    assert CredentialStore(tmp_path / "second.json").get_google_credentials("same-user")["token"] == "second"


def test_factory_context_restores_on_failure_and_partial_injection_uses_defaults():
    def fallback():
        return None

    def injected():
        return "injected"

    with pytest.raises(RuntimeError), oauth_client_context(OAuthClientFactories(flow=injected)):
        assert get_oauth_flow_factory(fallback) is injected
        assert get_refresh_request_factory(fallback) is fallback
        raise RuntimeError("failed flow")
    assert get_oauth_flow_factory(fallback) is fallback
    assert get_refresh_request_factory(fallback) is fallback


def test_code_exchange_preserves_pkce_and_uses_injected_flow():
    seen = []
    credentials = SimpleNamespace(
        token="access",
        refresh_token="refresh",
        token_uri="https://oauth2.googleapis.com/token",
        client_id="client",
        client_secret="secret",
        scopes=["openid"],
        expiry=None,
    )

    def flow_factory(config, **kwargs):
        assert kwargs["code_verifier"] == "pkce-verifier"
        return SimpleNamespace(credentials=credentials, fetch_token=lambda **kw: seen.append(kw))

    profile_request = SimpleNamespace(execute=lambda: {"id": "test-user", "email": "test@example.test"})
    profile_client = SimpleNamespace(userinfo=lambda: SimpleNamespace(get=lambda: profile_request))
    with (
        oauth_client_context(OAuthClientFactories(flow=flow_factory)),
        google_client_context(lambda *a, **kw: profile_client),
    ):
        result = exchange_code_for_tokens("auth-code", "pkce-verifier")
    assert seen == [{"code": "auth-code"}]
    assert result["token"] == "access"
    assert result["refresh_token"] == "refresh"
    assert result["user"]["sub"] == "test-user"
