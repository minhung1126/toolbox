from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException
from starlette.requests import Request

from backend.app.core import dependencies
from backend.app.core.credential_store import CredentialStore
from backend.app.core.session_store import SessionStore
from backend.app.services import google_auth
from backend.app.services.google_auth import (
    DRIVE_READONLY_SCOPE,
    DRIVE_SCOPES,
    LOGIN_SCOPES,
    SHEETS_READONLY_SCOPE,
    SHEETS_SCOPES,
    has_drive_read_scope,
    has_sheets_scope,
)


def _token_payload(scopes: list[str], token: str = "test-token", sub: str = "test-sub") -> dict:
    return {
        "token": token,
        "refresh_token": "refresh-token",
        "token_uri": "https://oauth2.googleapis.com/token",
        "client_id": "client-id",
        "client_secret": "client-secret",
        "scopes": scopes,
        "expiry": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        "user": {"sub": sub, "email": f"{sub}@example.test", "name": f"User {sub}"},
    }


def test_scopes_are_strictly_decoupled():
    """Verify login scopes contain only identity, while sheets and drive have dedicated scopes."""
    assert SHEETS_READONLY_SCOPE not in LOGIN_SCOPES
    assert DRIVE_READONLY_SCOPE not in LOGIN_SCOPES
    assert "openid" in LOGIN_SCOPES

    assert SHEETS_READONLY_SCOPE in SHEETS_SCOPES
    assert DRIVE_READONLY_SCOPE not in SHEETS_SCOPES

    assert DRIVE_READONLY_SCOPE in DRIVE_SCOPES
    assert SHEETS_READONLY_SCOPE not in DRIVE_SCOPES


def test_require_sheets_credentials_rejects_login_only_and_accepts_sheets(tmp_path: Path, monkeypatch):
    """Ensure require_sheets_credentials blocks login-only tokens and grants access with sheets scope."""
    cred_store = CredentialStore(tmp_path / "creds.json")
    sess_store = SessionStore(tmp_path / "sess.json")
    monkeypatch.setattr(dependencies, "session_store", sess_store)
    monkeypatch.setattr(google_auth, "credential_store", cred_store)
    monkeypatch.setattr(google_auth, "session_store", sess_store)

    sub = "subject-sheets-test"
    # User logs in with pure login scopes
    login_token = _token_payload(LOGIN_SCOPES, sub=sub)
    cred_store.save_google_connection(login_token, owner_sub=sub)
    session_id = sess_store.create({"credential_provider": "google_login", "user": {"sub": sub}})

    req = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/sheets/metadata",
            "headers": [(b"cookie", f"creator_session={session_id}".encode())],
            "query_string": b"",
            "server": ("testserver", 80),
        }
    )

    # Without sheets authorization -> raises 403 google_sheets_scope_required
    try:
        dependencies.require_sheets_credentials(req, owner_sub=sub)
        raise AssertionError("Expected 403 HTTPException")
    except HTTPException as exc:
        assert exc.status_code == 403
        assert exc.detail["code"] == "google_sheets_scope_required"

    # Now authorize dedicated Sheets
    sheets_token = _token_payload(SHEETS_SCOPES, token="sheets-access-token", sub=sub)
    cred_store.save_sheets_connection(sheets_token, owner_sub=sub)

    # Should succeed and return valid credentials with sheets scope
    creds = dependencies.require_sheets_credentials(req, owner_sub=sub)
    assert creds is not None
    assert has_sheets_scope(creds)
    assert creds.token == "sheets-access-token"


