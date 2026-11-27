from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from starlette.requests import Request

from backend.app.core import dependencies
from backend.app.core.credential_store import CredentialStore
from backend.app.core.security import (
    GOOGLE_OAUTH_STATE_SALT,
    sign_timed_data,
    verify_timed_data,
)
from backend.app.core.session_store import SessionStore


def test_oauth_state_is_tamper_expiry_and_salt_bound():
    token = sign_timed_data({"state": "abc"}, GOOGLE_OAUTH_STATE_SALT)
    assert verify_timed_data(token, GOOGLE_OAUTH_STATE_SALT, 60)["state"] == "abc"
    assert verify_timed_data(token + "x", GOOGLE_OAUTH_STATE_SALT, 60) is None
    assert verify_timed_data(token, "different-oauth-flow", 60) is None
    expired = sign_timed_data({"state": "old"}, GOOGLE_OAUTH_STATE_SALT)
    assert verify_timed_data(expired, GOOGLE_OAUTH_STATE_SALT, -1) is None


def test_sessions_are_isolated_and_cookie_has_no_token(tmp_path: Path):
    store = SessionStore(tmp_path / "sessions.json")
    first = store.create({"credential_provider": "google_login", "user": {"sub": "subject-a"}})
    second = store.create({"credential_provider": "google_login", "user": {"sub": "subject-b"}})
    assert first != second
    assert store.get(first)["user"]["sub"] == "subject-a"
    store.delete(first)
    assert store.get(first) is None
    assert store.get(second)["user"]["sub"] == "subject-b"
    assert "subject-a" not in first and "subject-b" not in second


def test_no_cookie_is_rejected():
    request = Request(
        {"type": "http", "method": "GET", "path": "/", "headers": [], "query_string": b"", "server": ("testserver", 80)}
    )
    with pytest.raises(HTTPException) as error:
        dependencies.require_login_credentials(request)
    assert error.value.status_code == 401


def test_credential_store_encrypts_and_rejects_wrong_key(tmp_path: Path, monkeypatch):
    monkeypatch.setattr("backend.app.core.credential_store.settings.CREDENTIAL_ENCRYPTION_KEY", "test-key")
    store = CredentialStore(tmp_path / "credentials.json")
    store.save_google_connection(
        {
            "token": "google-token",
            "refresh_token": "google-refresh-token",
            "expiry": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "user": {"sub": "subject-a", "email": "admin@example.test"},
        },
        owner_sub="subject-a",
    )
    raw = (tmp_path / "credentials.json").read_text(encoding="utf-8")
    assert "google-token" not in raw
    assert "google-refresh-token" not in raw
    store._fernet = Fernet(Fernet.generate_key())
    with pytest.raises(RuntimeError):
        store.get_google_credentials("subject-a")


def test_revoked_email_is_blocked_on_api_access(tmp_path: Path, monkeypatch):
    sess_store = SessionStore(tmp_path / "sessions.json")
    monkeypatch.setattr(dependencies, "session_store", sess_store)
    from types import SimpleNamespace

    monkeypatch.setattr(dependencies, "get_login_credentials", lambda sid: SimpleNamespace(valid=True))

    sub = "subject-revoked"
    session_id = sess_store.create(
        {"credential_provider": "google_login", "user": {"sub": sub, "email": "revoked@example.com"}}
    )

    # Allow only admin@example.com
    from backend.app.core.runtime_config import runtime_config

    runtime_config.set_allowed_emails(["admin@example.com"])
    try:
        request = Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/",
                "headers": [(b"cookie", f"{dependencies.settings.session_cookie_name}={session_id}".encode())],
                "query_string": b"",
                "server": ("testserver", 80),
            }
        )
        with pytest.raises(HTTPException) as error:
            dependencies.get_authenticated_session(request)
        assert error.value.status_code == 403
        assert error.value.detail["code"] == "access_denied"
    finally:
        runtime_config.set_allowed_emails([])


def test_session_store_delete_by_email_is_case_insensitive_and_resilient(tmp_path: Path):
    store = SessionStore(tmp_path / "sessions.json")
    admin_sid = store.create(
        {"credential_provider": "google_login", "user": {"sub": "s1", "email": "admin@example.com"}}
    )
    revoked_1 = store.create(
        {"credential_provider": "google_login", "user": {"sub": "s2", "email": "Revoked@Example.com"}}
    )
    revoked_2 = store.create(
        {"credential_provider": "google_login", "user": {"sub": "s2", "email": "revoked@example.com"}}
    )
    store._data["sessions"]["corrupt"] = {"expires_at": "2099-01-01T00:00:00+00:00", "data": "not-fernet"}

    deleted = store.delete_by_email("revoked@example.com")
    assert deleted == 2
    assert store.get(admin_sid) is not None
    assert store.get(revoked_1) is None
    assert store.get(revoked_2) is None


def test_revoked_user_blocked_on_auth_user_and_callback_before_token_refresh(tmp_path: Path, monkeypatch):
    from backend.app.api import auth as auth_api
    from backend.app.core.config import Settings, settings_context
    from backend.app.core.runtime_config import RuntimeConfig
    from backend.app.core.system_secrets import SystemSecretsManager
    from backend.app.main import create_app

    subdir = tmp_path / "revoked-auth"
    runtime = RuntimeConfig(subdir / "runtime.json")
    runtime.set_allowed_emails(["admin@example.com"])
    config = Settings(
        _env_file=None,
        runtime_store=runtime,
        secrets_store=SystemSecretsManager(subdir),
        PUBLIC_BASE_URL="http://localhost:8000",
        GOOGLE_CLIENT_ID="client-id",
        GOOGLE_CLIENT_SECRET="client-secret",
    )
    sessions = SessionStore(subdir / "sessions.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)
    creds = CredentialStore(subdir / "creds.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)
    revoked_user = {"sub": "revoked-sub", "email": "revoked@example.com"}
    creds.save_google_connection({"token": "tok", "user": revoked_user}, owner_sub="revoked-sub")
    sid = sessions.create({"credential_provider": "google_login", "user": revoked_user})

    monkeypatch.setattr(
        auth_api,
        "get_login_credentials",
        lambda _sid: pytest.fail("get_login_credentials must not run for revoked allowlist email"),
    )

    from fastapi.testclient import TestClient

    client = TestClient(create_app(app_settings=config, session_store=sessions, credential_store=creds))
    client.cookies.set(config.session_cookie_name, sid)
    user_resp = client.get("/api/v1/auth/user")
    assert user_resp.status_code == 200
    assert user_resp.json()["authenticated"] is False

    with settings_context(config):
        flow_cookie = sign_timed_data(
            {"flow_type": auth_api.SHEETS_FLOW, "state": "s", "code_verifier": "v", "session_id": sid},
            salt=GOOGLE_OAUTH_STATE_SALT,
        )
    monkeypatch.setattr(
        auth_api,
        "exchange_code_for_tokens",
        lambda **kwargs: {"token": "sheets-tok", "user": revoked_user},
    )
    client.cookies.set(config.oauth_flow_cookie_name, flow_cookie)
    cb_resp = client.get("/api/v1/auth/callback", params={"code": "c", "state": "s"}, follow_redirects=False)
    assert cb_resp.status_code == 307
    assert "sheets_auth_error=" in cb_resp.headers["location"]
    assert creds.get_sheets_credentials("revoked-sub") is None
