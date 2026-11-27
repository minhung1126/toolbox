import ipaddress
import logging
import re
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Request
from google.oauth2.credentials import Credentials
from pydantic import BaseModel, Field, field_validator

from backend.app.core.config import Settings, get_settings, settings
from backend.app.core.dependencies import require_account_email, require_login_credentials
from backend.app.core.error_contract import http_error
from backend.app.core.request_protection import enforce_setup_rate_limit
from backend.app.core.runtime_config import RuntimeConfig, get_runtime_config, runtime_config
from backend.app.core.session_store import get_session_store, session_store
from backend.app.core.system_secrets import get_system_secrets, resolve_secret_update, system_secrets

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/system", tags=["System & Setup Configuration"])

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


class SetupRequest(BaseModel):
    google_client_id: str = Field(..., min_length=5, max_length=512)
    google_client_secret: str = Field(..., min_length=5, max_length=512)
    admin_email: str = Field(..., min_length=3, max_length=256)
    pin: Optional[str] = Field(default="", max_length=32)

    @field_validator("admin_email")
    @classmethod
    def validate_email(cls, val: str) -> str:
        clean = val.strip().casefold()
        if not EMAIL_REGEX.match(clean):
            raise ValueError("請輸入有效的 Google 電子郵件信箱。")
        return clean

    @field_validator("google_client_id", "google_client_secret")
    @classmethod
    def strip_credentials(cls, val: str) -> str:
        clean = val.strip()
        if not clean:
            raise ValueError("憑證欄位不能為空。")
        return clean


class CredentialsUpdateRequest(BaseModel):
    google_client_id: Optional[str] = Field(default=None, max_length=512)
    google_client_secret: Optional[str] = Field(default=None, max_length=512)
    youtube_primary_client_id: Optional[str] = Field(default=None, max_length=512)
    youtube_primary_client_secret: Optional[str] = Field(default=None, max_length=512)
    youtube_secondary_client_id: Optional[str] = Field(default=None, max_length=512)
    youtube_secondary_client_secret: Optional[str] = Field(default=None, max_length=512)
    clear_google: bool = False
    clear_youtube_primary: bool = False
    clear_youtube_secondary: bool = False


class EmailActionRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=256)

    @field_validator("email")
    @classmethod
    def validate_email(cls, val: str) -> str:
        clean = val.strip().casefold()
        if not EMAIL_REGEX.match(clean):
            raise ValueError("請輸入有效的電子郵件信箱。")
        return clean


class AllowNewUsersUpdateRequest(BaseModel):
    allow_new_users: bool


_PROXY_FORWARDING_HEADERS = (
    "forwarded",
    "x-forwarded-for",
    "x-real-ip",
    "x-forwarded-host",
    "x-forwarded-proto",
    "cf-connecting-ip",
)

_SECRET_TO_ENV_ATTR = {
    "google_client_secret": "GOOGLE_CLIENT_SECRET",
    "youtube_primary_client_secret": "YOUTUBE_OAUTH_PRIMARY_CLIENT_SECRET",
    "youtube_secondary_client_secret": "YOUTUBE_OAUTH_SECONDARY_CLIENT_SECRET",
}


def _extract_hostname(raw_host: Optional[str]) -> str:
    clean = str(raw_host or "").strip().casefold()
    if not clean:
        return ""
    if clean.startswith("["):
        end_bracket = clean.find("]")
        return clean[1:end_bracket] if end_bracket != -1 else ""
    if clean.count(":") == 1:
        return clean.rsplit(":", 1)[0]
    return clean


def _is_loopback_host(host: Optional[str]) -> bool:
    extracted = _extract_hostname(host)
    if not extracted:
        return False
    if extracted in {"localhost", "testserver"}:
        return True
    try:
        return ipaddress.ip_address(extracted).is_loopback
    except ValueError:
        return False


def _has_proxy_forwarding_headers(request: Request) -> bool:
    headers = getattr(request, "headers", None)
    if headers is None:
        return False
    for name in _PROXY_FORWARDING_HEADERS:
        val = headers.get(name)
        if isinstance(val, str) and val.strip():
            return True
    return False


def _is_direct_local_setup_request(request: Request, current_settings: Settings) -> bool:
    if current_settings.ENVIRONMENT != "development":
        return False
    parsed_public = urlparse(current_settings.PUBLIC_BASE_URL or "")
    if parsed_public.scheme.lower() != "http" or not _is_loopback_host(parsed_public.hostname):
        return False
    if _has_proxy_forwarding_headers(request):
        return False
    headers = getattr(request, "headers", None)
    host_header = headers.get("host") if headers is not None else None
    if isinstance(host_header, str) and host_header.strip() and not _is_loopback_host(host_header):
        return False
    client_host = request.client.host if request.client else ""
    return _is_loopback_host(client_host)


