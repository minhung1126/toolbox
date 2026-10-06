from concurrent.futures import ThreadPoolExecutor
from dataclasses import FrozenInstanceError
from types import SimpleNamespace

import pytest
from starlette.requests import Request

from backend.app.api.youtube_workflow_dependencies import get_youtube_workflow_service
from backend.app.core.account_state_store import AccountStateStore
from backend.app.main import create_app


def test_account_ports_remain_app_bound_in_background_workers(tmp_path):
    services = []
    for name in ("first", "second"):
        store = AccountStateStore(tmp_path / f"{name}.json")
        store.set_setting("same-owner", "default_playlist_id", f"PL_{name}_playlist")
        app = create_app(account_state_store=store)
        services.append(get_youtube_workflow_service(Request({"type": "http", "app": app})))
    context = SimpleNamespace(owner_sub="same-owner")
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(service.ports.resolve_playlist_id, context, None) for service in services]
        assert [future.result() for future in futures] == ["PL_first_playlist", "PL_second_playlist"]
    with pytest.raises(FrozenInstanceError):
        services[0].ports.fetch_playlist_items = lambda *_: []
