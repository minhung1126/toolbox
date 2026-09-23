import logging
import math
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from google.oauth2.credentials import Credentials

from backend.app.api.youtube_helpers import (
    _direct_workflow_response,
    _preview_slot,
    _resolve_person_metadata,
    _safe_workflow_error,
    _stale_preview_exception,
    _workflow_error_detail,
    _youtube_context_metadata,
    _youtube_thumbnail,
    resolve_assignment_row,
    upload_time_sort_key,
    video_snapshot_digest,
)
from backend.app.api.youtube_models import (
    BatchUpdateInput,
    PlaylistItemsInput,
    PublishCleanupInput,
    QuotaEstimateInput,
    VideoAssignment,
    VideoMetadataUpdateInput,
)
from backend.app.core.account_state import get_account_active_slot, get_account_setting
from backend.app.core.config import normalize_youtube_slot
from backend.app.core.dependencies import (
    create_youtube_request_context,
    require_account_subject,
    require_login_credentials,
    require_sheets_credentials,
    require_youtube_context,
)
from backend.app.core.error_contract import http_error
from backend.app.core.preview import (
    build_preview_token,
    input_digest,
    playlist_snapshot,
    playlist_snapshot_from_preview,
    sheet_snapshot,
    verify_preview_token,
)
from backend.app.core.request_protection import enforce_workflow_rate_limit
from backend.app.core.youtube_context import YouTubeRequestContext
from backend.app.core.youtube_input import normalize_playlist_id
from backend.app.core.youtube_routing import choose_youtube_slot
from backend.app.services.provider_errors import map_youtube_error
from backend.app.services.sheets_service import (
    get_all_rows_for_sheet,
    get_sheet_headers,
    matches_team_person,
    normalize_text,
)
from backend.app.services.youtube_errors import YouTubeQuotaUnavailable
from backend.app.services.youtube_quota_service import get_youtube_quota_tracker
from backend.app.services.youtube_service import (
    fetch_playlist_items,
    fetch_playlist_preview,
    fetch_video_details,
    remove_playlist_item,
    set_video_public,
    update_single_video_metadata,
)
from backend.app.services.youtube_workflows import YoutubeWorkflowService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/youtube", tags=["YouTube Operations"])

_YOUTUBE_WORKFLOW_DEPENDENCY_NAMES = (
    "_direct_workflow_response",
    "_load_and_validate_sheet_data",
    "_preview_slot",
    "_quota_http_exception",
    "_resolve_person_metadata",
    "_resolve_playlist_id",
    "_run_youtube_operation_with_quota_fallback",
    "_stale_preview_exception",
    "_switch_youtube_context",
    "_validate_batch_inputs",
    "_verify_playlist_preview_token",
    "_workflow_error_detail",
    "_youtube_context_metadata",
    "_youtube_thumbnail",
    "fetch_playlist_items",
    "input_digest",
    "matches_team_person",
    "playlist_snapshot",
    "remove_playlist_item",
    "set_video_public",
    "sheet_snapshot",
    "build_preview_token",
    "fetch_playlist_items",
    "fetch_video_details",
    "get_all_rows_for_sheet",
    "get_sheet_headers",
    "http_error",
    "input_digest",
    "logger",
    "map_youtube_error",
    "matches_team_person",
    "normalize_text",
    "playlist_snapshot",
    "remove_playlist_item",
    "set_video_public",
    "sheet_snapshot",
    "update_single_video_metadata",
    "upload_time_sort_key",
    "verify_preview_token",
    "video_snapshot_digest",
)


def _youtube_workflow_dependencies() -> dict[str, Any]:
    """Provide workflow ports from this API module, including test overrides."""
    namespace = globals()
    return {name: namespace[name] for name in _YOUTUBE_WORKFLOW_DEPENDENCY_NAMES}


def _resolve_playlist_id(context: YouTubeRequestContext, requested: Optional[str]) -> str:
    # The account-level playlist is authoritative.  The request field remains
    # accepted only as a migration fallback for old clients/accounts that have
    # never saved the shared setting.
    configured_value = get_account_setting(context.owner_sub, "default_playlist_id", "")
    raw_value = configured_value or requested
    if not str(raw_value or "").strip():
        return ""
    playlist_id = normalize_playlist_id(raw_value)
    if not playlist_id:
        raise http_error(400, "playlist_invalid", "播放清單網址或 ID 格式不正確。")
    return playlist_id


