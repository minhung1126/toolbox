from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from backend.app.api import settings as settings_api
from backend.app.api import system as system_api
from backend.app.core.config import settings
from backend.app.core.runtime_config import runtime_config
from backend.app.core.system_secrets import system_secrets


@pytest.fixture(autouse=True)
def cleanup_runtime_data():
    yield
    runtime_config.set_allowed_emails([])
    runtime_config.set_allow_new_users(True)
    runtime_config.set_setup_completed(False)
    system_secrets.clear_setup_pin()
    if system_secrets._credentials_file.exists():
        system_secrets._credentials_file.unlink(missing_ok=True)
    system_secrets._credentials_cache = None
    settings.sync_dynamic_config()


def test_setup_status_endpoint(monkeypatch):
    monkeypatch.setattr(runtime_config, "is_setup_completed", lambda: False)
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "")

    req = MagicMock()
    req.client.host = "127.0.0.1"

    status = system_api.get_setup_status(req)
    assert status["is_configured"] is False
    assert status["setup_completed"] is False
    assert "development_pin" in status


def test_perform_initial_setup(monkeypatch):
    monkeypatch.setattr(runtime_config, "is_setup_completed", lambda: False)
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "")

    # Set known PIN
    system_secrets._setup_pin = "123456"

    req = MagicMock()
    req.client.host = "192.168.1.100"  # Remote IP

    payload = system_api.SetupRequest(
        google_client_id="my-google-client-id.apps.googleusercontent.com",
        google_client_secret="my-google-client-secret",
        admin_email="superadmin@example.com",
        pin="123456",
    )

    result = system_api.perform_initial_setup(payload, req)
    assert result["status"] == "success"
    assert result["admin_email"] == "superadmin@example.com"

    # Credentials updated
    creds = system_secrets.get_credentials()
    assert creds["google_client_id"] == "my-google-client-id.apps.googleusercontent.com"
    assert creds["google_client_secret"] == "my-google-client-secret"
    assert "superadmin@example.com" in runtime_config.get_allowed_emails()


def test_setup_rejected_with_invalid_pin(monkeypatch):
    monkeypatch.setattr(runtime_config, "is_setup_completed", lambda: False)
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    system_secrets._setup_pin = "654321"

    req = MagicMock()
    req.client.host = "192.168.1.100"

    payload = system_api.SetupRequest(
        google_client_id="my-google-client-id.apps.googleusercontent.com",
        google_client_secret="my-google-client-secret",
        admin_email="superadmin@example.com",
        pin="wrong-pin",
    )

    with pytest.raises(HTTPException) as exc:
        system_api.perform_initial_setup(payload, req)
    assert exc.value.status_code == 400
    assert "invalid_setup_pin" in str(exc.value.detail)


def test_get_and_update_credentials(monkeypatch):
    creds_dummy = SimpleNamespace(valid=True)
    res = system_api.get_credentials_masked(creds_dummy)
    assert res["status"] == "success"
    assert "google" in res["credentials"]

    update_payload = system_api.CredentialsUpdateRequest(
        youtube_secondary_client_id="sec-client-999",
        youtube_secondary_client_secret="sec-secret-999",
    )
    update_res = system_api.update_system_credentials(update_payload, creds_dummy)
    assert update_res["status"] == "success"
    assert update_res["credentials"]["youtube_secondary"]["configured"] is True


def test_allowlist_management_and_lockout_guard():
    creds_dummy = SimpleNamespace(valid=True)
    runtime_config.set_allowed_emails(["admin@example.com", "other@example.com"])
    settings.sync_dynamic_config()

    # Get allowlist
    res = system_api.get_allowlist(creds_dummy, "admin@example.com")
    assert "admin@example.com" in res["allowed_emails"]

    # Add email
    add_res = system_api.add_allowlist_email(
        system_api.EmailActionRequest(email="newuser@example.com"),
        creds_dummy,
        "admin@example.com",
    )
    assert "newuser@example.com" in add_res["allowed_emails"]

    # Lockout guard: cannot remove self
    with pytest.raises(HTTPException) as exc:
        system_api.remove_allowlist_email(
            system_api.EmailActionRequest(email="admin@example.com"),
            creds_dummy,
            "admin@example.com",
        )
    assert exc.value.status_code == 400
    assert "cannot_remove_self" in str(exc.value.detail)

    # Remove other user: succeeds
    rem_res = system_api.remove_allowlist_email(
        system_api.EmailActionRequest(email="newuser@example.com"),
        creds_dummy,
        "admin@example.com",
    )
    assert "newuser@example.com" not in rem_res["allowed_emails"]

    # Remove second other user
    system_api.remove_allowlist_email(
        system_api.EmailActionRequest(email="other@example.com"),
        creds_dummy,
        "admin@example.com",
    )

    # Only admin@example.com remains; guard prevents removing last remaining admin even from another context
    with pytest.raises(HTTPException) as exc2:
        system_api.remove_allowlist_email(
            system_api.EmailActionRequest(email="admin@example.com"),
            creds_dummy,
            "another_actor@example.com",
        )
    assert exc2.value.status_code == 400
    assert "cannot_remove_last_admin" in str(exc2.value.detail)


def test_update_youtube_slot_endpoint():
    creds_dummy = SimpleNamespace(valid=True)

    # Update secondary slot enabled and label
    payload = settings_api.YouTubeSlotConfigUpdateModel(
        label="Secondary Custom",
        enabled=True,
        client_id="yt-sec-client",
        client_secret="yt-sec-secret",
    )

    res = settings_api.update_youtube_slot_config("secondary", payload, creds_dummy)
    assert res["status"] == "success"
    assert res["label"] == "Secondary Custom"
    assert res["enabled"] is True
    assert res["configured"] is True


def test_allow_new_users_toggle_and_restriction():
    creds_dummy = SimpleNamespace(valid=True)
    runtime_config.set_allowed_emails(["admin@example.com"])
    settings.sync_dynamic_config()

    # Default is True
    res = system_api.get_allowlist(creds_dummy, "admin@example.com")
    assert res["allow_new_users"] is True

    # Disable allowing new users
    update_res = system_api.update_allow_new_users(
        system_api.AllowNewUsersUpdateRequest(allow_new_users=False),
        creds_dummy,
        "admin@example.com",
    )
    assert update_res["status"] == "success"
    assert update_res["allow_new_users"] is False
    assert settings.allow_new_users is False

    # Check GET reflect change
    res_after = system_api.get_allowlist(creds_dummy, "admin@example.com")
    assert res_after["allow_new_users"] is False

    # Attempting to add email now fails with 403
    with pytest.raises(HTTPException) as exc:
        system_api.add_allowlist_email(
            system_api.EmailActionRequest(email="blocked@example.com"),
            creds_dummy,
            "admin@example.com",
        )
    assert exc.value.status_code == 403
    assert "add_user_disabled" in str(exc.value.detail)

    # Re-enable allowing new users
    update_res_re = system_api.update_allow_new_users(
        system_api.AllowNewUsersUpdateRequest(allow_new_users=True),
        creds_dummy,
        "admin@example.com",
    )
    assert update_res_re["allow_new_users"] is True
    assert settings.allow_new_users is True

    # Adding email now succeeds
    add_res = system_api.add_allowlist_email(
        system_api.EmailActionRequest(email="allowed@example.com"),
        creds_dummy,
        "admin@example.com",
    )
    assert "allowed@example.com" in add_res["allowed_emails"]
