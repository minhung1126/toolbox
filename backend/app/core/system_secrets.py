"""System Secrets and Encrypted Credentials Manager.

Manages persistent master keys (SECRET_KEY, CREDENTIAL_ENCRYPTION_KEY),
AES-encrypted storage for Google and YouTube OAuth client credentials,
and the one-time Setup PIN for first-run configuration.
"""

import contextlib
import json
import logging
import secrets
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any, Dict, Optional, Tuple

from cryptography.fernet import Fernet, InvalidToken

from backend.app.core.data_paths import data_directory
from backend.app.core.persistence import atomic_write_json, derive_fernet, read_json_file, secure_chmod

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_DATA_DIR = data_directory()
_SECRETS_FILE = _DATA_DIR / ".secrets.json"
_CREDENTIALS_FILE = _DATA_DIR / "system_credentials.json"
_SETUP_PIN_FILE = _DATA_DIR / ".setup_pin"

OAUTH_CREDENTIAL_FIELDS = {
    "google_client_id",
    "google_client_secret",
    "youtube_primary_client_id",
    "youtube_primary_client_secret",
    "youtube_secondary_client_id",
    "youtube_secondary_client_secret",
}

SECRET_FIELDS = {
    "google_client_secret",
    "youtube_primary_client_secret",
    "youtube_secondary_client_secret",
}


def _derive_fernet(key_material: str) -> Fernet:
    return derive_fernet(key_material)


def mask_secret(value: str) -> str:
    """Return a masked representation of a sensitive secret for UI display."""
    raw = str(value or "").strip()
    if not raw:
        return ""
    if len(raw) <= 8:
        return "********"
    if len(raw) <= 14:
        return f"{raw[:3]}****{raw[-3:]}"
    return f"{raw[:6]}****{raw[-4:]}"


def _secure_file_permissions(path: Path) -> None:
    """Set restrictive file permissions on POSIX platforms."""
    secure_chmod(path, 0o600)


