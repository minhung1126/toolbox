import logging
from typing import Annotated, Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends
from google.oauth2.credentials import Credentials
from pydantic import BaseModel, Field, field_validator, model_validator

from backend.app.core.account_state import (
    WORK_STATE_KEYS,
    get_account_active_slot,
    get_account_setting,
    get_account_work_state,
    get_account_youtube_routing_mode,
    set_account_setting,
    set_account_youtube_routing_mode,
    update_account_work_state,
)
from backend.app.core.config import normalize_youtube_slot, settings
from backend.app.core.dependencies import require_account_subject, require_login_credentials
from backend.app.core.error_contract import http_error
from backend.app.core.runtime_config import runtime_config
from backend.app.core.system_secrets import system_secrets
from backend.app.core.youtube_input import normalize_playlist_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["System & Resource Settings"])


class SharedResourceSettingsModel(BaseModel):
    """Settings shared by Sheet and platform workflows unless overridden."""

    default_spreadsheet_id: str = Field(default="", max_length=512)


class YouTubePlaylistSettingsModel(BaseModel):
    default_playlist_id: str = Field(default="", max_length=256)

    @model_validator(mode="after")
    def normalize_playlist(self):
        raw = self.default_playlist_id.strip()
        normalized = normalize_playlist_id(raw)
        if raw and not normalized:
            raise ValueError("請提供合法的 YouTube 播放清單網址或 ID")
        self.default_playlist_id = normalized
        return self


class YouTubeQuotaSettingsModel(BaseModel):
    slot: Literal["primary", "secondary"]
    quota_limit: int
    safety_buffer_units: int

    @model_validator(mode="after")
    def validate_quota_policy(self):
        if self.quota_limit <= 0:
            raise ValueError("quota_limit 必須大於 0")
        if self.safety_buffer_units < 0:
            raise ValueError("safety_buffer_units 必須大於等於 0")
        if self.safety_buffer_units >= self.quota_limit:
            raise ValueError("safety_buffer_units 必須小於 quota_limit")
        return self


class YouTubeRoutingSettingsModel(BaseModel):
    routing_mode: Literal["auto_primary", "manual"]


class YouTubeDraftConfigModel(BaseModel):
    spreadsheet_id: str = Field(default="", max_length=512)
    playlist_id: str = Field(default="", max_length=256)
    worksheet_name: str = Field(default="", max_length=200)
    title_column: str = Field(default="", max_length=200)
    description_column: str = Field(default="", max_length=200)


class TeamPersonFilterModel(BaseModel):
    team: str = Field(default="", max_length=200)
    selected_people: List[Annotated[str, Field(max_length=200)]] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def normalize_values(self):
        self.team = self.team.strip()
        self.selected_people = list(dict.fromkeys(person.strip() for person in self.selected_people if person.strip()))
        return self


class YouTubeDraftConfigUpdateModel(BaseModel):
    video_type: Literal["Video", "Shorts"]
    config: YouTubeDraftConfigModel


class WorkStateUpdateModel(BaseModel):
    key: str = Field(..., min_length=1, max_length=100)
    value: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("key")
    @classmethod
    def validate_key(cls, v: str) -> str:
        if v not in WORK_STATE_KEYS:
            raise ValueError(f"Unsupported work state: {v}")
        return v


def _draft_config_key(video_type: str) -> str:
    return f"youtube_draft_{video_type.lower()}_config"


def _read_draft_config(video_type: str, owner_sub: str) -> Dict:
    raw = get_account_setting(owner_sub, _draft_config_key(video_type), "")
    if not isinstance(raw, dict) or not raw:
        return {}
    try:
        return YouTubeDraftConfigModel.model_validate(raw).model_dump()
    except ValueError:
        logger.warning("Ignoring invalid persisted %s draft config", video_type)
        return {}


def _read_team_person_filter(owner_sub: str) -> tuple[Dict, bool]:
    raw = get_account_setting(owner_sub, "shared_team_person_filter", None)
    if isinstance(raw, dict):
        try:
            return TeamPersonFilterModel.model_validate(raw).model_dump(), True
        except ValueError:
            logger.warning("Ignoring invalid persisted shared team/person filter")
    return TeamPersonFilterModel().model_dump(), False


@router.get("/shared")
def get_shared_settings(
    creds: Credentials = Depends(require_login_credentials),
    owner_sub: str = Depends(require_account_subject),
):
    del creds
    return {
        "default_spreadsheet_id": get_account_setting(owner_sub, "default_spreadsheet_id", ""),
    }


