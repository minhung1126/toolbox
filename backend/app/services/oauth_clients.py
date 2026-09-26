"""Construction boundary for OAuth flows and credential refresh transports."""

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Callable

from starlette.types import ASGIApp, Receive, Scope, Send


@dataclass(frozen=True)
class OAuthClientFactories:
    flow: Callable[..., Any] | None = None
    refresh_request: Callable[[], Any] | None = None


_factories: ContextVar[OAuthClientFactories | None] = ContextVar("oauth_client_factories", default=None)


@contextmanager
def oauth_client_context(factories: OAuthClientFactories | None):
    token = _factories.set(factories)
    try:
        yield
    finally:
        _factories.reset(token)


def get_oauth_flow_factory(fallback):
    factories = _factories.get()
    return factories.flow if factories is not None and factories.flow is not None else fallback


def get_refresh_request_factory(fallback):
    factories = _factories.get()
    return factories.refresh_request if factories is not None and factories.refresh_request is not None else fallback


class OAuthClientMiddleware:
    def __init__(self, app: ASGIApp, factories: OAuthClientFactories | None = None):
        self.app = app
        self.factories = factories

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        with oauth_client_context(self.factories):
            await self.app(scope, receive, send)
