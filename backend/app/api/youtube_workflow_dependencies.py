"""YouTube workflow dependencies composed at the API boundary."""

import logging
from collections.abc import Mapping
from functools import partial
from typing import Any, Optional

from fastapi import HTTPException
from google.oauth2.credentials import Credentials

from backend.app.api.youtube_helpers import (
    _direct_workflow_response,
    _preview_slot,
    _resolve_person_metadata,
    _stale_preview_exception,
    _workflow_error_detail,
    _youtube_context_metadata,
    _youtube_thumbnail,
    upload_time_sort_key,
    video_snapshot_digest,
)
from backend.app.api.youtube_models import BatchUpdateInput
from backend.app.core.account_state import get_account_setting
from backend.app.core.dependencies import create_youtube_request_context
from backend.app.core.error_contract import http_error
from backend.app.core.preview import (
    build_preview_token,
    input_digest,
    playlist_snapshot,
    sheet_snapshot,
    verify_preview_token,
)
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
from backend.app.services.youtube_service import (
    fetch_playlist_items,
    fetch_video_details,
    remove_playlist_item,
    set_video_public,
    update_single_video_metadata,
)
from backend.app.services.youtube_workflows import YoutubeWorkflowService

logger = logging.getLogger("backend.app.api.youtube")


def _resolve_playlist_id(
    context: YouTubeRequestContext,
    requested: Optional[str],
    *,
    get_setting=None,
    normalize_playlist=None,
    make_http_error=None,
) -> str:
    """Resolve the account playlist, retaining the request field as migration fallback."""
    get_setting = get_setting or get_account_setting
    normalize_playlist = normalize_playlist or normalize_playlist_id
    make_http_error = make_http_error or http_error
    configured_value = get_setting(context.owner_sub, "default_playlist_id", "")
    raw_value = configured_value or requested
    if not str(raw_value or "").strip():
        return ""
    playlist_id = normalize_playlist(raw_value)
    if not playlist_id:
        raise make_http_error(400, "playlist_invalid", "播放清單網址或 ID 格式不正確。")
    return playlist_id


def _quota_http_exception(exc: YouTubeQuotaUnavailable, *, make_http_error=None) -> HTTPException:
    make_http_error = make_http_error or http_error
    detail = exc.to_dict()
    return make_http_error(
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
    choose_slot=None,
    make_context=None,
) -> YouTubeRequestContext | None:
    """Select the other Auto slot after a quota failure."""
    choose_slot = choose_slot or choose_youtube_slot
    make_context = make_context or create_youtube_request_context
    if context.routing_mode != "auto_primary" or not context.session_id:
        return None
    for slot in ("secondary", "primary"):
        if slot == context.slot or slot in attempted_slots:
            continue
        try:
            decision = choose_slot(
                context.session_id,
                context.owner_sub,
                estimated_units=max(int(estimated_units or 0), 1),
                slot_hint=slot,
            )
        except HTTPException:
            continue
        if decision.slot == context.slot or decision.slot in attempted_slots:
            continue
        return make_context(
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
    switch_context=None,
) -> tuple[YouTubeRequestContext, Any]:
    """Run one operation and retry it once on the other Auto slot."""
    try:
        return context, operation(context)
    except YouTubeQuotaUnavailable:
        switch_context = switch_context or _switch_youtube_context
        fallback_context = switch_context(
            context,
            estimated_units=max(int(estimated_units or 0), 1),
            attempted_slots=attempted_slots,
        )
        if fallback_context is None:
            raise
        attempted_slots.add(fallback_context.slot)
        return fallback_context, operation(fallback_context)


def _verify_playlist_preview_token(
    context: YouTubeRequestContext,
    playlist_id: str,
    expected_playlist: dict[str, Any],
    preview_token: Optional[str],
    *,
    operation: str = "youtube.playlist_preview",
    token_slot: Optional[str] = None,
    verify_token=None,
    stale_preview_exception=None,
) -> None:
    verify_token = verify_token or verify_preview_token
    stale_preview_exception = stale_preview_exception or _stale_preview_exception
    if not preview_token or not verify_token(
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
    *,
    get_setting=None,
    normalize=None,
    make_http_error=None,
) -> tuple[str, str, str, list[tuple[str, str]], list[tuple[str, str]]]:
    """Validate sheet columns and assignments for a batch workflow."""
    get_setting = get_setting or get_account_setting
    normalize = normalize or normalize_text
    make_http_error = make_http_error or http_error
    spreadsheet_id = (payload.spreadsheet_url_or_id or get_setting(owner_sub, "default_spreadsheet_id", "")).strip()
    if not spreadsheet_id:
        raise make_http_error(400, "spreadsheet_required", "請提供試算表 ID 或網址。")
    title_column = normalize(payload.title_column)
    description_column = normalize(payload.description_column)
    if title_column == description_column:
        raise make_http_error(
            400,
            "columns_must_differ",
            "標題欄位與描述欄位必須不同。",
            field_errors={"description_column": ["不可與 title_column 相同。"]},
        )
    all_assignments = [(assignment.video_id, normalize(assignment.person)) for assignment in payload.assignments]
    active_assignments = [(video_id, person) for video_id, person in all_assignments if person and person != "不編輯"]
    if not active_assignments:
        raise make_http_error(
            400, "no_active_assignments", f"目前沒有任何影片被指定人物，請先選擇人物後再{action_label}。"
        )
    return spreadsheet_id, title_column, description_column, all_assignments, active_assignments


