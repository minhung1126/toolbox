import logging
import secrets
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse

from backend.app.core.account_state import (
    get_account_active_slot,
    get_account_youtube_routing_mode,
    set_account_active_slot,
)
from backend.app.core.config import normalize_youtube_slot, settings
from backend.app.core.credential_store import credential_store
from backend.app.core.dependencies import get_authenticated_session
from backend.app.core.error_contract import http_error
from backend.app.core.runtime_config import runtime_config
from backend.app.core.security import (
    GOOGLE_OAUTH_STATE_SALT,
    sign_timed_data,
    verify_timed_data,
)
from backend.app.core.session_store import SESSION_MAX_AGE, session_store
from backend.app.services.google_auth import (
    DRIVE_SCOPES,
    LOGIN_SCOPES,
    SHEETS_SCOPES,
    YOUTUBE_SCOPES,
    exchange_code_for_tokens,
    get_drive_credentials,
    get_login_credentials,
    get_sheets_credentials,
    get_youtube_credentials,
    get_ytmusic_credentials,
    has_drive_read_scope,
    has_sheets_scope,
    has_youtube_scope,
    login_scope_status,
)
from backend.app.services.google_auth import (
    get_auth_url as build_google_auth_url,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Google OAuth"])

OAUTH_FLOW_COOKIE = settings.oauth_flow_cookie_name
OAUTH_FLOW_MAX_AGE = 10 * 60
SESSION_COOKIE = settings.session_cookie_name
LOGIN_FLOW = "login"
SHEETS_FLOW = "sheets"
DRIVE_FLOW = "drive"
YOUTUBE_FLOW = "youtube"
YTMUSIC_FLOW = "ytmusic"


def redirect_with_auth_error(message: str, flow_type: str = LOGIN_FLOW) -> RedirectResponse:
    """Redirect to the frontend with a safely encoded OAuth error."""
    if flow_type == YOUTUBE_FLOW:
        hash_key = "youtube_auth_error"
    elif flow_type == YTMUSIC_FLOW:
        hash_key = "ytmusic_auth_error"
    elif flow_type == SHEETS_FLOW:
        hash_key = "sheets_auth_error"
    elif flow_type == DRIVE_FLOW:
        hash_key = "drive_auth_error"
    else:
        hash_key = "auth_error"
    response = RedirectResponse(url=f"{settings.frontend_url}/#{hash_key}={quote(message, safe='')}")
    _delete_flow_cookie(response)
    return response


def _delete_flow_cookie(response: Response) -> None:
    response.delete_cookie(
        OAUTH_FLOW_COOKIE,
        path="/",
        secure=settings.cookie_secure,
        httponly=True,
        samesite="lax",
    )


def _check_oauth_configuration(purpose: str = LOGIN_FLOW, slot: str = "primary") -> None:
    if purpose == YOUTUBE_FLOW:
        youtube_slot = settings.youtube_oauth_slot(normalize_youtube_slot(slot))
        if not youtube_slot.configured:
            raise http_error(
                400,
                "youtube_slot_not_configured",
                "此 YouTube OAuth slot 尚未完成伺服器設定。",
                youtube_slot=normalize_youtube_slot(slot),
            )
        return
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise http_error(400, "google_oauth_not_configured", "尚未完成 Google OAuth 設定，請聯絡系統管理員。")


def _set_flow_cookie(
    response: Response,
    *,
    flow_type: str,
    state: str,
    code_verifier: str,
    session_id: Optional[str] = None,
    slot: str = "primary",
) -> None:
    flow_payload = {
        "flow_type": flow_type,
        "state": state,
        "code_verifier": code_verifier,
    }
    if session_id:
        flow_payload["session_id"] = session_id
    if flow_type == YOUTUBE_FLOW:
        flow_payload["slot"] = normalize_youtube_slot(slot)
    response.set_cookie(
        key=OAUTH_FLOW_COOKIE,
        value=sign_timed_data(flow_payload, salt=GOOGLE_OAUTH_STATE_SALT),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=OAUTH_FLOW_MAX_AGE,
        path="/",
    )


def _get_authenticated_session_id(request: Request) -> str:
    return get_authenticated_session(request).session_id


def _generate_flow_auth_url(
    *,
    flow_type: str,
    response: Response,
    session_id: Optional[str] = None,
    slot: str = "primary",
    error_code: str,
    error_message: str,
) -> dict:
    _check_oauth_configuration(flow_type, slot)
    try:
        kwargs = {"slot": slot} if flow_type == YOUTUBE_FLOW else {}
        url, state, code_verifier = build_google_auth_url(flow_type, **kwargs)
        _set_flow_cookie(
            response,
            flow_type=flow_type,
            state=state,
            code_verifier=code_verifier,
            session_id=session_id,
            slot=slot,
        )
        return {"auth_url": url}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to generate %s auth URL: %s", flow_type, type(exc).__name__)
        raise http_error(500, error_code, error_message, retryable=True) from exc


def _disconnect_service(request: Request, clear_fn, service_name: str) -> dict:
    owner_sub = get_authenticated_session(request).subject
    clear_fn(owner_sub)
    logger.info("Google %s authorization disconnected for sub: %s", service_name.capitalize(), owner_sub)
    return {"status": f"{service_name}_disconnected"}


def _validate_callback_session(request: Request, flow_state: Optional[dict]) -> Optional[str]:
    session_id = request.cookies.get(SESSION_COOKIE)
    expected_session_id = (flow_state or {}).get("session_id")
    session_data = session_store.get(session_id) if session_id else None
    owner_sub = str(((session_data or {}).get("user") or {}).get("sub") or "").strip()
    login_credentials = get_login_credentials(session_id) if session_id else None
    if (
        not session_id
        or not expected_session_id
        or not secrets.compare_digest(session_id, str(expected_session_id))
        or not owner_sub
        or not login_credentials
        or not login_credentials.valid
    ):
        return None
    return owner_sub


def _build_service_authorization_status(
    creds,
    public_record: dict,
    has_scope_fn,
    fallback_user: Optional[dict] = None,
) -> dict:
    connected = bool(creds and creds.valid and has_scope_fn(creds))
    return {
        "connected": connected,
        "user": public_record.get("user") or (fallback_user if connected and not public_record else None),
        "scopes": sorted(getattr(creds, "scopes", None) or public_record.get("scopes") or []),
        "token_status": public_record.get("status", "active" if connected else "not_connected"),
        "token_expires_at": public_record.get("token_expires_at"),
        "last_refreshed_at": public_record.get("last_refreshed_at"),
        "last_refresh_error": public_record.get("last_refresh_error"),
    }


@router.get("/config")
def get_auth_config():
    """Return OAuth configuration status without exposing credentials."""
    youtube_slots = {
        slot: {
            "slot": slot,
            "label": slot_config.label,
            "configured": slot_config.configured,
            "enabled": slot_config.enabled,
            "client_fingerprint": slot_config.client_fingerprint,
            "quota_limit": slot_config.quota_limit,
            "safety_buffer_units": slot_config.safety_buffer_units,
        }
        for slot, slot_config in settings.youtube_oauth_slots.items()
    }
    return {
        "host": settings.base_url,
        "frontend_url": settings.frontend_url,
        "redirect_uri": settings.get_redirect_uri(),
        "has_client_id": bool(settings.GOOGLE_CLIENT_ID),
        "has_client_secret": bool(settings.GOOGLE_CLIENT_SECRET),
        "login_scopes": list(LOGIN_SCOPES),
        "sheets_scopes": list(SHEETS_SCOPES),
        "drive_scopes": list(DRIVE_SCOPES),
        "youtube_scopes": list(YOUTUBE_SCOPES),
        "ytmusic_scopes": list(YOUTUBE_SCOPES),
        "youtube_default_slot": settings.youtube_default_slot,
        "youtube_slots": youtube_slots,
    }


@router.get("/url")
def get_google_auth_url(response: Response):
    """Generate the control-panel login OAuth URL."""
    if settings.allowlist_required and not settings.allowed_google_emails:
        raise http_error(503, "google_allowlist_not_configured", "HTTPS／正式環境必須設定允許的 Google 帳號。")
    return _generate_flow_auth_url(
        flow_type=LOGIN_FLOW,
        response=response,
        error_code="oauth_url_failed",
        error_message="無法建立 Google 登入授權網址，請稍後再試。",
    )


@router.get("/sheets/url")
def get_sheets_auth_url(request: Request, response: Response):
    """Generate the dedicated Google Sheets OAuth URL for an authenticated user."""
    return _generate_flow_auth_url(
        flow_type=SHEETS_FLOW,
        response=response,
        session_id=_get_authenticated_session_id(request),
        error_code="sheets_oauth_url_failed",
        error_message="無法建立 Google 試算表授權網址，請稍後再試。",
    )


@router.post("/sheets/disconnect")
def disconnect_sheets(request: Request):
    """Disconnect the dedicated Google Sheets authorization."""
    return _disconnect_service(request, credential_store.clear_sheets, "sheets")


@router.get("/drive/url")
def get_drive_auth_url(request: Request, response: Response):
    """Generate the dedicated Google Drive OAuth URL for an authenticated user."""
    return _generate_flow_auth_url(
        flow_type=DRIVE_FLOW,
        response=response,
        session_id=_get_authenticated_session_id(request),
        error_code="drive_oauth_url_failed",
        error_message="無法建立 Google 雲端硬碟授權網址，請稍後再試。",
    )


@router.post("/drive/disconnect")
def disconnect_drive(request: Request):
    """Disconnect the dedicated Google Drive authorization."""
    return _disconnect_service(request, credential_store.clear_drive, "drive")


@router.get("/ytmusic/url")
def get_ytmusic_auth_url(request: Request, response: Response):
    """Generate the dedicated YouTube Music OAuth URL for an authenticated user."""
    return _generate_flow_auth_url(
        flow_type=YTMUSIC_FLOW,
        response=response,
        session_id=_get_authenticated_session_id(request),
        error_code="ytmusic_oauth_url_failed",
        error_message="無法建立 YouTube Music 授權網址，請稍後再試。",
    )


@router.post("/ytmusic/disconnect")
def disconnect_ytmusic(request: Request):
    """Disconnect the dedicated YouTube Music authorization."""
    return _disconnect_service(request, credential_store.clear_ytmusic, "ytmusic")


@router.get("/youtube/{slot}/url")
def get_youtube_slot_auth_url(slot: str, request: Request, response: Response):
    """Generate a separate OAuth URL for one configured YouTube slot."""
    try:
        slot_name = normalize_youtube_slot(slot)
    except ValueError as exc:
        raise http_error(400, "youtube_slot_invalid", "不支援的 YouTube OAuth slot。") from exc
    return _generate_flow_auth_url(
        flow_type=YOUTUBE_FLOW,
        response=response,
        session_id=_get_authenticated_session_id(request),
        slot=slot_name,
        error_code="youtube_oauth_url_failed",
        error_message="無法建立 YouTube 頻道授權網址，請稍後再試。",
    )


@router.get("/callback")
def google_oauth_callback(
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
):
    """Handle either the login or the separately initiated YouTube callback."""
    flow_cookie = request.cookies.get(OAUTH_FLOW_COOKIE)
    flow_state = (
        verify_timed_data(flow_cookie, salt=GOOGLE_OAUTH_STATE_SALT, max_age=OAUTH_FLOW_MAX_AGE)
        if flow_cookie
        else None
    )
    flow_type = (flow_state or {}).get("flow_type", LOGIN_FLOW)
    if flow_type not in {LOGIN_FLOW, SHEETS_FLOW, DRIVE_FLOW, YOUTUBE_FLOW, YTMUSIC_FLOW}:
        flow_type = LOGIN_FLOW
    flow_slot = "primary"
    if flow_type == YOUTUBE_FLOW:
        try:
            flow_slot = normalize_youtube_slot((flow_state or {}).get("slot", ""))
        except ValueError:
            return redirect_with_auth_error("YouTube OAuth slot 驗證失敗。", YOUTUBE_FLOW)

    oauth_error = str(error).strip() if isinstance(error, str) and str(error).strip() else None
    if oauth_error:
        logger.info("Google OAuth provider returned an error: %s", oauth_error)
        if flow_type == YOUTUBE_FLOW:
            message = "YouTube 頻道 Google 授權遭拒，請重新嘗試。"
        elif flow_type == YTMUSIC_FLOW:
            message = "YouTube Music 授權遭拒，請重新嘗試。"
        elif flow_type == SHEETS_FLOW:
            message = "Google 試算表授權遭拒，請重新嘗試。"
        elif flow_type == DRIVE_FLOW:
            message = "Google 雲端硬碟授權遭拒，請重新嘗試。"
        else:
            message = "Google 登入授權遭拒，請重新嘗試。"
        if isinstance(error_description, str) and error_description.strip():
            logger.debug("Google OAuth error description: %s", error_description.strip())
        return redirect_with_auth_error(message, flow_type)

    code_str = str(code).strip() if isinstance(code, str) and str(code).strip() else ""
    state_str = str(state).strip() if isinstance(state, str) and str(state).strip() else ""
    if not code_str or not state_str:
        return redirect_with_auth_error("Google OAuth callback 缺少 code 或 state。", flow_type)

    if not flow_state:
        if flow_type == YOUTUBE_FLOW:
            message = "YouTube Google OAuth 工作階段已逾時，請重新嘗試。"
        elif flow_type == YTMUSIC_FLOW:
            message = "YouTube Music OAuth 工作階段已逾時，請重新嘗試。"
        elif flow_type == SHEETS_FLOW:
            message = "Google 試算表 OAuth 工作階段已逾時，請重新嘗試。"
        elif flow_type == DRIVE_FLOW:
            message = "Google 雲端硬碟 OAuth 工作階段已逾時，請重新嘗試。"
        else:
            message = "Google OAuth 工作階段已逾時，請重新登入。"
        return redirect_with_auth_error(message, flow_type)

    expected_state = flow_state.get("state")
    code_verifier = flow_state.get("code_verifier")
    if not expected_state or not code_verifier:
        return redirect_with_auth_error("Google OAuth 工作階段資料不完整，請重新嘗試。", flow_type)

    if not secrets.compare_digest(state_str, expected_state):
        return redirect_with_auth_error("Google OAuth state 驗證失敗，請重新嘗試。", flow_type)

    try:
        token_dict = exchange_code_for_tokens(
            code=code_str,
            code_verifier=code_verifier,
            purpose=flow_type,
            slot=flow_slot,
        )
        user_info = token_dict.get("user") or {}

        if flow_type in {SHEETS_FLOW, DRIVE_FLOW, YTMUSIC_FLOW}:
            owner_sub = _validate_callback_session(request, flow_state)
            if not owner_sub:
                return redirect_with_auth_error("控制台登入已失效，請重新登入後再進行授權。", flow_type)
            if flow_type == SHEETS_FLOW:
                credential_store.save_sheets_connection(token_dict, owner_sub=owner_sub)
                response = RedirectResponse(url=f"{settings.frontend_url}/#sheets_auth_success=1")
            elif flow_type == DRIVE_FLOW:
                credential_store.save_drive_connection(token_dict, owner_sub=owner_sub)
                response = RedirectResponse(url=f"{settings.frontend_url}/#drive_auth_success=1")
            else:
                credential_store.save_ytmusic_connection(token_dict, owner_sub=owner_sub)
                response = RedirectResponse(url=f"{settings.frontend_url}/#ytmusic_auth_success=1")
            _delete_flow_cookie(response)
            return response

        if flow_type == YOUTUBE_FLOW:
            owner_sub = _validate_callback_session(request, flow_state)
            if not owner_sub:
                return redirect_with_auth_error("控制台登入已失效，請重新登入後再連結 YouTube。", YOUTUBE_FLOW)
            channel_id = str(token_dict.get("channel_id") or "").strip()
            other_slot = "secondary" if flow_slot == "primary" else "primary"
            other_public = credential_store.get_youtube_public(owner_sub, slot=other_slot) or {}
            other_channel_id = str(other_public.get("channel_id") or "").strip()
            if other_channel_id and channel_id and other_channel_id != channel_id:
                return redirect_with_auth_error("Primary 與 Secondary 槽位必須管理同一個 YouTube 頻道。", YOUTUBE_FLOW)
            credential_store.save_youtube_connection(token_dict, owner_sub=owner_sub, slot=flow_slot)
            response = RedirectResponse(
                url=f"{settings.frontend_url}/#youtube_auth_success=1&youtube_slot={quote(flow_slot, safe='')}"
            )
            _delete_flow_cookie(response)
            return response

        email = str(user_info.get("email") or "").strip()
        if not settings.is_google_email_allowed(email):
            logger.warning("Disallowed Google account attempted OAuth login: %s", email)
            return redirect_with_auth_error("此 Google 帳號未列入系統允許名單，無法登入。", LOGIN_FLOW)
        subject = str(user_info.get("sub") or user_info.get("id") or "").strip()
        if not subject:
            return redirect_with_auth_error("Google OAuth 使用者資料缺少 OIDC subject，請重新嘗試。", LOGIN_FLOW)
        # Keep login OAuth secrets in the encrypted persistent store. The
        # browser session only carries the account identity and a random id.
        credential_store.save_google_connection(token_dict, owner_sub=subject)
        session_id = session_store.create(
            {
                "credential_provider": "google_login",
                "user": {**user_info, "sub": subject},
            },
            max_age=SESSION_MAX_AGE,
        )

        response = RedirectResponse(url=f"{settings.frontend_url}/#auth_success=1")
        response.set_cookie(
            key=SESSION_COOKIE,
            value=session_id,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
            max_age=SESSION_MAX_AGE,
            path="/",
        )
        _delete_flow_cookie(response)
        return response
    except Exception as exc:
        logger.error("OAuth callback error (%s/%s): %s", flow_type, flow_slot, type(exc).__name__)
        if flow_type == YOUTUBE_FLOW:
            message = "YouTube 頻道 Google 授權失敗，請重新嘗試。"
        elif flow_type == SHEETS_FLOW:
            message = "Google 試算表授權失敗，請重新嘗試。"
        elif flow_type == DRIVE_FLOW:
            message = "Google 雲端硬碟授權失敗，請重新嘗試。"
        else:
            message = "Google OAuth 登入失敗，請重新嘗試。"
        return redirect_with_auth_error(message, flow_type)


@router.get("/user")
def get_user_status(request: Request):
    """Check control-panel login, sheets, drive, and YouTube authorization status."""
    session_id = request.cookies.get(SESSION_COOKIE)
    session_data = session_store.get(session_id) or {}
    session_sub = str(((session_data.get("user") or {}).get("sub") or "")).strip() or None
    creds = get_login_credentials(session_id) if session_sub else None
    if not session_sub or not creds or not creds.valid:
        return {
            "authenticated": False,
            "user": None,
            "youtube": {"slots": {}},
        }

    user_info = session_data.get("user") or {"email": "Authenticated User"}
    token_status = credential_store.get_google_public(session_sub) or {}

    sheets_creds = get_sheets_credentials(session_id=session_id, owner_sub=session_sub)
    drive_creds = get_drive_credentials(session_id=session_id, owner_sub=session_sub)
    ytmusic_creds = get_ytmusic_credentials(session_id=session_id, owner_sub=session_sub)
    sheets_public = credential_store.get_sheets_public(session_sub) or {}
    drive_public = credential_store.get_drive_public(session_sub) or {}
    ytmusic_public = credential_store.get_ytmusic_public(session_sub) or {}

    authorizations = {
        "sheets": _build_service_authorization_status(sheets_creds, sheets_public, has_sheets_scope, user_info),
        "drive": _build_service_authorization_status(drive_creds, drive_public, has_drive_read_scope, user_info),
        "ytmusic": _build_service_authorization_status(ytmusic_creds, ytmusic_public, has_youtube_scope, user_info),
    }

    google_scope_status = login_scope_status(
        creds,
        sheets_credentials=sheets_creds,
        drive_credentials=drive_creds,
        ytmusic_credentials=ytmusic_creds,
    )

    youtube_slots = {}
    for slot, slot_config in settings.youtube_oauth_slots.items():
        youtube_public = credential_store.get_youtube_public(session_sub, slot=slot) or {}
        youtube_creds = get_youtube_credentials(session_id, slot=slot) if slot_config.configured else None
        quota_limit, quota_buffer = runtime_config.get_youtube_quota_settings(slot)
        authenticated = bool(
            slot_config.configured and youtube_creds and youtube_creds.valid and youtube_public.get("channel_id")
        )
        youtube_slots[slot] = {
            "slot": slot,
            "label": slot_config.label,
            "configured": slot_config.configured,
            "enabled": slot_config.enabled,
            "authenticated": authenticated,
            "user": youtube_public.get("user"),
            "channel_id": youtube_public.get("channel_id"),
            "channel_title": youtube_public.get("channel_title"),
            "token_expired": bool(youtube_creds and youtube_creds.expired),
            "token_expires_at": youtube_public.get("token_expires_at"),
            "token_status": youtube_public.get("status", "not_connected"),
            "last_refreshed_at": youtube_public.get("last_refreshed_at"),
            "last_refresh_error": youtube_public.get("last_refresh_error"),
            "client_fingerprint": youtube_public.get("client_fingerprint"),
            "can_be_active": authenticated,
            "quota_limit": quota_limit,
            "safety_buffer_units": quota_buffer,
        }
    primary_channel_id = str(youtube_slots["primary"].get("channel_id") or "").strip()
    secondary_channel_id = str(youtube_slots["secondary"].get("channel_id") or "").strip()
    channel_mismatch = bool(primary_channel_id and secondary_channel_id and primary_channel_id != secondary_channel_id)
    if channel_mismatch:
        for slot in youtube_slots.values():
            slot["channel_mismatch"] = True
            slot["can_be_active"] = False
    else:
        for slot in youtube_slots.values():
            slot["channel_mismatch"] = False
    active_slot = get_account_active_slot(session_sub)
    youtube_connection = {
        "active_slot": active_slot,
        "routing_mode": get_account_youtube_routing_mode(session_sub),
        "slots": youtube_slots,
    }
    return {
        "authenticated": True,
        "user": user_info,
        "token_expired": creds.expired,
        "token_expires_at": token_status.get("token_expires_at"),
        "token_status": token_status.get("status", "active"),
        "last_refreshed_at": token_status.get("last_refreshed_at"),
        "last_refresh_error": token_status.get("last_refresh_error"),
        "google_scopes": google_scope_status,
        "authorizations": authorizations,
        "youtube": youtube_connection,
    }


@router.post("/youtube/{slot}/disconnect")
def disconnect_youtube_slot(slot: str, request: Request, confirm: bool = Query(False)):
    """Remove only one persistent YouTube authorization."""
    try:
        slot_name = normalize_youtube_slot(slot)
    except ValueError as exc:
        raise http_error(400, "youtube_slot_invalid", "不支援的 YouTube OAuth slot。") from exc
    auth_session = get_authenticated_session(request)
    owner_sub = auth_session.subject
    if slot_name == get_account_active_slot(owner_sub) and not confirm:
        raise http_error(
            409,
            "youtube_active_slot_disconnect_requires_confirmation",
            "請先切換作用中的 YouTube slot，或以二次確認斷開目前 slot。",
            youtube_slot=slot_name,
        )
    credential_store.clear_youtube(owner_sub, slot=slot_name)
    logger.info("YouTube OAuth slot disconnected: %s", slot_name)
    return {"status": "youtube_disconnected", "slot": slot_name}


@router.post("/youtube/{slot}/activate")
def activate_youtube_slot(slot: str, request: Request):
    """Make a valid, channel-verified slot the default for new requests."""
    try:
        slot_name = normalize_youtube_slot(slot)
    except ValueError as exc:
        raise http_error(400, "youtube_slot_invalid", "不支援的 YouTube OAuth slot。") from exc
    if not settings.youtube_oauth_slot(slot_name).configured:
        raise http_error(
            400, "youtube_slot_not_configured", "此 YouTube OAuth slot 尚未完成伺服器設定。", youtube_slot=slot_name
        )
    auth_session = get_authenticated_session(request)
    owner_sub = auth_session.subject
    session_id = auth_session.session_id
    public = credential_store.get_youtube_public(owner_sub, slot=slot_name) or {}
    credentials = get_youtube_credentials(session_id, slot=slot_name)
    other_slot = "secondary" if slot_name == "primary" else "primary"
    other_public = credential_store.get_youtube_public(owner_sub, slot=other_slot) or {}
    channel_id = str(public.get("channel_id") or "").strip()
    other_channel_id = str(other_public.get("channel_id") or "").strip()
    if channel_id and other_channel_id and channel_id != other_channel_id:
        raise http_error(
            409,
            "youtube_channel_mismatch",
            "Primary 與 secondary 必須管理同一個 YouTube Channel，不能啟用此 slot。",
            youtube_slot=slot_name,
        )
    if not credentials or not credentials.valid or not public.get("channel_id"):
        raise http_error(
            409,
            "youtube_slot_not_ready",
            "此 slot 尚未完成有效授權或頻道驗證。",
            youtube_slot=slot_name,
        )
    set_account_active_slot(owner_sub, slot_name)
    logger.info("YouTube active slot changed to %s", slot_name)
    return {"status": "youtube_slot_activated", "active_slot": slot_name}


@router.post("/logout")
def logout(request: Request):
    """Clear the control-panel login session without removing YouTube access."""
    res = Response(content='{"status":"logged_out"}', media_type="application/json")
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        session_store.delete(session_id)
    res.delete_cookie(SESSION_COOKIE, path="/", secure=settings.cookie_secure, httponly=True, samesite="lax")
    res.delete_cookie(OAUTH_FLOW_COOKIE, path="/", secure=settings.cookie_secure, httponly=True, samesite="lax")
    return res
