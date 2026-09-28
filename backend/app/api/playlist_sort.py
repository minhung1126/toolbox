from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from backend.app.core.credential_store import CredentialStore, credential_store
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


def get_playlist_credential_store(request: Request) -> CredentialStore:
    """Resolve the credential repository owned by this app instance."""
    configured = getattr(request.app.state, "credential_store", None)
    return configured if configured is not None else credential_store


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
    allow_quota_fallback: bool = False


@router.get("/playlists")
async def get_playlists(
    context: YouTubeRequestContext = Depends(require_ytmusic_context),
    token_store: CredentialStore = Depends(get_playlist_credential_store),
    language: Optional[str] = None,
    location: Optional[str] = None,
):
    try:
        playlists = await run_in_threadpool(
            fetch_user_playlists, context, language=language, location=location, token_store=token_store
        )
        return {"playlists": playlists}
    except YouTubeQuotaUnavailable as exc:
        raise _quota_http_exception(exc) from exc
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error fetching playlists: %s", type(e).__name__)
        raise http_error(500, "playlist_fetch_failed", "讀取播放清單失敗，請稍後再試。") from e


@router.post("/preview")
async def preview_sort(
    input_data: SortPreviewInput,
    context: YouTubeRequestContext = Depends(require_ytmusic_context),
    token_store: CredentialStore = Depends(get_playlist_credential_store),
):
    try:
        # Also run yt-dlp fallback when sorting by album so that singles and videos (items
        # without an album, displayed as "影片") receive their release year for
        # correct chronological ordering within the timeline.
        needs_year_fallback = any(
            k.field in ("year", "release_year", "release_date", "album") for k in input_data.sort_keys
        )
        original_items = await run_in_threadpool(
            fetch_playlist_items_for_sort,
            context,
            input_data.playlist_id,
            fetch_album_details=input_data.fetch_album_details,
            use_ytdlp_fallback=needs_year_fallback,
            language=input_data.language,
            location=input_data.location,
            token_store=token_store,
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

        has_custom_token = bool(token_store.get_ytmusic_custom_token(context.owner_sub))
        has_valid_set_video_ids = all(item.get("has_set_video_id", True) for item in original_items)
        can_use_ytm = not input_data.use_youtube_api and has_custom_token and has_valid_set_video_ids

        is_ytm = can_use_ytm
        units_per_move = 0 if is_ytm else 50
        total_units = 0 if is_ytm else preview["moved_count"] * 50

        if is_ytm:
            quota_message = "使用 YouTube Music Token 模式更新，消耗 0 Google API 配額。"
        elif not has_custom_token:
            quota_message = "未設定 YouTube Music 瀏覽器 Token，將使用 Google YouTube Data API 執行更新。"
        elif not has_valid_set_video_ids:
            quota_message = (
                "播放清單包含無法由 YouTube Music 內部協定識別的項目，將使用 Google YouTube Data API 執行更新。"
            )
        else:
            quota_message = "使用 Google YouTube Data API 更新。"

        return {
            "preview": preview,
            "preview_token": preview_token,
            "playlist_snapshot": snapshot,
            "quota_estimate": {
                "moved_count": preview["moved_count"],
                "units_per_move": units_per_move,
                "total_units": total_units,
                "engine": "ytmusic_innertube" if is_ytm else "youtube_data_api_v3",
                "message": quota_message,
            },
        }
    except YouTubeQuotaUnavailable as exc:
        raise _quota_http_exception(exc) from exc
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error generating sort preview: %s", type(e).__name__)
        raise http_error(500, "PREVIEW_FAILED", "產生排序預覽失敗，請稍後再試。") from e


@router.post("/apply")
async def apply_sort(
    input_data: SortApplyInput,
    context: YouTubeRequestContext = Depends(require_ytmusic_context),
    rate_limit=Depends(enforce_workflow_rate_limit),
    token_store: CredentialStore = Depends(get_playlist_credential_store),
):
    try:
        has_full_sorted_ids = bool(input_data.sorted_item_ids)
        needs_album = any(
            k.field in ("album", "track_number", "track", "year", "release_year", "release_date")
            for k in input_data.sort_keys
        )
        fetch_album = needs_album if not has_full_sorted_ids else False

        original_items = await run_in_threadpool(
            fetch_playlist_items_for_sort,
            context,
            input_data.playlist_id,
            fetch_album_details=fetch_album,
            use_ytdlp_fallback=False,
            language=input_data.language,
            location=input_data.location,
            token_store=token_store,
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

        has_custom_token = bool(token_store.get_ytmusic_custom_token(context.owner_sub))
        effective_fallback = input_data.allow_quota_fallback or (not has_custom_token)
        preview = build_sort_preview(original_items, sorted_items)

        result = await run_in_threadpool(
            apply_sort_to_playlist,
            context,
            input_data.playlist_id,
            preview["items"],
            original_items=original_items,
            mode=input_data.mode,
            new_playlist_title=input_data.new_playlist_title,
            use_youtube_api=input_data.use_youtube_api,
            language=input_data.language,
            location=input_data.location,
            allow_quota_fallback=effective_fallback,
            token_store=token_store,
        )
        return result
    except YouTubeQuotaUnavailable as exc:
        raise _quota_http_exception(exc) from exc
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error applying sort: %s", type(e).__name__)
        has_custom = bool(token_store.get_ytmusic_custom_token(context.owner_sub))
        if has_custom and not input_data.use_youtube_api and not input_data.allow_quota_fallback:
            raise http_error(
                401,
                "TOKEN_FALLBACK_BLOCKED",
                "YouTube Music Token 執行失敗。已啟動嚴格防禦保護，阻止自動降級至 Google API 配額模式（避免無預警消耗配額）。請更新 Token 或確認以 Google API 配額繼續。",
            ) from e
        raise http_error(500, "APPLY_FAILED", "套用排序失敗，請稍後再試。") from e
