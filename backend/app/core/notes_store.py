"""Atomic JSON persistence for user sticky notes.

Stores notes scoped by the authenticated user's OIDC subject.
Each note contains text content, optional remark, pinned state,
and creation / last-updated ISO timestamps.
"""

from __future__ import annotations

import copy
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


class NotesStore:
    """Thread-safe persistent store for user sticky notes."""

    def __init__(self, path: Path = _DEFAULT_PATH) -> None:
        self._path = path
        self._lock = RLock()
        self._data: dict[str, Any] = {"version": 1, "users": {}}
        self._load()

    def _load(self) -> None:
        with self._lock:
            loaded = read_json_file(self._path)
            if isinstance(loaded, dict) and isinstance(loaded.get("users"), dict):
                self._data = loaded
            else:
                self._data = {"version": 1, "users": {}}

    def _save(self) -> None:
        with self._lock:
            atomic_write_json(self._path, self._data)

    def list_notes(self, subject: str, query: str = "") -> List[dict[str, Any]]:
        """Retrieve notes for an account, optionally filtered by keyword, sorted by pin and updated time."""
        clean_sub = str(subject or "").strip()
        if not clean_sub:
            return []

        with self._lock:
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
            "created_at": now,
            "updated_at": now,
        }

        with self._lock:
            users = self._data.setdefault("users", {})
            user_notes = users.setdefault(clean_sub, [])
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
    ) -> Optional[dict[str, Any]]:
        """Update fields of an existing sticky note and bump updated_at."""
        clean_sub = str(subject or "").strip()
        clean_id = str(note_id or "").strip()
        if not clean_sub or not clean_id:
            return None

        with self._lock:
            user_notes = self._data.get("users", {}).get(clean_sub, [])
            target = None
            for note in user_notes:
                if note.get("id") == clean_id:
                    target = note
                    break

            if target is None:
                return None

            changed = False
            if content is not None:
                safe_content = content[:MAX_NOTE_CONTENT_LENGTH]
                if target.get("content") != safe_content:
                    target["content"] = safe_content
                    changed = True
            if remark is not None:
                safe_remark = remark[:MAX_NOTE_REMARK_LENGTH]
                if target.get("remark") != safe_remark:
                    target["remark"] = safe_remark
                    changed = True
            if pinned is not None and target.get("pinned") != pinned:
                target["pinned"] = bool(pinned)
                changed = True

            if changed:
                target["updated_at"] = _now_iso()
                self._save()
                logger.info("Updated sticky note %s for user %s", clean_id, clean_sub)

            return copy.deepcopy(target)

    def delete_note(self, subject: str, note_id: str) -> bool:
        """Delete an existing sticky note."""
        clean_sub = str(subject or "").strip()
        clean_id = str(note_id or "").strip()
        if not clean_sub or not clean_id:
            return False

        with self._lock:
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