def test_require_drive_credentials_rejects_login_only_and_accepts_drive(tmp_path: Path, monkeypatch):
    """Ensure require_drive_credentials blocks login-only tokens and grants access with drive scope."""
    cred_store = CredentialStore(tmp_path / "creds.json")
    sess_store = SessionStore(tmp_path / "sess.json")
    monkeypatch.setattr(dependencies, "session_store", sess_store)
    monkeypatch.setattr(google_auth, "credential_store", cred_store)
    monkeypatch.setattr(google_auth, "session_store", sess_store)

    sub = "subject-drive-test"
    login_token = _token_payload(LOGIN_SCOPES, sub=sub)
    cred_store.save_google_connection(login_token, owner_sub=sub)
    session_id = sess_store.create({"credential_provider": "google_login", "user": {"sub": sub}})

    req = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/drive/access/check",
            "headers": [(b"cookie", f"creator_session={session_id}".encode())],
            "query_string": b"",
            "server": ("testserver", 80),
        }
    )

    # Without drive authorization -> raises 403 google_drive_scope_required
    try:
        dependencies.require_drive_credentials(req, owner_sub=sub)
        raise AssertionError("Expected 403 HTTPException")
    except HTTPException as exc:
        assert exc.status_code == 403
        assert exc.detail["code"] == "google_drive_scope_required"

    # Now authorize dedicated Drive
    drive_token = _token_payload(DRIVE_SCOPES, token="drive-access-token", sub=sub)
    cred_store.save_drive_connection(drive_token, owner_sub=sub)

    # Should succeed and return valid credentials with drive scope
    creds = dependencies.require_drive_credentials(req, owner_sub=sub)
    assert creds is not None
    assert has_drive_read_scope(creds)
    assert creds.token == "drive-access-token"


def test_legacy_credentials_with_scopes_fallback_cleanly(tmp_path: Path, monkeypatch):
    """Ensure backward compatibility: an existing google connection containing sheets/drive scopes works."""
    cred_store = CredentialStore(tmp_path / "creds.json")
    sess_store = SessionStore(tmp_path / "sess.json")
    monkeypatch.setattr(dependencies, "session_store", sess_store)
    monkeypatch.setattr(google_auth, "credential_store", cred_store)
    monkeypatch.setattr(google_auth, "session_store", sess_store)

    sub = "subject-legacy-test"
    # Legacy connection that contained both sheets and drive scopes
    legacy_scopes = LOGIN_SCOPES + [SHEETS_READONLY_SCOPE, DRIVE_READONLY_SCOPE]
    legacy_token = _token_payload(legacy_scopes, token="legacy-token", sub=sub)
    cred_store.save_google_connection(legacy_token, owner_sub=sub)
    session_id = sess_store.create({"credential_provider": "google_login", "user": {"sub": sub}})

    req = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/test",
            "headers": [(b"cookie", f"creator_session={session_id}".encode())],
            "query_string": b"",
            "server": ("testserver", 80),
        }
    )

    # Fallback resolves sheets and drive credentials from legacy google connection
    sheets_creds = dependencies.require_sheets_credentials(req, owner_sub=sub)
    assert sheets_creds.token == "legacy-token"
    assert has_sheets_scope(sheets_creds)

    drive_creds = dependencies.require_drive_credentials(req, owner_sub=sub)
    assert drive_creds.token == "legacy-token"
    assert has_drive_read_scope(drive_creds)


def test_clear_sheets_and_drive(tmp_path: Path):
    """Ensure clear_sheets and clear_drive remove only the targeted authorization."""
    store = CredentialStore(tmp_path / "creds.json")
    sub = "sub-clear-test"
    store.save_google_connection(_token_payload(LOGIN_SCOPES, sub=sub), owner_sub=sub)
    store.save_sheets_connection(_token_payload(SHEETS_SCOPES, sub=sub), owner_sub=sub)
    store.save_drive_connection(_token_payload(DRIVE_SCOPES, sub=sub), owner_sub=sub)

    assert store.get_google_credentials(sub) is not None
    assert store.get_sheets_credentials(sub) is not None
    assert store.get_drive_credentials(sub) is not None

    store.clear_sheets(sub)
    assert store.get_sheets_credentials(sub) is None
    assert store.get_google_credentials(sub) is not None
    assert store.get_drive_credentials(sub) is not None

    store.clear_drive(sub)
    assert store.get_drive_credentials(sub) is None
    assert store.get_google_credentials(sub) is not None
