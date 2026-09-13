"""Pure helper functions, snapshot digests, and result formatting for YouTube workflows."""

from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from backend.app.core.error_contract import http_error
from backend.app.core.preview import input_digest
from backend.app.core.youtube_context import YouTubeRequestContext
from backend.app.services.provider_errors import map_youtube_error
from backend.app.services.sheets_service import normalize_text
from backend.app.services.youtube_errors import YouTubeQuotaUnavailable


def _youtube_context_metadata(context: YouTubeRequestContext) -> dict[str, Any]:
    return {
        "youtube_slot": context.slot,
        "youtube_routing_mode": context.routing_mode,
        "youtube_slot_reason": context.selection_reason,
        "youtube_preferred_slot": context.preferred_slot,
        "youtube_estimated_units": context.estimated_units,
    }


def _preview_slot(snapshot: object, fallback: str) -> str:
    """Read the slot that signed the preview, with a safe legacy fallback."""
    if isinstance(snapshot, dict):
        candidate = str(snapshot.get("youtube_slot") or "").strip()
        if candidate in {"primary", "secondary"}:
            return candidate
    return fallback


def resolve_assignment_row(matches: List[Dict[str, Any]], title_column: str, description_column: str):
    """Accept duplicate matching rows when the selected output values are identical."""
    if not matches:
        return None, "not_found"

    distinct_values = {}
    for row in matches:
        title = normalize_text(row.get(title_column) or "")
        description = str(row.get(description_column) or "")
        distinct_values.setdefault((title, description), row)

    if len(distinct_values) > 1:
        return None, "conflict"
    return next(iter(distinct_values.values())), None


def video_snapshot_digest(details_map: Dict[str, dict], video_ids: List[str]) -> str:
    """Digest the mutable YouTube fields used by a metadata update."""
    values = []
    for video_id in video_ids:
        detail = details_map.get(video_id) or {}
        snippet = detail.get("snippet") or {}
        status = detail.get("status") or {}
        values.append(
            {
                "video_id": video_id,
                "title": str(snippet.get("title") or ""),
                "description": str(snippet.get("description") or ""),
                "category_id": str(snippet.get("categoryId") or ""),
                "privacy_status": str(status.get("privacyStatus") or ""),
            }
        )
    return input_digest(values)


def upload_time_sort_key(video_id: str, details_map: Dict[str, dict], original_positions: Dict[str, int]):
    """Sort valid YouTube publishedAt values oldest-first with stable fallbacks."""
    detail = details_map.get(video_id) or {}
    published_at = (detail.get("snippet") or {}).get("publishedAt") or ""
    return (
        not bool(published_at),
        published_at,
        original_positions.get(video_id, 0),
    )


def _youtube_thumbnail(detail: dict, video_id: str) -> str:
    thumbnails = (detail.get("snippet") or {}).get("thumbnails") or {}
    url = (
        (thumbnails.get("maxres") or {}).get("url")
        or (thumbnails.get("standard") or {}).get("url")
        or (thumbnails.get("high") or {}).get("url")
        or (thumbnails.get("medium") or {}).get("url")
        or (thumbnails.get("default") or {}).get("url")
        or (f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg" if video_id else "")
    )
    if url and url.startswith("http://"):
        return "https://" + url[7:]
    return url


def _safe_workflow_error(exc: Exception) -> str:
    if isinstance(exc, YouTubeQuotaUnavailable):
        return exc.user_message
    return map_youtube_error(exc).message


def _workflow_error_detail(exc: Exception, *, slot: str) -> dict[str, Any]:
    if isinstance(exc, YouTubeQuotaUnavailable):
        return exc.to_dict()
    return map_youtube_error(exc, youtube_slot=slot).detail


def _stale_preview_exception() -> HTTPException:
    return http_error(
        409,
        "stale_preview",
        "預覽已過期或來源已變更，尚未寫入任何資料。請重新讀取後再執行。",
    )


def _resolve_person_metadata(
    matches: List[dict],
    normalized_team: str,
    person: str,
    title_column: str,
    description_column: str,
) -> Tuple[str, str, str]:
    """Resolve matched sheet row for a person into (skip_reason, new_title, new_description)."""
    row, match_error = resolve_assignment_row(matches, title_column, description_column)
    if match_error == "not_found":
        return f"找不到團體 {normalized_team} 的選項 {person} 資料", "", ""
    if match_error == "conflict":
        return f"團體 {normalized_team} 的選項 {person} 有多筆且標題或描述內容不同", "", ""
    new_title = normalize_text((row or {}).get(title_column) or "")
    new_description = str((row or {}).get(description_column) or "")
    if not new_title:
        return f"工作表的 {title_column} 為空白", "", ""
    return "", new_title, new_description


def _direct_workflow_response(
    operation: str,
    results: List[dict],
    *,
    quota_error: Optional[YouTubeQuotaUnavailable] = None,
    slot: str = "primary",
    context: YouTubeRequestContext | None = None,
) -> dict:
    statuses = [str(item.get("status") or "") for item in results]
    response = {
        "operation": operation,
        "youtube_slot": slot,
        "completed": quota_error is None and "not_attempted" not in statuses,
        "total_count": len(results),
        "succeeded_count": statuses.count("succeeded"),
        "warning_count": statuses.count("succeeded_with_warnings"),
        "skipped_count": statuses.count("skipped"),
        "failed_count": statuses.count("failed"),
        "not_attempted_count": statuses.count("not_attempted"),
        "quota_blocked": quota_error is not None,
        "reset_at": quota_error.reset_at if quota_error else None,
        "results": results,
    }
    if context is not None:
        response.update(_youtube_context_metadata(context))
    if quota_error:
        response["quota_error"] = quota_error.to_dict()
    return response


__all__ = [
    "_direct_workflow_response",
    "_preview_slot",
    "_resolve_person_metadata",
    "_safe_workflow_error",
    "_stale_preview_exception",
    "_workflow_error_detail",
    "_youtube_context_metadata",
    "_youtube_thumbnail",
    "resolve_assignment_row",
    "upload_time_sort_key",
    "video_snapshot_digest",
]
