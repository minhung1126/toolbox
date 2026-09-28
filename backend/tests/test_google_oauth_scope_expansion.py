import json
from types import SimpleNamespace

import pytest
from google_auth_oauthlib.flow import Flow
from oauthlib.oauth2 import InvalidGrantError, MissingTokenError
from requests import Request, Response

from backend.app.services.google_auth import LOGIN_SCOPES, YOUTUBE_SCOPE, exchange_code_for_tokens
from backend.app.services.google_clients import google_client_context
from backend.app.services.oauth_clients import OAuthClientFactories, oauth_client_context


def _exchange(payload, calls, *, failure=None):
    def factory(config, **kwargs):
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": "test-client",
                    "client_secret": "test-secret",
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            },
            **kwargs,
        )

        def request(**request_kwargs):
            calls.append(request_kwargs)
            if failure is not None:
                raise failure
            response = Response()
            response.status_code = 200
            response._content = json.dumps(payload).encode()
            response.request = Request("POST", request_kwargs["url"]).prepare()
            return response

        flow.oauth2session.request = request
        return flow

    profile = SimpleNamespace(execute=lambda: {"id": "test-user", "email": "test@example.test"})
    client = SimpleNamespace(userinfo=lambda: SimpleNamespace(get=lambda: profile))
    with (
        oauth_client_context(OAuthClientFactories(flow=factory)),
        google_client_context(lambda *args, **kwargs: client),
    ):
        return exchange_code_for_tokens("test-code", "test-verifier")


@pytest.fixture(autouse=True)
def strict_scope_validation(monkeypatch):
    monkeypatch.delenv("OAUTHLIB_RELAX_TOKEN_SCOPE", raising=False)


@pytest.mark.parametrize("extra_scopes", [[], [YOUTUBE_SCOPE], ["email", "profile", YOUTUBE_SCOPE]])
def test_login_accepts_scope_expansion_without_redeeming_code_twice(extra_scopes):
    calls = []
    token = _exchange(
        {
            "access_token": "test-access",
            "refresh_token": "test-refresh",
            "token_type": "Bearer",
            "expires_in": 3600,
            "scope": " ".join(LOGIN_SCOPES + extra_scopes),
        },
        calls,
    )
    assert token["token"] == "test-access"
    assert token["refresh_token"] == "test-refresh"
    assert token["expiry"]
    assert token["user"]["sub"] == "test-user"
    # Additional grants must not turn identity login into a service connection.
    assert set(token["scopes"]) == set(LOGIN_SCOPES)
    assert len(calls) == 1
    assert calls[0]["data"]["code"] == "test-code"
    assert calls[0]["data"]["code_verifier"] == "test-verifier"


@pytest.mark.parametrize(
    ("payload", "expected_error"),
    [
        ({"access_token": "test-access", "scope": "openid " + YOUTUBE_SCOPE}, Warning),
        ({"scope": " ".join(LOGIN_SCOPES + [YOUTUBE_SCOPE])}, MissingTokenError),
        ({"error": "invalid_grant"}, InvalidGrantError),
    ],
)
def test_login_rejects_missing_scopes_and_invalid_tokens(payload, expected_error):
    calls = []
    with pytest.raises(expected_error):
        _exchange(payload, calls)
    assert len(calls) == 1


def test_unrelated_warning_is_not_swallowed():
    calls = []
    with pytest.raises(Warning, match="unrelated failure"):
        _exchange({}, calls, failure=Warning("unrelated failure"))
    assert len(calls) == 1
