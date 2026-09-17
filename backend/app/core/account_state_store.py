"""Server-side persistence for account-scoped, non-secret work state.

The browser only carries the session cookie.  Settings and work-in-progress
values live here under the Google OIDC subject so two accounts can use the
same browser without sharing state.
"""

from __future__ import annotations

import copy
import json
import logging
from collections.abc import Iterable
from pathlib import Path
from threading import RLock
from typing import Any

from backend.app.core.persistence import atomic_write_json, read_json_file

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_DEFAULT_PATH = _PROJECT_ROOT / "data" / "account_state.json"
_MAX_SUBJECT_LENGTH = 256
_MAX_WORK_STATE_BYTES = 128 * 1024

DEFAULT_ACCOUNT_SETTING_KEYS = frozenset(
    {
        "default_spreadsheet_id",
        "default_playlist_id",
        "youtube_active_slot",
        "youtube_routing_mode",
        "youtube_draft_video_config",
        "youtube_draft_shorts_config",
        "shared_team_person_filter",
    }
)

DEFAULT_WORK_STATE_KEYS = frozenset(
    {
        "navigation",
        "sheet_copy",
        "youtube_publish_cleaner",
        "youtube_draft_video",
        "youtube_draft_shorts",
        "ytmusic_pinned_playlists",
        "ytmusic_sort_config",
        "ytmusic_preferences",
    }
)


class _DynamicKeysProxy:
    """Read-only proxy that checks membership against an AccountStateStore's dynamic key set."""

    def __init__(self, key_type: str, store_getter):
        self._key_type = key_type
        self._store_getter = store_getter

    def __contains__(self, item: object) -> bool:
        store = self._store_getter()
        if self._key_type == "setting":
            return store.is_valid_setting_key(str(item))
        return store.is_valid_work_state_key(str(item))

    def __iter__(self):
        store = self._store_getter()
        keys = store.setting_keys if self._key_type == "setting" else store.work_state_keys
        return iter(keys)

    def __len__(self) -> int:
        store = self._store_getter()
        keys = store.setting_keys if self._key_type == "setting" else store.work_state_keys
        return len(keys)

    def __repr__(self) -> str:
        store = self._store_getter()
        keys = store.setting_keys if self._key_type == "setting" else store.work_state_keys
        return f"DynamicKeysProxy({set(keys)})"


ACCOUNT_SETTING_KEYS = _DynamicKeysProxy("setting", lambda: account_state_store)
WORK_STATE_KEYS = _DynamicKeysProxy("work_state", lambda: account_state_store)

MISSING = object()


def _subject(value: str) -> str:
    normalized = str(value or "").strip()
    if not normalized or len(normalized) > _MAX_SUBJECT_LENGTH:
        raise ValueError("account subject is required")
    return normalized


def _copy(value: Any) -> Any:
    return copy.deepcopy(value)


