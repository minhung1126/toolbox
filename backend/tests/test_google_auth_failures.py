import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from google.auth.exceptions import TransportError
from googleapiclient.errors import HttpError
from httplib2 import Response

from backend.app.core.config import Settings
from backend.app.core.credential_store import CredentialStore
from backend.app.core.dependencies import require_account_subject, require_sheets_credentials
from backend.app.core.runtime_config import RuntimeConfig
from backend.app.core.session_store import SessionStore
from backend.app.core.system_secrets import SystemSecretsManager
from backend.app.main import create_app
from backend.app.services import google_auth
from backend.app.services.google_auth import LOGIN_SCOPES, SHEETS_SCOPES, YOUTUBE_SCOPES
from backend.app.services.oauth_clients import OAuthClientFactories


def _token(scopes, *, minutes=60, value="test-access"):
    return {
        "token": value,
        "refresh_token": "test-refresh",
        "client_id": "test-client",
        "scopes": scopes,
        "expiry": (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat(),
        "user": {"sub": "test-user", "email": "test@example.test"},
        "channel_id": "test-channel",
    }


def _auth_client(tmp_path, store, transport):
    config = Settings(
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
        ALLOWED_GOOGLE_EMAILS="test@example.test",
    )
    sessions = SessionStore(tmp_path / "sessions.json")
    session_id = sessions.create({"credential_provider": "google_login", "user": _token([])["user"]})
    client = TestClient(
        create_app(
            app_settings=config,
            credential_store=store,
            session_store=sessions,
            oauth_client_factories=OAuthClientFactories(refresh_request=lambda: transport),
        )
    )
    client.cookies.set(config.session_cookie_name, session_id)
    return client


def test_revoked_service_tokens_stop_retrying_across_fallbacks_and_restarts(tmp_path, caplog):
    path = tmp_path / "credentials.json"
    store = CredentialStore(path)
    store.save_google_connection(_token(LOGIN_SCOPES), owner_sub="test-user")
    store.save_sheets_connection(_token(SHEETS_SCOPES, minutes=4), owner_sub="test-user")
    store.save_ytmusic_connection(_token(YOUTUBE_SCOPES, minutes=4), owner_sub="test-user")
    for slot in ("primary", "secondary"):
        store.save_youtube_connection(_token(YOUTUBE_SCOPES, minutes=-60), owner_sub="test-user", slot=slot)
    calls = []

    def revoked(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(
            status=400,
            data=b'{"error":"invalid_grant","error_description":"refresh_token=private-value"}',
        )

    client = _auth_client(tmp_path, store, revoked)
    for _ in range(2):
        response = client.get("/api/v1/auth/user")
        assert response.status_code == 200
        status = response.json()
        assert status["authenticated"] is True
        for service in ("sheets", "ytmusic"):
            assert status["authorizations"][service]["connected"] is False
            assert status["authorizations"][service]["token_status"] == "reauthorization_required"
        for slot in ("primary", "secondary"):
            assert status["youtube"]["slots"][slot]["authenticated"] is False
            assert status["youtube"]["slots"][slot]["token_status"] == "reauthorization_required"
        assert "private-value" not in response.text
    # Music falls back to primary YouTube, which is also checked by auth/user.
    assert len(calls) == 4
    assert "private-value" not in caplog.text

    reloaded = CredentialStore(path)
    client = _auth_client(tmp_path, reloaded, revoked)
    assert client.get("/api/v1/auth/user").json()["authenticated"] is True
    assert len(calls) == 4

    # A new grant clears the failure state and may refresh immediately.
    reloaded.save_sheets_connection(_token(SHEETS_SCOPES, minutes=4, value="new-grant"), owner_sub="test-user")

    def refreshed(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(status=200, data=b'{"access_token":"refreshed","expires_in":3600}')

    client = _auth_client(tmp_path, reloaded, refreshed)
    status = client.get("/api/v1/auth/user").json()
    assert status["authorizations"]["sheets"]["connected"] is True
    assert status["authorizations"]["sheets"]["token_status"] == "active"
    assert reloaded.get_sheets_credentials("test-user")["token"] == "refreshed"
    assert len(calls) == 5


@pytest.mark.parametrize("expired", [False, True])
def test_temporary_refresh_failure_waits_then_recovers_without_reauthorization(tmp_path, monkeypatch, expired):
    store = CredentialStore(tmp_path / "credentials.json")
    store.save_google_connection(_token(LOGIN_SCOPES), owner_sub="test-user")
    store.save_ytmusic_connection(_token(YOUTUBE_SCOPES, minutes=-60 if expired else 4), owner_sub="test-user")
    calls = []

    def transport(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            raise TransportError("private transport detail")
        return SimpleNamespace(status=200, data=b'{"access_token":"recovered","expires_in":3600}')

    client = _auth_client(tmp_path, store, transport)
    for _ in range(2):
        status = client.get("/api/v1/auth/user").json()
        assert status["authenticated"] is True
        assert status["authorizations"]["ytmusic"]["connected"] is not expired
        assert status["authorizations"]["ytmusic"]["token_status"] == "refresh_failed"
    assert len(calls) == 1

    failure_time = datetime.fromisoformat(store.get_ytmusic_public("test-user")["last_refresh_failed_at"])

    class Later(datetime):
        @classmethod
        def now(cls, tz=None):
            return (failure_time + google_auth.GOOGLE_TOKEN_REFRESH_RETRY_DELAY + timedelta(seconds=1)).astimezone(tz)

    monkeypatch.setattr(google_auth, "datetime", Later)
    status = client.get("/api/v1/auth/user").json()
    assert status["authorizations"]["ytmusic"]["connected"] is True
    assert status["authorizations"]["ytmusic"]["token_status"] == "active"
    assert store.get_ytmusic_credentials("test-user")["token"] == "recovered"
    assert len(calls) == 2


@pytest.mark.parametrize("route", ["metadata", "parse-options", "people", "random-member-preview", "copy-table"])
@pytest.mark.parametrize(
    ("reason", "http_status", "expected_code"),
    [
        ("SERVICE_DISABLED", 403, "sheets_api_disabled"),
        ("ACCESS_TOKEN_SCOPE_INSUFFICIENT", 403, "google_sheets_scope_required"),
        ("CREDENTIALS_MISSING", 401, "sheets_reauthorization_required"),
        (None, 403, "sheets_permission_denied"),
    ],
)
def test_sheets_errors_report_safe_action_and_preserve_login(route, reason, http_status, expected_code, caplog):
    details = []
    if reason:
        details.append(
            {
                "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                "reason": reason,
                "domain": "googleapis.com",
                "metadata": {"consumer": "projects/private-id", "service": "sheets.googleapis.com"},
            }
        )
    error = HttpError(
        Response({"status": http_status}),
        json.dumps(
            {"error": {"status": "PERMISSION_DENIED", "message": "access_token=private-value", "details": details}}
        ).encode(),
        uri="https://sheets.googleapis.com/v4/spreadsheets/private-sheet",
    )

    def execute():
        raise error

    request = SimpleNamespace(execute=execute)
    spreadsheets = SimpleNamespace(get=lambda **kwargs: request, values=lambda: spreadsheets)
    provider = SimpleNamespace(spreadsheets=lambda: spreadsheets)
    client = TestClient(
        create_app(
            google_client_factory=lambda *args, **kwargs: provider,
            dependency_overrides={
                require_account_subject: lambda: "test-user",
                require_sheets_credentials: lambda: object(),
            },
        )
    )
    response = client.post(
        f"/api/v1/sheets/{route}",
        json={
            "spreadsheet_url_or_id": "private-sheet",
            "worksheet_name": "Videos",
            "team": "Team",
            "columns": [],
        },
    )
    assert response.status_code == 403
    detail = response.json()["detail"]
    assert detail["code"] == expected_code
    assert detail["retryable"] is False
    assert detail.get("reauthorization_required", False) is (
        expected_code
        in {
            "google_sheets_scope_required",
            "sheets_reauthorization_required",
        }
    )
    assert f"code={expected_code}" in caplog.text
    for private in ("private-value", "private-id", "private-sheet"):
        assert private not in response.text
        assert private not in caplog.text
