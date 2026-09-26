import asyncio
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient

from backend.app.core.config import settings
from backend.app.core.credential_store import CredentialStore
from backend.app.core.dependencies import require_account_subject
from backend.app.core.session_store import SessionStore, SessionStoreMiddleware, get_session_store
from backend.app.main import create_app


def test_cookie_authentication_and_logout_are_app_scoped(tmp_path, monkeypatch):
    credentials = CredentialStore(tmp_path / "credentials.json")
    credentials.save_google_connection(
        {"token": "test-token", "user": {"sub": "same-user", "email": "admin@example.test"}},
        owner_sub="same-user",
    )
    monkeypatch.setattr(type(settings), "is_google_email_allowed", lambda self, email: True)
    first_store = SessionStore(tmp_path / "first.json")
    session_id = first_store.create({"credential_provider": "google_login", "user": {"sub": "same-user"}})
    second_store = SessionStore(tmp_path / "second.json")
    clients = []
    for store in (first_store, second_store):
        app = create_app(session_store=store, credential_store=credentials)

        @app.get("/session-probe")
        def probe(subject: str = Depends(require_account_subject)):
            return {"subject": subject}

        app.router.routes.insert(0, app.router.routes.pop())
        client = TestClient(app)
        client.cookies.set(settings.session_cookie_name, session_id)
        clients.append(client)
    first, second = clients
    assert first.get("/session-probe").json() == {"subject": "same-user"}
    assert second.get("/session-probe").status_code == 401
    assert second.get("/api/v1/auth/user").json()["authenticated"] is False
    # A foreign app's logout must not invalidate the original cookie.
    assert second.post("/api/v1/auth/logout").status_code == 200
    assert first.get("/session-probe").status_code == 200
    assert first.post("/api/v1/auth/logout").status_code == 200
    assert first_store.get(session_id) is None
    assert first.get("/session-probe").status_code == 401


def test_overlapping_sync_requests_keep_session_writes_isolated(tmp_path):
    barrier = Barrier(2)
    stores = [SessionStore(tmp_path / f"{name}.json") for name in ("first", "second")]
    clients = []
    for store in stores:
        app = create_app(session_store=store)

        @app.post("/session-probe/{value}")
        def probe(value: str):
            session_id = get_session_store().create({"value": value})
            barrier.wait(timeout=5)
            return {"id": session_id, "data": get_session_store().get(session_id)}

        app.router.routes.insert(0, app.router.routes.pop())
        clients.append(TestClient(app))
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(client.post, f"/session-probe/{i}") for i, client in enumerate(clients)]
        responses = [future.result().json() for future in futures]
    for i, result in enumerate(responses):
        assert result["data"] == {"value": str(i)}
        assert stores[1 - i].get(result["id"]) is None


def test_session_context_resets_after_failure_and_preserves_fallback(tmp_path):
    store = SessionStore(tmp_path / "failed.json")
    fallback = get_session_store()

    async def fail(scope, receive, send):
        assert get_session_store() is store
        raise RuntimeError("failed request")

    async def check_reset():
        with pytest.raises(RuntimeError, match="failed request"):
            await SessionStoreMiddleware(fail, store)({"type": "http"}, None, None)
        assert get_session_store() is fallback
        assert get_session_store(store) is store

    asyncio.run(check_reset())


def test_oauth_callback_creates_and_rotates_only_the_app_session(tmp_path, monkeypatch):
    from backend.app.api import auth as auth_api
    from backend.app.core.security import GOOGLE_OAUTH_STATE_SALT, sign_timed_data

    credentials = [CredentialStore(tmp_path / f"callback-credentials-{i}.json") for i in range(2)]
    monkeypatch.setattr(type(settings), "is_google_email_allowed", lambda self, email: True)
    user = {"sub": "callback-user", "email": "callback@example.test"}

    def exchange(**kwargs):
        assert kwargs == {
            "code": "provider-code",
            "code_verifier": "test-verifier",
            "purpose": auth_api.LOGIN_FLOW,
            "slot": "primary",
        }
        return {"token": "provider-token", "user": user}

    monkeypatch.setattr(auth_api, "exchange_code_for_tokens", exchange)
    flow_cookie = sign_timed_data(
        {"state": "test-state", "code_verifier": "test-verifier", "flow_type": auth_api.LOGIN_FLOW},
        salt=GOOGLE_OAUTH_STATE_SALT,
    )
    stores = [SessionStore(tmp_path / f"callback-{index}.json") for index in range(2)]
    old_session = stores[0].create({"credential_provider": "google_login", "user": user})
    new_sessions = []
    for index, store in enumerate(stores):
        with TestClient(create_app(session_store=store, credential_store=credentials[index])) as client:
            # First rotate an owned session; then present a foreign app's session.
            existing = old_session if index == 0 else new_sessions[0]
            response = client.get(
                "/api/v1/auth/callback",
                params={"code": "provider-code", "state": "test-state"},
                headers={"Cookie": f"{auth_api.OAUTH_FLOW_COOKIE}={flow_cookie}; {auth_api.SESSION_COOKIE}={existing}"},
                follow_redirects=False,
            )
        assert credentials[index].get_google_credentials("callback-user")["token"] == "provider-token"
        if index == 0:
            assert credentials[1].get_google_credentials("callback-user") is None
        assert response.status_code == 307
        assert response.headers["location"].endswith("/#auth_success=1")
        session_id = response.cookies[auth_api.SESSION_COOKIE]
        new_sessions.append(session_id)
        assert session_id != existing
        assert store.get(session_id) == {"credential_provider": "google_login", "user": user}
        assert stores[1 - index].get(session_id) is None
        assert get_session_store().get(session_id) is None
    assert stores[0].get(old_session) is None
    assert stores[0].get(new_sessions[0]) is not None
    assert SessionStore(tmp_path / "callback-1.json").get(new_sessions[1]) is not None
