"""Weverse upload tasks and history persistent store."""

import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class WeverseUploadStore:
    """Thread-safe store for Weverse upload tasks, progress, and history."""

    def __init__(self, data_file: Optional[Path] = None) -> None:
        if data_file is None:
            # Persistent data folder outside codebase
            base_dir = Path(__file__).resolve().parent.parent.parent.parent / "data"
            self.data_file = base_dir / "weverse_uploads.json"
        else:
            self.data_file = data_file
        self._lock = threading.Lock()
        self._ensure_file()

    def _ensure_file(self) -> None:
        try:
            self.data_file.parent.mkdir(parents=True, exist_ok=True)
            if not self.data_file.exists():
                with open(self.data_file, "w", encoding="utf-8") as f:
                    json.dump({}, f)
        except Exception as exc:
            logger.error("Failed to initialize Weverse upload store: %s", exc)

    def _load_all(self) -> Dict[str, Any]:
        try:
            if not self.data_file.exists():
                return {}
            with open(self.data_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            logger.warning("Error reading Weverse upload store: %s", exc)
            return {}

    def _save_all(self, data: Dict[str, Any]) -> None:
        try:
            temp_file = self.data_file.with_suffix(".tmp")
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            temp_file.replace(self.data_file)
        except Exception as exc:
            logger.error("Error writing Weverse upload store: %s", exc)

    def create_task(self, owner_sub: str, task: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new upload task."""
        with self._lock:
            data = self._load_all()
            user_data = data.setdefault(owner_sub, {"tasks": {}, "recent_paths": []})
            tasks = user_data.setdefault("tasks", {})
            now = _utc_now_iso()
            task["created_at"] = now
            task["updated_at"] = now
            tasks[task["task_id"]] = task
            self._save_all(data)
            return task

    def get_task(self, owner_sub: str, task_id: str) -> Optional[Dict[str, Any]]:
        """Get an existing upload task by ID."""
        with self._lock:
            data = self._load_all()
            return data.get(owner_sub, {}).get("tasks", {}).get(task_id)

    def update_task(self, owner_sub: str, task_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update fields of an ongoing or completed task."""
        with self._lock:
            data = self._load_all()
            user_data = data.setdefault(owner_sub, {"tasks": {}, "recent_paths": []})
            tasks = user_data.setdefault("tasks", {})
            task = tasks.get(task_id)
            if not task:
                return None
            task.update(updates)
            task["updated_at"] = _utc_now_iso()
            tasks[task_id] = task
            self._save_all(data)
            return task

    def list_tasks(self, owner_sub: str, limit: int = 20) -> List[Dict[str, Any]]:
        """List recent tasks sorted by creation time descending."""
        with self._lock:
            data = self._load_all()
            tasks_dict = data.get(owner_sub, {}).get("tasks", {})
            tasks = list(tasks_dict.values())
            tasks.sort(key=lambda t: t.get("created_at", ""), reverse=True)
            return tasks[:limit]

    def record_recent_path(self, owner_sub: str, path: str) -> None:
        """Save a recently scanned folder path."""
        if not path:
            return
        with self._lock:
            data = self._load_all()
            user_data = data.setdefault(owner_sub, {"tasks": {}, "recent_paths": []})
            paths = user_data.setdefault("recent_paths", [])
            if path in paths:
                paths.remove(path)
            paths.insert(0, path)
            user_data["recent_paths"] = paths[:10]
            self._save_all(data)

    def get_recent_paths(self, owner_sub: str) -> List[str]:
        """Get recent folder paths."""
        with self._lock:
            data = self._load_all()
            return data.get(owner_sub, {}).get("recent_paths", [])


weverse_upload_store = WeverseUploadStore()
