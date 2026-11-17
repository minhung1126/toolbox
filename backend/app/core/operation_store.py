"""Durable operation journal. SQLite transactions claim an account/request/version once.

No provider call occurs inside a database transaction. A claim is never replayed,
including after a crash; uncertain writes require provider reconciliation.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

from backend.app.core.data_paths import data_directory
from backend.app.core.error_contract import http_error

STATES = {"prepared", "running", "completed", "partial", "needs_reconciliation", "failed_before_write"}


class OperationStore:
    def __init__(self, path: Path | None = None):
        self.path = path or data_directory() / "operations.sqlite3"

    @contextmanager
    def transaction(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, timeout=20)
        db.row_factory = sqlite3.Row
        try:
            db.execute("BEGIN IMMEDIATE")
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1):
                raise ValueError("Unsupported operation journal version")
            db.execute(
                "CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, request_id TEXT NOT NULL, digest TEXT NOT NULL, document TEXT NOT NULL, UNIQUE(owner, kind, request_id))"
            )
            db.execute("PRAGMA user_version=1")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def _save(db, operation):
        db.execute(
            "UPDATE operations SET document=? WHERE id=? AND owner=?",
            (json.dumps(operation, ensure_ascii=False), operation["id"], operation["owner"]),
        )

    def claim(self, owner, kind, payload, *, channel_id=None):
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
                "SELECT * FROM operations WHERE owner=? AND kind=? AND request_id=?", (owner, kind, request_id)
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
                return json.loads(row["document"]), False
            operation = {
                "version": 1,
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
            db.execute(
                "INSERT INTO operations VALUES (?, ?, ?, ?, ?, ?)",
                (operation["id"], owner, kind, request_id, digest, json.dumps(operation, ensure_ascii=False)),
            )
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
                backup.execute("PRAGMA user_version").fetchone()[0] != 1
                or backup.execute("PRAGMA integrity_check").fetchone()[0] != "ok"
            ):
                raise ValueError("Invalid operation backup")
            rows = backup.execute("SELECT document FROM operations").fetchall()
            if any(json.loads(row[0]).get("version") != 1 for row in rows):
                raise ValueError("Invalid operation document version")
            with sqlite3.connect(self.path) as target:
                backup.backup(target)
