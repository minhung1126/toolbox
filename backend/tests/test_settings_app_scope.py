import asyncio
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient

from backend.app.core.config import Settings, SettingsMiddleware, get_settings, settings_context
from backend.app.core.credential_store import CredentialStore
from backend.app.core.dependencies import require_account_email, require_account_subject, require_login_credentials
from backend.app.core.runtime_config import RuntimeConfig, get_runtime_config
from backend.app.core.security import GOOGLE_OAUTH_STATE_SALT, verify_timed_data
from backend.app.core.session_store import SessionStore
from backend.app.core.system_secrets import SystemSecretsManager
from backend.app.main import create_app


def config_for(tmp_path, name, **kwargs):
    return Settings(
        _env_file=None,
        runtime_store=RuntimeConfig(tmp_path / name / "runtime.json"),
        secrets_store=SystemSecretsManager(tmp_path / name),
        PUBLIC_BASE_URL=f"https://{name}.example.test",
        FRONTEND_URL=f"https://{name}.example.test",
        GOOGLE_CLIENT_ID=f"{name}-client",
        GOOGLE_CLIENT_SECRET=f"{name}-secret",
        ALLOWED_GOOGLE_EMAILS="admin@example.test",
        **kwargs,
    )


def admin_app(config):
    return create_app(
        app_settings=config,
        dependency_overrides={
            require_login_credentials: lambda: object(),
            require_account_email: lambda: "admin@example.test",
        },
    )


def test_settings_writes_and_environment_defaults_are_app_scoped(tmp_path):
    first_config = config_for(tmp_path, "first")
    second_config = config_for(tmp_path, "second", ALLOW_NEW_USERS=False)
    first = TestClient(admin_app(first_config), base_url=first_config.base_url)
    second = TestClient(admin_app(second_config), base_url=second_config.base_url)
    assert first.get("/api/v1/system/allowlist").json()["allow_new_users"] is True
    assert second.get("/api/v1/system/allowlist").json()["allow_new_users"] is False
    assert (
        first.put(
            "/api/v1/system/credentials",
            json={"google_client_id": "updated-client", "google_client_secret": "updated-secret"},
        ).status_code
        == 200
    )
    assert first_config.GOOGLE_CLIENT_ID == "updated-client"
    assert second_config.GOOGLE_CLIENT_ID == "second-client"
    assert second_config.get_secrets_store().get_credentials() == {}
    assert first.post("/api/v1/system/allowlist/add", json={"email": "new@example.test"}).status_code == 200
    assert first_config.allowed_google_emails == frozenset({"admin@example.test", "new@example.test"})
    assert second_config.allowed_google_emails == frozenset({"admin@example.test"})
    assert first.put("/api/v1/system/allow-new-users", json={"allow_new_users": False}).status_code == 200
    assert not first_config.allow_new_users
    # Direct repository writes outside HTTP must notify their owning settings too.
    second_config.get_runtime_store().set_allow_new_users(True)
    assert second_config.ALLOW_NEW_USERS is True
    assert first_config.ALLOW_NEW_USERS is False
    assert first.get("/api/v1/health").json()["host"] == first_config.base_url
    assert second.get("/api/v1/auth/config").json()["host"] == second_config.base_url
    assert RuntimeConfig(tmp_path / "first" / "runtime.json").get_allowed_emails() == [
        "admin@example.test",
        "new@example.test",
    ]


def test_oauth_url_signing_cookies_and_origin_policy_use_app_settings(tmp_path):
    configs = [config_for(tmp_path, name, ENVIRONMENT="production") for name in ("first", "second")]
    clients = [TestClient(admin_app(config), base_url=config.base_url) for config in configs]
    response = clients[0].get("/api/v1/auth/url")
    assert response.status_code == 200
    query = parse_qs(urlparse(response.json()["auth_url"]).query)
    assert query["client_id"] == ["first-client"]
    assert query["redirect_uri"] == ["https://first.example.test/api/v1/auth/callback"]
    cookie = response.cookies[configs[0].oauth_flow_cookie_name]
    assert "Secure" in response.headers["set-cookie"]
    assert response.headers["strict-transport-security"]
    with settings_context(configs[0]):
        assert verify_timed_data(cookie, GOOGLE_OAUTH_STATE_SALT, 600)["state"] == query["state"][0]
    with settings_context(configs[1]):
        assert verify_timed_data(cookie, GOOGLE_OAUTH_STATE_SALT, 600) is None
    payload = {"allow_new_users": False}
    assert (
        clients[0]
        .put("/api/v1/system/allow-new-users", json=payload, headers={"Origin": configs[1].base_url})
        .status_code
        == 403
    )
    assert (
        clients[0]
        .put("/api/v1/system/allow-new-users", json=payload, headers={"Origin": configs[0].base_url})
        .status_code
        == 200
    )
    assert clients[0].get("/api/v1/health", headers={"Host": "second.example.test"}).status_code == 400


