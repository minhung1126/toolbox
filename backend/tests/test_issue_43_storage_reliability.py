import json
import os
import sqlite3
import stat
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api import notes as notes_api
from backend.app.core import persistence as persistence_module
from backend.app.core import system_secrets as secrets_module
from backend.app.core.config import Settings
from backend.app.core.credential_store import CredentialStore
from backend.app.core.dependencies import require_account_subject
from backend.app.core.notes_store import (
    MAX_NOTES_PER_USER,
    NoteLimitError,
    NotesStore,
)
from backend.app.core.operation_store import EXECUTOR_HEARTBEAT_TTL_SECONDS, OperationStore
from backend.app.core.runtime_config import RuntimeConfig
from backend.app.core.session_store import SessionStore
from backend.app.core.system_secrets import SystemSecretsManager
from backend.app.main import create_app
from backend.app.services.operation_journal import public_operation
from backend.app.services.sheets_service import get_spreadsheet_metadata
from backend.app.services.youtube_publish_jobs import YouTubePublishRunner
from backend.app.tools.registry import ToolRegistry


def test_session_store_get_rejects_expired_before_decrypt_and_normalizes_naive_iso(tmp_path, monkeypatch):
    path = tmp_path / "sessions.json"
    store = SessionStore(path, encryption_key="test-key")
    sid_active = store.create({"user": {"sub": "u1", "email": "active@example.test"}}, max_age=3600)
    sid_expired = store.create({"user": {"sub": "u2", "email": "expired@example.test"}}, max_age=3600)
    sid_naive_expired = store.create({"user": {"sub": "u3", "email": "naive-exp@example.test"}}, max_age=3600)
    sid_naive_active = store.create({"user": {"sub": "u4", "email": "naive-ok@example.test"}}, max_age=3600)

    # Inject expired + naive ISO timestamps directly into persisted file and reload
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["sessions"][sid_expired]["expires_at"] = (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat()
    raw["sessions"][sid_naive_expired]["expires_at"] = (
        (datetime.now(timezone.utc) - timedelta(seconds=5)).replace(tzinfo=None).isoformat()
    )
    raw["sessions"][sid_naive_active]["expires_at"] = (
        (datetime.now(timezone.utc) + timedelta(hours=1)).replace(tzinfo=None).isoformat()
    )
    path.write_text(json.dumps(raw), encoding="utf-8")

    # Test get() checks expiry BEFORE decrypt even inside the 5-minute purge interval
    reloaded = SessionStore(path, encryption_key="test-key")
    reloaded._ensure_loaded()
    reloaded._last_purge_time = time.monotonic()  # prevent _maybe_purge_expired() from running

    decrypt_calls = []
    original_get_fernet = reloaded._get_fernet

    def tracked_fernet():
        fernet = original_get_fernet()

        class ProxyFernet:
            def decrypt(self, token):
                decrypt_calls.append(token)
                return fernet.decrypt(token)

        return ProxyFernet()

    monkeypatch.setattr(reloaded, "_get_fernet", tracked_fernet)
    save_calls = []
    monkeypatch.setattr(reloaded, "_save", lambda: save_calls.append(True))

    assert reloaded.get(sid_expired) is None
    assert reloaded.get(sid_naive_expired) is None
    assert decrypt_calls == []
    assert save_calls == []  # No disk write forced on read path

    assert reloaded.get(sid_naive_active)["user"]["sub"] == "u4"
    assert reloaded.get(sid_active)["user"]["sub"] == "u1"
    assert len(decrypt_calls) == 2

    # delete_by_email ignores expired sessions without raising TypeError on naive timestamps
    assert reloaded.delete_by_email("expired@example.test") == 0
    assert reloaded.delete_by_email("naive-ok@example.test") == 1


def test_operation_store_wal_permissions_read_write_separation_and_closing(tmp_path):
    db_path = tmp_path / "ops.sqlite3"
    store = OperationStore(db_path)
    # Lazy init: must NOT touch disk during __init__
    assert not db_path.exists()

    payload = SimpleNamespace(model_dump=lambda mode="json": {"request_id": "req-1", "title": "T"})
    op, created = store.claim("owner-1", "youtube.metadata_update", payload, channel_id="chan-1")
    assert created is True
    assert db_path.exists()

    if os.name != "nt":
        assert stat.S_IMODE(db_path.stat().st_mode) == 0o600

    with sqlite3.connect(db_path) as raw:
        mode = raw.execute("PRAGMA journal_mode").fetchone()[0]
        assert str(mode).lower() == "wal"

    # Read connection enforces PRAGMA query_only = ON
    with store._read_connection() as rdb:
        assert rdb.execute("PRAGMA query_only").fetchone()[0] == 1
        with pytest.raises(sqlite3.OperationalError):
            rdb.execute("DELETE FROM operations")

    assert store.get("owner-1", op["id"])["id"] == op["id"]

    # Read-only queries succeed without blocking even while an external connection holds BEGIN IMMEDIATE
    ext_conn = sqlite3.connect(db_path, timeout=0.1)
    try:
        ext_conn.execute("BEGIN IMMEDIATE")
        assert store.get("owner-1", op["id"])["id"] == op["id"]
        assert store.executor_alive("missing-exec") is False
    finally:
        ext_conn.rollback()
        ext_conn.close()

    # backup() and restore() must close all SQLite handles (unlink works immediately on Windows)
    backup_path = tmp_path / "ops-backup.sqlite3"
    store.backup(backup_path)
    assert backup_path.exists()

    restored_store = OperationStore(tmp_path / "restored.sqlite3")
    restored_store.restore(backup_path)
    assert restored_store._initialized is False
    assert restored_store.get("owner-1", op["id"])["id"] == op["id"]

    backup_path.unlink()
    assert not backup_path.exists()


def test_operation_store_executor_alive_checks_heartbeat_freshness(tmp_path):
    store = OperationStore(tmp_path / "ops.sqlite3")
    now = time.time()
    with store.transaction() as db:
        db.execute("INSERT INTO operation_executors VALUES (?,?,?,'active')", ("exec-fresh", 1, now))
        db.execute(
            "INSERT INTO operation_executors VALUES (?,?,?,'active')",
            ("exec-stale", 2, now - EXECUTOR_HEARTBEAT_TTL_SECONDS - 5.0),
        )

    assert store.executor_alive("exec-fresh") is True
    assert store.executor_alive("exec-stale") is False

    op = {"id": "op-1", "owner": "u1", "state": "running", "executor_id": "exec-stale"}
    assert public_operation(op, store)["state"] == "needs_reconciliation"


def test_publish_runner_heartbeat_and_shutdown_resilience(tmp_path, monkeypatch):
    store = OperationStore(tmp_path / "ops.sqlite3")
    runner = YouTubePublishRunner(store, runtime=None, capacity=2, shutdown_timeout=1)

    # _heartbeat() survives transient OperationalError without terminating thread
    calls = []
    wait_calls = 0

    def fake_wait(_interval):
        nonlocal wait_calls
        wait_calls += 1
        return wait_calls > 2

    def flaky_transaction():
        calls.append("tx")
        raise sqlite3.OperationalError("database is locked")

    monkeypatch.setattr(runner.stop_event, "wait", fake_wait)
    monkeypatch.setattr(store, "transaction", flaky_transaction)
    runner._heartbeat()
    assert len(calls) == 2

    # shutdown() drains queue in try/except/finally, always releases capacity & sets stop_event
    monkeypatch.undo()
    runner2 = YouTubePublishRunner(store, runtime=None, capacity=2, shutdown_timeout=1)
    assert runner2.capacity.acquire(blocking=False)
    assert runner2.capacity.acquire(blocking=False)
    runner2.queue.put(("owner-1", "missing-op-id-1"))
    runner2.queue.put(("owner-1", "missing-op-id-2"))

    runner2.shutdown()
    assert runner2.stop_event.is_set() is True
    assert runner2.queue.empty() is True
    # Both capacity slots were released despite Store get() raising HTTPException 404
    assert runner2.capacity.acquire(blocking=False) is True
    assert runner2.capacity.acquire(blocking=False) is True


def test_persistence_uses_0600_os_open_and_fsync_by_default(tmp_path, monkeypatch):
    opened = []
    synced = []
    original_open = os.open
    original_fsync = os.fsync

    def spy_open(path, flags, mode=0o777, *args, **kwargs):
        opened.append((str(path), flags, mode))
        return original_open(path, flags, mode, *args, **kwargs)

    def spy_fsync(fd):
        synced.append(fd)
        return original_fsync(fd)

    monkeypatch.setattr(persistence_module.os, "open", spy_open)
    monkeypatch.setattr(persistence_module.os, "fsync", spy_fsync)

    json_path = tmp_path / "secret.json"
    persistence_module.atomic_write_json(json_path, {"ok": True})
    text_path = tmp_path / ".setup_pin"
    persistence_module.atomic_write_text(text_path, "123456")

    assert len(opened) == 2
    for _, flags, mode in opened:
        assert flags & os.O_WRONLY
        assert flags & os.O_CREAT
        assert flags & os.O_EXCL
        assert mode == 0o600
    assert len(synced) == 2

    # SystemSecretsManager, RuntimeConfig, CredentialStore, SessionStore all flush via fsync=True
    fsync_args = []
    orig_write_json = persistence_module.atomic_write_json
    orig_write_text = persistence_module.atomic_write_text

    def rec_json(path, data, **kwargs):
        fsync_args.append(("json", path.name, kwargs.get("fsync")))
        return orig_write_json(path, data, **kwargs)

    def rec_text(path, content, **kwargs):
        fsync_args.append(("text", path.name, kwargs.get("fsync")))
        return orig_write_text(path, content, **kwargs)

    monkeypatch.setattr(secrets_module, "atomic_write_json", rec_json)
    monkeypatch.setattr(secrets_module, "atomic_write_text", rec_text)

    mgr = SystemSecretsManager(tmp_path / "sec")
    mgr.get_or_create_master_keys()
    mgr.update_credentials({"google_client_id": "cid", "google_client_secret": "csec"})
    pin = mgr.get_or_create_setup_pin()
    mgr.verify_setup_pin("000000")
    assert mgr.verify_setup_pin(pin)

    assert ("json", ".secrets.json", True) in fsync_args
    assert ("json", "system_credentials.json", True) in fsync_args
    assert ("text", ".setup_pin", True) in fsync_args
    assert ("text", ".setup_pin.attempts", True) in fsync_args

    # Core stores pass fsync=True
    rt = RuntimeConfig(tmp_path / "runtime.json")
    cs = CredentialStore(tmp_path / "creds.json", encryption_key="k")
    ss = SessionStore(tmp_path / "sessions.json", encryption_key="k")
    store_fsync = []
    for mod in (
        __import__("backend.app.core.runtime_config", fromlist=["atomic_write_json"]),
        __import__("backend.app.core.credential_store", fromlist=["atomic_write_json"]),
        __import__("backend.app.core.session_store", fromlist=["atomic_write_json"]),
    ):
        monkeypatch.setattr(mod, "atomic_write_json", lambda p, d, **kw: store_fsync.append((p.name, kw.get("fsync"))))
    rt._save()
    cs._save()
    ss._save()
    assert store_fsync == [("runtime.json", True), ("creds.json", True), ("sessions.json", True)]


def test_notes_store_caps_and_api_query_max_length(tmp_path):
    store = NotesStore(tmp_path / "notes.json")
    test_app = FastAPI()
    test_app.state.notes_store = store
    test_app.include_router(notes_api.router)
    test_app.dependency_overrides[require_account_subject] = lambda: "capped-user"
    client = TestClient(test_app)

    # Oversized single template note (> MAX_NOTE_PAYLOAD_BYTES) is rejected cleanly on create & update
    oversized_vars = {f"v{i}": "x" * 18_000 for i in range(10)}
    with pytest.raises(NoteLimitError) as exc_info:
        store.create_note("capped-user", content="tpl", note_type="template", variables=oversized_vars)
    assert exc_info.value.code == "note_payload_too_large"

    resp = client.post(
        "/notes",
        json={"content": "tpl", "note_type": "template", "variables": oversized_vars},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "note_payload_too_large"

    # Update rejection must NOT mutate in-memory or persisted note
    created = client.post("/notes", json={"content": "small", "note_type": "template", "variables": {"a": "1"}}).json()[
        "note"
    ]
    bad_update = client.put(
        f"/notes/{created['id']}",
        json={"content": "changed", "variables": oversized_vars},
    )
    assert bad_update.status_code == 400
    assert bad_update.json()["detail"]["code"] == "note_payload_too_large"
    assert store.get_note("capped-user", created["id"])["content"] == "small"
    assert NotesStore(tmp_path / "notes.json").get_note("capped-user", created["id"])["content"] == "small"

    # Per-user note count cap
    for i in range(MAX_NOTES_PER_USER - 1):
        store.create_note("capped-user", content=f"n{i}")
    resp_cap = client.post("/notes", json={"content": "overflow"})
    assert resp_cap.status_code == 400
    assert resp_cap.json()["detail"]["code"] == "note_count_limit_exceeded"

    # Search query max_length=200
    assert client.get("/notes", params={"q": "a" * 200}).status_code == 200
    assert client.get("/notes", params={"q": "a" * 201}).status_code == 422

    # Per-user total storage cap (MAX_USER_NOTES_TOTAL_BYTES = 4 MiB)
    test_app.dependency_overrides[require_account_subject] = lambda: "storage-capped-user"
    chunk_vars = {f"v{i}": "x" * 19_000 for i in range(5)}
    small_note = store.create_note("storage-capped-user", content="seed", note_type="template", variables={"k": "v"})
    for idx in range(36):
        store.create_note(
            "storage-capped-user",
            content=f"n{idx}-" + ("x" * 19_000),
            note_type="template",
            variables=chunk_vars,
        )

    with pytest.raises(NoteLimitError) as total_exc:
        store.create_note(
            "storage-capped-user",
            content="overflow-" + ("x" * 19_000),
            note_type="template",
            variables=chunk_vars,
        )
    assert total_exc.value.code == "notes_storage_limit_exceeded"

    post_overflow = client.post(
        "/notes",
        json={"content": "overflow-" + ("x" * 19_000), "note_type": "template", "variables": chunk_vars},
    )
    assert post_overflow.status_code == 400
    assert post_overflow.json()["detail"]["code"] == "notes_storage_limit_exceeded"

    put_overflow = client.put(
        f"/notes/{small_note['id']}",
        json={"content": "expanded-" + ("x" * 19_000), "variables": chunk_vars},
    )
    assert put_overflow.status_code == 400
    assert put_overflow.json()["detail"]["code"] == "notes_storage_limit_exceeded"
    assert store.get_note("storage-capped-user", small_note["id"])["content"] == "seed"


def test_sheets_metadata_uses_single_batch_get_for_all_sheets(monkeypatch):
    batch_calls = []
    get_calls = []

    class FakeValues:
        def get(self, **kwargs):
            get_calls.append(kwargs)
            raise AssertionError("Per-sheet values().get() must not be called by get_spreadsheet_metadata")

        def batchGet(self, **kwargs):
            batch_calls.append(kwargs)
            return SimpleNamespace(
                execute=lambda: {
                    "valueRanges": [
                        {"range": "'Sheet 1'!1:1", "values": [["所屬團體", "人", ""]]},
                        {"range": "'Empty'!1:1"},  # Google omits "values" for empty sheets
                        {"range": "'O''Reilly'!1:1", "values": [["ColA", "ColB"]]},
                    ]
                }
            )

    fake_service = SimpleNamespace(
        spreadsheets=lambda: SimpleNamespace(
            get=lambda **kwargs: SimpleNamespace(
                execute=lambda: {
                    "properties": {"title": "My Book"},
                    "sheets": [
                        {"properties": {"title": "Sheet 1"}},
                        {"properties": {"title": "Empty"}},
                        {"properties": {"title": "O'Reilly"}},
                    ],
                }
            ),
            values=lambda: FakeValues(),
        )
    )
    monkeypatch.setattr("backend.app.services.sheets_service.get_sheets_service", lambda creds: fake_service)

    result = get_spreadsheet_metadata(object(), "https://docs.google.com/spreadsheets/d/abc123/edit")
    assert len(get_calls) == 0
    assert len(batch_calls) == 1
    assert batch_calls[0]["spreadsheetId"] == "abc123"
    assert batch_calls[0]["ranges"] == ["'Sheet 1'!1:1", "'Empty'!1:1", "'O''Reilly'!1:1"]
    assert result == {
        "spreadsheet_id": "abc123",
        "spreadsheet_title": "My Book",
        "worksheets": [
            {"title": "Sheet 1", "columns": ["所屬團體", "人"]},
            {"title": "Empty", "columns": []},
            {"title": "O'Reilly", "columns": ["ColA", "ColB"]},
        ],
    }


def test_sheets_metadata_handles_empty_or_null_sheets_and_truncated_value_ranges(monkeypatch):
    batch_calls = []

    def make_service(sheets_value, batch_response=None):
        class FakeValues:
            def get(self, **kwargs):
                raise AssertionError("Per-sheet values().get() must not be called")

            def batchGet(self, **kwargs):
                batch_calls.append(kwargs)
                return SimpleNamespace(execute=lambda: batch_response)

        return SimpleNamespace(
            spreadsheets=lambda: SimpleNamespace(
                get=lambda **kwargs: SimpleNamespace(
                    execute=lambda: {"properties": {"title": "Edge Book"}, "sheets": sheets_value}
                ),
                values=lambda: FakeValues(),
            )
        )

    # sheets: [] and sheets: None must skip batchGet and return worksheets == []
    for empty_sheets in ([], None):
        monkeypatch.setattr(
            "backend.app.services.sheets_service.get_sheets_service",
            lambda creds, s=empty_sheets: make_service(s),
        )
        res = get_spreadsheet_metadata(object(), "abc123")
        assert res == {"spreadsheet_id": "abc123", "spreadsheet_title": "Edge Book", "worksheets": []}
        assert batch_calls == []

    # Missing or truncated valueRanges safely yields columns: [] for trailing worksheets
    monkeypatch.setattr(
        "backend.app.services.sheets_service.get_sheets_service",
        lambda creds: make_service(
            [{"properties": {"title": "First"}}, {"properties": {"title": "Second"}}],
            batch_response={"valueRanges": [{"values": [["Col1"]]}]},
        ),
    )
    truncated = get_spreadsheet_metadata(object(), "abc123")
    assert truncated["worksheets"] == [
        {"title": "First", "columns": ["Col1"]},
        {"title": "Second", "columns": []},
    ]

    monkeypatch.setattr(
        "backend.app.services.sheets_service.get_sheets_service",
        lambda creds: make_service(
            [{"properties": {"title": "Only"}}],
            batch_response=None,
        ),
    )
    missing_vr = get_spreadsheet_metadata(object(), "abc123")
    assert missing_vr["worksheets"] == [{"title": "Only", "columns": []}]

    monkeypatch.setattr(
        "backend.app.services.sheets_service.get_sheets_service",
        lambda creds: make_service(
            [{"properties": {"title": "Only"}}],
            batch_response={"valueRanges": None},
        ),
    )
    null_vr = get_spreadsheet_metadata(object(), "abc123")
    assert null_vr["worksheets"] == [{"title": "Only", "columns": []}]

    monkeypatch.setattr(
        "backend.app.services.sheets_service.get_sheets_service",
        lambda creds: make_service(
            [{"properties": {"title": "First"}}, {"properties": {"title": "Second"}}],
            batch_response={"valueRanges": [{"values": None}, None]},
        ),
    )
    null_values = get_spreadsheet_metadata(object(), "abc123")
    assert null_values["worksheets"] == [
        {"title": "First", "columns": []},
        {"title": "Second", "columns": []},
    ]


def test_operation_store_secures_wal_sidecars_while_connection_is_open(tmp_path, monkeypatch):
    from pathlib import Path

    from backend.app.core import operation_store as operation_store_module

    chmod_calls = []
    original_secure_chmod = operation_store_module.secure_chmod

    def spy_secure_chmod(path, mode=0o600):
        target = Path(path)
        chmod_calls.append((target.name, mode, target.exists()))
        return original_secure_chmod(path, mode)

    monkeypatch.setattr(operation_store_module, "secure_chmod", spy_secure_chmod)

    db_path = tmp_path / "ops.sqlite3"
    store = OperationStore(db_path)

    payload = SimpleNamespace(model_dump=lambda mode="json": {"request_id": "req-wal", "title": "T"})
    op, created = store.claim("owner-1", "youtube.metadata_update", payload, channel_id="chan-1")
    assert created is True
    assert ("ops.sqlite3-wal", 0o600, True) in chmod_calls
    assert ("ops.sqlite3-shm", 0o600, True) in chmod_calls

    chmod_calls.clear()
    with store.transaction() as db:
        assert ("ops.sqlite3-wal", 0o600, True) in chmod_calls
        assert ("ops.sqlite3-shm", 0o600, True) in chmod_calls
        db.execute("SELECT 1").fetchone()

    chmod_calls.clear()
    assert store.get("owner-1", op["id"])["id"] == op["id"]
    assert ("ops.sqlite3-wal", 0o600, True) in chmod_calls
    assert ("ops.sqlite3-shm", 0o600, True) in chmod_calls


def test_system_health_endpoint_uses_app_scoped_tool_registry(tmp_path):
    custom_registry = ToolRegistry()

    class BrokenTool:
        @property
        def metadata(self):
            return SimpleNamespace(
                id="custom-broken-tool",
                name="Custom Broken Tool",
                status="active",
                routes=[],
                required_scopes=[],
            )

        @property
        def router(self):
            return None

        def health_check(self):
            return {"status": "error", "error": "CustomFailure"}

    custom_registry.register(BrokenTool())
    config = Settings(
        _env_file=None,
        runtime_store=RuntimeConfig(tmp_path / "runtime.json"),
        secrets_store=SystemSecretsManager(tmp_path),
    )
    app = create_app(app_settings=config, registry=custom_registry)
    client = TestClient(app)

    res = client.get("/api/v1/system/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "degraded"
    assert "custom-broken-tool" in body["tools"]
    assert body["tools"]["custom-broken-tool"]["status"] == "error"
