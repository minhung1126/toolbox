from __future__ import annotations

import logging

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


class SortApplyInput(BaseModel):
    playlist_id: str
    sort_keys: list[SortKeyInput]
    preview_token: str


@router.get("/playlists")
async def get_playlists(
    context: YouTubeRequestContext = Depends(require_ytmusic_context),
):
    try:
        playlists = fetch_user_playlists(context)
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
        original_items = fetch_playlist_items_for_sort(context, input_data.playlist_id)

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

        return {
            "preview": preview,
            "preview_token": preview_token,
            "playlist_snapshot": snapshot,
            "quota_estimate": {
                "moved_count": preview["moved_count"],
                "units_per_move": 50,
                "total_units": preview["moved_count"] * 50,
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
        original_items = fetch_playlist_items_for_sort(context, input_data.playlist_id)
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

        sort_keys_dict = [{"field": k.field, "direction": k.direction} for k in input_data.sort_keys]
        sorted_items = sort_items(original_items, sort_keys_dict)

        preview = build_sort_preview(original_items, sorted_items)

        result = apply_sort_to_playlist(context, input_data.playlist_id, preview["items"])
        return result
    except YouTubeQuotaUnavailable as exc:
        raise _quota_http_exception(exc) from exc
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error applying sort: %s", e)
        raise http_error(500, "APPLY_FAILED", str(e)) from e
