"""
Shared FastAPI Dependencies

Centralizes common dependency injection functions used across API routes.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import Depends, HTTPException, Request
from google.oauth2.credentials import Credentials

from backend.app.core.account_state import get_account_setting
from backend.app.core.config import settings
from backend.app.core.credential_store import credential_store
from backend.app.core.error_contract import http_error
from backend.app.core.session_store import session_store
from backend.app.core.youtube_context import YouTubeRequestContext
from backend.app.core.youtube_routing import choose_youtube_slot, estimate_youtube_request_units
from backend.app.services.google_auth import (
    get_drive_credentials,
    get_login_credentials,
    get_sheets_credentials,
    get_video_uploader_credentials,
    get_ytmusic_credentials,
    has_drive_read_scope,
    has_sheets_scope,
    has_youtube_scope,
)
from backend.app.services.youtube_quota_service import get_youtube_quota_tracker

logger = logging.getLogger(__name__)


class AuthenticatedSession:
    """Cached container for the authenticated user session in the current request."""

    __slots__ = ("credentials", "email", "session_data", "session_id", "subject", "user")

    def __init__(
        self,
        *,
        session_id: str,
        session_data: dict[str, Any],
        user: dict[str, Any],
        subject: str,
        email: str,
        credentials: Credentials,
    ):
        self.session_id = session_id
        self.session_data = session_data
        self.user = user
        self.subject = subject
        self.email = email
        self.credentials = credentials


def get_authenticated_session(request: Request) -> AuthenticatedSession:
    """Extract and validate the control-panel session, caching on request.state."""
    cached = getattr(request.state, "_authenticated_session", None)
    if isinstance(cached, AuthenticatedSession):
        return cached

    session_id = request.cookies.get(settings.session_cookie_name)
    session_data = session_store.get(session_id) if session_id else None
    user = session_data.get("user") if isinstance(session_data, dict) else None
    subject = str((user or {}).get("sub") or "").strip()
    if not subject:
        logger.warning("API access attempted with a session missing an OIDC subject")
        raise http_error(401, "login_required", "登入資料缺少 Google OIDC subject，請重新登入。")
    creds = get_login_credentials(session_id)

    if not creds or not creds.valid:
        logger.warning("Unauthorized control-panel API access attempt")
        raise http_error(401, "login_required", "控制台登入已失效，請重新登入 Google 帳號。")

    email = str((user or {}).get("email") or "").strip().casefold()
    if (settings.allowed_google_emails or settings.allowlist_required) and not settings.is_google_email_allowed(email):
        logger.warning("Revoked or disallowed user attempted API access: %s", email)
        raise http_error(403, "access_denied", "此 Google 帳號未列入系統允許名單，存取遭拒。")

    auth_session = AuthenticatedSession(
        session_id=session_id,
        session_data=session_data if isinstance(session_data, dict) else {},
        user=user if isinstance(user, dict) else {},
        subject=subject,
        email=email,
        credentials=creds,
    )
    request.state._authenticated_session = auth_session
    return auth_session


def create_youtube_request_context(
    decision: Any,
    owner_sub: str,
    *,
    session_id: str | None = None,
    selection_reason: str | None = None,
) -> YouTubeRequestContext:
    """Standardized factory to build a YouTubeRequestContext from a routing decision."""
    return YouTubeRequestContext(
        slot=decision.slot,
        credentials=decision.credentials,
        quota_limiter=get_youtube_quota_tracker(decision.slot),
        channel_id=decision.channel_id,
        owner_sub=owner_sub,
        routing_mode=decision.routing_mode,
        selection_reason=selection_reason or decision.reason,
        estimated_units=decision.estimated_units,
        preferred_slot=decision.preferred_slot,
        session_id=session_id,
    )


def _get_preview_slot_hint(path: str, body: object) -> str | None:
    """Only pin a slot for a write request carrying a complete preview."""
    normalized_path = path.rstrip("/")
    if not isinstance(body, dict) or not (
        normalized_path.endswith("/batch-update") or normalized_path.endswith("/publish-and-cleanup")
    ):
        return None
    if not str(body.get("preview_token") or "").strip() or not isinstance(body.get("preview_snapshot"), dict):
        return None
    hint = body.get("youtube_slot")
    if not isinstance(hint, str) or not hint.strip():
        snapshot = body.get("preview_snapshot")
        hint = snapshot.get("youtube_slot") if isinstance(snapshot, dict) else None
    return hint if isinstance(hint, str) else None


def require_login_credentials(request: Request) -> Credentials:
    """Extract and validate control-panel login credentials from session."""
    return get_authenticated_session(request).credentials


def require_account_subject(
    request: Request,
    creds: Credentials = Depends(require_login_credentials),
) -> str:
    """Resolve the authenticated Google account used to scope saved state."""
    del creds
    return get_authenticated_session(request).subject


def require_account_email(
    request: Request,
    creds: Credentials = Depends(require_login_credentials),
) -> str:
    """Resolve the authenticated Google account email."""
    del creds
    return get_authenticated_session(request).email


def require_sheets_credentials(
    request: Request,
    owner_sub: str = Depends(require_account_subject),
) -> Credentials:
    """
    Extract and validate Google Sheets credentials for the authenticated user.
    Raises 403 if Google Sheets authorization has not been granted.
    """
    session_id = request.cookies.get(settings.session_cookie_name)
    creds = get_sheets_credentials(session_id=session_id, owner_sub=owner_sub)
    if not creds or not creds.valid or not has_sheets_scope(creds):
        logger.warning("Sheets API access attempted without valid Sheets authorization (sub=%s)", owner_sub)
        raise http_error(
            403,
            "google_sheets_scope_required",
            "Google 試算表權限不足，請先授權 Google 試算表。",
            reauthorization_required=True,
        )
    return creds


def require_drive_credentials(
    request: Request,
    owner_sub: str = Depends(require_account_subject),
) -> Credentials:
    """
    Extract and validate Google Drive credentials for the authenticated user.
    Raises 403 if Google Drive authorization has not been granted.
    """
    session_id = request.cookies.get(settings.session_cookie_name)
    creds = get_drive_credentials(session_id=session_id, owner_sub=owner_sub)
    if not creds or not creds.valid or not has_drive_read_scope(creds):
        logger.warning("Drive API access attempted without valid Drive authorization (sub=%s)", owner_sub)
        raise http_error(
            403,
            "google_drive_scope_required",
            "Google Drive 權限不足，請重新授權 Google Drive。",
            reauthorization_required=True,
        )
    return creds


async def _safe_read_request_json(request: Request) -> dict[str, Any]:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return {}
    try:
        data = await request.json()
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


async def require_youtube_context(request: Request) -> YouTubeRequestContext:
    """Resolve one quota-aware YouTube slot once at request start."""
    auth_session = get_authenticated_session(request)
    session_id = auth_session.session_id
    owner_sub = auth_session.subject

    body = await _safe_read_request_json(request)
    default_playlist_id = get_account_setting(owner_sub, "default_playlist_id", "")
    slot_hint = _get_preview_slot_hint(request.url.path, body)
    estimated_units = estimate_youtube_request_units(
        request.url.path,
        body if isinstance(body, dict) else {},
        default_playlist_id=str(default_playlist_id or ""),
    )
    decision = choose_youtube_slot(
        session_id,
        owner_sub,
        estimated_units=estimated_units,
        slot_hint=slot_hint if isinstance(slot_hint, str) else None,
    )
    logger.info(
        "YouTube request routed to slot=%s mode=%s reason=%s estimated_units=%s",
        decision.slot,
        decision.routing_mode,
        decision.reason,
        decision.estimated_units,
    )
    return create_youtube_request_context(
        decision,
        owner_sub,
        session_id=session_id,
    )


async def require_ytmusic_context(request: Request) -> YouTubeRequestContext:
    """Resolve dedicated YouTube Music credentials and context.

    Prefers dedicated YouTube Music authorization. Falls back to YouTube context if available.
    Raises 403 if neither is authorized.
    """
    auth_session = get_authenticated_session(request)
    session_id = auth_session.session_id
    owner_sub = auth_session.subject

    ytmusic_creds = get_ytmusic_credentials(session_id=session_id, owner_sub=owner_sub)
    if ytmusic_creds and ytmusic_creds.valid and has_youtube_scope(ytmusic_creds):
        ytmusic_public = credential_store.get_ytmusic_public(owner_sub) or {}
        channel_id = ytmusic_public.get("channel_id")
        limiter = get_youtube_quota_tracker("primary")

        body = await _safe_read_request_json(request)

        estimated_units = estimate_youtube_request_units(
            request.url.path,
            body if isinstance(body, dict) else {},
        )

        logger.info(
            "YouTube Music request routed with dedicated ytmusic credentials (channel=%s, estimated_units=%s)",
            channel_id,
            estimated_units,
        )
        return YouTubeRequestContext(
            slot="primary",
            credentials=ytmusic_creds,
            quota_limiter=limiter,
            owner_sub=owner_sub,
            channel_id=channel_id,
            routing_mode="ytmusic_dedicated",
            selection_reason="ytmusic_oauth_connection",
            estimated_units=estimated_units,
            preferred_slot="primary",
            session_id=session_id,
        )

    try:
        return await require_youtube_context(request)
    except HTTPException:
        logger.warning("YouTube Music access attempted without authorization (sub=%s)", owner_sub)
        raise http_error(
            403,
            "ytmusic_scope_required",
            "YouTube Music 權限不足，請先授權 YouTube Music 帳號。",
            reauthorization_required=True,
        )


async def require_video_uploader_context(request: Request) -> YouTubeRequestContext:
    """Resolve dedicated Video Uploader YouTube credentials and context.

    Requires dedicated Video Uploader YouTube channel authorization.
    Raises 403 if not authorized.
    """
    auth_session = get_authenticated_session(request)
    session_id = auth_session.session_id
    owner_sub = auth_session.subject

    video_creds = get_video_uploader_credentials(session_id=session_id, owner_sub=owner_sub)
    if not video_creds or not video_creds.valid or not has_youtube_scope(video_creds):
        logger.warning("Video Uploader access attempted without authorization (sub=%s)", owner_sub)
        raise http_error(
            403,
            "video_uploader_scope_required",
            "影片上傳 YouTube 頻道尚未授權或已失效，請先授權專屬 YouTube 頻道。",
            reauthorization_required=True,
        )

    public_record = credential_store.get_video_uploader_public(owner_sub) or {}
    channel_id = public_record.get("channel_id")
    limiter = get_youtube_quota_tracker("primary")

    body = await _safe_read_request_json(request)
    estimated_units = estimate_youtube_request_units(
        request.url.path,
        body if isinstance(body, dict) else {},
    )

    logger.info(
        "Video Uploader request routed with dedicated credentials (channel=%s, estimated_units=%s)",
        channel_id,
        estimated_units,
    )
    return YouTubeRequestContext(
        slot="primary",
        credentials=video_creds,
        quota_limiter=limiter,
        owner_sub=owner_sub,
        channel_id=channel_id,
        routing_mode="video_uploader_dedicated",
        selection_reason="video_uploader_oauth_connection",
        estimated_units=estimated_units,
        preferred_slot="primary",
        session_id=session_id,
    )


__all__ = [
    "AuthenticatedSession",
    "create_youtube_request_context",
    "get_authenticated_session",
    "require_account_email",
    "require_account_subject",
    "require_drive_credentials",
    "require_login_credentials",
    "require_sheets_credentials",
    "require_video_uploader_context",
    "require_youtube_context",
    "require_ytmusic_context",
]
