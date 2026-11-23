"""Migration, conflict protection and progress invariants at the SQLite boundary."""

import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from pydantic import BaseModel

from backend.app.core.operation_store import OperationStore
from backend.app.core.youtube_operation_state import content_fingerprint, initial_progress


class Input(BaseModel):
    request_id: str = "request"
    preview_token: str = "signed"
    edits: list[dict] = [{"video_id": "one", "skip": False}]


def claim(store, payload=None, **kwargs):
    return store.claim("owner", "youtube.metadata_publish", payload or Input(), channel_id="channel", **kwargs)


def test_v1_upgrade_preserves_journal_and_protects_legacy_unknown_targets(tmp_path):
    path = tmp_path / "operations.sqlite3"
    op = {
        "version": 1,
        "id": "legacy",
        "owner": "owner",
        "channel_id": "channel",
        "kind": "youtube.metadata_publish",
        "request_id": "old",
        "state": "needs_reconciliation",
        "plan": {"edits": [{"video_id": "one"}]},
        "items": [{"remote_id": "one", "state": "needs_reconciliation"}],
    }
    with sqlite3.connect(path) as db:
        db.execute(
            "CREATE TABLE operations (id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, request_id TEXT NOT NULL, digest TEXT NOT NULL, document TEXT NOT NULL, UNIQUE(owner, kind, request_id))"
        )
        db.execute(
            "INSERT INTO operations VALUES (?,?,?,?,?,?)",
            ("legacy", "owner", op["kind"], "old", "digest", json.dumps(op)),
        )
        db.execute("PRAGMA user_version=1")
    for _ in range(2):
        store = OperationStore(path)
        assert store.get("owner", "legacy") == op
        with pytest.raises(HTTPException) as error:
            claim(store)
        assert error.value.status_code == 409
    assert store.find_request("owner", "channel", "old")["id"] == "legacy"
    with sqlite3.connect(path) as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 2


def test_different_previews_cannot_race_to_same_video_and_scopes_are_independent(tmp_path):
    path = tmp_path / "journal.sqlite3"

    def submit(index):
        try:
            return claim(OperationStore(path), Input(request_id=str(index), preview_token=str(index)))[1]
        except HTTPException as exc:
            assert exc.status_code == 409
            return False

    with ThreadPoolExecutor(max_workers=8) as pool:
        assert sum(pool.map(submit, range(16))) == 1
    store = OperationStore(path)
    assert len(store.list("owner")) == 1
    assert store.claim("other", "youtube.metadata_publish", Input(), channel_id="channel")[1]
    assert store.claim("owner", "youtube.metadata_publish", Input(request_id="other-channel"), channel_id="different")[
        1
    ]


def test_progress_counts_revisions_and_atomic_reservation_release(tmp_path):
    store = OperationStore(tmp_path / "operations.sqlite3")
    operation, _ = claim(store, progress_plan=[{"video_id": "one", "title": "final", "description": "text"}])
    assert operation["items"] == []
    progress = operation["progress"]
    assert sum(progress["counts"].values()) == progress["total"] == 1
    updated = store.progress_row(
        "owner", operation["id"], "one", status="needs_reconciliation", attempted_parts=["snippet"]
    )
    assert updated["progress"]["revision"] == 2
    with pytest.raises(ValueError):
        store.progress_row("owner", operation["id"], "one", status="invalid")
    assert store.get("owner", operation["id"])["progress"] == updated["progress"]
    with pytest.raises(HTTPException):
        claim(store, Input(request_id="new", preview_token="new"))
    store.progress_row("owner", operation["id"], "one", status="succeeded", confirmation="provider_response")
    assert claim(store, Input(request_id="new", preview_token="new"))[1]


def test_request_alias_and_exact_lookup_beyond_recent_100(tmp_path):
    store = OperationStore(tmp_path / "operations.sqlite3")
    original, _ = claim(store)
    alias, created = claim(store, Input(request_id="alias"))
    assert not created and alias["id"] == original["id"]
    for i in range(105):
        store.claim("owner", "test", Input(request_id=str(i), preview_token=str(i)))
    assert all(op["id"] != original["id"] for op in store.list("owner"))
    assert store.find_request("owner", "channel", "alias")["id"] == original["id"]
    with pytest.raises(HTTPException):
        store.find_request("owner", "different", "alias")


def test_backup_restores_v2_progress_and_unknown_schema_is_rejected(tmp_path):
    store = OperationStore(tmp_path / "operations.sqlite3")
    op, _ = claim(store, progress_plan=[{"video_id": "one"}])
    backup = tmp_path / "backup.sqlite3"
    store.backup(backup)
    store.progress_row("owner", op["id"], "one", status="succeeded")
    store.restore(backup)
    assert store.get("owner", op["id"])["progress"]["counts"]["queued"] == 1
    with sqlite3.connect(backup) as db:
        db.execute("PRAGMA user_version=99")
    with pytest.raises(ValueError):
        OperationStore(backup).list("owner")
    with pytest.raises(ValueError):
        store.restore(backup)


def test_content_fingerprint_only_normalizes_line_endings_and_counts_reject_unknown():
    assert content_fingerprint("title", "a\r\nb\r") == content_fingerprint("title", "a\nb\n")
    assert content_fingerprint("title", " a") != content_fingerprint("title", "a")
    assert content_fingerprint("title", "a\n\nb") != content_fingerprint("title", "a\nb")
    with pytest.raises(ValueError):
        initial_progress([{"video_id": "one"}, {"video_id": "one"}])
