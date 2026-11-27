from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.app.api import settings as settings_api
from backend.app.api import system as system_api
from backend.app.core.config import Settings, settings
from backend.app.core.dependencies import require_account_email, require_login_credentials
from backend.app.core.runtime_config import RuntimeConfig, runtime_config
from backend.app.core.session_store import SessionStore
from backend.app.core.system_secrets import SystemSecretsManager, mask_secret, system_secrets
from backend.app.main import create_app


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
    monkeypatch.setattr(runtime_config, "get_allowed_emails", lambda: [])
    monkeypatch.setattr(settings, "ALLOWED_GOOGLE_EMAILS", "")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "")

    req = MagicMock()
    req.client.host = "127.0.0.1"
    req.headers = {}

    status = system_api.get_setup_status(req)
    assert status["is_configured"] is False
    assert status["setup_completed"] is False
    assert status["setup_locked"] is False
    assert status["needs_pin"] is False
    assert status["development_pin"] is not None


def test_perform_initial_setup(monkeypatch):
    monkeypatch.setattr(runtime_config, "is_setup_completed", lambda: False)
    runtime_config.set_allowed_emails([])
    monkeypatch.setattr(settings, "ALLOWED_GOOGLE_EMAILS", "")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "")

    # Set known PIN
    system_secrets._setup_pin = "123456"

    req = MagicMock()
    req.client.host = "192.168.1.100"  # Remote IP
    req.headers = {}

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
    runtime_config.set_allowed_emails([])
    monkeypatch.setattr(settings, "ALLOWED_GOOGLE_EMAILS", "")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "")
    system_secrets._setup_pin = "654321"

    req = MagicMock()
    req.client.host = "192.168.1.100"
    req.headers = {}

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


def test_setup_locked_for_env_oauth_or_allowlist(tmp_path):
    for label, kwargs in (
        (
            "env-oauth",
            {
                "GOOGLE_CLIENT_ID": "env-client-id.apps.googleusercontent.com",
                "GOOGLE_CLIENT_SECRET": "GOCSPX-envSecret1234",
            },
        ),
        ("env-allowlist", {"ALLOWED_GOOGLE_EMAILS": "admin@example.com"}),
    ):
        subdir = tmp_path / label
        config = Settings(
            _env_file=None,
            runtime_store=RuntimeConfig(subdir / "runtime.json"),
            secrets_store=SystemSecretsManager(subdir),
            PUBLIC_BASE_URL="http://localhost:8000",
            **kwargs,
        )
        client = TestClient(create_app(app_settings=config))
        status = client.get("/api/v1/system/setup-status")
        assert status.status_code == 200
        body = status.json()
        assert body["setup_locked"] is True
        assert body["needs_pin"] is False
        assert body["development_pin"] is None
        assert not (subdir / ".setup_pin").exists()

        res = client.post(
            "/api/v1/system/setup",
            json={
                "google_client_id": "attacker-id",
                "google_client_secret": "attacker-secret",
                "admin_email": "attacker@example.com",
            },
        )
        assert res.status_code == 400
        assert res.json()["detail"]["code"] == "setup_already_completed"


