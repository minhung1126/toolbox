import json
from pathlib import Path

from backend.app.core.config import Settings
from backend.app.core.runtime_config import RuntimeConfig
from backend.app.core.system_secrets import SystemSecretsManager, mask_secret


def test_system_secrets_master_keys_auto_generation_and_persistence(tmp_path: Path):
    mgr = SystemSecretsManager(
        data_dir=tmp_path,
        secrets_file=tmp_path / ".secrets.json",
        credentials_file=tmp_path / "system_credentials.json",
        pin_file=tmp_path / ".setup_pin",
    )

    # 1. First run: generates keys and persists
    secret_key, enc_key = mgr.get_or_create_master_keys()
    assert len(secret_key) >= 32
    assert len(enc_key) >= 32
    assert secret_key != enc_key
    assert (tmp_path / ".secrets.json").is_file()

    # 2. Second run: loads the same keys
    mgr2 = SystemSecretsManager(
        data_dir=tmp_path,
        secrets_file=tmp_path / ".secrets.json",
        credentials_file=tmp_path / "system_credentials.json",
        pin_file=tmp_path / ".setup_pin",
    )
    secret_key_2, enc_key_2 = mgr2.get_or_create_master_keys()
    assert secret_key_2 == secret_key
    assert enc_key_2 == enc_key


def test_system_secrets_oauth_credentials_aes_encryption(tmp_path: Path):
    mgr = SystemSecretsManager(
        data_dir=tmp_path,
        secrets_file=tmp_path / ".secrets.json",
        credentials_file=tmp_path / "system_credentials.json",
        pin_file=tmp_path / ".setup_pin",
    )

    # Save credentials
    mgr.update_credentials(
        {
            "google_client_id": "google-client-123.apps.googleusercontent.com",
            "google_client_secret": "GOCSPX-mySuperSecretSecret",
            "youtube_primary_client_id": "yt-primary-123",
            "youtube_primary_client_secret": "yt-primary-secret",
        }
    )

    # Check that file on disk is encrypted (does NOT contain raw secret)
    raw_disk_data = (tmp_path / "system_credentials.json").read_text(encoding="utf-8")
    assert "GOCSPX-mySuperSecretSecret" not in raw_disk_data
    assert "enc:" in raw_disk_data

    # Decrypted credentials return original secret
    decrypted = mgr.get_credentials()
    assert decrypted["google_client_id"] == "google-client-123.apps.googleusercontent.com"
    assert decrypted["google_client_secret"] == "GOCSPX-mySuperSecretSecret"
    assert decrypted["youtube_primary_client_id"] == "yt-primary-123"
    assert decrypted["youtube_primary_client_secret"] == "yt-primary-secret"

    # Masked credentials do not leak raw secret
    masked = mgr.get_masked_credentials()
    assert masked["google"]["configured"] is True
    assert masked["google"]["client_id"] == "google-client-123.apps.googleusercontent.com"
    assert masked["google"]["client_secret_masked"] == mask_secret("GOCSPX-mySuperSecretSecret")
    assert "GOCSPX-mySuperSecretSecret" not in json.dumps(masked)


def test_system_secrets_setup_pin_lifecycle(tmp_path: Path):
    mgr = SystemSecretsManager(
        data_dir=tmp_path,
        secrets_file=tmp_path / ".secrets.json",
        credentials_file=tmp_path / "system_credentials.json",
        pin_file=tmp_path / ".setup_pin",
    )

    pin = mgr.get_or_create_setup_pin()
    assert len(pin) == 6
    assert pin.isdigit()

    # Same instance returns identical pin
    assert mgr.get_or_create_setup_pin() == pin

    # Verify pin
    assert mgr.verify_setup_pin(pin) is True
    assert mgr.verify_setup_pin("wrong-pin") is False

    # Clear pin
    mgr.clear_setup_pin()
    assert not (tmp_path / ".setup_pin").is_file()


