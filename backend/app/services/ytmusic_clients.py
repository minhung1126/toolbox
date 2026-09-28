"""App-scoped YTMusic construction without retaining authenticated clients."""

from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Callable

from starlette.types import ASGIApp, Receive, Scope, Send

YtmusicClientFactory = Callable[..., Any]
_factory: ContextVar[YtmusicClientFactory | None] = ContextVar("ytmusic_client_factory", default=None)


@contextmanager
def ytmusic_client_context(factory: YtmusicClientFactory | None):
    token = _factory.set(factory)
    try:
        yield
    finally:
        _factory.reset(token)


def get_ytmusic_client_factory(fallback: YtmusicClientFactory) -> YtmusicClientFactory:
    factory = _factory.get()
    return fallback if factory is None else factory


class YtmusicClientMiddleware:
    def __init__(self, app: ASGIApp, factory: YtmusicClientFactory | None = None):
        self.app = app
        self.factory = factory

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        with ytmusic_client_context(self.factory):
            await self.app(scope, receive, send)
