import pytest
from fastapi.testclient import TestClient

from backend.app.core.dependencies import require_account_subject
from backend.app.core.notes_store import NotesStore
from backend.app.main import app


@pytest.fixture
def temp_notes_store(tmp_path):
    store_file = tmp_path / "notes.json"
    return NotesStore(path=store_file)


def test_notes_store_crud(temp_notes_store):
    store = temp_notes_store
    sub = "user_123"

    # Initially empty
    assert store.list_notes(sub) == []

    # Create note
    note = store.create_note(sub, content="Hello World", remark="Test Remark", pinned=False)
    assert note["content"] == "Hello World"
    assert note["remark"] == "Test Remark"
    assert note["pinned"] is False
    assert "id" in note
    assert note["created_at"]
    assert note["updated_at"]

    note_id = note["id"]

    # Get note
    fetched = store.get_note(sub, note_id)
    assert fetched is not None
    assert fetched["id"] == note_id
    assert fetched["content"] == "Hello World"

    # Update note
    updated = store.update_note(sub, note_id, content="Updated Content", pinned=True)
    assert updated is not None
    assert updated["content"] == "Updated Content"
    assert updated["remark"] == "Test Remark"
    assert updated["pinned"] is True

    # Delete note
    deleted = store.delete_note(sub, note_id)
    assert deleted is True
    assert store.get_note(sub, note_id) is None
    assert store.list_notes(sub) == []


def test_notes_store_user_isolation(temp_notes_store):
    store = temp_notes_store
    note_a = store.create_note("user_a", content="Secret A", remark="Remark A")
    note_b = store.create_note("user_b", content="Secret B", remark="Remark B")

    assert len(store.list_notes("user_a")) == 1
    assert store.list_notes("user_a")[0]["content"] == "Secret A"
    assert store.get_note("user_a", note_b["id"]) is None

    assert len(store.list_notes("user_b")) == 1
    assert store.list_notes("user_b")[0]["content"] == "Secret B"
    assert store.get_note("user_b", note_a["id"]) is None


def test_notes_store_search_and_ordering(temp_notes_store):
    store = temp_notes_store
    sub = "user_sort"

    n1 = store.create_note(sub, content="Apple banana", remark="Fruits")
    n2 = store.create_note(sub, content="Carrot potato", remark="Vegetables")
    n3 = store.create_note(sub, content="Cherry pie", remark="Dessert", pinned=True)

    # Pinned first
    all_notes = store.list_notes(sub)
    assert len(all_notes) == 3
    assert all_notes[0]["id"] == n3["id"]

    # Search by content
    fruit_search = store.list_notes(sub, query="banana")
    assert len(fruit_search) == 1
    assert fruit_search[0]["id"] == n1["id"]

    # Search by remark
    veg_search = store.list_notes(sub, query="Vegetables")
    assert len(veg_search) == 1
    assert veg_search[0]["id"] == n2["id"]


def test_sticky_notes_api_endpoints(monkeypatch, tmp_path):
    store_file = tmp_path / "notes_api.json"
    custom_store = NotesStore(path=store_file)

    from backend.app.api import notes as notes_api

    monkeypatch.setattr(notes_api, "notes_store", custom_store)

    app.dependency_overrides[require_account_subject] = lambda: "mock_test_subject"
    client = TestClient(app)

    try:
        # 1. List initially empty
        resp = client.get("/api/v1/notes", headers={"Origin": "http://localhost:3000"})
        assert resp.status_code == 200
        assert resp.json()["total"] == 0
        assert resp.json()["notes"] == []

        # 2. Create note
        resp = client.post(
            "/api/v1/notes",
            json={"content": "My API Note", "remark": "Important", "pinned": False},
            headers={"Origin": "http://localhost:3000"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "created"
        note_id = data["note"]["id"]
        assert data["note"]["content"] == "My API Note"
        assert data["note"]["remark"] == "Important"

        # 3. Get note
        resp = client.get(f"/api/v1/notes/{note_id}", headers={"Origin": "http://localhost:3000"})
        assert resp.status_code == 200
        assert resp.json()["note"]["id"] == note_id

        # 4. Update note
        resp = client.put(
            f"/api/v1/notes/{note_id}",
            json={"content": "Edited Content", "pinned": True},
            headers={"Origin": "http://localhost:3000"},
        )
        assert resp.status_code == 200
        assert resp.json()["note"]["content"] == "Edited Content"
        assert resp.json()["note"]["pinned"] is True

        # 5. Delete note
        resp = client.delete(f"/api/v1/notes/{note_id}", headers={"Origin": "http://localhost:3000"})
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True

        # 6. Get deleted note -> 404
        resp = client.get(f"/api/v1/notes/{note_id}", headers={"Origin": "http://localhost:3000"})
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()
