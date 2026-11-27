import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from backend.app.core.youtube_quota_limiter import (
    YOUTUBE_QUOTA_METHODS,
    YouTubeQuotaLimiter,
    next_reset_at,
)
from backend.app.services.youtube_errors import YouTubeQuotaUnavailable, is_youtube_quota_exceeded


class SuccessfulRequest:
    def __init__(self):
        self.calls = 0

    def execute(self):
        self.calls += 1
        return {"ok": True}


class HttpFailure(Exception):
    def __init__(self, reason):
        super().__init__(reason)
        self.resp = SimpleNamespace(status=403)
        self.content = json.dumps({"error": {"errors": [{"reason": reason}], "message": "safe test body"}}).encode()


def make_ledger(tmp_path, **kwargs):
    return YouTubeQuotaLimiter(
        tmp_path / "youtube_quota_usage.json",
        configured_limit=kwargs.pop("configured_limit", 100),
        safety_buffer_units=kwargs.pop("safety_buffer_units", 1),
        **kwargs,
    )


def test_method_registry_uses_documented_general_bucket_costs():
    assert {method: (value["bucket"], value["cost"]) for method, value in YOUTUBE_QUOTA_METHODS.items()} == {
        "playlistItems.list": ("general", 1),
        "videos.list": ("general", 1),
        "videos.update": ("general", 50),
        "playlistItems.delete": ("general", 50),
    }


def test_unknown_method_fails_closed_before_request(tmp_path):
    ledger = make_ledger(tmp_path)
    request = SuccessfulRequest()

    with pytest.raises(YouTubeQuotaUnavailable) as caught:
        ledger.execute(request, "future.youtube.method")

    assert caught.value.code == "youtube_quota_unknown_method"
    assert request.calls == 0


def test_request_is_reserved_before_failure_and_outcome_is_persisted(tmp_path):
    ledger = make_ledger(tmp_path)

    with pytest.raises(HttpFailure):
        ledger.execute(SimpleNamespace(execute=lambda: (_ for _ in ()).throw(HttpFailure("forbidden"))), "videos.list")

    usage = ledger.get_usage()
    assert usage["estimated_used_units"] == 1
    assert usage["state"] != "confirmed_exhausted"
    assert usage["methods"] == [
        {
            "method": "videos.list",
            "cost_per_call": 1,
            "calls": 1,
            "units": 1,
            "succeeded_calls": 0,
            "failed_calls": 1,
        }
    ]


def test_two_instances_share_a_path_lock_and_cannot_cross_policy_cap(tmp_path):
    path = tmp_path / "youtube_quota_usage.json"
    first = YouTubeQuotaLimiter(path, configured_limit=51, safety_buffer_units=0)
    second = YouTubeQuotaLimiter(path, configured_limit=51, safety_buffer_units=0)

    def send(ledger):
        try:
            ledger.execute(SuccessfulRequest(), "videos.update")
            return "succeeded"
        except YouTubeQuotaUnavailable as exc:
            return exc.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(send, (first, second)))

    assert sorted(results) == ["succeeded", "youtube_quota_safety_blocked"]
    assert first.get_usage()["estimated_used_units"] == 50


def test_safety_buffer_is_reserved_at_the_exact_policy_cap(tmp_path):
    ledger = make_ledger(tmp_path, configured_limit=51, safety_buffer_units=1)

    ledger.record("videos.update")
    usage = ledger.get_usage()

    assert usage["estimated_used_units"] == 50
    assert usage["estimated_remaining_units"] == 1
    assert usage["policy_cap_units"] == 50
    assert usage["effective_available_units"] == 0
    with pytest.raises(YouTubeQuotaUnavailable) as caught:
        ledger.reserve("videos.list")
    assert caught.value.code == "youtube_quota_safety_blocked"


def test_only_403_quota_exhaustion_reasons_are_confirmed_quota(tmp_path):
    assert is_youtube_quota_exceeded(HttpFailure("quotaExceeded")) is True
    assert is_youtube_quota_exceeded(HttpFailure("dailyLimitExceeded")) is True
    assert is_youtube_quota_exceeded(HttpFailure("dailyLimitExceededUnreg")) is True
    assert is_youtube_quota_exceeded(HttpFailure("forbidden")) is False

    ledger = make_ledger(tmp_path)
    with pytest.raises(HttpFailure):
        ledger.execute(SimpleNamespace(execute=lambda: (_ for _ in ()).throw(HttpFailure("forbidden"))), "videos.list")
    assert ledger.get_usage()["confirmed_by_google"] is False