def _quota_http_exception(exc: YouTubeQuotaUnavailable) -> HTTPException:
    detail = exc.to_dict()
    return http_error(
        429,
        detail["code"],
        detail["message"],
        retryable=True,
        reset_at=detail.get("reset_at"),
        youtube_slot=detail.get("youtube_slot"),
    )


def _switch_youtube_context(
    context: YouTubeRequestContext,
    *,
    estimated_units: int,
    attempted_slots: set[str],
) -> YouTubeRequestContext | None:
    """Select the other Auto slot after a quota failure.

    The initial request context remains immutable for ordinary work, but a
    provider quota failure is a safe boundary: both configured slots are
    required to represent the same channel, and the failed request did not
    perform a write. The caller retries only that operation on the alternate
    slot and keeps the same account-bound preview data.
    """

    if context.routing_mode != "auto_primary" or not context.session_id:
        return None
    for slot in ("secondary", "primary"):
        if slot == context.slot or slot in attempted_slots:
            continue
        try:
            decision = choose_youtube_slot(
                context.session_id,
                context.owner_sub,
                estimated_units=max(int(estimated_units or 0), 1),
                slot_hint=slot,
            )
        except HTTPException:
            continue
        if decision.slot == context.slot or decision.slot in attempted_slots:
            continue
        return create_youtube_request_context(
            decision,
            context.owner_sub,
            session_id=context.session_id,
            selection_reason=f"auto_{decision.slot}_quota_fallback",
        )
    return None


def _run_youtube_operation_with_quota_fallback(
    context: YouTubeRequestContext,
    operation,
    *,
    estimated_units: int,
    attempted_slots: set[str],
) -> tuple[YouTubeRequestContext, Any]:
    """Run one read/write boundary and retry it once on the other Auto slot."""

    try:
        return context, operation(context)
    except YouTubeQuotaUnavailable:
        fallback_context = _switch_youtube_context(
            context,
            estimated_units=max(int(estimated_units or 0), 1),
            attempted_slots=attempted_slots,
        )
        if fallback_context is None:
            raise
        attempted_slots.add(fallback_context.slot)
        return fallback_context, operation(fallback_context)


def _quota_estimate(operation: str, item_count: int, *, slot: Optional[str] = None) -> dict:
    count = max(int(item_count), 0)
    pages = math.ceil(count / 50) if count else 0
    if operation == "youtube.metadata_update":
        breakdown = [
            {"method": "videos.list", "calls": pages, "units": pages},
            {"method": "videos.update", "calls": count, "units": count * 50},
        ]
    elif operation == "youtube.publish_cleanup":
        breakdown = [
            # The workflow reads To-Post once for the preview snapshot and a
            # second time immediately before the first write.
            {"method": "playlistItems.list", "calls": pages * 2, "units": pages * 2},
            {"method": "videos.list", "calls": pages, "units": pages},
            {"method": "videos.update", "calls": count, "units": count * 50},
            {"method": "playlistItems.delete", "calls": count, "units": count * 50},
        ]
    else:  # defensive for callers outside Pydantic/FastAPI
        raise ValueError("不支援的 YouTube quota estimate operation")

    projected = sum(int(item["units"]) for item in breakdown)
    if slot is None:
        tracker = get_youtube_quota_tracker("primary")
        slot_name = "primary"
    else:
        try:
            slot_name = normalize_youtube_slot(slot)
        except ValueError as exc:
            raise ValueError("不支援的 YouTube OAuth slot") from exc
        tracker = get_youtube_quota_tracker(slot_name)
    usage = tracker.get_usage()
    available = int(usage.get("effective_available_units") or 0)

    def cost_for(number: int) -> int:
        number_pages = math.ceil(number / 50) if number else 0
        if operation == "youtube.metadata_update":
            return number_pages + number * 50
        return number_pages * 3 + number * 100

    max_items_today = 0
    for number in range(1, count + 1):
        if cost_for(number) <= available:
            max_items_today = number
        else:
            break
    return {
        "operation": operation,
        "slot": slot_name,
        "item_count": count,
        "projected_units": projected,
        "worst_case": True,
        "breakdown": breakdown,
        "effective_available_units": available,
        "can_complete_today": projected <= available,
        "max_items_today": max_items_today,
        "reset_at": usage.get("reset_at"),
        "reset_timezone": usage.get("reset_timezone", "America/Los_Angeles"),
    }


