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
    import pytest

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