class SystemSecretsManager:
    """Thread-safe manager for master encryption keys and system OAuth credentials."""

    def __init__(
        self,
        data_dir: Path = _DATA_DIR,
        secrets_file: Optional[Path] = None,
        credentials_file: Optional[Path] = None,
        pin_file: Optional[Path] = None,
    ):
        self._data_dir = data_dir
        self._secrets_file = secrets_file or (data_dir / ".secrets.json")
        self._credentials_file = credentials_file or (data_dir / "system_credentials.json")
        self._pin_file = pin_file or (data_dir / ".setup_pin")
        self._lock = RLock()
        self._master_secret_key: Optional[str] = None
        self._master_encryption_key: Optional[str] = None
        self._credentials_cache: Optional[Dict[str, str]] = None
        self._setup_pin: Optional[str] = None

    def get_or_create_master_keys(self, env_secret_key: str = "", env_encryption_key: str = "") -> Tuple[str, str]:
        """Resolve persistent master keys from env, existing file, or auto-generation."""
        with self._lock:
            # If already resolved and cached in memory
            if self._master_secret_key and self._master_encryption_key:
                return self._master_secret_key, self._master_encryption_key

            secret_key = env_secret_key.strip()
            encryption_key = env_encryption_key.strip()

            # Try loading existing secrets file
            saved_secrets = read_json_file(self._secrets_file, {}, strict=True)
            if not isinstance(saved_secrets, dict):
                raise ValueError("Invalid master secrets structure")

            # Priority 1: explicitly passed from environment
            # Priority 2: saved in persistent .secrets.json
            # Priority 3: auto-generate strong cryptographic keys
            needs_save = False

            if not secret_key:
                secret_key = str(saved_secrets.get("secret_key") or "").strip()
                if not secret_key:
                    secret_key = secrets.token_urlsafe(48)
                    needs_save = True

            if not encryption_key:
                encryption_key = str(saved_secrets.get("credential_encryption_key") or "").strip()
                if not encryption_key:
                    encryption_key = secrets.token_urlsafe(48)
                    needs_save = True

            if needs_save or not self._secrets_file.is_file():
                try:
                    atomic_write_json(
                        self._secrets_file,
                        {
                            "secret_key": secret_key,
                            "credential_encryption_key": encryption_key,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        },
                        indent=2,
                    )
                    logger.info("Persisted auto-generated master keys to %s", self._secrets_file.name)
                except OSError as exc:
                    logger.error("Failed to persist master keys: %s", type(exc).__name__)
                    raise

            self._master_secret_key = secret_key
            self._master_encryption_key = encryption_key
            return secret_key, encryption_key

    def _get_fernet(self) -> Fernet:
        _, encryption_key = self.get_or_create_master_keys()
        return _derive_fernet(encryption_key)

    def get_credentials(self) -> Dict[str, str]:
        """Return decrypted OAuth client credentials from persistent store."""
        with self._lock:
            if self._credentials_cache is not None:
                return dict(self._credentials_cache)

            data = read_json_file(self._credentials_file, {}, strict=True)
            if not isinstance(data, dict):
                raise ValueError("Invalid system credentials structure")
            if not data:
                self._credentials_cache = {}
                return {}

            try:
                fernet = self._get_fernet()
                decrypted: Dict[str, str] = {}
                for field in OAUTH_CREDENTIAL_FIELDS:
                    raw_val = data.get(field, "")
                    if not raw_val:
                        decrypted[field] = ""
                        continue
                    if field in SECRET_FIELDS and isinstance(raw_val, str) and raw_val.startswith("enc:"):
                        try:
                            token = raw_val[4:].encode("utf-8")
                            decrypted[field] = fernet.decrypt(token).decode("utf-8")
                        except (InvalidToken, ValueError):
                            logger.error("Failed to decrypt secret field: %s", field)
                            raise RuntimeError("Cannot decrypt stored system credentials") from None
                    else:
                        decrypted[field] = str(raw_val)

                self._credentials_cache = decrypted
                return dict(decrypted)
            except (OSError, json.JSONDecodeError) as exc:
                logger.error("Failed to load system credentials: %s", type(exc).__name__)
                raise

    def update_credentials(self, updates: Dict[str, Any]) -> Dict[str, str]:
        """Encrypt and persist updated system OAuth credentials."""
        with self._lock:
            current = self.get_credentials()
            for key, val in updates.items():
                if key in OAUTH_CREDENTIAL_FIELDS and val is not None:
                    current[key] = str(val).strip()

            fernet = self._get_fernet()
            payload: Dict[str, Any] = {
                "version": 1,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }

            for field in OAUTH_CREDENTIAL_FIELDS:
                val = current.get(field, "")
                if field in SECRET_FIELDS and val:
                    encrypted_token = fernet.encrypt(val.encode("utf-8")).decode("utf-8")
                    payload[field] = f"enc:{encrypted_token}"
                else:
                    payload[field] = val

            try:
                atomic_write_json(self._credentials_file, payload, indent=2)
                self._credentials_cache = dict(current)
                logger.info("Successfully updated and persisted system OAuth credentials")
            except OSError as exc:
                logger.error("Failed to save system credentials: %s", type(exc).__name__)
                raise

            return dict(current)

    def get_masked_credentials(self) -> Dict[str, Any]:
        """Return credentials masked for safe display in the Web UI."""
        creds = self.get_credentials()
        return {
            "google": {
                "client_id": creds.get("google_client_id", ""),
                "has_client_secret": bool(creds.get("google_client_secret")),
                "client_secret_masked": mask_secret(creds.get("google_client_secret", "")),
                "configured": bool(creds.get("google_client_id") and creds.get("google_client_secret")),
            },
            "youtube_primary": {
                "client_id": creds.get("youtube_primary_client_id", ""),
                "has_client_secret": bool(creds.get("youtube_primary_client_secret")),
                "client_secret_masked": mask_secret(creds.get("youtube_primary_client_secret", "")),
                "configured": bool(
                    creds.get("youtube_primary_client_id") and creds.get("youtube_primary_client_secret")
                ),
            },
            "youtube_secondary": {
                "client_id": creds.get("youtube_secondary_client_id", ""),
                "has_client_secret": bool(creds.get("youtube_secondary_client_secret")),
                "client_secret_masked": mask_secret(creds.get("youtube_secondary_client_secret", "")),
                "configured": bool(
                    creds.get("youtube_secondary_client_id") and creds.get("youtube_secondary_client_secret")
                ),
            },
        }

    # Setup PIN & Initial Onboarding
    def get_or_create_setup_pin(self) -> str:
        """Return the active one-time Setup PIN, generating one if not already set."""
        with self._lock:
            if self._setup_pin:
                return self._setup_pin

            if self._pin_file.is_file():
                try:
                    pin = self._pin_file.read_text(encoding="utf-8").strip()
                    if pin:
                        self._setup_pin = pin
                        return pin
                except OSError:
                    raise

            pin = f"{secrets.randbelow(900000) + 100000}"
            self._data_dir.mkdir(parents=True, exist_ok=True)
            self._pin_file.write_text(pin, encoding="utf-8")
            _secure_file_permissions(self._pin_file)
            self._setup_pin = pin

            logger.warning("=" * 66)
            logger.warning("[Toolbox Setup] Google OAuth is not configured.")
            logger.warning("[Toolbox Setup] Complete setup at the web interface: /setup")
            logger.warning("[Toolbox Setup] One-time Setup PIN: %s", pin)
            logger.warning("=" * 66)
            return pin

    def verify_setup_pin(self, pin: str) -> bool:
        """Verify the user-provided setup PIN using constant-time comparison."""
        with self._lock:
            expected = self.get_or_create_setup_pin()
            if not expected or not pin:
                return False
            return secrets.compare_digest(str(pin).strip(), expected.strip())

    def clear_setup_pin(self) -> None:
        """Clear the setup PIN once configuration is completed."""
        with self._lock:
            self._setup_pin = None
            if self._pin_file.is_file():
                with contextlib.suppress(OSError):
                    self._pin_file.unlink(missing_ok=True)


system_secrets = SystemSecretsManager()


def get_system_secrets(fallback: SystemSecretsManager | None = None) -> SystemSecretsManager:
    from backend.app.core.config import get_settings

    config = get_settings()
    if config.secrets_store is not None:
        return config.secrets_store
    return system_secrets if fallback is None else fallback
