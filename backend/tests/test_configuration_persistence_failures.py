from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.core import runtime_config as runtime_module
from backend.app.core import system_secrets as secrets_module
from backend.app.core.config import Settings
from backend.app.core.dependencies import require_account_email, require_login_credentials
from backend.app.core.runtime_config import RuntimeConfig
from backend.app.core.system_secrets import SystemSecretsManager
from backend.app.main import create_app


def fail_write(*args, **kwargs):
    raise PermissionError("storage unavailable")


def test_runtime_write_failure_preserves_policy_and_does_not_return_success(tmp_path, monkeypatch):
    runtime = RuntimeConfig(tmp_path / "runtime.json")
    config = Settings(_env_file=None, runtime_store=runtime, secrets_store=SystemSecretsManager(tmp_path))
    runtime.set_allow_new_users(True)
    app = create_app(
        app_settings=config,
        dependency_overrides={
            require_login_credentials: lambda: object(),
            require_account_email: lambda: "admin@example.test",
        },
    )
    client = TestClient(app, raise_server_exceptions=False)
    before = (tmp_path / "runtime.json").read_bytes()
    with monkeypatch.context() as patch:
        patch.setattr(runtime_module, "atomic_write_json", fail_write)
        response = client.put("/api/v1/system/allow-new-users", json={"allow_new_users": False})
    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "internal_error"
    assert runtime.get("allow_new_users") is True
    assert config.allow_new_users is True
    assert (tmp_path / "runtime.json").read_bytes() == before


def test_system_credentials_write_failure_preserves_saved_and_active_credentials(tmp_path, monkeypatch):
    manager = SystemSecretsManager(tmp_path)
    runtime = RuntimeConfig(tmp_path / "runtime.json")
    config = Settings(_env_file=None, runtime_store=runtime, secrets_store=manager)
    manager.update_credentials({"google_client_id": "old-id", "google_client_secret": "old-secret"})
    app = create_app(app_settings=config, dependency_overrides={require_login_credentials: lambda: object()})
    client = TestClient(app, raise_server_exceptions=False)
    before = (tmp_path / "system_credentials.json").read_bytes()
    with monkeypatch.context() as patch:
        patch.setattr(secrets_module, "atomic_write_json", fail_write)
        response = client.put(
            "/api/v1/system/credentials", json={"google_client_id": "new-id", "google_client_secret": "new-secret"}
        )
    assert response.status_code == 500
    assert manager.get_credentials()["google_client_id"] == "old-id"
    assert config.GOOGLE_CLIENT_ID == "old-id"
    assert (tmp_path / "system_credentials.json").read_bytes() == before


@pytest.mark.parametrize("kind", ["runtime", "credentials", "master-keys"])
@pytest.mark.parametrize("raw", ["{bad-json", "null", "[]"])
def test_corrupt_configuration_is_not_overwritten(tmp_path, kind, raw):
    filename = {"runtime": "runtime.json", "credentials": "system_credentials.json", "master-keys": ".secrets.json"}[
        kind
    ]
    path = tmp_path / filename
    path.write_text(raw, encoding="utf-8")
    runtime = RuntimeConfig(path)
    manager = SystemSecretsManager(tmp_path)
    with pytest.raises(ValueError):
        if kind == "runtime":
            runtime.set_allow_new_users(True)
        elif kind == "credentials":
            manager.update_credentials({"google_client_secret": "replacement"})
        else:
            manager.get_or_create_master_keys()
    assert path.read_text(encoding="utf-8") == raw


def test_wrong_encryption_key_does_not_overwrite_system_credentials(tmp_path):
    manager = SystemSecretsManager(tmp_path)
    manager.update_credentials({"google_client_id": "client", "google_client_secret": "original-secret"})
    before = (tmp_path / "system_credentials.json").read_bytes()
    replacement = SystemSecretsManager(tmp_path)
    replacement.get_or_create_master_keys(env_secret_key="other-signing-key", env_encryption_key="other-encryption-key")
    with pytest.raises(RuntimeError, match="decrypt"):
        replacement.update_credentials({"google_client_secret": "replacement"})
    assert (tmp_path / "system_credentials.json").read_bytes() == before


def test_master_key_and_setup_pin_failures_are_retryable_not_cached(tmp_path, monkeypatch):
    manager = SystemSecretsManager(tmp_path)
    with monkeypatch.context() as patch:
        patch.setattr(secrets_module, "atomic_write_json", fail_write)
        with pytest.raises(PermissionError):
            manager.get_or_create_master_keys()
    keys = manager.get_or_create_master_keys()
    assert SystemSecretsManager(tmp_path).get_or_create_master_keys() == keys
    with monkeypatch.context() as patch:
        patch.setattr(Path, "write_text", fail_write)
        with pytest.raises(PermissionError):
            manager.get_or_create_setup_pin()
    pin = manager.get_or_create_setup_pin()
    assert (tmp_path / ".setup_pin").read_text(encoding="utf-8") == pin
    assert SystemSecretsManager(tmp_path).verify_setup_pin(pin)
