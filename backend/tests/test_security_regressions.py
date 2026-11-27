from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, Response
from fastapi.testclient import TestClient
from pydantic import ValidationError
from starlette.requests import Request

from backend.app import main
from backend.app.api import auth
from backend.app.api import sheets as sheets_api
from backend.app.api.sheets import SpreadsheetInput
from backend.app.api.youtube import BatchUpdateInput, VideoAssignment
from backend.app.core.config import Settings, settings
from backend.app.core.credential_store import CredentialStore
from backend.app.core.request_protection import require_same_origin


def test_frontend_path_traversal_cannot_escape_dist():
    with pytest.raises(HTTPException) as error:
        main.resolve_frontend_path("../../backend/app/main.py")

    assert error.value.status_code == 404
    assert "main.py" not in str(error.value.detail)


def test_production_settings_fail_closed_and_use_host_only_cookies():
    common = {
        "ENVIRONMENT": "production",
        "PUBLIC_BASE_URL": "https://creator.example.com",
        "FRONTEND_URL": "https://creator.example.com",
        "SECRET_KEY": "s" * 64,
        "CREDENTIAL_ENCRYPTION_KEY": "c" * 64,
        "ALLOWED_GOOGLE_EMAILS": "admin@example.com",
    }

    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings(**{**common, "SECRET_KEY": ""})
    with pytest.raises(ValueError, match="CREDENTIAL_ENCRYPTION_KEY"):
        Settings(**{**common, "CREDENTIAL_ENCRYPTION_KEY": ""})
    with pytest.raises(ValueError, match="HTTPS"):
        Settings(**{**common, "PUBLIC_BASE_URL": "http://creator.example.com"})
    with pytest.raises(ValueError, match="different"):
        Settings(**{**common, "CREDENTIAL_ENCRYPTION_KEY": common["SECRET_KEY"]})

    production = Settings(**common)
    assert production.is_production is True
    assert production.cookie_secure is True
    assert production.session_cookie_name.startswith("__Host-")
    assert production.oauth_flow_cookie_name.startswith("__Host-")

    https_development = Settings(**{**common, "ENVIRONMENT": "development", "ALLOWED_GOOGLE_EMAILS": ""})
    assert https_development.allowlist_required is True
    assert https_development.is_google_email_allowed("anyone@example.com") is False


def test_production_oauth_flow_cookie_has_secure_host_only_attributes(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    response = Response()

    auth._set_flow_cookie(response, flow_type="login", state="state", code_verifier="verifier")
    set_cookie = response.headers["set-cookie"]

    assert set_cookie.startswith("__Host-creator_tools_oauth_flow=")
    assert "Secure" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "Path=/" in set_cookie
    assert "SameSite=lax" in set_cookie

    deleted = auth.redirect_with_auth_error("test")
    delete_cookie = deleted.headers["set-cookie"]
    assert "__Host-creator_tools_oauth_flow=" in delete_cookie
    assert "Secure" in delete_cookie
    assert "Path=/" in delete_cookie


def test_credentials_are_isolated_by_oidc_subject(tmp_path: Path):
    store = CredentialStore(tmp_path / "credentials.json")
    store.save_google_connection(
        {"token": "google-a", "refresh_token": "refresh-a", "user": {"sub": "sub-a", "email": "a@example.com"}},
        owner_sub="sub-a",
    )
    store.save_youtube_connection(
        {"token": "youtube-a", "refresh_token": "youtube-refresh-a", "user": {"sub": "sub-a"}},
        owner_sub="sub-a",
    )
    store.save_google_connection(
        {"token": "google-b", "refresh_token": "refresh-b", "user": {"sub": "sub-b", "email": "b@example.com"}},
        owner_sub="sub-b",
    )

    assert store.get_google_credentials("sub-a")["token"] == "google-a"
    assert store.get_google_credentials("sub-b")["token"] == "google-b"
    assert store.get_youtube_credentials("sub-a")["token"] == "youtube-a"
    assert store.get_youtube_credentials("sub-b") is None
    assert "owner_sub" not in store.get_google_public("sub-a")


def test_foreign_origin_is_rejected_for_mutations():
    request = Request(
        {
            "type": "http",
            "method": "PUT",
            "path": "/api/v1/settings/shared",
            "headers": [(b"origin", b"https://evil.example")],
            "query_string": b"",
            "server": ("testserver", 80),
        }
    )

    with pytest.raises(HTTPException) as error:
        require_same_origin(request)

    assert error.value.status_code == 403
    assert error.value.detail["code"] == "csrf_origin_denied"


def test_production_requires_origin_or_referer(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/settings/shared",
            "headers": [],
            "query_string": b"",
            "server": ("testserver", 80),
        }
    )

    with pytest.raises(HTTPException) as error:
        require_same_origin(request)

    assert error.value.status_code == 403


