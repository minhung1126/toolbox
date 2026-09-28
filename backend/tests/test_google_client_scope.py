from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.app.core.dependencies import require_account_subject, require_sheets_credentials
from backend.app.main import create_app
from backend.app.services.google_clients import build_google_client, google_client_context
from backend.app.services.sheets_service import get_sheets_service
from backend.app.services.youtube_service import get_youtube_service


def test_sheets_http_requests_use_each_apps_factory_and_credentials():
    barrier = Barrier(2)
    clients = []
    calls = []

    def make_app(name):
        credentials = object()

        def factory(service, version, *, credentials):
            calls.append((name, service, version, credentials))
            barrier.wait(timeout=5)
            request = SimpleNamespace(execute=lambda: {"properties": {"title": name}, "sheets": []})
            return SimpleNamespace(spreadsheets=lambda: SimpleNamespace(get=lambda **kwargs: request))

        app = create_app(
            google_client_factory=factory,
            dependency_overrides={
                require_account_subject: lambda: "same-user",
                require_sheets_credentials: lambda: credentials,
            },
        )
        return TestClient(app), credentials

    for name in ("first", "second"):
        clients.append(make_app(name))
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(client.post, "/api/v1/sheets/metadata", json={"spreadsheet_url_or_id": "sheet-id"})
            for client, _ in clients
        ]
        responses = [future.result() for future in futures]
    assert [response.status_code for response in responses] == [200, 200]
    assert [response.json()["spreadsheet_title"] for response in responses] == ["first", "second"]
    assert sorted(calls, key=lambda item: item[0]) == [
        (name, "sheets", "v4", credentials) for name, (_, credentials) in zip(("first", "second"), clients, strict=True)
    ]


def test_client_context_restores_after_failure_and_does_not_cache_credentials(monkeypatch):
    calls = []

    def factory(service, version, *, credentials):
        calls.append((service, version, credentials))
        return credentials

    fallback = object()
    monkeypatch.setattr("backend.app.services.google_clients.googleapiclient.discovery.build", lambda *a, **k: fallback)
    first, second = object(), object()
    with pytest.raises(RuntimeError), google_client_context(factory):
        assert get_sheets_service(first) is first
        assert get_youtube_service(SimpleNamespace(credentials=second)) is second
        raise RuntimeError("provider failed")
    assert calls == [("sheets", "v4", first), ("youtube", "v3", second)]
    assert build_google_client("sheets", "v4", credentials=first) is fallback


def test_provider_failure_keeps_api_error_contract_and_other_context_usable():
    def broken(*args, **kwargs):
        raise RuntimeError("private provider detail")

    overrides = {
        require_account_subject: lambda: "same-user",
        require_sheets_credentials: lambda: object(),
    }
    client = TestClient(create_app(google_client_factory=broken, dependency_overrides=overrides))
    response = client.post("/api/v1/sheets/metadata", json={"spreadsheet_url_or_id": "sheet-id"})
    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "sheets_provider_error"
    assert "private provider detail" not in response.text
    with google_client_context(lambda *a, **k: "other"):
        assert get_sheets_service(object()) == "other"
