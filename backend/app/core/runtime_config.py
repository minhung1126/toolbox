"""
Runtime Configuration Persistence

Manages user-modifiable, non-secret settings that persist across server restarts.
Sensitive values are stored separately by credential_store.py.
"""

import logging
from pathlib import Path
from threading import RLock
from typing import Any, Dict

from backend.app.core.persistence import atomic_write_json, read_json_file

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_DATA_DIR = _PROJECT_ROOT / "data"
_CONFIG_FILE = _DATA_DIR / "runtime_config.json"

# Only non-secret fields belong here. Tokens and secret keys must use credential_store.
_PERSISTABLE_FIELDS = {
    # Quotas
    "youtube_primary_general_quota_limit",
    "youtube_primary_quota_safety_buffer_units",
    "youtube_secondary_general_quota_limit",
    "youtube_secondary_quota_safety_buffer_units",
    # Access Control
    "allowed_google_emails",
    "allow_new_users",
    # YouTube Slots
    "youtube_oauth_primary_label",
    "youtube_oauth_secondary_label",
    "youtube_oauth_secondary_enabled",
    "youtube_oauth_default_slot",
    # Setup State
    "setup_completed",
}


class RuntimeConfig:
    """Thread-safe persistent key-value store for non-secret operational settings."""

    def __init__(self, config_path: Path = _CONFIG_FILE):
        self._path = config_path
        self._lock = RLock()
        self._data: Dict[str, Any] = {}
        self._load()

    def _load(self):
        saved = read_json_file(self._path)
        if isinstance(saved, dict):
            self._data = {key: value for key, value in saved.items() if key in _PERSISTABLE_FIELDS}
            logger.info("Loaded runtime config from %s", self._path)
        else:
            self._data = {}

    def _save(self):
        try:
            atomic_write_json(self._path, self._data)
            logger.info("Saved runtime config to %s", self._path)
        except OSError as exc:
            logger.error("Failed to save runtime config: %s", type(exc).__name__)

    def _notify_settings_sync(self):
        try:
            from backend.app.core.config import settings

            if hasattr(settings, "sync_dynamic_config"):
                settings.sync_dynamic_config()
        except Exception as exc:
            logger.error("Failed to sync dynamic settings config: %s", type(exc).__name__)

    def get(self, key: str, default: Any = "") -> Any:
        with self._lock:
            if key in self._data and self._data[key] not in (None, ""):
                return self._data[key]
        try:
            from backend.app.core.config import settings

            env_value = getattr(settings, key.upper(), "")
            return env_value if env_value not in (None, "") else default
        except Exception:
            return default

    def set(self, key: str, value: Any):
        if key not in _PERSISTABLE_FIELDS:
            logger.warning("Attempted to persist non-persistable field: %s", key)
            return
        with self._lock:
            self._data[key] = value
            self._save()
        self._notify_settings_sync()

    def update(self, data: Dict[str, Any]):
        with self._lock:
            for key, value in data.items():
                if key in _PERSISTABLE_FIELDS and value is not None:
                    self._data[key] = value
            self._save()
        self._notify_settings_sync()

    def get_all(self) -> Dict[str, Any]:
        return {field: self.get(field) for field in _PERSISTABLE_FIELDS}

    # Access Control Helpers
    def get_allowed_emails(self) -> list[str]:
        """Return persisted allowed Google emails as a cleaned list."""
        with self._lock:
            raw = self._data.get("allowed_google_emails")
            if isinstance(raw, list):
                return [str(e).strip().casefold() for e in raw if str(e).strip()]
            if isinstance(raw, str) and raw.strip():
                return [e.strip().casefold() for e in raw.split(",") if e.strip()]
            return []

    def set_allowed_emails(self, emails: list[str]) -> list[str]:
        """Normalize, deduplicate, and persist the allowed emails list."""
        cleaned = list(dict.fromkeys(str(e).strip().casefold() for e in emails if str(e).strip()))
        with self._lock:
            self._data["allowed_google_emails"] = cleaned
            self._save()
        self._notify_settings_sync()
        return cleaned

    def add_allowed_email(self, email: str) -> list[str]:
        """Add a single email to the allowlist atomically."""
        norm = email.strip().casefold()
        with self._lock:
            current = self.get_allowed_emails()
            if norm and norm not in current:
                current.append(norm)
                self._data["allowed_google_emails"] = current
                self._save()
            else:
                return current
        self._notify_settings_sync()
        return current

    def remove_allowed_email(self, email: str) -> list[str]:
        """Remove a single email from the allowlist atomically."""
        norm = email.strip().casefold()
        with self._lock:
            current = self.get_allowed_emails()
            updated = [e for e in current if e != norm]
            self._data["allowed_google_emails"] = updated
            self._save()
        self._notify_settings_sync()
        return updated

    def is_allow_new_users(self) -> bool:
        """Return whether adding new user accounts is permitted."""
        with self._lock:
            val = self._data.get("allow_new_users")
            if val is not None:
                return bool(val)
        return True

    def set_allow_new_users(self, allowed: bool) -> bool:
        """Set whether adding new user accounts is permitted."""
        self.set("allow_new_users", bool(allowed))
        return bool(allowed)

    # Setup State Helpers
    def is_setup_completed(self) -> bool:
        with self._lock:
            return bool(self._data.get("setup_completed", False))

    def set_setup_completed(self, completed: bool = True):
        self.set("setup_completed", bool(completed))

    def get_youtube_quota_settings(self, slot: str) -> tuple[int, int]:
        """Return the persisted-or-environment quota policy for one slot."""
        from backend.app.core.config import normalize_youtube_slot, settings

        slot_name = normalize_youtube_slot(slot)
        slot_config = settings.youtube_oauth_slot(slot_name)
        limit_key = f"youtube_{slot_name}_general_quota_limit"
        buffer_key = f"youtube_{slot_name}_quota_safety_buffer_units"
        limit = self.get(limit_key, slot_config.quota_limit)
        buffer = self.get(buffer_key, slot_config.safety_buffer_units)

        try:
            parsed_limit = max(int(limit), 1)
        except (TypeError, ValueError):
            parsed_limit = max(int(slot_config.quota_limit), 1)
        try:
            parsed_buffer = max(int(buffer), 0)
        except (TypeError, ValueError):
            parsed_buffer = max(int(slot_config.safety_buffer_units), 0)
        return parsed_limit, min(parsed_buffer, max(parsed_limit - 1, 0))


runtime_config = RuntimeConfig()
