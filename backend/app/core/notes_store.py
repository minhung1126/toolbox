"""Atomic JSON persistence for user sticky notes.

Stores notes scoped by the authenticated user's OIDC subject.
Each note contains text content, optional remark, pinned state,
and creation / last-updated ISO timestamps.
"""

from __future__ import annotations

import copy
import json
import logging
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from threading import RLock
from typing import Any, List, Optional

from backend.app.core.data_paths import data_directory
from backend.app.core.persistence import atomic_write_json, read_json_file

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_DEFAULT_PATH = data_directory() / "notes.json"


def _now_iso() -> str:
    """Return current UTC timestamp in ISO format."""
    return datetime.now(timezone.utc).isoformat()


MAX_NOTE_CONTENT_LENGTH = 20_000
MAX_NOTE_REMARK_LENGTH = 200
MAX_NOTES_PER_USER = 500
MAX_NOTE_PAYLOAD_BYTES = 128 * 1024
MAX_USER_NOTES_TOTAL_BYTES = 4 * 1024 * 1024


class NoteLimitError(ValueError):
    """Raised when a sticky note exceeds per-note or per-user storage caps."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _note_payload_bytes(note: dict[str, Any]) -> int:
    return len(json.dumps(note, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def _validate_user_limits(
    user_notes: list[dict[str, Any]],
    candidate_note: dict[str, Any],
    *,
    replacing_id: Optional[str] = None,
) -> None:
    if replacing_id is None and len(user_notes) >= MAX_NOTES_PER_USER:
        raise NoteLimitError(
            "note_count_limit_exceeded",
            f"每個帳號最多只能儲存 {MAX_NOTES_PER_USER} 則便利貼。",
        )
    candidate_bytes = _note_payload_bytes(candidate_note)
    if candidate_bytes > MAX_NOTE_PAYLOAD_BYTES:
        raise NoteLimitError(
            "note_payload_too_large",
            "單則便利貼內容過大，超過系統容量上限。",
        )
    existing_bytes = sum(_note_payload_bytes(existing) for existing in user_notes if existing.get("id") != replacing_id)
    if existing_bytes + candidate_bytes > MAX_USER_NOTES_TOTAL_BYTES:
        raise NoteLimitError(
            "notes_storage_limit_exceeded",
            "便利貼總儲存空間已達上限，請刪除部分便利貼後再試。",
        )


class NotesStore:
    """Thread-safe persistent store for user sticky notes."""

    def __init__(self, path: Path = _DEFAULT_PATH) -> None:
        self._path = path
        self._lock = RLock()
        self._data: dict[str, Any] = {"version": 1, "users": {}}
        self._loaded = False
        self._load()

    def _load(self) -> None:
        with self._lock:
            loaded = read_json_file(self._path, {"version": 1, "users": {}}, strict=True)
            if not isinstance(loaded, dict) or not isinstance(loaded.get("users"), dict):
                raise ValueError("Invalid notes structure")
            self._data = loaded
            self._loaded = True

    def _ensure_loaded(self) -> None:
        with self._lock:
            if not self._loaded:
                self._load()

    def _save(self) -> None:
        with self._lock:
            try:
                atomic_write_json(self._path, self._data)
            except Exception:
                self._loaded = False
                raise

    def list_notes(self, subject: str, query: str = "") -> List[dict[str, Any]]:
        """Retrieve notes for an account, optionally filtered by keyword, sorted by pin and updated time."""
        clean_sub = str(subject or "").strip()
        if not clean_sub:
            return []

        with self._lock:
            self._ensure_loaded()
            user_notes = list(self._data.get("users", {}).get(clean_sub, []))

        clean_query = str(query or "").strip().lower()
        if clean_query:
            user_notes = [
                n
                for n in user_notes
                if clean_query in str(n.get("content", "")).lower() or clean_query in str(n.get("remark", "")).lower()
            ]

        # Pinned notes first, then ordered by updated_at descending
        pinned = [n for n in user_notes if n.get("pinned")]
        unpinned = [n for n in user_notes if not n.get("pinned")]
        pinned.sort(key=lambda n: str(n.get("updated_at") or n.get("created_at") or ""), reverse=True)
        unpinned.sort(key=lambda n: str(n.get("updated_at") or n.get("created_at") or ""), reverse=True)

        return [copy.deepcopy(n) for n in (pinned + unpinned)]

    def get_note(self, subject: str, note_id: str) -> Optional[dict[str, Any]]:
        """Find a single note by ID for a user."""
        clean_sub = str(subject or "").strip()
        clean_id = str(note_id or "").strip()
        if not clean_sub or not clean_id:
            return None

        with self._lock:
            self._ensure_loaded()
            for note in self._data.get("users", {}).get(clean_sub, []):
                if note.get("id") == clean_id:
                    return copy.deepcopy(note)
        return None

    def create_note(
        self,
        subject: str,
        content: str = "",
        remark: str = "",
        pinned: bool = False,
        note_type: str = "plain",
        variables: Optional[dict[str, str]] = None,
    ) -> dict[str, Any]:
        """Create a new sticky note for a user."""
        clean_sub = str(subject or "").strip()
        if not clean_sub:
            raise ValueError("subject cannot be empty")

        now = _now_iso()
        note = {
            "id": uuid.uuid4().hex,
            "content": (content or "")[:MAX_NOTE_CONTENT_LENGTH],
            "remark": (remark or "")[:MAX_NOTE_REMARK_LENGTH],
            "pinned": bool(pinned),
            "note_type": note_type,
            "variables": copy.deepcopy(variables or {}),
            "created_at": now,
            "updated_at": now,
        }

        with self._lock:
            self._ensure_loaded()
            users = self._data.setdefault("users", {})
            user_notes = users.setdefault(clean_sub, [])
            _validate_user_limits(user_notes, note)
            user_notes.insert(0, note)
            self._save()
            logger.info("Created sticky note %s for user %s", note["id"], clean_sub)
            return copy.deepcopy(note)

    def update_note(
        self,
        subject: str,
        note_id: str,
        *,
        content: Optional[str] = None,
        remark: Optional[str] = None,
        pinned: Optional[bool] = None,
        note_type: Optional[str] = None,
        variables: Optional[dict[str, str]] = None,
    ) -> Optional[dict[str, Any]]:
        """Update fields of an existing sticky note and bump updated_at."""
        clean_sub = str(subject or "").strip()
        clean_id = str(note_id or "").strip()
        if not clean_sub or not clean_id:
            return None

        with self._lock:
            self._ensure_loaded()
            user_notes = self._data.get("users", {}).get(clean_sub, [])
            target_index = None
            target = None
            for idx, note in enumerate(user_notes):
                if note.get("id") == clean_id:
                    target_index = idx
                    target = note
                    break

            if target is None or target_index is None:
                return None

            candidate = copy.deepcopy(target)
            changed = False
            if content is not None:
                safe_content = content[:MAX_NOTE_CONTENT_LENGTH]
                if candidate.get("content") != safe_content:
                    candidate["content"] = safe_content
                    changed = True
            if remark is not None:
                safe_remark = remark[:MAX_NOTE_REMARK_LENGTH]
                if candidate.get("remark") != safe_remark:
                    candidate["remark"] = safe_remark
                    changed = True
            if pinned is not None and candidate.get("pinned") != pinned:
                candidate["pinned"] = bool(pinned)
                changed = True

            if note_type is not None and candidate.get("note_type", "plain") != note_type:
                candidate["note_type"] = note_type
                changed = True
            if variables is not None and candidate.get("variables", {}) != variables:
                candidate["variables"] = copy.deepcopy(variables)
                changed = True

            if changed:
                candidate["updated_at"] = _now_iso()
                _validate_user_limits(user_notes, candidate, replacing_id=clean_id)
                user_notes[target_index] = candidate
                self._save()
                logger.info("Updated sticky note %s for user %s", clean_id, clean_sub)
                return copy.deepcopy(candidate)

            return copy.deepcopy(target)

    def delete_note(self, subject: str, note_id: str) -> bool:
        """Delete an existing sticky note."""
        clean_sub = str(subject or "").strip()
        clean_id = str(note_id or "").strip()
        if not clean_sub or not clean_id:
            return False

        with self._lock:
            self._ensure_loaded()
            user_notes = self._data.get("users", {}).get(clean_sub, [])
            initial_len = len(user_notes)
            user_notes[:] = [n for n in user_notes if n.get("id") != clean_id]
            if len(user_notes) < initial_len:
                self._save()
                logger.info("Deleted sticky note %s for user %s", clean_id, clean_sub)
                return True
            return False


@lru_cache(maxsize=1)
def default_notes_store() -> NotesStore:
    """Open the production notes file only when an app first needs it."""
    return NotesStore()