@router.get("/system")
def get_system_info(creds: Credentials = Depends(require_login_credentials)):
    del creds
    return {
        "public_base_url": settings.base_url,
        "bind_host": settings.BIND_HOST,
        "frontend_url": settings.frontend_url,
        "redirect_uri": settings.get_redirect_uri(),
        "google_client_configured": bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET),
    }


@router.put("/shared")
def update_shared_settings(
    payload: SharedResourceSettingsModel,
    creds: Credentials = Depends(require_login_credentials),
    owner_sub: str = Depends(require_account_subject),
):
    value = payload.default_spreadsheet_id.strip()
    set_account_setting(owner_sub, "default_spreadsheet_id", value)
    logger.info("Account-scoped resource settings updated: default_spreadsheet_id")
    return {"status": "success", "settings": get_shared_settings(creds, owner_sub)}


@router.get("/youtube")
def get_youtube_settings(
    creds: Credentials = Depends(require_login_credentials),
    owner_sub: str = Depends(require_account_subject),
):
    del creds
    primary_limit, primary_buffer = runtime_config.get_youtube_quota_settings("primary")
    raw_playlist_id = get_account_setting(owner_sub, "default_playlist_id", "")
    return {
        "default_playlist_id": normalize_playlist_id(raw_playlist_id),
        "slot": "primary",
        "quota_limit": primary_limit,
        "safety_buffer_units": primary_buffer,
        "routing_mode": get_account_youtube_routing_mode(owner_sub),
    }


@router.get("/youtube-slots")
def get_youtube_slot_settings(
    creds: Credentials = Depends(require_login_credentials),
    owner_sub: str = Depends(require_account_subject),
):
    """Return non-secret configuration defaults for both YouTube slots."""
    del creds
    slots = {}
    for slot, slot_config in settings.youtube_oauth_slots.items():
        limit, buffer = runtime_config.get_youtube_quota_settings(slot)
        slots[slot] = {
            "slot": slot,
            "label": slot_config.label,
            "configured": slot_config.configured,
            "enabled": slot_config.enabled,
            "client_fingerprint": slot_config.client_fingerprint,
            "quota_limit": limit,
            "safety_buffer_units": buffer,
        }
    return {
        "active_slot": get_account_active_slot(owner_sub),
        "routing_mode": get_account_youtube_routing_mode(owner_sub),
        "slots": slots,
    }


class YouTubeSlotConfigUpdateModel(BaseModel):
    label: Optional[str] = Field(default=None, max_length=100)
    enabled: Optional[bool] = None
    client_id: Optional[str] = Field(default=None, max_length=512)
    client_secret: Optional[str] = Field(default=None, max_length=512)
    use_system_google_oauth: Optional[bool] = None


@router.put("/youtube-slots/{slot}")
def update_youtube_slot_config(
    slot: str,
    payload: YouTubeSlotConfigUpdateModel,
    creds: Credentials = Depends(require_login_credentials),
):
    """Update YouTube slot label, enabled state, or OAuth client credentials."""
    del creds
    slot_name = normalize_youtube_slot(slot)
    if payload.label is not None:
        runtime_config.set(f"youtube_oauth_{slot_name}_label", payload.label.strip())
    if slot_name == "secondary" and payload.enabled is not None:
        runtime_config.set("youtube_oauth_secondary_enabled", bool(payload.enabled))

    updates = {}
    if slot_name == "primary" and payload.use_system_google_oauth:
        updates["youtube_primary_client_id"] = settings.GOOGLE_CLIENT_ID
        updates["youtube_primary_client_secret"] = settings.GOOGLE_CLIENT_SECRET
    else:
        if payload.client_id is not None:
            updates[f"youtube_{slot_name}_client_id"] = payload.client_id.strip()
        if payload.client_secret is not None:
            clean_secret = payload.client_secret.strip()
            if not clean_secret.startswith("****") and clean_secret != "********":
                updates[f"youtube_{slot_name}_client_secret"] = clean_secret

    if updates:
        system_secrets.update_credentials(updates)

    settings.sync_dynamic_config()
    slot_config = settings.youtube_oauth_slot(slot_name)
    limit, buffer = runtime_config.get_youtube_quota_settings(slot_name)
    return {
        "status": "success",
        "slot": slot_name,
        "label": slot_config.label,
        "configured": slot_config.configured,
        "enabled": slot_config.enabled,
        "client_fingerprint": slot_config.client_fingerprint,
        "quota_limit": limit,
        "safety_buffer_units": buffer,
    }