def test_origin_null_and_malformed_origin_or_referer_rejected_in_all_environments(monkeypatch):
    for env in ("development", "test", "staging", "production"):
        monkeypatch.setattr(settings, "ENVIRONMENT", env)
        for headers in (
            [(b"origin", b"null")],
            [(b"origin", b"")],
            [(b"origin", b"null"), (b"referer", b"http://localhost:3000/")],
            [(b"referer", b"about:blank")],
        ):
            req = Request(
                {
                    "type": "http",
                    "method": "POST",
                    "path": "/api/v1/settings/shared",
                    "headers": headers,
                    "query_string": b"",
                    "server": ("testserver", 80),
                }
            )
            with pytest.raises(HTTPException) as exc:
                require_same_origin(req)
            assert exc.value.status_code == 403
            assert exc.value.detail["code"] == "csrf_origin_denied"


def test_headerless_mutation_allowed_only_in_development_and_test(monkeypatch):
    for env, expected_allow in (("development", True), ("test", True), ("staging", False), ("production", False)):
        monkeypatch.setattr(settings, "ENVIRONMENT", env)
        req = Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/api/v1/settings/shared",
                "headers": [],
                "query_string": b"",
                "server": ("testserver", 80),
            }
        )
        if expected_allow:
            require_same_origin(req)
        else:
            with pytest.raises(HTTPException) as exc:
                require_same_origin(req)
            assert exc.value.status_code == 403


def test_staging_and_https_enforce_strict_security_headers_cookies_and_cors(tmp_path):
    from backend.app.core.runtime_config import RuntimeConfig
    from backend.app.core.system_secrets import SystemSecretsManager

    for label, env, base_url in (
        ("staging", "staging", "http://staging.example.test"),
        ("https-dev", "development", "https://dev.example.test"),
    ):
        subdir = tmp_path / label
        config = Settings(
            _env_file=None,
            runtime_store=RuntimeConfig(subdir / "runtime.json"),
            secrets_store=SystemSecretsManager(subdir),
            ENVIRONMENT=env,
            PUBLIC_BASE_URL=base_url,
            FRONTEND_URL=base_url,
            ALLOWED_GOOGLE_EMAILS="admin@example.com",
        )
        assert config.is_strict_security is True
        assert config.cookie_secure is True
        assert config.allowlist_required is True
        assert config.session_cookie_name.startswith("__Host-")
        assert config.oauth_flow_cookie_name.startswith("__Host-")
        assert "localhost" not in config.trusted_hosts
        assert "testserver" not in config.trusted_hosts

        client = TestClient(main.create_app(app_settings=config), base_url=base_url)
        health = client.get("/api/v1/health")
        assert health.status_code == 200
        assert health.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"

        cors_foreign = client.options(
            "/api/v1/health",
            headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
        )
        assert "access-control-allow-origin" not in cors_foreign.headers


