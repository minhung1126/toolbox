from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from fastapi.testclient import TestClient

from backend.app.core.account_state import get_account_setting, set_account_setting
from backend.app.core.account_state_store import AccountStateStore, get_account_state_store
from backend.app.core.dependencies import require_account_subject, require_login_credentials
from backend.app.main import create_app
from backend.app.services.ytmusic_service import resolve_ytmusic_locale


def configured_app(store):
    return create_app(
        account_state_store=store,
        dependency_overrides={
            require_account_subject: lambda: "same-user",
            require_login_credentials: lambda: object(),
        },
    )


def test_account_repository_and_dynamic_validation_are_app_scoped(tmp_path):
    first_store = AccountStateStore(tmp_path / "first.json")
    second_store = AccountStateStore(tmp_path / "second.json")
    first_store.register_work_state_keys(["custom_tool"])
    first_app, second_app = configured_app(first_store), configured_app(second_store)
    with TestClient(first_app) as first, TestClient(second_app) as second:
        response = first.put("/api/v1/settings/shared", json={"default_spreadsheet_id": "first-sheet"})
        assert response.status_code == 200
        assert first.get("/api/v1/settings/shared").json()["default_spreadsheet_id"] == "first-sheet"
        assert second.get("/api/v1/settings/shared").json()["default_spreadsheet_id"] == ""
        payload = {"key": "custom_tool", "value": {"draft": "first only"}}
        assert first.put("/api/v1/settings/work-state", json=payload).status_code == 200
        assert second.put("/api/v1/settings/work-state", json=payload).status_code == 422
        assert second.get("/api/v1/settings/work-state").json()["state"] == {}
    assert (
        AccountStateStore(tmp_path / "first.json").get_setting("same-user", "default_spreadsheet_id") == "first-sheet"
    )
    assert second_store.get_work_state("same-user") == {}


def test_overlapping_sync_requests_keep_repository_and_locale_isolated(tmp_path):
    barrier = Barrier(2)
    stores = [AccountStateStore(tmp_path / f"{name}.json") for name in ("first", "second")]
    clients = []
    for store, region in zip(stores, ("US", "JP"), strict=True):
        store.set_work_state("same-user", "ytmusic_preferences", {"regionPreset": region})
        application = configured_app(store)

        @application.get("/repository-probe/{value}")
        def probe(value: str):
            set_account_setting("same-user", "default_spreadsheet_id", value)
            barrier.wait(timeout=5)
            return {
                "value": get_account_setting("same-user", "default_spreadsheet_id"),
                "locale": resolve_ytmusic_locale("same-user"),
            }

        application.router.routes.insert(0, application.router.routes.pop())
        clients.append(TestClient(application))
    fallback = get_account_state_store()
    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(clients[0].get, "/repository-probe/first")
        second = executor.submit(clients[1].get, "/repository-probe/second")
        assert first.result().json() == {"value": "first", "locale": ["en", "US"]}
        assert second.result().json() == {"value": "second", "locale": ["ja", "JP"]}
    assert get_account_state_store() is fallback


def test_repository_context_resets_after_failed_request(tmp_path):
    import asyncio

    from backend.app.core.account_state_store import AccountStateMiddleware

    store = AccountStateStore(tmp_path / "failed.json")
    fallback = get_account_state_store()

    async def failing_app(scope, receive, send):
        assert get_account_state_store() is store
        raise RuntimeError("failed request")

    async def check_reset():
        import pytest

        middleware = AccountStateMiddleware(failing_app, store)
        with pytest.raises(RuntimeError, match="failed request"):
            await middleware({"type": "http"}, None, None)
        assert get_account_state_store() is fallback

    asyncio.run(check_reset())