def get_youtube_workflow_service() -> YoutubeWorkflowService:
    """Build the YouTube workflow adapter through FastAPI dependency injection."""
    return YoutubeWorkflowService(_youtube_workflow_dependencies())


def _resolve_workflow_service(workflows: Any) -> YoutubeWorkflowService:
    """Preserve direct route-function calls used by existing tests and tools."""
    if getattr(workflows, "dependency", None) is get_youtube_workflow_service:
        return get_youtube_workflow_service()
    return workflows


@router.get("/quota-usage")
def get_quota_usage(
    slot: Optional[str] = Query(default=None, max_length=32),
    creds: Credentials = Depends(require_login_credentials),
    owner_sub: str = Depends(require_account_subject),
):
    del creds
    try:
        slot_name = get_account_active_slot(owner_sub) if slot is None else normalize_youtube_slot(slot)
        return get_youtube_quota_tracker(slot_name).get_usage()
    except ValueError as exc:
        raise http_error(400, "youtube_slot_invalid", "不支援的 YouTube OAuth slot。") from exc
    except YouTubeQuotaUnavailable as exc:
        raise _quota_http_exception(exc) from exc


@router.post("/quota-estimate")
def estimate_quota(
    payload: QuotaEstimateInput,
    creds: Credentials = Depends(require_login_credentials),
    owner_sub: str = Depends(require_account_subject),
):
    del creds
    if payload.item_count < 0:
        raise http_error(
            400, "invalid_item_count", "item_count 不可小於 0。", field_errors={"item_count": ["不可小於 0。"]}
        )
    try:
        return _quota_estimate(
            payload.operation,
            payload.item_count,
            slot=payload.slot or get_account_active_slot(owner_sub),
        )
    except ValueError as exc:
        raise http_error(400, "youtube_slot_invalid", "不支援的 YouTube OAuth slot。") from exc
    except YouTubeQuotaUnavailable as exc:
        raise _quota_http_exception(exc) from exc


@router.post("/playlist-items")
def get_playlist_videos(
    payload: PlaylistItemsInput,
    creds: YouTubeRequestContext = Depends(require_youtube_context),
):
    youtube_context = creds
    playlist_id = _resolve_playlist_id(youtube_context, payload.playlist_id)
    if not playlist_id:
        raise http_error(400, "playlist_required", "請提供播放清單 ID。")
    try:
        videos, source, fallback_reason = fetch_playlist_preview(youtube_context, playlist_id)
        videos = [{**video, "youtube_slot": youtube_context.slot} for video in videos]
        preview_snapshot = playlist_snapshot_from_preview(videos)
        preview_snapshot["youtube_slot"] = youtube_context.slot
        preview_snapshot["youtube_channel_id"] = youtube_context.channel_id
        preview_snapshot["youtube_routing_mode"] = youtube_context.routing_mode
        preview_snapshot["youtube_slot_reason"] = youtube_context.selection_reason
        return {
            "playlist_id": playlist_id,
            "total": len(videos),
            "videos": videos,
            "source": source,
            "fallback_reason": fallback_reason,
            "youtube_slot": youtube_context.slot,
            "youtube_routing_mode": youtube_context.routing_mode,
            "youtube_slot_reason": youtube_context.selection_reason,
            "youtube_preferred_slot": youtube_context.preferred_slot,
            "youtube_estimated_units": youtube_context.estimated_units,
            "preview_token": _playlist_preview_token(youtube_context, playlist_id, videos),
            "preview_snapshot": preview_snapshot,
            "quota_usage": youtube_context.quota_limiter.get_usage(),
        }
    except YouTubeQuotaUnavailable as exc:
        raise _quota_http_exception(exc) from exc
    except Exception as exc:
        logger.error("Failed to fetch YouTube playlist items: %s", type(exc).__name__)
        raise map_youtube_error(
            exc, method="playlistItems.list", youtube_slot=youtube_context.slot
        ).to_http_exception() from exc