@router.put("/youtube")
def update_youtube_settings():
    """Reject the former combined write endpoint so resources stay isolated."""

    raise http_error(
        410,
        "youtube_settings_split",
        "YouTube 設定已分離；請分別儲存預設播放清單與 quota。",
    )


@router.put("/youtube/playlist")
def update_youtube_playlist(
    payload: YouTubePlaylistSettingsModel,
    creds: Credentials = Depends(require_login_credentials),
    owner_sub: str = Depends(require_account_subject),
):
    del creds
    set_account_setting(owner_sub, "default_playlist_id", payload.default_playlist_id)
    logger.info("Account-scoped YouTube default playlist updated")
    return {"status": "success", "default_playlist_id": payload.default_playlist_id}


@router.put("/youtube/routing")
def update_youtube_routing(
    payload: YouTubeRoutingSettingsModel,
    creds: Credentials = Depends(require_login_credentials),
    owner_sub: str = Depends(require_account_subject),
):
    del creds
    set_account_youtube_routing_mode(owner_sub, payload.routing_mode)
    logger.info("Account-scoped YouTube routing mode updated: %s", payload.routing_mode)
    return {"status": "success", "routing_mode": payload.routing_mode}


@router.put("/youtube/quota")
def update_youtube_quota(
    payload: YouTubeQuotaSettingsModel,
    creds: Credentials = Depends(require_login_credentials),
):
    del creds
    runtime_config.update(
        {
            f"youtube_{payload.slot}_general_quota_limit": payload.quota_limit,
            f"youtube_{payload.slot}_quota_safety_buffer_units": payload.safety_buffer_units,
        }
    )
    logger.info("YouTube quota policy updated for slot=%s", payload.slot)
    return {
        "status": "success",
        "slot": payload.slot,
        "quota_limit": payload.quota_limit,
        "safety_buffer_units": payload.safety_buffer_units,
    }


@router.get("/youtube-drafts")
def get_youtube_draft_settings(
    creds: Credentials = Depends(require_login_credentials),
    owner_sub: str = Depends(require_account_subject),
):
    del creds
    return {
        "video": _read_draft_config("Video", owner_sub),
        "shorts": _read_draft_config("Shorts", owner_sub),
    }


@router.put("/youtube-drafts")
def update_youtube_draft_settings(
    payload: YouTubeDraftConfigUpdateModel,
    creds: Credentials = Depends(require_login_credentials),
    owner_sub: str = Depends(require_account_subject),
):
    del creds
    key = _draft_config_key(payload.video_type)
    value = payload.config.model_dump()
    # Keep legacy per-workflow playlist values for migration/debugging, but
    # callers must use the account-level default_playlist_id at execution time.
    previous = get_account_setting(owner_sub, key, {})
    if not value.get("playlist_id") and isinstance(previous, dict) and previous.get("playlist_id"):
        value["playlist_id"] = previous["playlist_id"]
    set_account_setting(owner_sub, key, value)
    logger.info("Account-scoped YouTube %s draft settings updated", payload.video_type)
    return {"status": "success", "video_type": payload.video_type, "config": value}


@router.get("/team-person-filter")
def get_team_person_filter(
    creds: Credentials = Depends(require_login_credentials),
    owner_sub: str = Depends(require_account_subject),
):
    del creds
    value, configured = _read_team_person_filter(owner_sub)
    return {"configured": configured, **value}


@router.put("/team-person-filter")
def update_team_person_filter(
    payload: TeamPersonFilterModel,
    creds: Credentials = Depends(require_login_credentials),
    owner_sub: str = Depends(require_account_subject),
):
    del creds
    value = payload.model_dump()
    set_account_setting(owner_sub, "shared_team_person_filter", value)
    logger.info("Account-scoped team/person filter updated")
    return {"configured": True, **value}


@router.get("/work-state")
def get_work_state(
    creds: Credentials = Depends(require_login_credentials),
    owner_sub: str = Depends(require_account_subject),
):
    del creds
    return {"version": 1, "state": get_account_work_state(owner_sub)}


@router.put("/work-state")
def update_work_state(
    payload: WorkStateUpdateModel,
    creds: Credentials = Depends(require_login_credentials),
    owner_sub: str = Depends(require_account_subject),
):
    del creds
    try:
        state = update_account_work_state(owner_sub, payload.key, payload.value)
    except ValueError as exc:
        raise http_error(422, "invalid_work_state", "工作狀態資料不正確，請重新整理後再試。") from exc
    return {"version": 1, "state": state}