@pytest.mark.parametrize(
    "extra_settings,headers",
    [
        ({"PUBLIC_BASE_URL": "https://toolbox.example.com", "ALLOWED_GOOGLE_EMAILS": ""}, {}),
        ({"PUBLIC_BASE_URL": "http://toolbox.example.com"}, {}),
        ({"PUBLIC_BASE_URL": "http://localhost:8000"}, {"X-Forwarded-For": "203.0.113.10"}),
        ({"PUBLIC_BASE_URL": "http://localhost:8000"}, {"Forwarded": "for=203.0.113.10"}),
        ({"PUBLIC_BASE_URL": "http://localhost:8000"}, {"X-Real-IP": "203.0.113.10"}),
        ({"PUBLIC_BASE_URL": "http://localhost:8000"}, {"X-Forwarded-Host": "toolbox.example.com"}),
        ({"PUBLIC_BASE_URL": "http://localhost:8000"}, {"X-Forwarded-Proto": "https"}),
        ({"PUBLIC_BASE_URL": "http://localhost:8000"}, {"CF-Connecting-IP": "203.0.113.10"}),
        ({"PUBLIC_BASE_URL": "http://localhost:8000"}, {"Host": "toolbox.example.com"}),
    ],
)
def test_setup_blocks_dev_pin_and_requires_pin_behind_proxy_or_public_url(tmp_path, extra_settings, headers):
    subdir = tmp_path / "proxy-setup"
    secrets_mgr = SystemSecretsManager(subdir)
    base = extra_settings.get("PUBLIC_BASE_URL", "http://localhost:8000")
    config = Settings(
        _env_file=None,
        runtime_store=RuntimeConfig(subdir / "runtime.json"),
        secrets_store=secrets_mgr,
        TRUSTED_HOSTS="localhost,127.0.0.1,testserver,toolbox.example.com",
        **extra_settings,
    )
    client = TestClient(create_app(app_settings=config), base_url=base)
    status = client.get("/api/v1/system/setup-status", headers=headers)
    assert status.status_code == 200
    body = status.json()
    assert body["setup_locked"] is False
    assert body["needs_pin"] is True
    assert body["development_pin"] is None

    # Attempt without PIN fails
    no_pin = client.post(
        "/api/v1/system/setup",
        headers=headers,
        json={
            "google_client_id": "client-id",
            "google_client_secret": "client-secret",
            "admin_email": "admin@example.com",
        },
    )
    assert no_pin.status_code == 400
    assert no_pin.json()["detail"]["code"] == "invalid_setup_pin"

    # Attempt with real server PIN succeeds
    real_pin = secrets_mgr.get_or_create_setup_pin()
    ok = client.post(
        "/api/v1/system/setup",
        headers=headers,
        json={
            "google_client_id": "client-id",
            "google_client_secret": "client-secret",
            "admin_email": "admin@example.com",
            "pin": real_pin,
        },
    )
    assert ok.status_code == 200


def test_setup_endpoint_is_strictly_rate_limited(tmp_path):
    subdir = tmp_path / "rate-limit"
    config = Settings(
        _env_file=None,
        runtime_store=RuntimeConfig(subdir / "runtime.json"),
        secrets_store=SystemSecretsManager(subdir),
        PUBLIC_BASE_URL="https://toolbox.example.com",
    )
    client = TestClient(create_app(app_settings=config), base_url="https://toolbox.example.com")
    for _ in range(5):
        resp = client.post(
            "/api/v1/system/setup",
            json={
                "google_client_id": "client-id",
                "google_client_secret": "client-secret",
                "admin_email": "admin@example.com",
                "pin": "000000",
            },
        )
        assert resp.status_code == 400
    blocked = client.post(
        "/api/v1/system/setup",
        json={
            "google_client_id": "client-id",
            "google_client_secret": "client-secret",
            "admin_email": "admin@example.com",
            "pin": "000000",
        },
    )
    assert blocked.status_code == 429
    assert blocked.json()["detail"]["code"] == "rate_limited"


