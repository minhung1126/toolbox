import logging
import re
from typing import Optional

from fastapi import APIRouter, Depends, Request
from google.oauth2.credentials import Credentials
from pydantic import BaseModel, Field, field_validator

from backend.app.core.config import settings
from backend.app.core.dependencies import require_account_email, require_login_credentials
from backend.app.core.error_contract import http_error
from backend.app.core.runtime_config import runtime_config
from backend.app.core.system_secrets import system_secrets

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


def _is_local_request(request: Request) -> bool:
    client_host = request.client.host if request.client else ""
    return client_host in {"127.0.0.1", "::1", "localhost", "testserver"}


@router.get("/setup-status")
def get_setup_status(request: Request):
    """Public endpoint to check if initial setup has been completed."""
    is_configured = bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)
    setup_completed = runtime_config.is_setup_completed()
    is_local = _is_local_request(request)
    needs_pin = not setup_completed and not (settings.ENVIRONMENT == "development" and is_local)

    # Ensure PIN is generated and logged if setup is needed
    active_pin = ""
    if not is_configured and not setup_completed:
        active_pin = system_secrets.get_or_create_setup_pin()

    return {
        "is_configured": is_configured,
        "setup_completed": setup_completed,
        "needs_pin": needs_pin,
        "has_admin": bool(settings.allowed_google_emails),
        "public_base_url": settings.base_url,
        "redirect_uri": settings.get_redirect_uri(),
        "environment": settings.ENVIRONMENT,
        # Only expose pin in response if local development
        "development_pin": active_pin if (settings.ENVIRONMENT == "development" and is_local) else None,
    }


@router.post("/setup")
def perform_initial_setup(payload: SetupRequest, request: Request):
    """Perform first-time installation setup: configure Google OAuth & admin email."""
    if runtime_config.is_setup_completed() and (settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET):
        raise http_error(400, "setup_already_completed", "系統已完成初始設定，如需修改請登入後前往系統設定頁。")

    is_local = _is_local_request(request)
    # Require PIN unless development on localhost
    if not (settings.ENVIRONMENT == "development" and is_local):
        if not payload.pin or not system_secrets.verify_setup_pin(payload.pin):
            raise http_error(
                400,
                "invalid_setup_pin",
                "初始設定安全碼 (PIN) 不正確。請查看後端容器或伺服器啟動日誌獲取 6 位數安全碼。",
            )

    # Update system OAuth credentials
    system_secrets.update_credentials(
        {
            "google_client_id": payload.google_client_id,
            "google_client_secret": payload.google_client_secret,
        }
    )

    # Set administrator email
    runtime_config.set_allowed_emails([payload.admin_email])
    runtime_config.set_setup_completed(True)

    # Clear the one-time PIN
    system_secrets.clear_setup_pin()

    # Sync settings into memory
    settings.sync_dynamic_config()

    logger.info("Initial system setup successfully completed by %s", payload.admin_email)
    return {
        "status": "success",
        "message": "系統初始設定完成！請使用管理員 Google 帳號登入。",
        "admin_email": payload.admin_email,
        "redirect_uri": settings.get_redirect_uri(),
    }


@router.get("/credentials")
def get_credentials_masked(
    creds: Credentials = Depends(require_login_credentials),
):
    """Return masked system OAuth credentials for display in the admin UI."""
    del creds
    return {
        "status": "success",
        "credentials": system_secrets.get_masked_credentials(),
        "public_base_url": settings.base_url,
        "redirect_uri": settings.get_redirect_uri(),
    }


@router.put("/credentials")
def update_system_credentials(
    payload: CredentialsUpdateRequest,
    creds: Credentials = Depends(require_login_credentials),
):
    """Update system OAuth credentials (Google and YouTube slots)."""
    del creds
    updates = {}
    for field, val in payload.model_dump(exclude_unset=True).items():
        if val is not None:
            clean = str(val).strip()
            # If masked value sent back unchanged, skip updating that secret
            if clean.startswith("****") or clean == "********":
                continue
            updates[field] = clean

    if updates:
        system_secrets.update_credentials(updates)
        settings.sync_dynamic_config()
        logger.info("System credentials updated via Web UI: %s", list(updates.keys()))

    return {
        "status": "success",
        "message": "系統 OAuth 憑證已更新。",
        "credentials": system_secrets.get_masked_credentials(),
        "public_base_url": settings.base_url,
        "redirect_uri": settings.get_redirect_uri(),
    }


@router.get("/allowlist")
def get_allowlist(
    creds: Credentials = Depends(require_login_credentials),
    current_user_email: str = Depends(require_account_email),
):
    """Return the allowed Google accounts list and user creation policy."""
    del creds
    return {
        "allowed_emails": sorted(list(settings.allowed_google_emails)),
        "current_user_email": current_user_email,
        "allowlist_required": settings.allowlist_required,
        "allow_new_users": settings.allow_new_users,
    }


@router.post("/allowlist/add")
def add_allowlist_email(
    payload: EmailActionRequest,
    creds: Credentials = Depends(require_login_credentials),
    current_user_email: str = Depends(require_account_email),
):
    """Add an email to the allowed Google accounts list."""
    del creds
    if not settings.allow_new_users:
        raise http_error(
            403,
            "add_user_disabled",
            "目前系統已設定為不允許新增使用者帳號。如需新增，請先至系統設定開啟此功能。",
        )
    email = payload.email.strip().casefold()
    runtime_config.add_allowed_email(email)
    logger.info("Added %s to allowed Google emails by %s", email, current_user_email)
    return {
        "status": "success",
        "allowed_emails": sorted(list(settings.allowed_google_emails)),
        "current_user_email": current_user_email,
        "allow_new_users": settings.allow_new_users,
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
    if len(settings.allowed_google_emails) <= 1 and email in settings.allowed_google_emails:
        raise http_error(
            400,
            "cannot_remove_last_admin",
            "不能移除白名單中唯一的管理員帳號，系統必須保留至少一個授權帳號。",
        )

    runtime_config.remove_allowed_email(email)
    logger.info("Removed %s from allowed Google emails by %s", email, current_user_email)
    return {
        "status": "success",
        "allowed_emails": sorted(list(settings.allowed_google_emails)),
        "current_user_email": current_user_email,
        "allow_new_users": settings.allow_new_users,
    }


@router.put("/allow-new-users")
def update_allow_new_users(
    payload: AllowNewUsersUpdateRequest,
    creds: Credentials = Depends(require_login_credentials),
    current_user_email: str = Depends(require_account_email),
):
    """Update whether adding new user accounts is allowed."""
    del creds
    runtime_config.set_allow_new_users(payload.allow_new_users)
    settings.sync_dynamic_config()
    logger.info(
        "Allow new users setting updated to %s by %s",
        payload.allow_new_users,
        current_user_email,
    )
    return {
        "status": "success",
        "allow_new_users": settings.allow_new_users,
        "message": "已更新新增使用者帳號設定。",
    }


@router.get("/health")
def get_system_health():
    """System health check endpoint aligned with plugin route metadata."""
    from backend.app.main import health_check

    return health_check()
