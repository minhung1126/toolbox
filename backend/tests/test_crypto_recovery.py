import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.app.api import auth as auth_api
from backend.app.core.config import Settings, settings_context
from backend.app.core.credential_store import CredentialStore
from backend.app.core.runtime_config import RuntimeConfig
from backend.app.core.security import GOOGLE_OAUTH_STATE_SALT, sign_timed_data
from backend.app.core.session_store import SessionStore
from backend.app.core.system_secrets import SystemSecretsManager, _derive_fernet
from backend.app.main import create_app
from backend.app.services.google_auth import LOGIN_SCOPES, SHEETS_SCOPES, YOUTUBE_SCOPES
from backend.app.services.youtube_publish_jobs import JobIdentity, PublishJobRuntime


def _token(scopes, *, value="token-val", sub="user-1", email="user@example.test"):
    return {
        "token": value,
        "refresh_token": "refresh-token",
        "client_id": "client-id",
        "scopes": scopes,
        "expiry": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        "user": {"sub": sub, "email": email},
        "channel_id": "chan-1",
    }


def test_credential_store_save_connection_self_heals_undecryptable_record(tmp_path: Path, caplog):
    path = tmp_path / "credentials.json"
    old_store = CredentialStore(path, encryption_key="old-key")
    old_store.save_google_connection(_token(LOGIN_SCOPES, value="old-token"), owner_sub="user-1")

    new_store = CredentialStore(path, encryption_key="new-key")
    with pytest.raises(RuntimeError):
        new_store.get_google_credentials("user-1")

    new_store.save_google_connection(_token(LOGIN_SCOPES, value="new-token"), owner_sub="user-1")
    assert new_store.get_google_credentials("user-1")["token"] == "new-token"
    assert "overwriting with new authorization" in caplog.text