class AccountStateStore:
    """Thread-safe JSON store keyed by a Google OIDC subject."""

    def __init__(self, path: Path = _DEFAULT_PATH):
        self._path = Path(path)
        self._lock = RLock()
        self._setting_keys: set[str] = set(DEFAULT_ACCOUNT_SETTING_KEYS)
        self._work_state_keys: set[str] = set(DEFAULT_WORK_STATE_KEYS)
        self._data: dict[str, Any] = {
            "version": 1,
            "accounts": {},
        }
        self._load()

    def register_setting_keys(self, keys: Iterable[str]) -> None:
        """Dynamically register allowed setting keys for tools and plugins."""
        with self._lock:
            self._setting_keys.update(str(k).strip() for k in keys if str(k).strip())

    def register_work_state_keys(self, keys: Iterable[str]) -> None:
        """Dynamically register allowed work state keys for tools and plugins."""
        with self._lock:
            self._work_state_keys.update(str(k).strip() for k in keys if str(k).strip())

    def is_valid_setting_key(self, key: str) -> bool:
        with self._lock:
            return key in self._setting_keys

    def is_valid_work_state_key(self, key: str) -> bool:
        with self._lock:
            return key in self._work_state_keys

    @property
    def setting_keys(self) -> frozenset[str]:
        with self._lock:
            return frozenset(self._setting_keys)

    @property
    def work_state_keys(self) -> frozenset[str]:
        with self._lock:
            return frozenset(self._work_state_keys)

    def _load(self) -> None:
        with self._lock:
            loaded = read_json_file(self._path)
            if not isinstance(loaded, dict):
                return

            accounts = loaded.get("accounts")
            normalized_accounts: dict[str, dict[str, Any]] = {}
            if isinstance(accounts, dict):
                for raw_subject, raw_account in accounts.items():
                    try:
                        subject = _subject(raw_subject)
                    except ValueError:
                        continue
                    if not isinstance(raw_account, dict):
                        continue
                    settings = raw_account.get("settings")
                    work_state = raw_account.get("work_state")
                    normalized_accounts[subject] = {
                        "settings": dict(settings) if isinstance(settings, dict) else {},
                        "work_state": dict(work_state) if isinstance(work_state, dict) else {},
                    }
            self._data = {
                "version": 1,
                "accounts": normalized_accounts,
            }
            logger.info("Loaded account state from %s", self._path)

    def _save(self) -> None:
        atomic_write_json(self._path, self._data)

    def _ensure_account_unlocked(self, subject: str) -> tuple[dict[str, Any], bool]:
        account = self._data["accounts"].get(subject)
        changed = False
        if not isinstance(account, dict):
            account = {"settings": {}, "work_state": {}}
            self._data["accounts"][subject] = account
            changed = True
        if not isinstance(account.get("settings"), dict):
            account["settings"] = {}
            changed = True
        if not isinstance(account.get("work_state"), dict):
            account["work_state"] = {}
            changed = True
        return account, changed

    def ensure_account(self, owner_sub: str) -> None:
        subject = _subject(owner_sub)
        with self._lock:
            account, changed = self._ensure_account_unlocked(subject)
            if changed:
                self._save()

    def get_setting(self, owner_sub: str, key: str, default: Any = MISSING) -> Any:
        if not self.is_valid_setting_key(key):
            raise ValueError(f"Unsupported account setting: {key}")
        subject = _subject(owner_sub)
        with self._lock:
            account = self._data["accounts"].get(subject)
            settings = account.get("settings") if isinstance(account, dict) else None
            if isinstance(settings, dict) and key in settings:
                return _copy(settings[key])
        return default

    def set_setting(self, owner_sub: str, key: str, value: Any) -> None:
        if not self.is_valid_setting_key(key):
            raise ValueError(f"Unsupported account setting: {key}")
        subject = _subject(owner_sub)
        with self._lock:
            account, _ = self._ensure_account_unlocked(subject)
            account["settings"][key] = _copy(value)
            self._save()

    def get_settings(self, owner_sub: str) -> dict[str, Any]:
        subject = _subject(owner_sub)
        with self._lock:
            account = self._data["accounts"].get(subject)
            settings = account.get("settings") if isinstance(account, dict) else None
            return _copy(settings) if isinstance(settings, dict) else {}

    def get_work_state(self, owner_sub: str) -> dict[str, Any]:
        subject = _subject(owner_sub)
        with self._lock:
            account = self._data["accounts"].get(subject)
            work_state = account.get("work_state") if isinstance(account, dict) else None
            return _copy(work_state) if isinstance(work_state, dict) else {}

    def set_work_state(self, owner_sub: str, key: str, value: dict[str, Any]) -> dict[str, Any]:
        if not self.is_valid_work_state_key(key):
            raise ValueError(f"Unsupported work state: {key}")
        if not isinstance(value, dict):
            raise ValueError("work state value must be an object")
        try:
            encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        except (TypeError, ValueError) as exc:
            raise ValueError("work state value must be JSON serializable") from exc
        if len(encoded.encode("utf-8")) > _MAX_WORK_STATE_BYTES:
            raise ValueError("work state value is too large")

        subject = _subject(owner_sub)
        with self._lock:
            account, _ = self._ensure_account_unlocked(subject)
            account["work_state"][key] = _copy(value)
            self._save()
            return _copy(account["work_state"])

    def has_account(self, owner_sub: str) -> bool:
        subject = _subject(owner_sub)
        with self._lock:
            return subject in self._data["accounts"]


account_state_store = AccountStateStore()


__all__ = [
    "ACCOUNT_SETTING_KEYS",
    "AccountStateStore",
    "DEFAULT_ACCOUNT_SETTING_KEYS",
    "DEFAULT_WORK_STATE_KEYS",
    "MISSING",
    "WORK_STATE_KEYS",
    "account_state_store",
]