def _load_and_validate_sheet_data(
    sheet_creds: Credentials,
    spreadsheet_id: str,
    worksheet_name: str,
    title_column: str,
    description_column: str,
    *,
    read_headers=None,
    read_rows=None,
    make_http_error=None,
) -> tuple[list[str], list[dict]]:
    """Load sheet data and verify that all required columns and rows exist."""
    read_headers = read_headers or get_sheet_headers
    read_rows = read_rows or get_all_rows_for_sheet
    make_http_error = make_http_error or http_error
    headers = read_headers(sheet_creds, spreadsheet_id, worksheet_name)
    required_headers = ["所屬團體", "人", title_column, description_column]
    missing_headers = [header for header in required_headers if header not in headers]
    if missing_headers:
        raise make_http_error(
            400,
            "sheet_columns_missing",
            f"工作表「{worksheet_name}」缺少必要欄位，請重新整理後再試。",
            field_errors={"worksheet_name": [f"缺少欄位：{', '.join(missing_headers)}。"]},
        )
    sheet_rows = read_rows(sheet_creds, spreadsheet_id, worksheet_name)
    if not sheet_rows:
        raise make_http_error(400, "sheet_rows_empty", f"工作表「{worksheet_name}」沒有可用資料列。")
    return headers, sheet_rows


def _youtube_workflow_dependencies() -> dict[str, Any]:
    """Build the workflow ports explicitly at the API composition boundary."""
    return {
        "_direct_workflow_response": _direct_workflow_response,
        "_load_and_validate_sheet_data": _load_and_validate_sheet_data,
        "_preview_slot": _preview_slot,
        "_quota_http_exception": _quota_http_exception,
        "_resolve_person_metadata": _resolve_person_metadata,
        "_resolve_playlist_id": _resolve_playlist_id,
        "_run_youtube_operation_with_quota_fallback": _run_youtube_operation_with_quota_fallback,
        "_stale_preview_exception": _stale_preview_exception,
        "_switch_youtube_context": _switch_youtube_context,
        "_validate_batch_inputs": _validate_batch_inputs,
        "_verify_playlist_preview_token": _verify_playlist_preview_token,
        "_workflow_error_detail": _workflow_error_detail,
        "_youtube_context_metadata": _youtube_context_metadata,
        "_youtube_thumbnail": _youtube_thumbnail,
        "build_preview_token": build_preview_token,
        "choose_youtube_slot": choose_youtube_slot,
        "create_youtube_request_context": create_youtube_request_context,
        "fetch_playlist_items": fetch_playlist_items,
        "fetch_video_details": fetch_video_details,
        "get_account_setting": get_account_setting,
        "get_all_rows_for_sheet": get_all_rows_for_sheet,
        "get_sheet_headers": get_sheet_headers,
        "http_error": http_error,
        "input_digest": input_digest,
        "logger": logger,
        "map_youtube_error": map_youtube_error,
        "matches_team_person": matches_team_person,
        "normalize_text": normalize_text,
        "normalize_playlist_id": normalize_playlist_id,
        "playlist_snapshot": playlist_snapshot,
        "remove_playlist_item": remove_playlist_item,
        "set_video_public": set_video_public,
        "sheet_snapshot": sheet_snapshot,
        "update_single_video_metadata": update_single_video_metadata,
        "upload_time_sort_key": upload_time_sort_key,
        "verify_preview_token": verify_preview_token,
        "video_snapshot_digest": video_snapshot_digest,
    }


def create_youtube_workflow_service(overrides: Mapping[str, Any] | None = None) -> YoutubeWorkflowService:
    """Build the workflow service with replaceable adapters at the API boundary."""
    dependencies = _youtube_workflow_dependencies()
    if overrides:
        dependencies.update({name: overrides[name] for name in dependencies if name in overrides})
    dependencies["_resolve_playlist_id"] = partial(
        _resolve_playlist_id,
        get_setting=dependencies["get_account_setting"],
        normalize_playlist=dependencies["normalize_playlist_id"],
        make_http_error=dependencies["http_error"],
    )
    dependencies["_quota_http_exception"] = partial(_quota_http_exception, make_http_error=dependencies["http_error"])
    switch_context = dependencies["_switch_youtube_context"]
    if switch_context is _switch_youtube_context:
        switch_context = partial(
            _switch_youtube_context,
            choose_slot=dependencies["choose_youtube_slot"],
            make_context=dependencies["create_youtube_request_context"],
        )
    dependencies["_switch_youtube_context"] = switch_context
    dependencies["_run_youtube_operation_with_quota_fallback"] = partial(
        _run_youtube_operation_with_quota_fallback,
        switch_context=dependencies["_switch_youtube_context"],
    )
    dependencies["_verify_playlist_preview_token"] = partial(
        _verify_playlist_preview_token,
        verify_token=dependencies["verify_preview_token"],
        stale_preview_exception=dependencies["_stale_preview_exception"],
    )
    dependencies["_validate_batch_inputs"] = partial(
        _validate_batch_inputs,
        get_setting=dependencies["get_account_setting"],
        normalize=dependencies["normalize_text"],
        make_http_error=dependencies["http_error"],
    )
    dependencies["_load_and_validate_sheet_data"] = partial(
        _load_and_validate_sheet_data,
        read_headers=dependencies["get_sheet_headers"],
        read_rows=dependencies["get_all_rows_for_sheet"],
        make_http_error=dependencies["http_error"],
    )
    return YoutubeWorkflowService(dependencies)


def get_youtube_workflow_service() -> YoutubeWorkflowService:
    """FastAPI dependency used by YouTube workflow endpoints."""
    return create_youtube_workflow_service()