def test_login_allowlist_is_app_scoped_without_auth_overrides(tmp_path):
    configs = [config_for(tmp_path, name) for name in ("first", "second")]
    configs[1].get_runtime_store().set_allowed_emails(["another@example.test"])
    for i, config in enumerate(configs):
        sessions = SessionStore(tmp_path / f"sessions-{i}.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)
        credentials = CredentialStore(
            tmp_path / f"credentials-{i}.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY
        )
        user = {"sub": "same-user", "email": "admin@example.test"}
        credentials.save_google_connection({"token": "test-token", "user": user}, owner_sub="same-user")
        session_id = sessions.create({"credential_provider": "google_login", "user": user})
        app = create_app(app_settings=config, session_store=sessions, credential_store=credentials)

        @app.get("/identity-probe")
        def probe(subject: str = Depends(require_account_subject)):
            return {"subject": subject}

        app.router.routes.insert(0, app.router.routes.pop())
        client = TestClient(app, base_url=config.base_url)
        client.cookies.set(config.session_cookie_name, session_id)
        response = client.get("/identity-probe")
        assert response.status_code == (200 if i == 0 else 403)


def test_concurrent_settings_context_and_exception_cleanup(tmp_path):
    configs = [config_for(tmp_path, name) for name in ("first", "second")]
    barrier = Barrier(2)
    clients = []
    for config in configs:
        app = create_app(app_settings=config)

        @app.get("/config-probe/{value}")
        def probe(value: str):
            get_runtime_config().set("youtube_oauth_primary_label", value)
            barrier.wait(timeout=5)
            return {"label": get_settings().YOUTUBE_OAUTH_PRIMARY_LABEL}

        app.router.routes.insert(0, app.router.routes.pop())
        clients.append(TestClient(app, base_url=config.base_url))
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(client.get, f"/config-probe/{i}") for i, client in enumerate(clients)]
        assert [future.result().json() for future in futures] == [{"label": "0"}, {"label": "1"}]
    fallback = get_settings()

    async def fail(scope, receive, send):
        assert get_settings() is configs[0]
        raise RuntimeError("failed request")

    async def check_reset():
        with pytest.raises(RuntimeError, match="failed request"):
            await SettingsMiddleware(fail, configs[0])({"type": "http"}, None, None)
        assert get_settings() is fallback

    asyncio.run(check_reset())


def test_local_oauth_does_not_require_process_transport_override(tmp_path, monkeypatch):
    from backend.app.services.google_auth import get_auth_url

    monkeypatch.delenv("OAUTHLIB_INSECURE_TRANSPORT", raising=False)
    config = config_for(tmp_path, "local")
    config.PUBLIC_BASE_URL = "http://localhost:8000"
    with settings_context(config):
        url, state, verifier = get_auth_url()
    query = parse_qs(urlparse(url).query)
    assert url.startswith("https://accounts.google.com/")
    assert query["redirect_uri"] == ["http://localhost:8000/api/v1/auth/callback"]
    assert state and verifier


def test_lifespan_uses_and_restores_injected_settings(tmp_path):
    config = config_for(tmp_path, "lifecycle")
    observed = []

    class Registry:
        def mount_routers(self, router):
            pass

        async def run_startup(self, app):
            observed.append(("startup", get_settings()))

        async def run_shutdown(self, app):
            observed.append(("shutdown", get_settings()))

    fallback = get_settings()
    with TestClient(create_app(app_settings=config, registry=Registry())):
        assert get_settings() is fallback
    assert observed == [("startup", config), ("shutdown", config)]
    assert get_settings() is fallback