@router.post("/video-metadata")
def update_video_metadata(
    payload: VideoMetadataUpdateInput,
    creds: YouTubeRequestContext = Depends(require_youtube_context),
    _rate_limit: None = Depends(enforce_workflow_rate_limit),
):
    """Update one video's title and description while preserving other metadata."""
    youtube_context = creds
    video_id = normalize_text(payload.video_id)
    title = normalize_text(payload.title)
    description = payload.description
    if not video_id or not title:
        raise http_error(400, "youtube_video_input_invalid", "影片 ID 與標題不可為空白。")

    active_context = youtube_context

    def execute_update(context: YouTubeRequestContext) -> dict[str, Any]:
        details = fetch_video_details(context, [video_id])
        detail = next((item for item in details if item.get("id") == video_id), None)
        if not detail:
            raise http_error(404, "youtube_not_found", "找不到指定的 YouTube 影片。", youtube_slot=context.slot)

        update_single_video_metadata(
            context,
            video_id,
            str(title),
            description,
            current_snippet=(detail.get("snippet") or {}),
        )
        return {
            "video_id": video_id,
            **_youtube_context_metadata(context),
            "title": str(title),
            "description": description,
            "thumbnail_url": _youtube_thumbnail(detail, video_id),
            "status": "succeeded",
        }

    try:
        try:
            return execute_update(active_context)
        except YouTubeQuotaUnavailable:
            fallback_context = _switch_youtube_context(
                active_context,
                estimated_units=51,
                attempted_slots={active_context.slot},
            )
            if fallback_context is None:
                raise
            active_context = fallback_context
            return execute_update(active_context)
    except YouTubeQuotaUnavailable as exc:
        raise _quota_http_exception(exc) from exc
    except HTTPException:
        raise
    except ValueError as exc:
        raise map_youtube_error(
            exc, method="videos.update", youtube_slot=active_context.slot
        ).to_http_exception() from exc
    except Exception as exc:
        logger.error("Single YouTube metadata update failed for slot %s: %s", active_context.slot, type(exc).__name__)
        raise map_youtube_error(
            exc, method="videos.update", youtube_slot=active_context.slot
        ).to_http_exception() from exc


def _playlist_preview_token(context: YouTubeRequestContext, playlist_id: str, videos: list[dict]) -> str:
    return build_preview_token(
        owner_sub=context.owner_sub,
        youtube_slot=context.slot,
        operation="youtube.playlist_preview",
        playlist_id=playlist_id,
        playlist=playlist_snapshot_from_preview(videos),
    )


def _verify_playlist_preview_token(
    context: YouTubeRequestContext,
    playlist_id: str,
    expected_playlist: dict[str, Any],
    preview_token: Optional[str],
    *,
    operation: str = "youtube.playlist_preview",
    token_slot: Optional[str] = None,
) -> None:
    if not preview_token or not verify_preview_token(
        preview_token,
        owner_sub=context.owner_sub,
        youtube_slot=token_slot or context.slot,
        operation=operation,
        playlist_id=playlist_id,
        playlist=expected_playlist,
    ):
        raise _stale_preview_exception()


def _validate_batch_inputs(
    payload: BatchUpdateInput,
    owner_sub: str,
    action_label: str = "預覽",
) -> tuple[str, str, str, list[tuple[str, str]], list[tuple[str, str]]]:
    """Extract and validate spreadsheet ID, title/description columns, and assignments."""
    spreadsheet_id = (
        payload.spreadsheet_url_or_id or get_account_setting(owner_sub, "default_spreadsheet_id", "")
    ).strip()
    if not spreadsheet_id:
        raise http_error(400, "spreadsheet_required", "請提供試算表 ID 或網址。")
    title_column = normalize_text(payload.title_column)
    description_column = normalize_text(payload.description_column)
    if title_column == description_column:
        raise http_error(
            400,
            "columns_must_differ",
            "標題欄位與描述欄位必須不同。",
            field_errors={"description_column": ["不可與 title_column 相同。"]},
        )
    all_assignments = [(assignment.video_id, normalize_text(assignment.person)) for assignment in payload.assignments]
    active_assignments = [(video_id, person) for video_id, person in all_assignments if person and person != "不編輯"]
    if not active_assignments:
        raise http_error(400, "no_active_assignments", f"目前沒有任何影片被指定人物，請先選擇人物後再{action_label}。")
    return spreadsheet_id, title_column, description_column, all_assignments, active_assignments


