from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from backend.app.api import youtube as youtube_api
from backend.app.core import dependencies, youtube_routing
from backend.app.core.account_state_store import AccountStateStore
from backend.app.core.config import settings
from backend.app.core.credential_store import CredentialStore
from backend.app.core.session_store import SessionStore
from backend.app.core.youtube_context import YouTubeRequestContext
from backend.app.main import create_app
from backend.app.services import google_auth
from backend.app.services.google_auth import (
    DRIVE_READONLY_SCOPE,
    DRIVE_SCOPES,
    LOGIN_SCOPES,
    SHEETS_READONLY_SCOPE,
    SHEETS_SCOPES,
    YOUTUBE_SCOPES,
    has_drive_read_scope,
    has_sheets_scope,
    has_youtube_scope,
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


def test_login_only_session_keeps_connection_pages_available_but_rejects_provider_actions(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(type(settings), "is_google_email_allowed", lambda self, email: True)
    subject = "login-only-capabilities"
    credentials = CredentialStore(tmp_path / "credentials.json")
    sessions = SessionStore(tmp_path / "sessions.json")
    credentials.save_google_connection(_token_payload(LOGIN_SCOPES, sub=subject), owner_sub=subject)
    session_id = sessions.create(
        {"credential_provider": "google_login", "user": {"sub": subject, "email": f"{subject}@example.test"}}
    )
    client = TestClient(create_app(session_store=sessions, credential_store=credentials))
    client.cookies.set(settings.session_cookie_name, session_id)

    user = client.get("/api/v1/auth/user")
    assert user.status_code == 200
    assert user.json()["authenticated"] is True
    assert user.json()["authorizations"]["sheets"]["connected"] is False
    assert user.json()["authorizations"]["ytmusic"]["connected"] is False
    assert user.json()["authorizations"]["video_uploader"]["connected"] is False

    sheet_input = {"spreadsheet_url_or_id": "sheet-id", "worksheet_name": "Videos", "team": "Team", "columns": []}
    requests = [
        ("google_sheets_scope_required", client.post(f"/api/v1/sheets/{route}", json=sheet_input))
        for route in ("metadata", "parse-options", "people", "random-member-preview", "copy-table")
    ]
    requests.extend(
        [
            ("ytmusic_scope_required", client.get("/api/v1/playlist-sort/playlists")),
            (
                "ytmusic_scope_required",
                client.post("/api/v1/playlist-sort/preview", json={"playlist_id": "playlist-1", "sort_keys": []}),
            ),
            (
                "ytmusic_scope_required",
                client.post(
                    "/api/v1/playlist-sort/apply",
                    json={"playlist_id": "playlist-1", "sort_keys": [], "preview_token": "invalid"},
                ),
            ),
            (
                "video_uploader_scope_required",
                client.post(
                    "/api/v1/weverse-uploader/upload-from-path",
                    json={"video_path": "missing.mp4", "title": "Test"},
                ),
            ),
            (
                "video_uploader_scope_required",
                client.post(
                    "/api/v1/weverse-uploader/upload-files",
                    data={"metadata": '{"title":"Test"}'},
                    files={"video": ("sample.mp4", b"test", "video/mp4")},
                ),
            ),
        ]
    )
    for code, response in requests:
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == code


def test_creator_workflow_requires_sheets_but_publish_does_not(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(type(settings), "is_google_email_allowed", lambda self, email: True)
    subject = "creator-without-sheets"
    credentials = CredentialStore(tmp_path / "credentials.json")
    sessions = SessionStore(tmp_path / "sessions.json")
    credentials.save_google_connection(_token_payload(LOGIN_SCOPES, sub=subject), owner_sub=subject)
    session_id = sessions.create(
        {"credential_provider": "google_login", "user": {"sub": subject, "email": f"{subject}@example.test"}}
    )
    youtube_context = YouTubeRequestContext(
        slot="primary",
        credentials=object(),
        quota_limiter=SimpleNamespace(),
        owner_sub=subject,
    )
    calls = []

    class FakeWorkflowService:
        def create_batch_metadata_preview(self, *_args, **_kwargs):
            raise AssertionError("Batch preview must not run without Sheets authorization")

        def run_batch_metadata_update(self, *_args, **_kwargs):
            raise AssertionError("Batch update must not run without Sheets authorization")

        def run_publish_and_cleanup(self, payload, *, creds):
            calls.append((payload, creds))
            return {"status": "provider-fake"}

    app = create_app(
        session_store=sessions,
        credential_store=credentials,
        dependency_overrides={
            youtube_api.require_youtube_context: lambda: youtube_context,
            youtube_api.get_youtube_workflow_service: lambda: FakeWorkflowService(),
        },
    )
    client = TestClient(app)
    client.cookies.set(settings.session_cookie_name, session_id)

    batch_payload = {
        "worksheet_name": "Videos",
        "title_column": "Title",
        "description_column": "Description",
        "team": "Team",
        "assignments": [{"video_id": "video-1", "person": "Alice"}],
    }
    for route in ("batch-preview", "batch-update"):
        batch = client.post(f"/api/v1/youtube/{route}", json=batch_payload)
        assert batch.status_code == 403
        assert batch.json()["detail"]["code"] == "google_sheets_scope_required"

    publish = client.post("/api/v1/youtube/publish-and-cleanup", json={"playlist_id": "playlist-1"})
    assert publish.status_code == 200
    assert publish.json() == {"status": "provider-fake"}
    assert len(calls) == 1
    assert calls[0][1] is youtube_context


def test_creator_operations_reject_mismatched_youtube_channels_before_provider_calls(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(type(settings), "is_google_email_allowed", lambda self, email: True)
    subject = "mismatched-creator-channels"
    credentials = CredentialStore(tmp_path / "credentials.json")
    sessions = SessionStore(tmp_path / "sessions.json")
    credentials.save_google_connection(_token_payload(LOGIN_SCOPES, sub=subject), owner_sub=subject)
    credentials.save_sheets_connection(_token_payload(SHEETS_SCOPES, sub=subject), owner_sub=subject)
    session_id = sessions.create(
        {"credential_provider": "google_login", "user": {"sub": subject, "email": f"{subject}@example.test"}}
    )

    class MismatchedPublicChannels:
        def get_youtube_public(self, owner_sub, *, slot):
            assert owner_sub == subject
            return {"channel_id": "channel-a" if slot == "primary" else "channel-b"}

    monkeypatch.setattr(youtube_routing, "get_credential_store", lambda _default: MismatchedPublicChannels())
    app = create_app(
        session_store=sessions,
        credential_store=credentials,
        account_state_store=AccountStateStore(tmp_path / "account-state.json"),
    )
    client = TestClient(app)
    client.cookies.set(settings.session_cookie_name, session_id)
    requests = [
        client.post("/api/v1/youtube/playlist-items", json={"playlist_id": "playlist-1"}),
        client.post("/api/v1/youtube/video-metadata", json={"video_id": "video-1", "title": "Title"}),
        client.post("/api/v1/youtube/publish-and-cleanup", json={"playlist_id": "playlist-1"}),
        client.post(
            "/api/v1/youtube/batch-preview",
            json={
                "worksheet_name": "Videos",
                "title_column": "Title",
                "description_column": "Description",
                "team": "Team",
                "assignments": [{"video_id": "video-1", "person": "Alice"}],
            },
        ),
        client.post(
            "/api/v1/youtube/batch-update",
            json={
                "worksheet_name": "Videos",
                "title_column": "Title",
                "description_column": "Description",
                "team": "Team",
                "assignments": [{"video_id": "video-1", "person": "Alice"}],
            },
        ),
    ]
    for response in requests:
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "youtube_channel_mismatch"


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


def test_ytmusic_decoupled_credentials(tmp_path: Path, monkeypatch):
    """Ensure ytmusic credentials can be saved and retrieved independently, with proper fallback."""
    cred_store = CredentialStore(tmp_path / "creds.json")
    sess_store = SessionStore(tmp_path / "sess.json")
    monkeypatch.setattr(google_auth, "credential_store", cred_store)
    monkeypatch.setattr(google_auth, "session_store", sess_store)

    sub = "subject-ytmusic-test"
    # 1. Login only
    login_token = _token_payload(LOGIN_SCOPES, sub=sub)
    cred_store.save_google_connection(login_token, owner_sub=sub)
    session_id = sess_store.create({"credential_provider": "google_login", "user": {"sub": sub}})

    # Without any YouTube scopes, get_ytmusic_credentials returns None
    assert google_auth.get_ytmusic_credentials(session_id=session_id) is None

    # 2. Add YouTube primary slot
    yt_token = _token_payload(YOUTUBE_SCOPES, token="yt-primary-token", sub=sub)
    cred_store.save_youtube_connection(yt_token, owner_sub=sub, slot="primary")

    # Fallback to youtube credentials works
    fallback_creds = google_auth.get_ytmusic_credentials(session_id=session_id)
    assert fallback_creds is not None
    assert fallback_creds.token == "yt-primary-token"
    assert has_youtube_scope(fallback_creds)

    # 3. Add dedicated ytmusic connection
    ytmusic_token = _token_payload(YOUTUBE_SCOPES, token="ytmusic-dedicated-token", sub=sub)
    cred_store.save_ytmusic_connection(ytmusic_token, owner_sub=sub)

    # Dedicated credentials take priority over fallback
    dedicated_creds = google_auth.get_ytmusic_credentials(session_id=session_id)
    assert dedicated_creds is not None
    assert dedicated_creds.token == "ytmusic-dedicated-token"
    assert has_youtube_scope(dedicated_creds)

    # 4. Disconnect dedicated ytmusic
    cred_store.clear_ytmusic(sub)
    assert cred_store.get_ytmusic_credentials(sub) is None
    # Now falls back to primary youtube again
    re_fallback = google_auth.get_ytmusic_credentials(session_id=session_id)
    assert re_fallback is not None
    assert re_fallback.token == "yt-primary-token"


def test_validate_ytmusic_custom_token_endpoint(tmp_path: Path, monkeypatch):
    from fastapi.testclient import TestClient

    from backend.app import main
    from backend.app.api import auth as auth_api
    from backend.app.core.credential_store import CredentialStore
    from backend.app.core.session_store import SessionStore

    cred_store = CredentialStore(tmp_path / "creds.json")
    sess_store = SessionStore(tmp_path / "sess.json")

    monkeypatch.setattr(auth_api, "credential_store", cred_store)
    monkeypatch.setattr(dependencies, "credential_store", cred_store)
    monkeypatch.setattr(auth_api, "session_store", sess_store)
    monkeypatch.setattr(dependencies, "session_store", sess_store)

    sub = "sub-validate-token-test"
    auth_sess = dependencies.AuthenticatedSession(
        session_id="test-sid",
        session_data={"user": {"sub": sub, "email": "test@example.com"}},
        user={"sub": sub, "email": "test@example.com"},
        subject=sub,
        email="test@example.com",
        credentials=None,
    )
    monkeypatch.setattr(auth_api, "get_authenticated_session", lambda req: auth_sess)
    monkeypatch.setattr(dependencies, "get_authenticated_session", lambda req: auth_sess)

    # Mock validate_ytmusic_custom_token in auth_api / ytmusic_service
    monkeypatch.setattr(
        "backend.app.services.ytmusic_service.validate_ytmusic_custom_token",
        lambda token, **kwargs: (
            {
                "valid": True,
                "account_name": "API Tester",
                "channel_handle": "@tester",
                "account_photo_url": None,
                "message": "Token 有效！",
            }
            if token.startswith("valid")
            else (_ for _ in ()).throw(ValueError("Token 驗證失敗或 Cookie 已過期"))
        ),
    )

    client = TestClient(main.app)

    # 1. Empty token without saved token -> 400 empty_token
    resp = client.post(
        "/api/v1/auth/ytmusic/custom-token/validate", json={}, headers={"Origin": "http://localhost:3000"}
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "empty_token"

    # 2. Valid token passed in payload -> 200 success
    resp = client.post(
        "/api/v1/auth/ytmusic/custom-token/validate",
        json={"token": "valid-token-string"},
        headers={"Origin": "http://localhost:3000"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["valid"] is True
    assert data["account_name"] == "API Tester"

    # 3. Fallback to stored token when payload token is empty
    cred_store.save_ytmusic_custom_token("valid-saved-token", owner_sub=sub)
    resp = client.post(
        "/api/v1/auth/ytmusic/custom-token/validate",
        json={},
        headers={"Origin": "http://localhost:3000"},
    )
    assert resp.status_code == 200
    assert resp.json()["valid"] is True

    # 4. Invalid token -> 400 token_invalid
    resp = client.post(
        "/api/v1/auth/ytmusic/custom-token/validate",
        json={"token": "invalid-token"},
        headers={"Origin": "http://localhost:3000"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "token_invalid"

    def fail_provider(*_args, **_kwargs):
        raise RuntimeError("Cookie: SID=private-provider-value")

    monkeypatch.setattr("backend.app.services.ytmusic_service.validate_ytmusic_custom_token", fail_provider)
    resp = client.post(
        "/api/v1/auth/ytmusic/custom-token/validate",
        json={"token": "bad-token"},
        headers={"Origin": "http://localhost:3000"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "token_invalid"
    assert "private-provider-value" not in resp.text

    from backend.app.services.ytmusic_service import parse_custom_token_input

    monkeypatch.setattr("backend.app.services.ytmusic_service.validate_ytmusic_custom_token", parse_custom_token_input)
    resp = client.post(
        "/api/v1/auth/ytmusic/custom-token/validate",
        json={"token": "not-a-cookie"},
        headers={"Origin": "http://localhost:3000"},
    )
    assert resp.status_code == 400
    assert "無法在輸入內容中偵測到有效的 Cookie" in resp.json()["detail"]["message"]
