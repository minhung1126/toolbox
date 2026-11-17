"""Durable operation journal. SQLite transactions claim an account/request/version once.

No provider call occurs inside a database transaction. A claim is never replayed,
including after a crash; uncertain writes require provider reconciliation.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

from backend.app.core.data_paths import data_directory
from backend.app.core.error_contract import http_error
from backend.app.core.youtube_operation_state import change_progress, initial_progress, project_operation, write_targets

STATES = {"prepared", "running", "completed", "partial", "needs_reconciliation", "failed_before_write"}


class OperationStore:
    def __init__(self, path: Path | None = None):
        self.path = path or data_directory() / "operations.sqlite3"
        self.active = set()
        self.active_lock = threading.RLock()

    @contextmanager
    def transaction(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, timeout=20)
        db.row_factory = sqlite3.Row
        try:
            db.execute("BEGIN IMMEDIATE")
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1, 2):
                raise ValueError("Unsupported operation journal version")
            if version < 2:
                self._migrate(db, version)
            db.execute("CREATE TABLE IF NOT EXISTS youtube_projection_meta (version INTEGER PRIMARY KEY)")
            if not db.execute("SELECT 1 FROM youtube_projection_meta WHERE version=1").fetchone():
                for row in db.execute("SELECT document FROM operations ORDER BY rowid").fetchall():
                    project_operation(db, json.loads(row[0]))
                db.execute("INSERT INTO youtube_projection_meta VALUES (1)")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def _migrate(db, version):
        db.execute(
            "CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, request_id TEXT NOT NULL, digest TEXT NOT NULL, document TEXT NOT NULL, UNIQUE(owner, kind, request_id))"
        )
        db.execute("ALTER TABLE operations ADD COLUMN channel_id TEXT")
        db.execute("ALTER TABLE operations ADD COLUMN stage_id TEXT")
        db.execute("CREATE INDEX operation_digest ON operations(owner, kind, digest)")
        db.execute("CREATE INDEX operation_stage ON operations(owner, channel_id, stage_id)")
        db.execute(
            "CREATE TABLE operation_requests (owner TEXT, kind TEXT, request_id TEXT, operation_id TEXT NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(owner, kind, request_id))"
        )
        db.execute(
            "CREATE TABLE youtube_write_targets (owner TEXT, channel_id TEXT, video_id TEXT, operation_id TEXT, PRIMARY KEY(owner, channel_id, video_id, operation_id))"
        )
        db.execute("CREATE INDEX target_operation ON youtube_write_targets(operation_id)")
        db.execute(
            "CREATE TABLE youtube_video_state (owner TEXT, channel_id TEXT, video_id TEXT, document TEXT NOT NULL, PRIMARY KEY(owner, channel_id, video_id))"
        )
        db.execute(
            "CREATE TABLE youtube_cleanup_state (owner TEXT, channel_id TEXT, playlist_id TEXT, playlist_item_id TEXT, document TEXT NOT NULL, PRIMARY KEY(owner, channel_id, playlist_id, playlist_item_id))"
        )
        db.execute(
            "CREATE TABLE operation_executors (id TEXT PRIMARY KEY, process_id INTEGER NOT NULL, heartbeat REAL NOT NULL, state TEXT NOT NULL)"
        )
        for row in db.execute("SELECT * FROM operations").fetchall():
            op = json.loads(row["document"])
            if op.get("version") != 1:
                raise ValueError("Unsupported operation document version")
            stage = (op.get("plan", {}).get("stage_snapshot") or {}).get("stage_id")
            db.execute(
                "UPDATE operations SET channel_id=?, stage_id=? WHERE id=?", (op.get("channel_id"), stage, op["id"])
            )
            db.execute(
                "INSERT INTO operation_requests VALUES (?,?,?,?,?)",
                (op["owner"], op["kind"], op["request_id"], op["id"], row["digest"]),
            )
            OperationStore._sync_targets(db, op)
        db.execute("PRAGMA user_version=2")

    @staticmethod
    def _sync_targets(db, operation):
        db.execute("DELETE FROM youtube_write_targets WHERE operation_id=?", (operation["id"],))
        if operation.get("channel_id"):
            db.executemany(
                "INSERT INTO youtube_write_targets VALUES (?,?,?,?)",
                [
                    (operation["owner"], operation["channel_id"], video_id, operation["id"])
                    for video_id in write_targets(operation)
                ],
            )

    @staticmethod
    def _save(db, operation):
        db.execute(
            "UPDATE operations SET document=? WHERE id=? AND owner=?",
            (json.dumps(operation, ensure_ascii=False), operation["id"], operation["owner"]),
        )
        OperationStore._sync_targets(db, operation)
        project_operation(db, operation)

    def claim(self, owner, kind, payload, *, channel_id=None, progress_plan=None, executor_id=None, acceptance=None):
        original = payload.model_dump(mode="json")
        request_id = original.pop("request_id", None)
        digest = hashlib.sha256(
            json.dumps({"input": original, "channel_id": channel_id}, sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()
        # Old synchronous callers get a deterministic ID for the same signed plan.
        request_id = request_id or digest
        plan = {key: value for key, value in original.items() if key != "preview_token"}
        with self.transaction() as db:
            row = db.execute(
                "SELECT o.document, r.digest FROM operation_requests r JOIN operations o ON o.id=r.operation_id WHERE r.owner=? AND r.kind=? AND r.request_id=?",
                (owner, kind, request_id),
            ).fetchone()
            if row:
                if row["digest"] != digest:
                    raise http_error(409, "operation_input_changed", "同一請求 ID 的輸入版本已變更，請重新預覽。")
                return json.loads(row["document"]), False
            # A different request ID must not bypass a claim for the same confirmed plan.
            row = db.execute(
                "SELECT document FROM operations WHERE owner=? AND kind=? AND digest=?", (owner, kind, digest)
            ).fetchone()
            if row:
                existing = json.loads(row["document"])
                db.execute(
                    "INSERT INTO operation_requests VALUES (?,?,?,?,?)",
                    (owner, kind, request_id, existing["id"], digest),
                )
                return existing, False
            operation = {
                "version": 2,
                "id": str(uuid.uuid4()),
                "owner": owner,
                "kind": kind,
                "request_id": request_id,
                "input_version": digest,
                "channel_id": channel_id,
                "plan": plan,
                "state": "prepared",
                "items": [],
                "result": None,
                "created_at": time.time(),
                "updated_at": time.time(),
            }
            if progress_plan is not None:
                operation["progress"] = initial_progress(progress_plan)
            if executor_id:
                operation["executor_id"] = executor_id
                operation["acceptance"] = acceptance or {}
            for video_id in write_targets(operation):
                if db.execute(
                    "SELECT 1 FROM youtube_write_targets WHERE owner=? AND channel_id=? AND video_id=?",
                    (owner, channel_id, video_id),
                ).fetchone():
                    raise http_error(
                        409, "operation_requires_reconciliation", "此影片已有執行中或待核對的作業，請先核對結果。"
                    )
            stage = (plan.get("stage_snapshot") or {}).get("stage_id")
            db.execute(
                "INSERT INTO operations (id, owner, kind, request_id, digest, document, channel_id, stage_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    operation["id"],
                    owner,
                    kind,
                    request_id,
                    digest,
                    json.dumps(operation, ensure_ascii=False),
                    channel_id,
                    stage,
                ),
            )
            db.execute(
                "INSERT INTO operation_requests VALUES (?,?,?,?,?)", (owner, kind, request_id, operation["id"], digest)
            )
            self._sync_targets(db, operation)
            return operation, True

    def get(self, owner, operation_id):
        with self.transaction() as db:
            row = db.execute("SELECT document FROM operations WHERE owner=? AND id=?", (owner, operation_id)).fetchone()
            if not row:
                raise http_error(404, "operation_not_found", "找不到此作業紀錄。")
            return json.loads(row["document"])

    def list(self, owner):
        with self.transaction() as db:
            rows = db.execute(
                "SELECT document FROM operations WHERE owner=? ORDER BY rowid DESC LIMIT 100", (owner,)
            ).fetchall()
            return [json.loads(row["document"]) for row in rows]

    def update(self, owner, operation_id, change):
        with self.transaction() as db:
            row = db.execute("SELECT document FROM operations WHERE owner=? AND id=?", (owner, operation_id)).fetchone()
            if not row:
                raise http_error(404, "operation_not_found", "找不到此作業紀錄。")
            operation = json.loads(row["document"])
            change(operation)
            if operation["state"] not in STATES:
                raise ValueError("Invalid operation state")
            operation["updated_at"] = time.time()
            self._save(db, operation)
            return operation

    def draft_publish_attempts(self, owner, channel_id):
        """Include all prior attempts, so older uncertain writes cannot be bypassed."""
        with self.transaction() as db:
            rows = db.execute(
                "SELECT document FROM operations WHERE owner=? AND kind='youtube.metadata_publish'", (owner,)
            ).fetchall()
        return [op for row in rows if (op := json.loads(row[0]))["channel_id"] == channel_id]

    def youtube_metadata_attempts(self, owner, channel_id):
        """Read the full history; the recent-operations UI's 100-row limit must not hide successes."""
        with self.transaction() as db:
            rows = db.execute(
                "SELECT document FROM operations WHERE owner=? AND kind IN ('youtube.metadata_update', 'youtube.metadata_publish')",
                (owner,),
            ).fetchall()
        return [op for row in rows if (op := json.loads(row[0])).get("channel_id") == channel_id]

    def backup(self, destination: Path):
        # sqlite backup takes a consistent snapshot, including concurrent committed writes.
        with self.transaction():
            pass
        with sqlite3.connect(self.path) as source, sqlite3.connect(destination) as target:
            source.backup(target)

    def restore(self, source: Path):
        """Offline maintenance only; validate the backup before touching the current journal."""
        with sqlite3.connect(f"file:{source}?mode=ro", uri=True) as backup:
            if (
                backup.execute("PRAGMA user_version").fetchone()[0] not in (1, 2)
                or backup.execute("PRAGMA integrity_check").fetchone()[0] != "ok"
            ):
                raise ValueError("Invalid operation backup")
            rows = backup.execute("SELECT document FROM operations").fetchall()
            if any(json.loads(row[0]).get("version") not in (1, 2) for row in rows):
                raise ValueError("Invalid operation document version")
            with sqlite3.connect(self.path) as target:
                backup.backup(target)

    def find_request(self, owner, channel_id, request_id, *, kind="youtube.metadata_publish"):
        with self.transaction() as db:
            row = db.execute(
                "SELECT o.document FROM operation_requests r JOIN operations o ON o.id=r.operation_id WHERE r.owner=? AND r.kind=? AND r.request_id=? AND o.channel_id=?",
                (owner, kind, request_id, channel_id),
            ).fetchone()
            if not row:
                raise http_error(404, "operation_not_found", "尚未找到此請求的作業紀錄。")
            return json.loads(row[0])

    def find_stage(self, owner, channel_id, stage_id):
        with self.transaction() as db:
            rows = db.execute(
                "SELECT document FROM operations WHERE owner=? AND channel_id=? AND stage_id=? AND kind='youtube.metadata_publish'",
                (owner, channel_id, stage_id),
            ).fetchall()
            if len(rows) != 1:
                raise http_error(
                    409 if rows else 404,
                    "operation_stage_ambiguous" if rows else "operation_not_found",
                    "無法唯一確認此草稿的作業，請保留草稿並至作業紀錄核對。",
                )
            return json.loads(rows[0][0])

    def progress_row(self, owner, operation_id, video_id, **changes):
        return self.update(owner, operation_id, lambda op: change_progress(op, video_id, **changes))

    def assert_targets_available(self, owner, channel_id, video_ids, *, operation_id=None):
        with self.transaction() as db:
            for video_id in video_ids:
                if db.execute(
                    "SELECT 1 FROM youtube_write_targets WHERE owner=? AND channel_id=? AND video_id=? AND operation_id!=?",
                    (owner, channel_id, video_id, operation_id or ""),
                ).fetchone():
                    raise http_error(
                        409, "operation_requires_reconciliation", "此影片已有執行中或待核對作業，請先核對結果。"
                    )

    def executor_alive(self, executor_id):
        with self.transaction() as db:
            row = db.execute("SELECT state FROM operation_executors WHERE id=?", (executor_id,)).fetchone()
            return bool(row and row[0] == "active")

    def existing(self, owner, kind, payload, channel_id):
        original = payload.model_dump(mode="json")
        request_id = original.pop("request_id", None)
        digest = hashlib.sha256(
            json.dumps({"input": original, "channel_id": channel_id}, sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()
        with self.transaction() as db:
            row = db.execute(
                "SELECT o.document, r.digest FROM operation_requests r JOIN operations o ON o.id=r.operation_id WHERE r.owner=? AND r.kind=? AND r.request_id=?",
                (owner, kind, request_id),
            ).fetchone()
            if row and row["digest"] != digest:
                raise http_error(409, "operation_input_changed", "同一請求 ID 的輸入版本已變更，請重新預覽。")
            if not row:
                row = db.execute(
                    "SELECT document FROM operations WHERE owner=? AND kind=? AND digest=?", (owner, kind, digest)
                ).fetchone()
            return json.loads(row["document"]) if row else None

    def recover_lost_executor_jobs(self):
        """Only call while holding the exclusive runner file lock; never replay a write."""
        with self.transaction() as db:
            db.execute("UPDATE operation_executors SET state='lost'")
            rows = db.execute(
                "SELECT document FROM operations WHERE json_extract(document, '$.executor_id') IS NOT NULL AND json_extract(document, '$.state') IN ('prepared','running')"
            ).fetchall()
            for row in rows:
                op = json.loads(row[0])
                for progress_row in (op.get("progress") or {}).get("rows", []):
                    if progress_row["status"] in {"queued", "running"}:
                        change_progress(
                            op,
                            progress_row["video_id"],
                            status="needs_reconciliation" if progress_row["status"] == "running" else "not_attempted",
                            reason="原執行程序已結束；未自動重送。",
                        )
                uncertain = any(
                    row["status"] == "needs_reconciliation" for row in (op.get("progress") or {}).get("rows", [])
                )
                op.update(
                    state="needs_reconciliation"
                    if uncertain
                    else "partial"
                    if op.get("items")
                    else "failed_before_write",
                    updated_at=time.time(),
                )
                self._save(db, op)

    def video_processing_states(self, owner, channel_id, video_ids):
        with self.transaction() as db:
            result = {}
            for video_id in dict.fromkeys(video_ids):
                row = db.execute(
                    "SELECT document FROM youtube_video_state WHERE owner=? AND channel_id=? AND video_id=?",
                    (owner, channel_id, video_id),
                ).fetchone()
                state = json.loads(row[0]) if row else {"video_id": video_id}
                pending = [
                    row[0]
                    for row in db.execute(
                        "SELECT operation_id FROM youtube_write_targets WHERE owner=? AND channel_id=? AND video_id=?",
                        (owner, channel_id, video_id),
                    ).fetchall()
                ]
                state["pending_operations"] = pending
                state["edit_status"] = (
                    "applied"
                    if state.get("person_application")
                    else "unknown"
                    if pending
                    else "not_applied"
                    if state.get("known_not_applied")
                    else "unknown"
                )
                result[video_id] = state
            return result

    def cleanup_states(self, owner, channel_id, playlist_id):
        with self.transaction() as db:
            return [
                json.loads(row[0])
                for row in db.execute(
                    "SELECT document FROM youtube_cleanup_state WHERE owner=? AND channel_id=? AND playlist_id=?",
                    (owner, channel_id, playlist_id),
                ).fetchall()
            ]

    def rebuild_youtube_projections(self):
        with self.transaction() as db:
            db.execute("DELETE FROM youtube_video_state")
            db.execute("DELETE FROM youtube_cleanup_state")
            for row in db.execute("SELECT document FROM operations ORDER BY rowid").fetchall():
                project_operation(db, json.loads(row[0]))