def _load_and_validate_sheet_data(
    sheet_creds: Credentials,
    spreadsheet_id: str,
    worksheet_name: str,
    title_column: str,
    description_column: str,
) -> tuple[list[str], list[dict]]:
    """Load sheet headers and rows, validating required columns and presence of data."""
    headers = get_sheet_headers(sheet_creds, spreadsheet_id, worksheet_name)
    required_headers = ["所屬團體", "人", title_column, description_column]
    missing_headers = [header for header in required_headers if header not in headers]
    if missing_headers:
        raise http_error(
            400,
            "sheet_columns_missing",
            f"工作表「{worksheet_name}」缺少必要欄位，請重新整理後再試。",
            field_errors={"worksheet_name": [f"缺少欄位：{', '.join(missing_headers)}。"]},
        )
    sheet_rows = get_all_rows_for_sheet(sheet_creds, spreadsheet_id, worksheet_name)
    if not sheet_rows:
        raise http_error(400, "sheet_rows_empty", f"工作表「{worksheet_name}」沒有可用資料列。")
    return headers, sheet_rows


@router.post("/batch-preview")
def create_batch_metadata_preview(
    payload: BatchUpdateInput,
    creds: YouTubeRequestContext = Depends(require_youtube_context),
    sheet_creds: Credentials = Depends(require_sheets_credentials),
    workflows: YoutubeWorkflowService = Depends(get_youtube_workflow_service),
):
    """Build a signed, account-bound batch plan without performing writes."""
    workflows = _resolve_workflow_service(workflows)
    return workflows.create_batch_metadata_preview(payload, creds=creds, sheet_creds=sheet_creds)


@router.post("/batch-update")
def run_batch_metadata_update(
    payload: BatchUpdateInput,
    creds: YouTubeRequestContext = Depends(require_youtube_context),
    sheet_creds: Credentials = Depends(require_sheets_credentials),
    _rate_limit: None = Depends(enforce_workflow_rate_limit),
    workflows: YoutubeWorkflowService = Depends(get_youtube_workflow_service),
):
    """Validate and update selected videos synchronously, returning one result per video."""
    del _rate_limit
    workflows = _resolve_workflow_service(workflows)
    return workflows.run_batch_metadata_update(payload, creds=creds, sheet_creds=sheet_creds)


@router.post("/publish-and-cleanup")
def run_publish_and_cleanup(
    payload: PublishCleanupInput,
    creds: YouTubeRequestContext = Depends(require_youtube_context),
    _rate_limit: None = Depends(enforce_workflow_rate_limit),
    workflows: YoutubeWorkflowService = Depends(get_youtube_workflow_service),
):
    """Snapshot To-Post, sort oldest-first, then publish each video synchronously."""
    del _rate_limit
    workflows = _resolve_workflow_service(workflows)
    return workflows.run_publish_and_cleanup(payload, creds=creds)


__all__ = [
    "BatchUpdateInput",
    "PlaylistItemsInput",
    "PublishCleanupInput",
    "QuotaEstimateInput",
    "VideoAssignment",
    "VideoMetadataUpdateInput",
    "_direct_workflow_response",
    "_load_and_validate_sheet_data",
    "_playlist_preview_token",
    "_preview_slot",
    "_quota_estimate",
    "_quota_http_exception",
    "_resolve_person_metadata",
    "_resolve_playlist_id",
    "_run_youtube_operation_with_quota_fallback",
    "_safe_workflow_error",
    "_stale_preview_exception",
    "_switch_youtube_context",
    "_validate_batch_inputs",
    "_verify_playlist_preview_token",
    "_workflow_error_detail",
    "_youtube_context_metadata",
    "_youtube_thumbnail",
    "fetch_playlist_items",
    "input_digest",
    "matches_team_person",
    "playlist_snapshot",
    "remove_playlist_item",
    "set_video_public",
    "sheet_snapshot",
    "create_batch_metadata_preview",
    "estimate_quota",
    "get_playlist_videos",
    "get_quota_usage",
    "get_youtube_quota_tracker",
    "get_youtube_workflow_service",
    "resolve_assignment_row",
    "router",
    "run_batch_metadata_update",
    "run_publish_and_cleanup",
    "update_video_metadata",
    "upload_time_sort_key",
    "video_snapshot_digest",
]