def _get_setup_state(current_settings: Settings, current_runtime: RuntimeConfig) -> dict[str, bool]:
    is_configured = bool(current_settings.GOOGLE_CLIENT_ID and current_settings.GOOGLE_CLIENT_SECRET)
    has_oauth = bool(current_settings.GOOGLE_CLIENT_ID or current_settings.GOOGLE_CLIENT_SECRET)
    has_admin = bool(current_settings.allowed_google_emails)
    setup_completed = current_runtime.is_setup_completed()
    setup_locked = setup_completed or has_oauth or has_admin
    return {
        "is_configured": is_configured,
        "has_oauth": has_oauth,
        "has_admin": has_admin,
        "setup_completed": setup_completed,
        "setup_locked": setup_locked,
    }


@router.get("/setup-status")
def get_setup_status(request: Request):
    """Public endpoint to check if initial setup has been completed."""
    current_settings = get_settings(settings)
    current_runtime = get_runtime_config(runtime_config)
    state = _get_setup_state(current_settings, current_runtime)
    setup_locked = state["setup_locked"]
    can_bypass_pin = _is_direct_local_setup_request(request, current_settings)
    needs_pin = (not setup_locked) and (not can_bypass_pin)

    # Ensure PIN is generated and logged if setup is still unlocked
    active_pin = ""
    if not setup_locked:
        active_pin = get_system_secrets(system_secrets).get_or_create_setup_pin()

    return {
        "is_configured": state["is_configured"],
        "setup_completed": state["setup_completed"],
        "setup_locked": setup_locked,
        "needs_pin": needs_pin,
        "has_admin": state["has_admin"],
        "public_base_url": current_settings.base_url,
        "redirect_uri": current_settings.get_redirect_uri(),
        "environment": current_settings.ENVIRONMENT,
        # Only expose pin in response if direct local development without proxy/HTTPS
        "development_pin": active_pin if (not setup_locked and can_bypass_pin) else None,
    }


@router.post("/setup", dependencies=[Depends(enforce_setup_rate_limit)])
def perform_initial_setup(payload: SetupRequest, request: Request):
    """Perform first-time installation setup: configure Google OAuth & admin email."""
    current_settings = get_settings(settings)
    current_runtime = get_runtime_config(runtime_config)
    state = _get_setup_state(current_settings, current_runtime)
    if state["setup_locked"]:
        raise http_error(400, "setup_already_completed", "系統已完成初始設定，如需修改請登入後前往系統設定頁。")

    # Require PIN unless direct local HTTP development
    if not _is_direct_local_setup_request(request, current_settings):
        if not payload.pin or not get_system_secrets(system_secrets).verify_setup_pin(payload.pin):
            raise http_error(
                400,
                "invalid_setup_pin",
                "初始設定安全碼 (PIN) 不正確。請查看後端容器或伺服器啟動日誌獲取 6 位數安全碼。",
            )

    # Update system OAuth credentials
    get_system_secrets(system_secrets).update_credentials(
        {
            "google_client_id": payload.google_client_id,
            "google_client_secret": payload.google_client_secret,
        }
    )

    # Set administrator email
    current_runtime.set_allowed_emails([payload.admin_email])
    current_runtime.set_setup_completed(True)

    # Clear the one-time PIN
    get_system_secrets(system_secrets).clear_setup_pin()

    # Sync settings into memory
    current_settings.sync_dynamic_config()

    logger.info("Initial system setup successfully completed by %s", payload.admin_email)
    return {
        "status": "success",
        "message": "系統初始設定完成！請使用管理員 Google 帳號登入。",
        "admin_email": payload.admin_email,
        "redirect_uri": current_settings.get_redirect_uri(),
    }


@router.get("/credentials")
def get_credentials_masked(
    creds: Credentials = Depends(require_login_credentials),
):
    """Return masked system OAuth credentials for display in the admin UI."""
    del creds
    current_settings = get_settings(settings)
    return {
        "status": "success",
        "credentials": get_system_secrets(system_secrets).get_masked_credentials(effective_settings=current_settings),
        "public_base_url": current_settings.base_url,
        "redirect_uri": current_settings.get_redirect_uri(),
    }


