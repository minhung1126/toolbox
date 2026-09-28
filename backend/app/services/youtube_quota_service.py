"""Application-wide YouTube quota ledger."""

from __future__ import annotations

from collections.abc import Mapping
from contextvars import ContextVar

from starlette.types import ASGIApp, Receive, Scope, Send

from backend.app.core.youtube_quota_limiter import (
    DEFAULT_SAFETY_BUFFER_UNITS,
    JSON_SCHEMA_VERSION,
    OFFICIAL_DEFAULT_LIMIT,
    QUOTA_COSTS,
    QUOTA_FILE,
    QUOTA_FILE_SECONDARY,
    QUOTA_RULES_VERIFIED_AT,
    QUOTA_SOURCE_URL,
    YOUTUBE_AUXILIARY_QUOTA_METHODS,
    YOUTUBE_QUOTA_METHODS,
    YouTubeQuotaLimiter,
)

_youtube_quota_trackers: dict[str, YouTubeQuotaLimiter] = {
    "primary": YouTubeQuotaLimiter(QUOTA_FILE, slot="primary"),
    "secondary": YouTubeQuotaLimiter(QUOTA_FILE_SECONDARY, slot="secondary"),
}


_request_trackers: ContextVar[Mapping[str, YouTubeQuotaLimiter] | None] = ContextVar(
    "youtube_quota_trackers", default=None
)


class YouTubeQuotaMiddleware:
    """Resolve quota ledgers per app for existing HTTP/provider helpers."""

    def __init__(self, app: ASGIApp, trackers: Mapping[str, YouTubeQuotaLimiter] | None = None):
        self.app = app
        self.trackers = trackers

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        token = _request_trackers.set(self.trackers)
        try:
            await self.app(scope, receive, send)
        finally:
            _request_trackers.reset(token)


def get_youtube_quota_tracker(slot: str = "primary") -> YouTubeQuotaLimiter:
    slot_name = str(slot or "").strip().casefold()
    scoped = _request_trackers.get()
    trackers = _youtube_quota_trackers if scoped is None else scoped
    if slot_name not in trackers:
        raise ValueError("YouTube quota slot must be primary or secondary")
    return trackers[slot_name]


__all__ = [
    "DEFAULT_SAFETY_BUFFER_UNITS",
    "JSON_SCHEMA_VERSION",
    "OFFICIAL_DEFAULT_LIMIT",
    "QUOTA_COSTS",
    "QUOTA_FILE",
    "QUOTA_FILE_SECONDARY",
    "QUOTA_RULES_VERIFIED_AT",
    "QUOTA_SOURCE_URL",
    "YOUTUBE_QUOTA_METHODS",
    "YOUTUBE_AUXILIARY_QUOTA_METHODS",
    "YouTubeQuotaLimiter",
    "YouTubeQuotaMiddleware",
    "get_youtube_quota_tracker",
]