def test_credentials_mask_comparison_clearing_env_source_and_invalid_slot(tmp_path):
    subdir = tmp_path / "creds"
    secrets_mgr = SystemSecretsManager(subdir)
    config = Settings(
        _env_file=None,
        runtime_store=RuntimeConfig(subdir / "runtime.json"),
        secrets_store=secrets_mgr,
        GOOGLE_CLIENT_ID="env-google-id",
        GOOGLE_CLIENT_SECRET="GOCSPX-envSecret9876",
        ALLOWED_GOOGLE_EMAILS="admin@example.com",
    )
    client = TestClient(
        create_app(
            app_settings=config,
            dependency_overrides={require_login_credentials: lambda: SimpleNamespace(valid=True)},
        )
    )

    # Initial GET reports .env credentials and source="env"
    initial = client.get("/api/v1/system/credentials").json()
    assert initial["credentials"]["google"]["configured"] is True
    assert initial["credentials"]["google"]["client_id"] == "env-google-id"
    assert initial["credentials"]["google"]["client_secret_masked"] == mask_secret("GOCSPX-envSecret9876")
    assert initial["credentials"]["google"]["source"] == "env"

    # Override dynamically with a long secret (>14 chars)
    real_secret = "GOCSPX-dynamicSecret1234"
    updated = client.put(
        "/api/v1/system/credentials",
        json={"google_client_id": "dyn-google-id", "google_client_secret": real_secret},
    ).json()
    assert updated["credentials"]["google"]["source"] == "dynamic"
    masked = updated["credentials"]["google"]["client_secret_masked"]
    assert masked == "GOCSPX****1234"

    # Sending back exact mask_secret(current) keeps real secret intact
    same_mask = client.put(
        "/api/v1/system/credentials",
        json={"google_client_id": "dyn-google-id-2", "google_client_secret": masked},
    )
    assert same_mask.status_code == 200
    assert secrets_mgr.get_credentials()["google_client_secret"] == real_secret
    assert secrets_mgr.get_credentials()["google_client_id"] == "dyn-google-id-2"

    # Sending a different "****" string is rejected with 400
    bad_mask = client.put(
        "/api/v1/system/credentials",
        json={"google_client_secret": "GOCSPX****9999"},
    )
    assert bad_mask.status_code == 400
    assert bad_mask.json()["detail"]["code"] == "masked_secret_rejected"
    assert secrets_mgr.get_credentials()["google_client_secret"] == real_secret

    # Clearing dynamic google credentials falls back to .env baseline in memory immediately
    cleared = client.put("/api/v1/system/credentials", json={"clear_google": True}).json()
    assert config.GOOGLE_CLIENT_ID == "env-google-id"
    assert config.GOOGLE_CLIENT_SECRET == "GOCSPX-envSecret9876"
    assert cleared["credentials"]["google"]["source"] == "env"
    assert cleared["credentials"]["google"]["client_id"] == "env-google-id"

    # YouTube slot: invalid slot returns 400, mask skipped, foreign mask rejected, clear works
    invalid_slot = client.put("/api/v1/settings/youtube-slots/invalid", json={"label": "x"})
    assert invalid_slot.status_code == 400
    assert invalid_slot.json()["detail"]["code"] == "youtube_slot_invalid"

    yt_secret = "GOCSPX-youtubePrimary5678"
    slot_ok = client.put(
        "/api/v1/settings/youtube-slots/primary",
        json={"client_id": "yt-pri-id", "client_secret": yt_secret},
    )
    assert slot_ok.status_code == 200
    assert config.YOUTUBE_OAUTH_PRIMARY_CLIENT_SECRET == yt_secret

    slot_same_mask = client.put(
        "/api/v1/settings/youtube-slots/primary",
        json={"client_id": "yt-pri-id-2", "client_secret": mask_secret(yt_secret)},
    )
    assert slot_same_mask.status_code == 200
    assert secrets_mgr.get_credentials()["youtube_primary_client_secret"] == yt_secret

    slot_bad_mask = client.put(
        "/api/v1/settings/youtube-slots/primary",
        json={"client_secret": "GOCSPX****0000"},
    )
    assert slot_bad_mask.status_code == 400

    slot_cleared = client.put("/api/v1/settings/youtube-slots/primary", json={"clear_credentials": True})
    assert slot_cleared.status_code == 200
    assert slot_cleared.json()["configured"] is False
    assert config.YOUTUBE_OAUTH_PRIMARY_CLIENT_ID == ""
    assert config.YOUTUBE_OAUTH_PRIMARY_CLIENT_SECRET == ""


def test_allowlist_remove_purges_removed_users_sessions(tmp_path):
    subdir = tmp_path / "allowlist-purge"
    runtime = RuntimeConfig(subdir / "runtime.json")
    runtime.set_allowed_emails(["admin@example.com", "target@example.com"])
    config = Settings(
        _env_file=None,
        runtime_store=runtime,
        secrets_store=SystemSecretsManager(subdir),
    )
    sessions = SessionStore(subdir / "sessions.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)
    admin_sid = sessions.create(
        {"credential_provider": "google_login", "user": {"sub": "admin", "email": "admin@example.com"}}
    )
    target_sid_1 = sessions.create(
        {"credential_provider": "google_login", "user": {"sub": "target", "email": "target@example.com"}}
    )
    target_sid_2 = sessions.create(
        {"credential_provider": "google_login", "user": {"sub": "target", "email": "TARGET@EXAMPLE.COM"}}
    )
    client = TestClient(
        create_app(
            app_settings=config,
            session_store=sessions,
            dependency_overrides={
                require_login_credentials: lambda: SimpleNamespace(valid=True),
                require_account_email: lambda: "admin@example.com",
            },
        )
    )
    resp = client.post("/api/v1/system/allowlist/remove", json={"email": "target@example.com"})
    assert resp.status_code == 200
    assert sessions.get(admin_sid) is not None
    assert sessions.get(target_sid_1) is None
    assert sessions.get(target_sid_2) is None