@pytest.mark.parametrize("reason", ["quotaExceeded", "dailyLimitExceeded", "dailyLimitExceededUnreg"])
def test_google_quota_exhaustion_reason_blocks_the_current_slot(tmp_path, reason):
    ledger = make_ledger(tmp_path)
    with pytest.raises(YouTubeQuotaUnavailable) as caught:
        ledger.execute(SimpleNamespace(execute=lambda: (_ for _ in ()).throw(HttpFailure(reason))), "videos.update")

    assert caught.value.code == "youtube_quota_exhausted"
    assert caught.value.reason == reason
    usage = ledger.get_usage()
    assert usage["state"] == "confirmed_exhausted"
    assert usage["last_error_reason"] == reason


def test_confirmed_exhaustion_sets_effective_available_to_zero(tmp_path):
    ledger = make_ledger(tmp_path)
    with pytest.raises(YouTubeQuotaUnavailable) as caught:
        ledger.execute(
            SimpleNamespace(execute=lambda: (_ for _ in ()).throw(HttpFailure("quotaExceeded"))), "videos.update"
        )

    usage = ledger.get_usage()
    assert caught.value.code == "youtube_quota_exhausted"
    assert usage["state"] == "confirmed_exhausted"
    assert usage["confirmed_by_google"] is True
    assert usage["effective_available_units"] == 0
    assert usage["estimated_used_units"] == 50


def test_reset_uses_pacific_midnight_and_dst_offsets():
    summer = datetime(2026, 7, 1, 20, 0, tzinfo=timezone.utc)
    winter = datetime(2026, 1, 1, 20, 0, tzinfo=timezone.utc)
    assert next_reset_at(summer).isoformat().endswith("-07:00")
    assert next_reset_at(winter).isoformat().endswith("-08:00")


def test_new_quota_date_replaces_the_previous_day_with_a_normal_ledger(tmp_path):
    ledger = make_ledger(tmp_path)
    first_day = datetime(2026, 7, 1, 20, 0, tzinfo=timezone.utc)
    next_day = datetime(2026, 7, 2, 8, 0, tzinfo=timezone.utc)
    first = ledger.get_usage(now=first_day)
    second = ledger.get_usage(now=next_day)

    assert first["quota_date"] != second["quota_date"]
    assert second["state"] == "normal"
    assert second["estimated_used_units"] == 0


def test_non_current_json_schema_fails_closed(tmp_path):
    path = tmp_path / "youtube_quota_usage.json"
    path.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "quota_date": "2026-08-02",
                "estimated_used_units": 51,
                "methods": {},
            }
        ),
        encoding="utf-8",
    )
    request = SuccessfulRequest()
    ledger = YouTubeQuotaLimiter(path)

    with pytest.raises(YouTubeQuotaUnavailable) as caught:
        ledger.execute(request, "videos.list")

    assert caught.value.code == "youtube_quota_storage_unavailable"
    assert request.calls == 0


def test_corrupt_json_fails_closed_before_request(tmp_path):
    path = tmp_path / "youtube_quota_usage.json"
    path.write_text("{not-json", encoding="utf-8")
    request = SuccessfulRequest()
    ledger = YouTubeQuotaLimiter(path)

    with pytest.raises(YouTubeQuotaUnavailable) as caught:
        ledger.execute(request, "videos.list")

    assert caught.value.code == "youtube_quota_storage_unavailable"
    assert request.calls == 0


def test_atomic_write_failure_fails_closed_before_request(monkeypatch, tmp_path):
    request = SuccessfulRequest()
    ledger = make_ledger(tmp_path)

    def fail_replace(_source, _target):
        raise OSError("disk unavailable")

    monkeypatch.setattr("backend.app.core.youtube_quota_limiter.os.replace", fail_replace)
    with pytest.raises(YouTubeQuotaUnavailable) as caught:
        ledger.execute(request, "videos.list")

    assert caught.value.code == "youtube_quota_storage_unavailable"
    assert request.calls == 0


def test_cost_estimates_match_direct_metadata_and_publish_formulas(monkeypatch):
    from backend.app.api.youtube import _quota_estimate

    monkeypatch.setattr(
        "backend.app.api.youtube.get_youtube_quota_tracker",
        lambda _slot="primary": SimpleNamespace(
            get_usage=lambda: {
                "effective_available_units": 1500,
                "reset_at": "reset",
                "reset_timezone": "America/Los_Angeles",
            }
        ),
    )
    metadata = _quota_estimate("youtube.metadata_update", 51)
    publish = _quota_estimate("youtube.publish_cleanup", 20)
    assert metadata["projected_units"] == 2 + 51 * 50
    assert publish["projected_units"] == (3 + 20) * 1 + 53 * 20
    assert publish["breakdown"][0] == {"method": "playlistItems.list", "calls": 62, "units": 62}
    assert publish["max_items_today"] == 20


