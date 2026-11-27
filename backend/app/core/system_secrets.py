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
MAX_SETUP_PIN_ATTEMPTS = 5


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


def resolve_secret_update(raw_value: Any, current_secret: str = "") -> Optional[str]:
    """Validate and resolve a secret update payload value.

    Returns ``None`` when the caller sent back the unchanged masked value of
    ``current_secret`` (meaning keep as-is), ``""`` for explicit clear, or the
    cleaned plaintext secret. Raises ``ValueError`` for any other masked string.
    """
    clean = str(raw_value if raw_value is not None else "").strip()
    if clean == "":
        return ""
    if current_secret and clean == mask_secret(current_secret):
        return None
    if "****" in clean:
        raise ValueError("請輸入完整的 OAuth 密鑰，勿傳入遮罩字串。")
    return clean


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
        self._pin_attempts_file = self._pin_file.with_name(f"{self._pin_file.name}.attempts")
        self._setup_pin_failures: int = 0

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

    def get_credentials(self, *, ignore_decrypt_errors: bool = False) -> Dict[str, str]:
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
                had_decrypt_error = False
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
                            if ignore_decrypt_errors:
                                logger.warning(
                                    "Failed to decrypt secret field %s; treating as empty for recovery/display",
                                    field,
                                )
                                decrypted[field] = ""
                                had_decrypt_error = True
                            else:
                                logger.error("Failed to decrypt secret field: %s", field)
                                raise RuntimeError("Cannot decrypt stored system credentials") from None
                    else:
                        decrypted[field] = str(raw_val)

                if not had_decrypt_error:
                    self._credentials_cache = decrypted
                return dict(decrypted)
            except (OSError, json.JSONDecodeError) as exc:
                logger.error("Failed to load system credentials: %s", type(exc).__name__)
                raise

    def update_credentials(self, updates: Dict[str, Any]) -> Dict[str, str]:
        """Encrypt and persist updated system OAuth credentials."""
        with self._lock:
            current = self.get_credentials(ignore_decrypt_errors=True)
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

    def get_masked_credentials(self, effective_settings: Any = None) -> Dict[str, Any]:
        """Return credentials masked for safe display in the Web UI."""
        stored = self.get_credentials(ignore_decrypt_errors=True)
        groups = (
            ("google", "google_client_id", "google_client_secret", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
            (
                "youtube_primary",
                "youtube_primary_client_id",
                "youtube_primary_client_secret",
                "YOUTUBE_OAUTH_PRIMARY_CLIENT_ID",
                "YOUTUBE_OAUTH_PRIMARY_CLIENT_SECRET",
            ),
            (
                "youtube_secondary",
                "youtube_secondary_client_id",
                "youtube_secondary_client_secret",
                "YOUTUBE_OAUTH_SECONDARY_CLIENT_ID",
                "YOUTUBE_OAUTH_SECONDARY_CLIENT_SECRET",
            ),
        )
        masked: Dict[str, Any] = {}
        for group_name, id_key, secret_key, env_id_attr, env_secret_attr in groups:
            stored_id = str(stored.get(id_key, "") or "").strip()
            stored_secret = str(stored.get(secret_key, "") or "").strip()
            if effective_settings is not None:
                eff_id = str(getattr(effective_settings, env_id_attr, "") or "").strip()
                eff_secret = str(getattr(effective_settings, env_secret_attr, "") or "").strip()
                source = "dynamic" if (stored_id or stored_secret) else ("env" if (eff_id or eff_secret) else "none")
            else:
                eff_id = stored_id
                eff_secret = stored_secret
                source = "dynamic" if (eff_id or eff_secret) else "none"
            masked[group_name] = {
                "client_id": eff_id,
                "has_client_secret": bool(eff_secret),
                "client_secret_masked": mask_secret(eff_secret),
                "configured": bool(eff_id and eff_secret),
                "source": source,
            }
        return masked

    # Setup PIN & Initial Onboarding
    def _read_active_setup_pin_unlocked(self) -> str:
        if self._setup_pin:
            return self._setup_pin
        if self._pin_file.is_file():
            pin = self._pin_file.read_text(encoding="utf-8").strip()
            if pin:
                self._setup_pin = pin
                return pin
        return ""

    def _read_setup_pin_failures_unlocked(self) -> int:
        if self._setup_pin_failures > 0:
            return self._setup_pin_failures
        if self._pin_attempts_file.is_file():
            try:
                raw = self._pin_attempts_file.read_text(encoding="utf-8").strip()
                parsed = int(raw)
                if parsed > 0:
                    self._setup_pin_failures = parsed
                    return parsed
            except (OSError, ValueError):
                return 0
        return 0

    def _write_setup_pin_failures_unlocked(self, count: int) -> None:
        self._setup_pin_failures = max(0, int(count))
        if self._setup_pin_failures <= 0:
            with contextlib.suppress(OSError):
                self._pin_attempts_file.unlink(missing_ok=True)
            return
        try:
            self._data_dir.mkdir(parents=True, exist_ok=True)
            self._pin_attempts_file.write_text(str(self._setup_pin_failures), encoding="utf-8")
            _secure_file_permissions(self._pin_attempts_file)
        except OSError:
            pass

    def _generate_and_persist_setup_pin_unlocked(self, *, previous_pin: str = "", rotated: bool = False) -> str:
        pin = f"{secrets.randbelow(900000) + 100000}"
        while previous_pin and pin == previous_pin:
            pin = f"{secrets.randbelow(900000) + 100000}"
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._pin_file.write_text(pin, encoding="utf-8")
        _secure_file_permissions(self._pin_file)
        self._setup_pin = pin
        self._write_setup_pin_failures_unlocked(0)

        logger.warning("=" * 66)
        if rotated:
            logger.warning("[Toolbox Setup] Setup PIN invalidated after too many failed attempts.")
            logger.warning("[Toolbox Setup] Rotated One-time Setup PIN: %s", pin)
        else:
            logger.warning("[Toolbox Setup] Google OAuth is not configured.")
            logger.warning("[Toolbox Setup] Complete setup at the web interface: /setup")
            logger.warning("[Toolbox Setup] One-time Setup PIN: %s", pin)
        logger.warning("=" * 66)
        return pin

    def get_or_create_setup_pin(self) -> str:
        """Return the active one-time Setup PIN, generating one if not already set."""
        with self._lock:
            existing = self._read_active_setup_pin_unlocked()
            if existing:
                return existing
            return self._generate_and_persist_setup_pin_unlocked()

    def verify_setup_pin(self, pin: str) -> bool:
        """Verify the user-provided setup PIN against an existing PIN only."""
        with self._lock:
            expected = self._read_active_setup_pin_unlocked()
            if not expected:
                return False
            candidate = str(pin or "").strip()
            if candidate and secrets.compare_digest(candidate, expected.strip()):
                self._write_setup_pin_failures_unlocked(0)
                return True
            failures = self._read_setup_pin_failures_unlocked() + 1
            if failures >= MAX_SETUP_PIN_ATTEMPTS:
                logger.warning("Setup PIN verification failed %d times; rotating Setup PIN", failures)
                self._generate_and_persist_setup_pin_unlocked(previous_pin=expected, rotated=True)
                return False
            self._write_setup_pin_failures_unlocked(failures)
            return False

    def clear_setup_pin(self) -> None:
        """Clear the setup PIN once configuration is completed."""
        with self._lock:
            self._setup_pin = None
            self._setup_pin_failures = 0
            if self._pin_file.is_file():
                with contextlib.suppress(OSError):
                    self._pin_file.unlink(missing_ok=True)
            if self._pin_attempts_file.is_file():
                with contextlib.suppress(OSError):
                    self._pin_attempts_file.unlink(missing_ok=True)


system_secrets = SystemSecretsManager()


def get_system_secrets(fallback: SystemSecretsManager | None = None) -> SystemSecretsManager:
    from backend.app.core.config import get_settings

    config = get_settings()
    if config.secrets_store is not None:
        return config.secrets_store
    return system_secrets if fallback is None else fallback
