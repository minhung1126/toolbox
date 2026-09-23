"""Weverse upload tasks and history persistent store."""

import json
import logging
import os
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

from backend.app.core.persistence import atomic_write_json

logger = logging.getLogger(__name__)

_process_locks_guard = threading.Lock()
_process_locks: dict[str, Any] = {}


def _thread_lock_for(path: Path) -> Any:
    key = str(path.resolve())
    with _process_locks_guard:
        return _process_locks.setdefault(key, threading.RLock())


class WeverseUploadStoreError(RuntimeError):
    """Raised when durable Weverse upload state cannot be read or written."""


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
        self._process_thread_lock = _thread_lock_for(self.data_file)
        self._ensure_file()

    @contextmanager
    def _process_file_lock(self) -> Iterator[None]:
        """Serialize read-modify-write operations across cooperating processes.

        The lock file is a stable sibling of the JSON file so atomic replacement
        of the JSON data never changes the inode/handle being used as the lock.
        This provides local-filesystem coordination only; deployments on a
        network filesystem still need a database or external lock service.
        """
        lock_path = self.data_file.with_name(f"{self.data_file.name}.lock")
        with self._process_thread_lock:
            try:
                lock_file = lock_path.open("a+b")
            except OSError as exc:
                raise WeverseUploadStoreError("無法鎖定 Weverse 上傳工作紀錄。") from exc

            with lock_file:
                try:
                    lock_file.seek(0, os.SEEK_END)
                    if lock_file.tell() == 0:
                        lock_file.write(b"\0")
                        lock_file.flush()
                    lock_file.seek(0)
                    if os.name == "nt":
                        import msvcrt

                        msvcrt.locking(lock_file.fileno(), msvcrt.LK_LOCK, 1)
                    else:
                        import fcntl

                        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
                except OSError as exc:
                    raise WeverseUploadStoreError("無法鎖定 Weverse 上傳工作紀錄。") from exc

                try:
                    yield
                finally:
                    try:
                        lock_file.seek(0)
                        if os.name == "nt":
                            import msvcrt

                            msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
                        else:
                            import fcntl

                            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
                    except OSError:
                        logger.exception("Failed to release Weverse upload store lock %s", lock_path)

    def _ensure_file(self) -> None:
        try:
            self.data_file.parent.mkdir(parents=True, exist_ok=True)
            with self._lock, self._process_file_lock():
                if not self.data_file.exists():
                    atomic_write_json(self.data_file, {})
        except Exception as exc:
            logger.error("Failed to initialize Weverse upload store: %s", exc)

    def _load_all(self) -> Dict[str, Any]:
        if not self.data_file.exists():
            return {}
        try:
            with self.data_file.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, ValueError, UnicodeDecodeError) as exc:
            logger.error("Failed to read Weverse upload store %s", self.data_file, exc_info=True)
            raise WeverseUploadStoreError("無法讀取 Weverse 上傳工作紀錄。") from exc
        if not isinstance(data, dict):
            raise WeverseUploadStoreError("Weverse 上傳工作紀錄格式無效。")
        return data

    def _save_all(self, data: Dict[str, Any]) -> None:
        try:
            atomic_write_json(self.data_file, data)
        except Exception as exc:
            logger.error("Failed to persist Weverse upload store %s", self.data_file, exc_info=True)
            raise WeverseUploadStoreError("無法儲存 Weverse 上傳工作紀錄。") from exc

    def create_task(self, owner_sub: str, task: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new upload task."""
        with self._lock, self._process_file_lock():
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
        with self._lock, self._process_file_lock():
            data = self._load_all()
            return data.get(owner_sub, {}).get("tasks", {}).get(task_id)

    def update_task(self, owner_sub: str, task_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update fields of an ongoing or completed task."""
        with self._lock, self._process_file_lock():
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
        with self._lock, self._process_file_lock():
            data = self._load_all()
            tasks_dict = data.get(owner_sub, {}).get("tasks", {})
            tasks = list(tasks_dict.values())
            tasks.sort(key=lambda t: t.get("created_at", ""), reverse=True)
            return tasks[:limit]

    def mark_active_tasks_interrupted(self) -> int:
        """Mark work left active by a prior process as interrupted without retrying it."""
        active_statuses = {"pending", "uploading_video", "uploading_captions"}
        interrupted_step = "服務重新啟動，無法確認 YouTube 上傳結果。為避免重複建立影片，請先檢查 YouTube Studio。"
        with self._lock, self._process_file_lock():
            data = self._load_all()
            now = _utc_now_iso()
            recovered = 0
            for user_data in data.values():
                if not isinstance(user_data, dict):
                    raise WeverseUploadStoreError("Weverse 上傳工作紀錄格式無效。")
                tasks = user_data.get("tasks", {})
                if not isinstance(tasks, dict):
                    raise WeverseUploadStoreError("Weverse 上傳工作紀錄格式無效。")
                for task in tasks.values():
                    if not isinstance(task, dict):
                        raise WeverseUploadStoreError("Weverse 上傳工作紀錄格式無效。")
                    if task.get("status") in active_statuses:
                        task.update(
                            {
                                "status": "interrupted",
                                "current_step": interrupted_step,
                                "error_message": interrupted_step,
                                "updated_at": now,
                            }
                        )
                        recovered += 1
            if recovered:
                self._save_all(data)
            return recovered

    def record_recent_path(self, owner_sub: str, path: str) -> None:
        """Save a recently scanned folder path."""
        if not path:
            return
        with self._lock, self._process_file_lock():
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
        with self._lock, self._process_file_lock():
            data = self._load_all()
            return data.get(owner_sub, {}).get("recent_paths", [])


weverse_upload_store = WeverseUploadStore()
