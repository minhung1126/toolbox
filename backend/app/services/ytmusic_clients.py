"""App-scoped YTMusic construction without retaining authenticated clients."""

from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Callable, Protocol

from starlette.types import ASGIApp, Receive, Scope, Send

from backend.app.services.ytmusic_writer import YtmusicWriteProvider


class YtmusicProvider(YtmusicWriteProvider, Protocol):
    def get_library_playlists(self, *, limit: int | None = None) -> list[dict[str, Any]]: ...
    def get_playlist(self, playlistId: str, *, limit: int | None = None) -> dict[str, Any]: ...
    def get_album(self, browseId: str) -> dict[str, Any]: ...
    def get_song(self, videoId: str) -> dict[str, Any]: ...
    def get_account_info(self) -> dict[str, Any]: ...


YtmusicClientFactory = Callable[..., YtmusicProvider]
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
