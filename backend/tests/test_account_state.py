import pytest

from backend.app.core import account_state_store as account_state_module
from backend.app.core.account_state_store import MISSING, AccountStateStore


def test_account_state_isolated_by_google_subject(tmp_path):
    store = AccountStateStore(tmp_path / "account-state.json")
    store.ensure_account("google-user-a")
    store.ensure_account("google-user-b")

    store.set_setting("google-user-a", "default_spreadsheet_id", "sheet-a")
    store.set_work_state("google-user-a", "navigation", {"activeTab": "sheet_copy"})

    assert store.get_setting("google-user-a", "default_spreadsheet_id") == "sheet-a"
    assert store.get_setting("google-user-b", "default_spreadsheet_id") is MISSING
    assert store.get_work_state("google-user-a") == {"navigation": {"activeTab": "sheet_copy"}}
    assert store.get_work_state("google-user-b") == {}


def test_account_creation_does_not_copy_external_settings(tmp_path):
    store = AccountStateStore(tmp_path / "account-state.json")
    store.ensure_account("first-user")
    store.ensure_account("second-user")

    assert store.get_setting("first-user", "default_playlist_id") is MISSING
    assert store.get_setting("second-user", "default_playlist_id") is MISSING


def test_dynamic_key_registration(tmp_path):
    store = AccountStateStore(tmp_path / "account-state.json")
    store.ensure_account("custom-user")

    # Before registration, custom keys should raise ValueError
    with pytest.raises(ValueError, match="Unsupported account setting"):
        store.set_setting("custom-user", "custom_plugin_config", "val-1")

    with pytest.raises(ValueError, match="Unsupported work state"):
        store.set_work_state("custom-user", "custom_plugin_state", {"data": 123})

    # Dynamically register keys
    store.register_setting_keys(["custom_plugin_config"])
    store.register_work_state_keys(["custom_plugin_state"])

    # Now they should be accepted
    store.set_setting("custom-user", "custom_plugin_config", "val-1")
    store.set_work_state("custom-user", "custom_plugin_state", {"data": 123})

    assert store.get_setting("custom-user", "custom_plugin_config") == "val-1"
    assert store.get_work_state("custom-user") == {"custom_plugin_state": {"data": 123}}


def test_ytmusic_work_state_keys_supported_by_default(tmp_path):
    store = AccountStateStore(tmp_path / "account-state.json")
    store.ensure_account("ytmusic-user")

    pinned_data = {"ids": ["PL_test_1", "PL_test_2"]}
    sort_data = {"presetMode": "artist-asc", "applyMode": "in_place"}
    pref_data = {"defaultPreset": "title-asc"}

    store.set_work_state("ytmusic-user", "ytmusic_pinned_playlists", pinned_data)
    store.set_work_state("ytmusic-user", "ytmusic_sort_config", sort_data)
    store.set_work_state("ytmusic-user", "ytmusic_preferences", pref_data)

    work_state = store.get_work_state("ytmusic-user")
    assert work_state["ytmusic_pinned_playlists"] == pinned_data
    assert work_state["ytmusic_sort_config"] == sort_data
    assert work_state["ytmusic_preferences"] == pref_data


@pytest.mark.parametrize("stored", ["{broken", "null", "{}"])
def test_lazy_account_state_rejects_corrupt_file_until_repaired(tmp_path, stored):
    path = tmp_path / "account-state.json"
    path.write_text(stored, encoding="utf-8")
    store = AccountStateStore(path, defer_load=True)

    with pytest.raises(ValueError):
        store.set_setting("test-user", "default_spreadsheet_id", "new-value")
    assert path.read_text(encoding="utf-8") == stored

    path.write_text('{"version":1,"accounts":{}}', encoding="utf-8")
    store.set_setting("test-user", "default_spreadsheet_id", "new-value")
    assert store.get_setting("test-user", "default_spreadsheet_id") == "new-value"


def test_account_state_write_failure_does_not_expose_unsaved_value(tmp_path, monkeypatch):
    path = tmp_path / "account-state.json"
    store = AccountStateStore(path)
    store.set_setting("test-user", "default_spreadsheet_id", "saved-value")

    def fail_write(*args, **kwargs):
        raise OSError("disk unavailable")

    monkeypatch.setattr(account_state_module, "atomic_write_json", fail_write)
    with pytest.raises(OSError, match="disk unavailable"):
        store.set_setting("test-user", "default_spreadsheet_id", "unsaved-value")

    assert store.get_setting("test-user", "default_spreadsheet_id") == "saved-value"
    assert AccountStateStore(path).get_setting("test-user", "default_spreadsheet_id") == "saved-value"
