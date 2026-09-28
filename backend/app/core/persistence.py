"""Shared atomic JSON persistence and cryptographic helper functions."""

from __future__ import annotations

import base64
import contextlib
import hashlib
import json
import logging
import os
import uuid
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)


def derive_fernet(key_material: str) -> Fernet:
    """Derive a Fernet instance from an arbitrary string using SHA-256."""
    digest = hashlib.sha256(key_material.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def secure_chmod(path: Path, mode: int = 0o600) -> None:
    """Apply restrictive file permissions, suppressing OS errors on platforms like Windows."""
    with contextlib.suppress(OSError):
        os.chmod(path, mode)


def atomic_write_json(
    path: Path,
    data: Any,
    *,
    indent: int = 2,
    fsync: bool = False,
    replace_fn: Any = None,
) -> None:
    """Atomically write data as JSON using a unique temp file and os.replace."""
    target_path = Path(path)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = target_path.with_name(f".{target_path.name}.{os.getpid()}.{uuid.uuid4().hex[:8]}.tmp")
    replacer = replace_fn or os.replace
    try:
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=indent)
            if fsync:
                handle.flush()
                os.fsync(handle.fileno())
        secure_chmod(tmp_path, 0o600)
        replacer(tmp_path, target_path)
        secure_chmod(target_path, 0o600)
    except Exception:
        with contextlib.suppress(OSError):
            tmp_path.unlink(missing_ok=True)
        raise


def read_json_file(path: Path, default: Any = None, *, strict: bool = False) -> Any:
    """Read JSON; strict stores only treat a missing file as empty."""
    target_path = Path(path)
    try:
        with target_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return default
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        if strict:
            raise
        logger.warning("Failed to read JSON from %s: %s", target_path, type(exc).__name__)
        return default


__all__ = [
    "atomic_write_json",
    "derive_fernet",
    "read_json_file",
    "secure_chmod",
]