@router.put("/credentials")
def update_system_credentials(
    payload: CredentialsUpdateRequest,
    creds: Credentials = Depends(require_login_credentials),
):
    """Update system OAuth credentials (Google and YouTube slots)."""
    del creds
    current_settings = get_settings(settings)
    secrets_mgr = get_system_secrets(system_secrets)
    stored_creds = secrets_mgr.get_credentials(ignore_decrypt_errors=True)
    updates: dict[str, str] = {}
    for field, val in payload.model_dump(exclude_unset=True).items():
        if field in {"clear_google", "clear_youtube_primary", "clear_youtube_secondary"} or val is None:
            continue
        if field in _SECRET_TO_ENV_ATTR:
            current_secret = stored_creds.get(field) or getattr(current_settings, _SECRET_TO_ENV_ATTR[field], "")
            try:
                resolved = resolve_secret_update(val, current_secret)
            except ValueError as exc:
                raise http_error(400, "masked_secret_rejected", str(exc)) from exc
            if resolved is not None:
                updates[field] = resolved
        else:
            updates[field] = str(val).strip()

    if payload.clear_google:
        updates["google_client_id"] = ""
        updates["google_client_secret"] = ""
    if payload.clear_youtube_primary:
        updates["youtube_primary_client_id"] = ""
        updates["youtube_primary_client_secret"] = ""
    if payload.clear_youtube_secondary:
        updates["youtube_secondary_client_id"] = ""
        updates["youtube_secondary_client_secret"] = ""

    if updates:
        secrets_mgr.update_credentials(updates)
        current_settings.sync_dynamic_config()
        logger.info("System credentials updated via Web UI: %s", list(updates.keys()))

    return {
        "status": "success",
        "message": "系統 OAuth 憑證已更新。",
        "credentials": secrets_mgr.get_masked_credentials(effective_settings=current_settings),
        "public_base_url": current_settings.base_url,
        "redirect_uri": current_settings.get_redirect_uri(),
    }


@router.get("/allowlist")
def get_allowlist(
    creds: Credentials = Depends(require_login_credentials),
    current_user_email: str = Depends(require_account_email),
):
    """Return the allowed Google accounts list and user creation policy."""
    del creds
    return {
        "allowed_emails": sorted(list(get_settings(settings).allowed_google_emails)),
        "current_user_email": current_user_email,
        "allowlist_required": get_settings(settings).allowlist_required,
        "allow_new_users": get_settings(settings).allow_new_users,
    }


@router.post("/allowlist/add")
def add_allowlist_email(
    payload: EmailActionRequest,
    creds: Credentials = Depends(require_login_credentials),
    current_user_email: str = Depends(require_account_email),
):
    """Add an email to the allowed Google accounts list."""
    del creds
    if not get_settings(settings).allow_new_users:
        raise http_error(
            403,
            "add_user_disabled",
            "目前系統已設定為不允許新增使用者帳號。如需新增，請先至系統設定開啟此功能。",
        )
    email = payload.email.strip().casefold()
    get_runtime_config(runtime_config).add_allowed_email(email)
    logger.info("Added %s to allowed Google emails by %s", email, current_user_email)
    return {
        "status": "success",
        "allowed_emails": sorted(list(get_settings(settings).allowed_google_emails)),
        "current_user_email": current_user_email,
        "allow_new_users": get_settings(settings).allow_new_users,
    }


@router.post("/allowlist/remove")
def remove_allowlist_email(
    payload: EmailActionRequest,
    creds: Credentials = Depends(require_login_credentials),
    current_user_email: str = Depends(require_account_email),
):
    """Remove an email from the allowed Google accounts list with lockout guard."""
    del creds
    email = payload.email.strip().casefold()
    if current_user_email and email == current_user_email:
        raise http_error(
            400,
            "cannot_remove_self",
            "不能從白名單移除您目前登入的帳號，以避免失去管理權限被鎖定於系統之外。",
        )
    if len(get_settings(settings).allowed_google_emails) <= 1 and email in get_settings(settings).allowed_google_emails:
        raise http_error(
            400,
            "cannot_remove_last_admin",
            "不能移除白名單中唯一的管理員帳號，系統必須保留至少一個授權帳號。",
        )

    get_runtime_config(runtime_config).remove_allowed_email(email)
    purged_sessions = get_session_store(session_store).delete_by_email(email)
    logger.info(
        "Removed %s from allowed Google emails by %s (purged_sessions=%d)",
        email,
        current_user_email,
        purged_sessions,
    )
    return {
        "status": "success",
        "allowed_emails": sorted(list(get_settings(settings).allowed_google_emails)),
        "current_user_email": current_user_email,
        "allow_new_users": get_settings(settings).allow_new_users,
    }


@router.put("/allow-new-users")
def update_allow_new_users(
    payload: AllowNewUsersUpdateRequest,
    creds: Credentials = Depends(require_login_credentials),
    current_user_email: str = Depends(require_account_email),
):
    """Update whether adding new user accounts is allowed."""
    del creds
    get_runtime_config(runtime_config).set_allow_new_users(payload.allow_new_users)
    get_settings(settings).sync_dynamic_config()
    logger.info(
        "Allow new users setting updated to %s by %s",
        payload.allow_new_users,
        current_user_email,
    )
    return {
        "status": "success",
        "allow_new_users": get_settings(settings).allow_new_users,
        "message": "已更新新增使用者帳號設定。",
    }


@router.get("/health")
def get_system_health():
    """System health check endpoint aligned with plugin route metadata."""
    from backend.app.main import health_check

    return health_check()
