"""App-scoped construction of Google discovery clients; never cache user clients."""

from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Protocol

import googleapiclient.discovery
from starlette.types import ASGIApp, Receive, Scope, Send


class GoogleClientFactory(Protocol):
    def __call__(self, service: str, version: str, *, credentials: Any) -> Any: ...


_factory: ContextVar[GoogleClientFactory | None] = ContextVar("google_client_factory", default=None)


@contextmanager
def google_client_context(factory: GoogleClientFactory | None):
    token = _factory.set(factory)
    try:
        yield
    finally:
        _factory.reset(token)


def build_google_client(service: str, version: str, *, credentials: Any) -> Any:
    factory = _factory.get()
    if factory is None:
        factory = googleapiclient.discovery.build
    return factory(service, version, credentials=credentials)


class GoogleClientMiddleware:
    def __init__(self, app: ASGIApp, factory: GoogleClientFactory | None = None):
        self.app = app
        self.factory = factory

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        with google_client_context(self.factory):
            await self.app(scope, receive, send)
