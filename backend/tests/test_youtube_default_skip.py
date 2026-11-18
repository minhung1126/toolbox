"""Default skip requires historical person evidence AND matching fresh remote state."""

import pytest
from test_youtube_draft_publish import Harness


@pytest.fixture
def applied(tmp_path):
    h = Harness(tmp_path)
    payload, _ = h.preview(h.prepare())
    assert h.publish(payload).status_code == 200
    return h


def test_same_person_text_and_public_can_be_reversibly_skipped(applied):
    h = applied
    draft = h.prepare()
    row = draft["stage_snapshot"]["plan"][0]
    assert row["status"] == "ready" and row["default_skip"] and row["can_reinclude"]
    # Force including this otherwise unchanged target still costs no writes.
    payload, preview = h.preview(draft)
    assert preview["plan"][0]["status"] == "unchanged"
    before = len(h.provider.writes)
    assert h.publish(payload).status_code == 200
    assert len(h.provider.writes) == before


@pytest.mark.parametrize("change", ["template", "remote_text", "private", "unlisted", "person"])
def test_changed_targets_or_remote_state_are_never_silently_excluded(applied, change):
    h = applied
    people = ("Alice", "不編輯")
    if change == "template":
        h.rows[0]["Title"] = "New template title"
    elif change == "remote_text":
        h.provider.videos_by_id["one"]["snippet"]["title"] = "Edited on YouTube"
    elif change in {"private", "unlisted"}:
        h.provider.videos_by_id["one"]["status"]["privacyStatus"] = change
    else:
        h.rows.append({**h.rows[0], "人": "Bob"})
        people = ("Bob", "不編輯")
    draft = h.prepare(people=people)
    assert draft["stage_snapshot"]["plan"][0]["default_skip"] is False
    _, preview = h.preview(draft)
    if change in {"private", "unlisted"}:
        assert preview["plan"][0]["parts"] == ["status"]


def test_public_matching_text_without_trusted_history_is_not_default_skipped(tmp_path):
    h = Harness(tmp_path)
    h.provider.videos_by_id["one"]["snippet"].update(title="Applied title", description="Applied description")
    h.provider.videos_by_id["one"]["status"]["privacyStatus"] = "public"
    assert not h.prepare()["stage_snapshot"]["plan"][0]["default_skip"]


def test_pending_unknown_cannot_be_bypassed_by_force_include(applied):
    h = applied
    draft = h.prepare()
    draft["edits"][0]["title"] = "New manual text"
    payload, _ = h.preview(draft)
    h.provider.failures[("primary", "one")] = "timeout_absent"
    assert h.publish(payload).status_code == 200
    draft = h.prepare()
    row = draft["stage_snapshot"]["plan"][0]
    assert not row["default_skip"] and row["pending_operations"]
    draft["edits"][0]["skip"] = False
    response = h.client.post("/api/v1/youtube/drafts/preview", json=draft)
    assert response.status_code == 409