def test_playlists_insert_is_registered_in_auxiliary_methods_and_charges_50_units(tmp_path):
    from backend.app.core.youtube_quota_limiter import YOUTUBE_AUXILIARY_QUOTA_METHODS

    assert YOUTUBE_AUXILIARY_QUOTA_METHODS["playlists.insert"] == {"bucket": "general", "cost": 50}
    ledger = make_ledger(tmp_path, configured_limit=200, safety_buffer_units=0)
    res = ledger.execute(SuccessfulRequest(), "playlists.insert")
    assert res == {"ok": True}
    assert ledger.get_usage()["estimated_used_units"] == 50


def test_policy_cap_refuses_50_unit_write_without_locking_1_unit_read(tmp_path):
    ledger = make_ledger(tmp_path, configured_limit=10_000, safety_buffer_units=1_000)
    # Use 8,970 units (policy_cap = 9,000, 30 units remaining below safety cap)
    path = tmp_path / "youtube_quota_usage.json"
    ledger.get_usage()
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["estimated_used_units"] = 8_970
    path.write_text(json.dumps(raw), encoding="utf-8")

    with pytest.raises(YouTubeQuotaUnavailable) as caught:
        ledger.execute(SuccessfulRequest(), "videos.update")
    assert caught.value.code == "youtube_quota_safety_blocked"

    # Must NOT persist blocked_until for local safety cap; 1-unit read must still succeed!
    saved = json.loads(path.read_text(encoding="utf-8"))
    assert saved["blocked_until"] is None
    assert ledger.execute(SuccessfulRequest(), "videos.list") == {"ok": True}
    assert ledger.get_usage()["estimated_used_units"] == 8_971


def test_dynamic_quota_increase_immediately_unblocks_local_policy_cap_but_not_confirmed_exhausted(tmp_path):
    from backend.app.core.runtime_config import RuntimeConfig

    runtime = RuntimeConfig(tmp_path / "runtime.json")
    runtime.update({"youtube_primary_general_quota_limit": 100, "youtube_primary_quota_safety_buffer_units": 50})
    ledger = YouTubeQuotaLimiter(tmp_path / "youtube_quota_usage.json", runtime_store=runtime)
    ledger.record("videos.update")
    blocked_usage = ledger.get_usage()
    assert blocked_usage["state"] == "safety_blocked"
    assert blocked_usage["effective_available_units"] == 0
    assert blocked_usage["blocked_until"] is None

    # Simulate legacy persisted blocked_until under safety_blocked on disk
    raw = json.loads((tmp_path / "youtube_quota_usage.json").read_text(encoding="utf-8"))
    raw["state"] = "safety_blocked"
    raw["blocked_until"] = blocked_usage["reset_at"]
    (tmp_path / "youtube_quota_usage.json").write_text(json.dumps(raw), encoding="utf-8")

    # Raise limit dynamically: immediately unblocked without waiting for Pacific midnight
    runtime.update({"youtube_primary_general_quota_limit": 200, "youtube_primary_quota_safety_buffer_units": 50})
    recovered = ledger.get_usage()
    assert recovered["state"] == "normal"
    assert recovered["effective_available_units"] == 100
    assert recovered["blocked_until"] is None
    assert ledger.execute(SuccessfulRequest(), "videos.update") == {"ok": True}

    # Google 403 confirmed_exhausted remains blocked even if limit is raised
    with pytest.raises(YouTubeQuotaUnavailable) as exhausted:
        ledger.execute(
            SimpleNamespace(execute=lambda: (_ for _ in ()).throw(HttpFailure("quotaExceeded"))), "videos.list"
        )
    assert exhausted.value.code == "youtube_quota_exhausted"
    runtime.update({"youtube_primary_general_quota_limit": 10_000, "youtube_primary_quota_safety_buffer_units": 0})
    assert ledger.get_usage()["state"] == "confirmed_exhausted"
    assert ledger.get_usage()["effective_available_units"] == 0
    with pytest.raises(YouTubeQuotaUnavailable) as still_blocked:
        ledger.reserve("videos.list")
    assert still_blocked.value.code == "youtube_quota_exhausted"