def test_trusted_proxy_ip_extraction_and_session_bucketed_rate_limiting(tmp_path, monkeypatch):
    from backend.app.core import request_protection
    from backend.app.core.request_protection import SlidingWindowLimiter, _client_key, _extract_client_ip
    from backend.app.core.runtime_config import RuntimeConfig
    from backend.app.core.session_store import SessionStore
    from backend.app.core.system_secrets import SystemSecretsManager

    with pytest.raises(ValueError, match="TRUSTED_PROXY_IPS"):
        Settings(_env_file=None, TRUSTED_PROXY_IPS="not-an-ip")

    subdir = tmp_path / "proxy-rate"
    config = Settings(
        _env_file=None,
        runtime_store=RuntimeConfig(subdir / "runtime.json"),
        secrets_store=SystemSecretsManager(subdir),
        TRUSTED_PROXY_IPS="127.0.0.1,10.0.0.0/8",
        ALLOWED_GOOGLE_EMAILS="admin@example.com",
    )

    def make_req(peer_host: str, headers=None, cookies=None):
        raw_headers = [(k.lower().encode("ascii"), v.encode("ascii")) for k, v in (headers or {}).items()]
        if cookies:
            cookie_header = "; ".join(f"{k}={v}" for k, v in cookies.items())
            raw_headers.append((b"cookie", cookie_header.encode("ascii")))
        return Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/api/v1/auth/config",
                "headers": raw_headers,
                "query_string": b"",
                "client": (peer_host, 12345),
                "server": ("testserver", 80),
            }
        )

    # Untrusted peer cannot spoof X-Forwarded-For
    untrusted = make_req("198.51.100.5", headers={"X-Forwarded-For": "203.0.113.99"})
    assert _extract_client_ip(untrusted, config) == "198.51.100.5"

    # Trusted proxy walks right-to-left skipping trusted proxies, ignoring spoofed prefix
    trusted = make_req("127.0.0.1", headers={"X-Forwarded-For": "1.1.1.1, 203.0.113.7, 10.1.2.3"})
    assert _extract_client_ip(trusted, config) == "203.0.113.7"

    # Valid authenticated session gets its own subject bucket, immune to unauthenticated flood
    sessions = SessionStore(subdir / "sessions.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY)
    valid_sid = sessions.create(
        {"credential_provider": "google_login", "user": {"sub": "user-42", "email": "admin@example.com"}}
    )
    limiter = SlidingWindowLimiter()
    app = main.create_app(app_settings=config, session_store=sessions, request_limiter=limiter)
    client = TestClient(app)

    # Exhaust unauthenticated IP bucket ("testclient")
    for _ in range(240):
        limiter.check("testclient", "api", limit=240)
    assert client.get("/api/v1/auth/config").status_code == 429

    # Forged session cookie also hits IP bucket 429
    client.cookies.set(config.session_cookie_name, "forged-session-id")
    assert client.get("/api/v1/auth/config").status_code == 429

    # Valid session cookie has its own subject:user-42 bucket and succeeds
    client.cookies.set(config.session_cookie_name, valid_sid)
    assert client.get("/api/v1/auth/config").status_code == 200
    monkeypatch.setattr(request_protection, "session_store", sessions)
    with main.settings_context(config):
        assert _client_key(make_req("127.0.0.1", cookies={config.session_cookie_name: valid_sid})) == "subject:user-42"


def test_docker_compose_binds_to_localhost():
    compose_text = (Path(__file__).resolve().parents[2] / "docker-compose.yml").read_text(encoding="utf-8")
    assert "127.0.0.1:${HOST_PORT:-8000}:8000" in compose_text


def test_quota_usage_requires_login():
    response = TestClient(main.app).get("/api/v1/youtube/quota-usage")
    assert response.status_code == 401


def test_provider_exception_is_not_returned_to_the_client(monkeypatch):
    secret_detail = "https://sheets.googleapis.com/v4/spreadsheets/private-id"

    def raise_provider_error(*args, **kwargs):
        raise RuntimeError(secret_detail)

    monkeypatch.setattr(sheets_api, "get_spreadsheet_metadata", raise_provider_error)
    with pytest.raises(HTTPException) as error:
        sheets_api.spreadsheet_metadata(SpreadsheetInput(spreadsheet_url_or_id="sheet-id"), SimpleNamespace())

    assert error.value.status_code == 500
    assert secret_detail not in str(error.value.detail)


def test_security_headers_are_present():
    response = TestClient(main.app).get("/api/v1/health")
    assert response.status_code == 200
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Content-Security-Policy"].startswith("default-src 'self'")
    assert "img-src 'self' data: https: blob:;" in response.headers["Content-Security-Policy"]
    assert "media-src 'self' data: blob:;" in response.headers["Content-Security-Policy"]


def test_batch_input_has_a_bounded_assignment_count():
    with pytest.raises(ValidationError):
        BatchUpdateInput(
            worksheet_name="工作表",
            title_column="標題",
            description_column="描述",
            team="團體",
            assignments=[VideoAssignment(video_id=str(index), person="人物") for index in range(501)],
        )