def test_oauth_callback_recovers_when_previous_credential_cannot_decrypt(tmp_path: Path, monkeypatch):
    subdir = tmp_path / "callback-heal"
    config = Settings(
        _env_file=None,
        runtime_store=RuntimeConfig(subdir / "runtime.json"),
        secrets_store=SystemSecretsManager(subdir),
        SECRET_KEY="s" * 40,
        CREDENTIAL_ENCRYPTION_KEY="new-encryption-key-material-00000000",
        GOOGLE_CLIENT_ID="client-id",
        GOOGLE_CLIENT_SECRET="client-secret",
        ALLOWED_GOOGLE_EMAILS="user@example.test",
    )
    old_store = CredentialStore(subdir / "credentials.json", encryption_key="old-encryption-key-material-00000000")
    old_store.save_google_connection(_token(LOGIN_SCOPES, value="stale"), owner_sub="user-1")

    healed_store = CredentialStore(subdir / "credentials.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)
    sessions = SessionStore(subdir / "sessions.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)
    monkeypatch.setattr(
        auth_api,
        "exchange_code_for_tokens",
        lambda **kwargs: _token(LOGIN_SCOPES, value="fresh-token"),
    )
    app = create_app(app_settings=config, credential_store=healed_store, session_store=sessions)
    with settings_context(config):
        flow_cookie = sign_timed_data(
            {"flow_type": auth_api.LOGIN_FLOW, "state": "state-1", "code_verifier": "verifier-1"},
            salt=GOOGLE_OAUTH_STATE_SALT,
        )
    client = TestClient(app)
    client.cookies.set(config.oauth_flow_cookie_name, flow_cookie)
    resp = client.get("/api/v1/auth/callback", params={"code": "code-1", "state": "state-1"}, follow_redirects=False)
    assert resp.status_code == 307
    assert resp.headers["location"].endswith("/#auth_success=1")
    assert healed_store.get_google_credentials("user-1")["token"] == "fresh-token"


def test_auth_user_degrades_gracefully_instead_of_500_on_decrypt_failure(tmp_path: Path):
    subdir = tmp_path / "degrade"
    config = Settings(
        _env_file=None,
        runtime_store=RuntimeConfig(subdir / "runtime.json"),
        secrets_store=SystemSecretsManager(subdir),
        GOOGLE_CLIENT_ID="client-id",
        GOOGLE_CLIENT_SECRET="client-secret",
        YOUTUBE_OAUTH_PRIMARY_CLIENT_ID="yt-client-id",
        YOUTUBE_OAUTH_PRIMARY_CLIENT_SECRET="yt-client-secret",
        ALLOWED_GOOGLE_EMAILS="user@example.test",
    )
    sessions = SessionStore(subdir / "sessions.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)
    session_id = sessions.create(
        {"credential_provider": "google_login", "user": {"sub": "user-1", "email": "user@example.test"}}
    )

    # 1. Undecryptable login credential -> authenticated: False (HTTP 200, not 500)
    bad_login_store = CredentialStore(subdir / "bad_login.json", encryption_key="other-key")
    bad_login_store.save_google_connection(_token(LOGIN_SCOPES), owner_sub="user-1")
    read_store = CredentialStore(subdir / "bad_login.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)

    client = TestClient(create_app(app_settings=config, credential_store=read_store, session_store=sessions))
    client.cookies.set(config.session_cookie_name, session_id)
    res = client.get("/api/v1/auth/user")
    assert res.status_code == 200
    assert res.json()["authenticated"] is False

    # 2. Valid login credential + undecryptable service/youtube slots -> authenticated: True, services False (HTTP 200)
    mixed_store = CredentialStore(subdir / "mixed.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)
    mixed_store.save_google_connection(_token(LOGIN_SCOPES), owner_sub="user-1")
    # Save sheets/ytmusic/youtube encrypted with a foreign key
    mixed_store._fernet = Fernet(Fernet.generate_key())
    mixed_store.save_sheets_connection(_token(SHEETS_SCOPES), owner_sub="user-1")
    mixed_store.save_ytmusic_connection(_token(YOUTUBE_SCOPES), owner_sub="user-1")
    mixed_store.save_youtube_connection(_token(YOUTUBE_SCOPES), owner_sub="user-1", slot="primary")
    # Restore real key for reading
    mixed_store._fernet = None
    mixed_store = CredentialStore(subdir / "mixed.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)

    client2 = TestClient(create_app(app_settings=config, credential_store=mixed_store, session_store=sessions))
    client2.cookies.set(config.session_cookie_name, session_id)
    res2 = client2.get("/api/v1/auth/user")
    assert res2.status_code == 200
    body2 = res2.json()
    assert body2["authenticated"] is True
    assert body2["authorizations"]["sheets"]["connected"] is False
    assert body2["authorizations"]["ytmusic"]["connected"] is False
    assert body2["youtube"]["slots"]["primary"]["authenticated"] is False


def test_deferred_credential_and_session_stores_isolate_per_app_settings(tmp_path: Path):
    configs = [
        Settings(
            _env_file=None,
            runtime_store=RuntimeConfig(tmp_path / name / "runtime.json"),
            secrets_store=SystemSecretsManager(tmp_path / name),
            SECRET_KEY=f"{name}-secret-key-00000000000000000000000",
            CREDENTIAL_ENCRYPTION_KEY=f"{name}-enc-key-000000000000000000000000",
            ALLOWED_GOOGLE_EMAILS="user@example.test",
        )
        for name in ("alpha", "beta")
    ]
    deferred_creds = CredentialStore(tmp_path / "shared_creds.json", defer_encryption_key=True)
    deferred_sessions = SessionStore(tmp_path / "shared_sessions.json", defer_encryption_key=True)

    app_alpha = create_app(app_settings=configs[0], credential_store=deferred_creds, session_store=deferred_sessions)
    app_beta = create_app(app_settings=configs[1], credential_store=deferred_creds, session_store=deferred_sessions)

    @app_alpha.get("/crypto-probe")
    def probe_alpha():
        sid = deferred_sessions.create({"user": {"sub": "alpha-user", "email": "user@example.test"}})
        deferred_creds.save_google_connection(
            _token(LOGIN_SCOPES, value="alpha-tok", sub="alpha-user"), owner_sub="alpha-user"
        )
        return {"sid": sid, "tok": deferred_creds.get_google_credentials("alpha-user")["token"]}

    @app_beta.get("/crypto-probe-read/{sid}")
    def probe_beta(sid: str):
        return {"session": deferred_sessions.get(sid)}

    app_alpha.router.routes.insert(0, app_alpha.router.routes.pop())
    app_beta.router.routes.insert(0, app_beta.router.routes.pop())

    res_alpha = TestClient(app_alpha).get("/crypto-probe").json()
    assert res_alpha["tok"] == "alpha-tok"
    # Beta uses a different app_settings CREDENTIAL_ENCRYPTION_KEY, so it must NOT decrypt alpha's session
    assert TestClient(app_beta).get(f"/crypto-probe-read/{res_alpha['sid']}").json()["session"] is None


def test_publish_job_runtime_youtube_context_raises_403_on_decrypt_error(tmp_path: Path):
    config = Settings(
        _env_file=None,
        runtime_store=RuntimeConfig(tmp_path / "runtime.json"),
        secrets_store=SystemSecretsManager(tmp_path),
    )
    bad_store = CredentialStore(tmp_path / "creds.json", encryption_key="other-key")
    bad_store.save_youtube_connection(_token(YOUTUBE_SCOPES), owner_sub="owner-1", slot="primary")
    store = CredentialStore(tmp_path / "creds.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)

    runtime = PublishJobRuntime(
        config=config,
        credentials=store,
        accounts=SimpleNamespace(),
        trackers=None,
        client_factory=None,
        service=None,
    )
    with pytest.raises(HTTPException) as exc:
        runtime._youtube_context(JobIdentity("owner-1", "chan-1", "primary", "manual"))
    assert exc.value.status_code == 403
    assert exc.value.detail["code"] == "youtube_scope_required"


def test_settings_explicit_keys_sync_and_rotate_with_system_secrets(tmp_path: Path):
    explicit_dir = tmp_path / "explicit"
    mgr = SystemSecretsManager(explicit_dir)
    cfg = Settings(
        _env_file=None,
        runtime_store=RuntimeConfig(explicit_dir / "runtime.json"),
        secrets_store=mgr,
        SECRET_KEY="explicit-secret-key-at-least-32-chars",
        CREDENTIAL_ENCRYPTION_KEY="explicit-enc-key-at-least-32-chars",
    )
    mgr.update_credentials({"google_client_id": "cid", "google_client_secret": "csec-1"})
    assert mgr._master_secret_key == cfg.SECRET_KEY
    assert mgr._master_encryption_key == cfg.CREDENTIAL_ENCRYPTION_KEY
    assert not (explicit_dir / ".secrets.json").exists()

    raw_disk = json.loads((explicit_dir / "system_credentials.json").read_text(encoding="utf-8"))
    token = raw_disk["google_client_secret"][4:].encode("utf-8")
    assert _derive_fernet(cfg.CREDENTIAL_ENCRYPTION_KEY).decrypt(token).decode("utf-8") == "csec-1"

    # Rotating CREDENTIAL_ENCRYPTION_KEY in Settings triggers strict decrypt failure, while update self-heals
    rotated_cfg = Settings(
        _env_file=None,
        runtime_store=RuntimeConfig(explicit_dir / "runtime.json"),
        secrets_store=mgr,
        SECRET_KEY="explicit-secret-key-at-least-32-chars",
        CREDENTIAL_ENCRYPTION_KEY="rotated-enc-key-at-least-32-chars",
    )
    assert mgr._master_encryption_key == rotated_cfg.CREDENTIAL_ENCRYPTION_KEY
    with pytest.raises(RuntimeError, match="decrypt"):
        mgr.get_credentials()

    healed = mgr.update_credentials({"google_client_secret": "csec-2"})
    assert healed["google_client_id"] == "cid"
    assert healed["google_client_secret"] == "csec-2"
    assert mgr.get_credentials()["google_client_secret"] == "csec-2"

    # In-place key rotation on an active Settings instance also invalidates cache and triggers self-heal flow
    rotated_cfg.CREDENTIAL_ENCRYPTION_KEY = "in-place-rotated-enc-key-32-chars"
    with settings_context(rotated_cfg):
        with pytest.raises(RuntimeError, match="decrypt"):
            mgr.get_credentials()
        mgr.update_credentials({"google_client_secret": "csec-3"})
        assert mgr.get_credentials()["google_client_secret"] == "csec-3"

    # Explicit Settings keys take precedence over a pre-existing stale .secrets.json
    stale_dir = tmp_path / "stale-secrets"
    stale_mgr = SystemSecretsManager(stale_dir)
    stale_sec, stale_enc = stale_mgr.get_or_create_master_keys()
    assert stale_enc != "override-enc-key-at-least-32-chars"
    override_mgr = SystemSecretsManager(stale_dir)
    override_cfg = Settings(
        _env_file=None,
        runtime_store=RuntimeConfig(stale_dir / "runtime.json"),
        secrets_store=override_mgr,
        SECRET_KEY="override-secret-key-at-least-32-chars",
        CREDENTIAL_ENCRYPTION_KEY="override-enc-key-at-least-32-chars",
    )
    assert override_mgr._master_secret_key == override_cfg.SECRET_KEY != stale_sec
    assert override_mgr._master_encryption_key == override_cfg.CREDENTIAL_ENCRYPTION_KEY != stale_enc
    override_mgr.update_credentials({"google_client_id": "cid", "google_client_secret": "override-secret"})
    raw_override = json.loads((stale_dir / "system_credentials.json").read_text(encoding="utf-8"))
    assert (
        _derive_fernet(override_cfg.CREDENTIAL_ENCRYPTION_KEY)
        .decrypt(raw_override["google_client_secret"][4:].encode("utf-8"))
        .decode("utf-8")
        == "override-secret"
    )


def test_shared_system_secrets_manager_isolates_per_app_settings(tmp_path: Path):
    shared_mgr = SystemSecretsManager(tmp_path)
    cfg_alpha = Settings(
        _env_file=None,
        runtime_store=RuntimeConfig(tmp_path / "alpha" / "runtime.json"),
        secrets_store=shared_mgr,
        SECRET_KEY="alpha-secret-key-00000000000000000000000",
        CREDENTIAL_ENCRYPTION_KEY="alpha-enc-key-000000000000000000000000",
        ALLOWED_GOOGLE_EMAILS="user@example.test",
    )
    cfg_beta = Settings(
        _env_file=None,
        runtime_store=RuntimeConfig(tmp_path / "beta" / "runtime.json"),
        secrets_store=shared_mgr,
        SECRET_KEY="beta-secret-key-000000000000000000000000",
        CREDENTIAL_ENCRYPTION_KEY="beta-enc-key-0000000000000000000000000",
        ALLOWED_GOOGLE_EMAILS="user@example.test",
    )
    app_alpha = create_app(app_settings=cfg_alpha)
    app_beta = create_app(app_settings=cfg_beta)

    @app_alpha.post("/secrets-write")
    def write_alpha():
        shared_mgr.update_credentials({"google_client_id": "alpha-id", "google_client_secret": "alpha-secret"})
        return {"secret": shared_mgr.get_credentials()["google_client_secret"]}

    @app_beta.get("/secrets-read")
    def read_beta():
        try:
            shared_mgr.get_credentials()
            return {"decrypted": True}
        except RuntimeError:
            degraded = shared_mgr.get_credentials(ignore_decrypt_errors=True)
            return {"decrypted": False, "secret": degraded["google_client_secret"]}

    app_alpha.router.routes.insert(0, app_alpha.router.routes.pop())
    app_beta.router.routes.insert(0, app_beta.router.routes.pop())

    assert TestClient(app_alpha).post("/secrets-write").json() == {"secret": "alpha-secret"}
    assert TestClient(app_beta).get("/secrets-read").json() == {"decrypted": False, "secret": ""}

    raw = json.loads((tmp_path / "system_credentials.json").read_text(encoding="utf-8"))
    assert (
        _derive_fernet(cfg_alpha.CREDENTIAL_ENCRYPTION_KEY)
        .decrypt(raw["google_client_secret"][4:].encode("utf-8"))
        .decode("utf-8")
        == "alpha-secret"
    )
