from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.app.core.dependencies import require_ytmusic_context
from backend.app.core.error_contract import http_error
from backend.app.core.preview import (
    build_preview_token,
    playlist_snapshot_from_preview,
    verify_preview_token,
)
from backend.app.core.request_protection import enforce_workflow_rate_limit
from backend.app.core.youtube_context import YouTubeRequestContext
from backend.app.services.playlist_sort_service import (
    apply_sort_to_playlist,
    build_sort_preview,
    fetch_playlist_items_for_sort,
    fetch_user_playlists,
    sort_items,
)
from backend.app.services.youtube_errors import YouTubeQuotaUnavailable

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/playlist-sort", tags=["Playlist Sort"])


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


class SortKeyInput(BaseModel):
    field: str
    direction: str = "asc"


class SortPreviewInput(BaseModel):
    playlist_id: str
    sort_keys: list[SortKeyInput]
    fetch_album_details: bool = True
    use_youtube_api: bool = False
    language: Optional[str] = None
    location: Optional[str] = None


class SortApplyInput(BaseModel):
    playlist_id: str
    sort_keys: list[SortKeyInput]
    preview_token: str
    mode: str = "in_place"
    new_playlist_title: Optional[str] = None
    use_youtube_api: bool = False
    sorted_item_ids: Optional[list[str]] = None
    language: Optional[str] = None
    location: Optional[str] = None


@router.get("/playlists")
async def get_playlists(
    context: YouTubeRequestContext = Depends(require_ytmusic_context),
    language: Optional[str] = None,
    location: Optional[str] = None,
):
    try:
        playlists = fetch_user_playlists(context, language=language, location=location)
        return {"playlists": playlists}
    except YouTubeQuotaUnavailable as exc:
        raise _quota_http_exception(exc) from exc
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error fetching playlists: %s", e)
        raise http_error(500, "FETCH_FAILED", str(e)) from e


@router.post("/preview")
async def preview_sort(
    input_data: SortPreviewInput,
    context: YouTubeRequestContext = Depends(require_ytmusic_context),
):
    try:
        # Also run yt-dlp fallback when sorting by album so that singles and videos (items
        # without an album, displayed as "影片") receive their release year for
        # correct chronological ordering within the timeline.
        needs_year_fallback = any(
            k.field in ("year", "release_year", "release_date", "album") for k in input_data.sort_keys
        )
        original_items = fetch_playlist_items_for_sort(
            context,
            input_data.playlist_id,
            fetch_album_details=input_data.fetch_album_details,
            use_ytdlp_fallback=needs_year_fallback,
            language=input_data.language,
            location=input_data.location,
        )

        sort_keys_dict = [{"field": k.field, "direction": k.direction} for k in input_data.sort_keys]
        sorted_items = sort_items(original_items, sort_keys_dict)

        preview = build_sort_preview(original_items, sorted_items)
        snapshot = playlist_snapshot_from_preview(original_items)

        preview_token = build_preview_token(
            owner_sub=context.owner_sub,
            youtube_slot=context.slot,
            operation="youtube.playlist_sort",
            playlist_id=input_data.playlist_id,
            playlist=snapshot,
        )

        is_ytm = not input_data.use_youtube_api
        units_per_move = 0 if is_ytm else 50
        total_units = 0 if is_ytm else preview["moved_count"] * 50

        return {
            "preview": preview,
            "preview_token": preview_token,
            "playlist_snapshot": snapshot,
            "quota_estimate": {
                "moved_count": preview["moved_count"],
                "units_per_move": units_per_move,
                "total_units": total_units,
                "engine": "ytmusic_innertube" if is_ytm else "youtube_data_api_v3",
                "message": (
                    "使用 YouTube Music Token 模式更新，消耗 0 Google API 配額。"
                    if is_ytm
                    else "使用 Google YouTube Data API 更新。"
                ),
            },
        }
    except YouTubeQuotaUnavailable as exc:
        raise _quota_http_exception(exc) from exc
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error generating sort preview: %s", e)
        raise http_error(500, "PREVIEW_FAILED", str(e)) from e


@router.post("/apply")
async def apply_sort(
    input_data: SortApplyInput,
    context: YouTubeRequestContext = Depends(require_ytmusic_context),
    rate_limit=Depends(enforce_workflow_rate_limit),
):
    try:
        has_full_sorted_ids = bool(input_data.sorted_item_ids)
        needs_album = any(
            k.field in ("album", "track_number", "track", "year", "release_year", "release_date")
            for k in input_data.sort_keys
        )
        fetch_album = needs_album if not has_full_sorted_ids else False

        original_items = fetch_playlist_items_for_sort(
            context,
            input_data.playlist_id,
            fetch_album_details=fetch_album,
            use_ytdlp_fallback=False,
            language=input_data.language,
            location=input_data.location,
        )
        snapshot = playlist_snapshot_from_preview(original_items)

        if not input_data.preview_token or not verify_preview_token(
            input_data.preview_token,
            owner_sub=context.owner_sub,
            youtube_slot=context.slot,
            operation="youtube.playlist_sort",
            playlist_id=input_data.playlist_id,
            playlist=snapshot,
        ):
            raise http_error(
                409,
                "stale_preview",
                "預覽已過期或播放清單內容已變更，尚未寫入任何資料。請重新讀取預覽後再執行。",
            )

        if input_data.sorted_item_ids and len(input_data.sorted_item_ids) == len(original_items):
            items_by_id = {item["playlist_item_id"]: item for item in original_items}
            sorted_items = [items_by_id[item_id] for item_id in input_data.sorted_item_ids if item_id in items_by_id]
            if len(sorted_items) != len(original_items):
                sort_keys_dict = [{"field": k.field, "direction": k.direction} for k in input_data.sort_keys]
                sorted_items = sort_items(original_items, sort_keys_dict)
        else:
            sort_keys_dict = [{"field": k.field, "direction": k.direction} for k in input_data.sort_keys]
            sorted_items = sort_items(original_items, sort_keys_dict)

        preview = build_sort_preview(original_items, sorted_items)

        result = apply_sort_to_playlist(
            context,
            input_data.playlist_id,
            preview["items"],
            original_items=original_items,
            mode=input_data.mode,
            new_playlist_title=input_data.new_playlist_title,
            use_youtube_api=input_data.use_youtube_api,
            language=input_data.language,
            location=input_data.location,
        )
        return result
    except YouTubeQuotaUnavailable as exc:
        raise _quota_http_exception(exc) from exc
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error applying sort: %s", e)
        raise http_error(500, "APPLY_FAILED", str(e)) from e
