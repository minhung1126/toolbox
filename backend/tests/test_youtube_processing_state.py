"""Trusted person evidence, observations, reconstruction and item identity."""

import copy

import pytest
from test_youtube_draft_publish import Harness

from backend.app.core.operation_store import OperationStore


def statuses(harness, ids=("one", "two")):
    response = harness.client.post("/api/v1/youtube/video-processing-status", json={"video_ids": list(ids)})
    assert response.status_code == 200, response.text
    return response.json()["statuses"]


@pytest.mark.parametrize("parts", ["snippet", "status", "snippet,status", "unchanged"])
def test_actual_parts_determine_person_evidence_and_unchanged_never_invents_history(tmp_path, parts):
    h = Harness(tmp_path)
    if parts in {"status", "unchanged"}:
        h.provider.videos_by_id["one"]["snippet"].update(title="Applied title", description="Applied description")
    if parts in {"snippet", "unchanged"}:
        h.provider.videos_by_id["one"]["status"]["privacyStatus"] = "public"
    payload, _ = h.preview(h.prepare())
    result = h.publish(payload)
    assert result.status_code == 200, result.text
    state = statuses(h)["one"]
    if parts in {"snippet", "snippet,status"}:
        assert state["edit_status"] == "applied"
        assert state["person_application"]["parts"] == parts.split(",")
        assert state["person_application"]["person_key"] == "Alice"
    else:
        assert state["edit_status"] == "unknown"
        assert not state.get("person_application")
    if parts == "status":
        assert state["public_observation"]["privacy"] == "public"
    if parts == "unchanged":
        assert h.provider.writes == []
    before = copy.deepcopy(state)
    h.store.rebuild_youtube_projections()
    assert statuses(h)["one"] == before
    h.store = OperationStore(h.store.path)
    h.client = h.new_client()
    assert statuses(h)["one"] == before


def test_pending_blocks_new_writes_but_never_erases_confirmed_history(tmp_path):
    h = Harness(tmp_path)
    payload, _ = h.preview(h.prepare())
    assert h.publish(payload).status_code == 200
    old = statuses(h)["one"]["person_application"]
    draft = h.prepare()
    draft["edits"][0]["title"] = "A different final version"
    payload, _ = h.preview(draft)
    h.provider.failures[("primary", "one")] = "timeout_absent"
    assert h.publish(payload).status_code == 200
    state = statuses(h)["one"]
    assert state["person_application"] == old
    assert state["edit_status"] == "applied"
    assert state["pending_operations"]


def test_older_reconciliation_cannot_replace_a_newer_person_application(tmp_path):
    h = Harness(tmp_path)
    payload, _ = h.preview(h.prepare())
    first = h.publish(payload).json()
    old = h.store.get("owner-one", first["operation_id"])
    draft = h.prepare()
    draft["edits"][0]["title"] = "New final title"
    payload, _ = h.preview(draft)
    assert h.publish(payload).status_code == 200
    latest = statuses(h)["one"]["person_application"]
    h.store.update(
        "owner-one", old["id"], lambda op: op.update(reconciliation={"provider_read": True, "matches_intent": False})
    )
    assert statuses(h)["one"]["person_application"] == latest


def test_projection_and_journal_roll_back_together_on_invalid_evidence(tmp_path):
    h = Harness(tmp_path)
    payload, _ = h.preview(h.prepare())
    result = h.publish(payload).json()
    op = h.store.get("owner-one", result["operation_id"])
    before = statuses(h)

    def broken(operation):
        operation["items"][0]["intended"]["title"] = "not committed"
        operation["items"][0]["created_at"] = object()

    with pytest.raises(TypeError):
        h.store.update("owner-one", op["id"], broken)
    assert h.store.get("owner-one", op["id"]) == op
    assert statuses(h) == before


def test_cleanup_projection_is_per_item_and_new_membership_is_independent(tmp_path):
    h = Harness(tmp_path)
    h.provider.videos_by_id["one"]["status"]["privacyStatus"] = "public"
    h.provider.members = ["one"]
    preview = h.client.post("/api/v1/youtube/cleanup-preview", json={"playlist_id": "PLdrafts_test"}).json()
    result = h.client.post(
        "/api/v1/youtube/publish-and-cleanup",
        json={
            "playlist_id": "PLdrafts_test",
            "preview_token": preview["preview_token"],
            "preview_snapshot": preview["preview_snapshot"],
        },
    )
    assert result.status_code == 200, result.text
    states = h.store.cleanup_states("owner-one", "channel-one", "PLdrafts_test")
    assert len(states) == 1 and states[0]["playlist_item_id"] == "item-one" and states[0]["status"] == "removed"
    assert h.store.cleanup_states("other", "channel-one", "PLdrafts_test") == []
    assert h.store.cleanup_states("owner-one", "other", "PLdrafts_test") == []


def test_old_metadata_without_actual_parts_stays_unknown_and_rebuild_is_conservative(tmp_path):
    from types import SimpleNamespace

    h = Harness(tmp_path)
    op, _ = h.store.claim(
        "owner-one",
        "youtube.metadata_update",
        SimpleNamespace(
            model_dump=lambda mode: {
                "request_id": "legacy",
                "assignments": [{"video_id": "one", "person": "Alice"}],
                "preview_snapshot": {"plan": [{"video_id": "one", "newTitle": "Final", "newDescription": "Text"}]},
            }
        ),
        channel_id="channel-one",
    )
    h.store.update(
        "owner-one",
        op["id"],
        lambda operation: operation.update(
            state="completed",
            items=[
                {
                    "phase": "metadata",
                    "remote_id": "one",
                    "state": "completed",
                    "intended": {"title": "Final", "description": "Text"},
                    "evidence": {"provider_returned": True},
                }
            ],
        ),
    )
    h.store.rebuild_youtube_projections()
    assert statuses(h)["one"]["edit_status"] == "unknown"


def test_line_endings_alone_do_not_create_an_unnecessary_write(tmp_path):
    h = Harness(tmp_path)
    h.rows[0]["Description"] = "a\nb\n"
    h.provider.videos_by_id["one"]["snippet"].update(title="Applied title", description="a\r\nb\r\n")
    h.provider.videos_by_id["one"]["status"]["privacyStatus"] = "public"
    payload, preview = h.preview(h.prepare())
    assert preview["plan"][0]["parts"] == []
    assert h.publish(payload).json()["unchanged_count"] == 1
    assert h.provider.writes == []
