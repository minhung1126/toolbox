import json
from concurrent.futures import ThreadPoolExecutor
from importlib import import_module

import pytest


@pytest.fixture(params=["session", "credential"])
def repository(request, tmp_path):
    module = import_module(f"backend.app.core.{request.param}_store")
    factory = module.SessionStore if request.param == "session" else module.CredentialStore
    path = tmp_path / "store.json"

    def write(store, value):
        if request.param == "session":
            return store.create({"value": value})
        store.save_google_connection({"token": value}, owner_sub=value)
        return value

    def read(store, key):
        return store.get(key) if request.param == "session" else store.get_google_credentials(key)

    def delete(store, key):
        return store.delete(key) if request.param == "session" else store.clear_google(key)

    return module, lambda: factory(path, encryption_key="test-key"), path, write, read, delete


def test_construction_does_not_read_and_first_write_preserves_existing_records(repository, monkeypatch):
    module, factory, path, write, read, _ = repository
    key = write(factory(), "existing")
    original = module.read_json_file
    calls = []

    def observe(*args, **kwargs):
        calls.append(args[0])
        return original(*args, **kwargs)

    monkeypatch.setattr(module, "read_json_file", observe)
    store = factory()
    assert calls == []
    new_key = write(store, "new")
    assert calls == [path]
    assert read(store, key) is not None
    reloaded = factory()
    assert read(reloaded, key) is not None
    assert read(reloaded, new_key) is not None


@pytest.mark.parametrize("raw", ["{broken-json", "null", "[]", "{}"])
def test_corrupt_store_is_not_overwritten_and_recovery_can_retry(repository, raw):
    _, factory, path, write, read, _ = repository
    key = write(factory(), "existing")
    original = path.read_bytes()
    path.write_text(raw, encoding="utf-8")
    store = factory()
    with pytest.raises(ValueError):
        write(store, "new")
    assert path.read_text(encoding="utf-8") == raw
    path.write_bytes(original)
    assert read(store, key) is not None


def test_failed_reads_retry_and_failed_writes_do_not_publish_cached_mutations(repository, monkeypatch):
    module, factory, path, write, read, delete = repository
    key = write(factory(), "existing")
    before = path.read_bytes()
    store = factory()

    def fail(*args, **kwargs):
        raise PermissionError("denied test storage")

    with monkeypatch.context() as patch:
        patch.setattr(module, "read_json_file", fail)
        with pytest.raises(PermissionError):
            read(store, key)
    assert read(store, key) is not None
    with monkeypatch.context() as patch:
        patch.setattr(module, "atomic_write_json", fail)
        with pytest.raises(PermissionError):
            delete(store, key)
    assert read(store, key) is not None
    assert path.read_bytes() == before
    with monkeypatch.context() as patch:
        patch.setattr(module, "atomic_write_json", fail)
        with pytest.raises(PermissionError):
            write(store, "failed-new")
    # The next successful mutation must not persist the earlier failed insertion.
    write(store, "successful-new")
    persisted = json.loads(path.read_text(encoding="utf-8"))
    if "users" in persisted:
        assert read(factory(), "failed-new") is None
    else:
        assert len(persisted["sessions"]) == 2


def test_concurrent_first_writes_load_once_without_losing_existing_records(repository, monkeypatch):
    module, factory, _, write, read, _ = repository
    existing = write(factory(), "existing")
    store = factory()
    original = module.read_json_file
    calls = []

    def observe(*args, **kwargs):
        calls.append(1)
        return original(*args, **kwargs)

    monkeypatch.setattr(module, "read_json_file", observe)
    with ThreadPoolExecutor(max_workers=4) as pool:
        keys = list(pool.map(lambda value: write(store, str(value)), range(8)))
    assert len(calls) == 1
    reloaded = factory()
    assert all(read(reloaded, key) is not None for key in [existing, *keys])
