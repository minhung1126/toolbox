import asyncio
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient

from backend.app.core.dependencies import require_account_subject, require_login_credentials
from backend.app.core.request_protection import SlidingWindowLimiter, enforce_workflow_rate_limit
from backend.app.core.youtube_quota_limiter import YouTubeQuotaLimiter
from backend.app.main import create_app
from backend.app.services.youtube_quota_service import YouTubeQuotaMiddleware, get_youtube_quota_tracker


def ledgers_for(tmp_path, name):
    return {
        slot: YouTubeQuotaLimiter(
            tmp_path / name / f"{slot}.json", slot=slot, configured_limit=100, safety_buffer_units=0
        )
        for slot in ("primary", "secondary")
    }


def app_for(ledgers, **kwargs):
    return create_app(
        youtube_quota_trackers=ledgers,
        dependency_overrides={
            require_account_subject: lambda: "same-user",
            require_login_credentials: lambda: object(),
        },
        **kwargs,
    )


def test_quota_api_and_provider_calls_use_app_ledgers(tmp_path):
    stores = [ledgers_for(tmp_path, name) for name in ("first", "second")]
    clients = []
    barrier = Barrier(2)
    for ledgers in stores:
        app = app_for(ledgers)

        @app.post("/quota-probe/{slot}")
        def probe(slot: str):
            barrier.wait(timeout=5)
            get_youtube_quota_tracker(slot).execute(SimpleNamespace(execute=lambda: {"ok": True}), "videos.update")
            return {"used": get_youtube_quota_tracker(slot).get_usage()["estimated_used_units"]}

        app.router.routes.insert(0, app.router.routes.pop())
        clients.append(TestClient(app))
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(client.post, f"/quota-probe/{slot}")
            for client, slot in zip(clients, ("primary", "secondary"), strict=True)
        ]
        assert [future.result().json() for future in futures] == [{"used": 50}, {"used": 50}]
    for i, client in enumerate(clients):
        for slot in ("primary", "secondary"):
            response = client.get("/api/v1/youtube/quota-usage", params={"slot": slot})
            assert response.status_code == 200
            expected = 50 if slot == ("primary", "secondary")[i] else 0
            assert response.json()["estimated_used_units"] == expected
    reloaded = ledgers_for(tmp_path, "first")
    assert reloaded["primary"].get_usage()["estimated_used_units"] == 50
    assert reloaded["secondary"].get_usage()["estimated_used_units"] == 0


def test_rate_limits_do_not_block_another_app_or_execute_rejected_work(tmp_path):
    ledgers = ledgers_for(tmp_path, "limited")
    first_app = app_for(ledgers)
    second_app = app_for(ledgers_for(tmp_path, "other"))
    for app in (first_app, second_app):

        @app.post("/workflow-probe", dependencies=[Depends(enforce_workflow_rate_limit)])
        def probe():
            get_youtube_quota_tracker().record("videos.list")
            return {"ok": True}

        app.router.routes.insert(0, app.router.routes.pop())
    first, second = TestClient(first_app), TestClient(second_app)
    for _ in range(12):
        assert first.post("/workflow-probe").status_code == 200
    response = first.post("/workflow-probe")
    assert response.status_code == 429
    assert response.json()["detail"]["code"] == "rate_limited"
    assert int(response.headers["retry-after"]) > 0
    assert ledgers["primary"].get_usage()["estimated_used_units"] == 12
    assert second.post("/workflow-probe").status_code == 200
    # Exercise the actual versioned API dependency without hundreds of HTTP requests.
    for _ in range(240):
        first_app.state.request_limiter.check("testclient", "api", limit=240)
    assert first.get("/api/v1/auth/config").status_code == 429
    assert second.get("/api/v1/auth/config").status_code == 200


def test_explicit_rate_limiter_is_used(tmp_path):
    limiter = SlidingWindowLimiter()
    for _ in range(240):
        limiter.check("testclient", "api", limit=240)
    client = TestClient(app_for(ledgers_for(tmp_path, "injected"), request_limiter=limiter))
    assert client.get("/api/v1/auth/config").status_code == 429


def test_quota_context_resets_after_failure_and_rejects_incomplete_maps(tmp_path):
    ledgers = ledgers_for(tmp_path, "failed")
    fallback = get_youtube_quota_tracker()

    async def fail(scope, receive, send):
        assert get_youtube_quota_tracker() is ledgers["primary"]
        raise RuntimeError("failed request")

    async def check_reset():
        with pytest.raises(RuntimeError, match="failed request"):
            await YouTubeQuotaMiddleware(fail, ledgers)({"type": "http"}, None, None)
        assert get_youtube_quota_tracker() is fallback

    asyncio.run(check_reset())
    with pytest.raises(ValueError, match="primary and secondary"):
        create_app(youtube_quota_trackers={"primary": ledgers["primary"]})
    with pytest.raises(ValueError, match="mapping keys"):
        create_app(youtube_quota_trackers={"primary": ledgers["secondary"], "secondary": ledgers["primary"]})