def test_verify_setup_pin_no_lazy_generation_and_rotates_after_five_failures(tmp_path):
    mgr = SystemSecretsManager(
        data_dir=tmp_path,
        secrets_file=tmp_path / ".secrets.json",
        credentials_file=tmp_path / "system_credentials.json",
        pin_file=tmp_path / ".setup_pin",
    )

    # Must NOT lazily generate a PIN during verification
    assert mgr.verify_setup_pin("123456") is False
    assert not (tmp_path / ".setup_pin").exists()

    first_pin = mgr.get_or_create_setup_pin()
    # 4 failures keep the existing PIN valid
    for _ in range(4):
        assert mgr.verify_setup_pin("000000") is False
    assert mgr.verify_setup_pin(first_pin) is True

    # 5 consecutive failures across reloads invalidate old PIN and rotate to a new one
    for _ in range(4):
        assert mgr.verify_setup_pin("000000") is False
    reloaded = SystemSecretsManager(
        data_dir=tmp_path,
        secrets_file=tmp_path / ".secrets.json",
        credentials_file=tmp_path / "system_credentials.json",
        pin_file=tmp_path / ".setup_pin",
    )
    assert reloaded.verify_setup_pin("000000") is False
    rotated_pin = (tmp_path / ".setup_pin").read_text(encoding="utf-8").strip()
    assert rotated_pin != first_pin
    assert reloaded.verify_setup_pin(first_pin) is False
    assert reloaded.verify_setup_pin(rotated_pin) is True


def test_settings_sync_dynamic_config_falls_back_to_env_baseline_on_clear(tmp_path):
    mgr = SystemSecretsManager(tmp_path)
    runtime = RuntimeConfig(tmp_path / "runtime.json")
    s = Settings(
        _env_file=None,
        runtime_store=runtime,
        secrets_store=mgr,
        GOOGLE_CLIENT_ID="env-client-id",
        GOOGLE_CLIENT_SECRET="env-client-secret",
        YOUTUBE_OAUTH_PRIMARY_LABEL="Env Primary",
    )
    mgr.update_credentials({"google_client_id": "dyn-id", "google_client_secret": "dyn-secret"})
    runtime.set("youtube_oauth_primary_label", "Dynamic Primary")
    s.sync_dynamic_config()
    assert s.GOOGLE_CLIENT_ID == "dyn-id"
    assert s.GOOGLE_CLIENT_SECRET == "dyn-secret"
    assert s.YOUTUBE_OAUTH_PRIMARY_LABEL == "Dynamic Primary"

    mgr.update_credentials({"google_client_id": "", "google_client_secret": ""})
    runtime.set("youtube_oauth_primary_label", "")
    s.sync_dynamic_config()
    assert s.GOOGLE_CLIENT_ID == "env-client-id"
    assert s.GOOGLE_CLIENT_SECRET == "env-client-secret"
    assert s.YOUTUBE_OAUTH_PRIMARY_LABEL == "Env Primary"


def test_runtime_config_allowlist_helpers(tmp_path: Path):
    config = RuntimeConfig(config_path=tmp_path / "runtime_config.json")
    assert config.get_allowed_emails() == []

    # Set emails
    config.set_allowed_emails(["Alice@example.com", "bob@example.com ", "alice@example.com"])
    assert config.get_allowed_emails() == ["alice@example.com", "bob@example.com"]

    # Add email
    config.add_allowed_email("Charlie@example.com")
    assert config.get_allowed_emails() == ["alice@example.com", "bob@example.com", "charlie@example.com"]

    # Remove email
    config.remove_allowed_email("BOB@EXAMPLE.COM")
    assert config.get_allowed_emails() == ["alice@example.com", "charlie@example.com"]


def test_settings_sync_dynamic_config(tmp_path: Path, monkeypatch):
    mgr = SystemSecretsManager(
        data_dir=tmp_path,
        secrets_file=tmp_path / ".secrets.json",
        credentials_file=tmp_path / "system_credentials.json",
        pin_file=tmp_path / ".setup_pin",
    )
    r_config = RuntimeConfig(config_path=tmp_path / "runtime_config.json")

    mgr.update_credentials(
        {
            "google_client_id": "dynamic-client.apps.googleusercontent.com",
            "google_client_secret": "dynamic-secret",
        }
    )
    r_config.set_allowed_emails(["admin@domain.com"])

    monkeypatch.setattr("backend.app.core.system_secrets.system_secrets", mgr)
    monkeypatch.setattr("backend.app.core.runtime_config.runtime_config", r_config)

    s = Settings(
        ENVIRONMENT="development",
        PUBLIC_BASE_URL="http://localhost:8000",
    )
    s.sync_dynamic_config()

    assert s.GOOGLE_CLIENT_ID == "dynamic-client.apps.googleusercontent.com"
    assert s.GOOGLE_CLIENT_SECRET == "dynamic-secret"
    assert s.allowed_google_emails == frozenset({"admin@domain.com"})
    assert s.is_google_email_allowed("admin@domain.com") is True
    assert s.is_google_email_allowed("other@domain.com") is False
