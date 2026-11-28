"""Small, process-local request protections for the dashboard API."""

from __future__ import annotations

import ipaddress
import re
import time
from collections import defaultdict, deque
from threading import RLock
from urllib.parse import urlparse

from fastapi import Request

from backend.app.core.config import Settings, get_settings, settings
from backend.app.core.error_contract import http_error
from backend.app.core.session_store import get_session_store, session_store


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._events: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = RLock()

    def check(self, key: str, bucket: str, limit: int, window_seconds: int = 60) -> None:
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            events = self._events[(key, bucket)]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= limit:
                retry_after = max(1, int(events[0] + window_seconds - now) + 1)
                raise http_error(
                    429,
                    "rate_limited",
                    "請求過於頻繁，請稍後再試。",
                    retryable=True,
                    retry_after_seconds=retry_after,
                    headers={"Retry-After": str(retry_after)},
                )
            events.append(now)

            # Prevent attacker-controlled client identities from growing this
            # process-local map without bound.
            if len(self._events) > 4096:
                stale_keys = [
                    event_key
                    for event_key, event_times in self._events.items()
                    if not event_times or event_times[-1] <= cutoff
                ]
                for event_key in stale_keys[:1024]:
                    self._events.pop(event_key, None)
                # If still over threshold (e.g. distributed burst), evict the oldest entries.
                if len(self._events) > 4096:
                    sorted_keys = sorted(
                        self._events.keys(),
                        key=lambda k: self._events[k][-1] if self._events[k] else 0,
                    )
                    for event_key in sorted_keys[:1024]:
                        self._events.pop(event_key, None)


_limiter = SlidingWindowLimiter()


def get_request_limiter(request: Request) -> SlidingWindowLimiter:
    application = request.scope.get("app")
    return getattr(application.state, "request_limiter", _limiter) if application is not None else _limiter


_FORWARDED_FOR_RE = re.compile(r'(?:^|[;,])\s*for\s*=\s*("[^"]+"|[^;,]+)', re.IGNORECASE)


def _parse_ip(value: str | None) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    clean = str(value or "").strip().strip('"').strip("'")
    if not clean or clean.casefold() in {"unknown", "_hidden"} or clean.startswith("_"):
        return None
    if clean.startswith("["):
        end_bracket = clean.find("]")
        if end_bracket == -1:
            return None
        clean = clean[1:end_bracket]
    try:
        return ipaddress.ip_address(clean)
    except ValueError:
        if clean.count(":") == 1:
            host_part = clean.rsplit(":", 1)[0]
            try:
                return ipaddress.ip_address(host_part)
            except ValueError:
                return None
        return None


def _parse_forwarded_ips(request: Request) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    ips: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
    xff = request.headers.get("x-forwarded-for")
    if isinstance(xff, str) and xff.strip():
        for part in xff.split(","):
            parsed = _parse_ip(part)
            if parsed is not None:
                ips.append(parsed)
    if ips:
        return ips
    forwarded = request.headers.get("forwarded")
    if isinstance(forwarded, str) and forwarded.strip():
        for match in _FORWARDED_FOR_RE.findall(forwarded):
            parsed = _parse_ip(match)
            if parsed is not None:
                ips.append(parsed)
    return ips


def _is_trusted_proxy(
    ip: ipaddress.IPv4Address | ipaddress.IPv6Address,
    networks: tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...],
) -> bool:
    return any(ip in network for network in networks)


def _extract_client_ip(request: Request, config: Settings) -> str:
    peer_host = request.client.host if request.client and request.client.host else ""
    peer_ip = _parse_ip(peer_host)
    networks = config.trusted_proxy_networks
    if peer_ip is None or not networks or not _is_trusted_proxy(peer_ip, networks):
        return peer_host or "unknown"

    forwarded_ips = _parse_forwarded_ips(request)
    if not forwarded_ips:
        return str(peer_ip)
    for ip in reversed(forwarded_ips):
        if not _is_trusted_proxy(ip, networks):
            return str(ip)
    return str(forwarded_ips[0])


def _client_key(request: Request) -> str:
    cached = getattr(request.state, "_rate_limit_client_key", None)
    if isinstance(cached, str) and cached:
        return cached

    config = get_settings(settings)
    session_id = request.cookies.get(config.session_cookie_name)
    if session_id and len(session_id) <= 200:
        try:
            session_data = get_session_store(session_store).get(session_id)
        except Exception:
            session_data = None
        if isinstance(session_data, dict):
            user = session_data.get("user") if isinstance(session_data.get("user"), dict) else {}
            subject = str(user.get("sub") or "").strip()
            key = f"subject:{subject}" if subject else f"session:{session_id}"
            request.state._rate_limit_client_key = key
            return key

    key = _extract_client_ip(request, config)
    request.state._rate_limit_client_key = key
    return key


def enforce_api_rate_limit(request: Request) -> None:
    """Apply a modest per-client limit to every versioned API request."""
    get_request_limiter(request).check(_client_key(request), "api", limit=240)


def enforce_workflow_rate_limit(request: Request) -> None:
    """Apply a stricter limit to synchronous, quota-consuming workflows."""
    get_request_limiter(request).check(_client_key(request), "workflow", limit=12)


def enforce_setup_rate_limit(request: Request) -> None:
    """Apply a strict low-frequency limit to initial system setup attempts."""
    get_request_limiter(request).check(_client_key(request), "setup", limit=5, window_seconds=300)


def _origin_from_referer(referer: str) -> str:
    clean = str(referer or "").strip()
    if not clean or any(ch.isspace() for ch in clean):
        return ""
    parsed = urlparse(clean)
    if not parsed.scheme or not parsed.netloc or parsed.username or parsed.password:
        return ""
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}".rstrip("/")


def _normalise_origin(value: str) -> str:
    clean = str(value or "").strip()
    if not clean or any(ch.isspace() for ch in clean):
        return ""
    parsed = urlparse(clean)
    if not parsed.scheme or not parsed.netloc or parsed.username or parsed.password:
        return ""
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}".rstrip("/")


def _allowed_origins() -> set[str]:
    config = get_settings(settings)
    allowed = {
        _normalise_origin(config.frontend_url),
        _normalise_origin(config.base_url),
    }
    allowed.discard("")
    if not config.is_strict_security:
        allowed.update(
            {
                "http://localhost:3000",
                "http://localhost:5173",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:5173",
                "http://testserver",
            }
        )
    return allowed


def require_same_origin(request: Request) -> None:
    """Reject cross-site mutation requests before route dependencies run.

    Explicit Origin/Referer headers (including ``Origin: null``) must match
    ``_allowed_origins()`` in every environment. Headerless programmatic calls
    are permitted only in local ``development`` and ``test`` environments.
    """
    if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
        return

    config = get_settings(settings)
    origin_header = request.headers.get("origin")
    referer_header = request.headers.get("referer")
    if origin_header is not None or referer_header is not None:
        origin = (
            _normalise_origin(origin_header)
            if origin_header is not None
            else _origin_from_referer(referer_header or "")
        )
        if origin and origin in _allowed_origins():
            return
        raise http_error(403, "csrf_origin_denied", "要求來源未通過驗證。")

    if config.ENVIRONMENT in {"development", "test"}:
        return
    raise http_error(403, "csrf_origin_denied", "要求來源未通過驗證。")
