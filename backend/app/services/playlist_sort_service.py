from __future__ import annotations

import logging
import random
import re
import unicodedata
from typing import Any

from backend.app.core.youtube_context import YouTubeRequestContext
from backend.app.services.youtube_errors import YouTubeQuotaUnavailable
from backend.app.services.youtube_service import (
    _execute_with_quota,
    fetch_playlist_items,
    fetch_video_details,
    get_youtube_service,
)
from backend.app.services.ytmusic_service import (
    apply_ytmusic_sort_in_place,
    create_sorted_ytmusic_playlist,
    fetch_ytmusic_playlist_tracks,
    fetch_ytmusic_playlists,
)

logger = logging.getLogger(__name__)


def _parse_iso8601_duration(value: str) -> int:
    """Parse ISO 8601 duration string into seconds."""
    if not value:
        return 0
    match = re.match(r"^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$", value)
    if not match:
        return 0
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds


def fetch_user_playlists(context: YouTubeRequestContext) -> list[dict[str, Any]]:
    """Fetch user playlists. First attempts YouTube Music API (0 quota),

    falling back to YouTube Data API v3 if needed.
    """
    try:
        ytm_playlists = fetch_ytmusic_playlists(context=context)
        if ytm_playlists:
            logger.info("Retrieved %d playlists via YouTube Music client", len(ytm_playlists))
            return ytm_playlists
    except Exception as exc:
        logger.debug("ytmusic_service.fetch_ytmusic_playlists fallback to Data API: %s", exc)

    # Fallback to Google YouTube Data API v3
    service = get_youtube_service(context)
    playlists = []
    next_page_token = None

    while True:
        request = service.playlists().list(
            part="snippet,contentDetails,status",
            mine=True,
            maxResults=50,
            pageToken=next_page_token,
        )
        response = _execute_with_quota(request, "playlists.list", context)

        for item in response.get("items", []):
            thumbnails = item["snippet"].get("thumbnails", {})
            thumbnail_url = ""
            if "high" in thumbnails:
                thumbnail_url = thumbnails["high"].get("url", "")
            elif "default" in thumbnails:
                thumbnail_url = thumbnails["default"].get("url", "")

            playlists.append(
                {
                    "id": item["id"],
                    "title": item["snippet"]["title"],
                    "description": item["snippet"]["description"],
                    "thumbnail_url": thumbnail_url,
                    "item_count": item["contentDetails"]["itemCount"],
                    "privacy_status": item.get("status", {}).get("privacyStatus"),
                }
            )

        next_page_token = response.get("nextPageToken")
        if not next_page_token:
            break

    return playlists


def fetch_playlist_items_for_sort(
    context: YouTubeRequestContext,
    playlist_id: str,
    fetch_album_details: bool = True,
) -> list[dict[str, Any]]:
    """Fetch playlist items for sorting.

    Prioritizes YouTube Music API to retrieve artist, album, track_number, and release year (0 quota).
    Falls back to YouTube Data API v3 if necessary.
    """
    try:
        ytm_items = fetch_ytmusic_playlist_tracks(
            playlist_id=playlist_id,
            context=context,
            fetch_album_details=fetch_album_details,
        )
        if ytm_items:
            logger.info("Retrieved %d tracks for playlist %s via YouTube Music client", len(ytm_items), playlist_id)
            return ytm_items
    except Exception as exc:
        logger.debug("ytmusic_service.fetch_ytmusic_playlist_tracks fallback to Data API: %s", exc)

    # Fallback to Google YouTube Data API v3
    raw_items = fetch_playlist_items(context, playlist_id)
    if not raw_items:
        return []

    video_ids = [item["snippet"]["resourceId"]["videoId"] for item in raw_items]
    video_details = fetch_video_details(context, video_ids)

    details_map = {
        vid["id"]: {
            "duration_seconds": _parse_iso8601_duration(vid.get("contentDetails", {}).get("duration", "")),
            "published_at": vid.get("snippet", {}).get("publishedAt", ""),
        }
        for vid in video_details
    }

    result = []
    for item in raw_items:
        snippet = item["snippet"]
        video_id = snippet["resourceId"]["videoId"]
        detail = details_map.get(video_id, {})
        channel_name = snippet.get("videoOwnerChannelTitle", snippet.get("channelTitle", ""))
        result.append(
            {
                "playlist_item_id": item["id"],
                "video_id": video_id,
                "title": snippet["title"],
                "artist": channel_name,
                "channel_title": channel_name,
                "album": "",
                "album_id": None,
                "track_number": None,
                "year": None,
                "added_at": snippet["publishedAt"],
                "published_at": detail.get("published_at", ""),
                "duration_seconds": detail.get("duration_seconds", 0),
                "thumbnail_url": snippet.get("thumbnails", {}).get("default", {}).get("url", ""),
                "position": snippet["position"],
            }
        )
    return result


def sort_items(items: list[dict[str, Any]], sort_keys: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sort playlist tracks according to multi-key rules.

    Supports fields:
    - artist: 藝人名稱 (artist or channel_title)
    - album: 專輯名稱
    - track_number / track: 歌曲曲目 / 第幾首 (numeric, missing sorted to end)
    - year / release_year: 發行年份 (numeric, missing sorted to end)
    - title: 歌曲名稱
    - duration / duration_seconds: 歌曲時長 (numeric)
    - added_at: 加入清單日期
    - published_at: 發布日期
    - original_position / position: 原始清單順序
    - random: 隨機打亂
    """
    if not items or not sort_keys:
        return [item.copy() for item in items]

    sorted_list = [item.copy() for item in items]

    for key_config in reversed(sort_keys):
        field = key_config["field"]
        direction = key_config.get("direction", "asc")
        reverse = direction == "desc"

        if field == "random":
            seed = str(sort_keys)
            rng = random.Random(seed)
            rng.shuffle(sorted_list)
        else:

            def sort_key_func(item: dict[str, Any], sort_field: str = field, rev: bool = reverse) -> Any:
                if sort_field == "artist":
                    val = item.get("artist") or item.get("channel_title") or ""
                    return unicodedata.normalize("NFKC", str(val)).casefold()

                if sort_field == "album":
                    val = item.get("album") or ""
                    return unicodedata.normalize("NFKC", str(val)).casefold()

                if sort_field in ("track_number", "track"):
                    val = item.get("track_number")
                    if val is None or val == "" or str(val).strip() == "":
                        return (1, 0) if not rev else (0, -1)
                    try:
                        num = int(val)
                        return (0, num) if not rev else (1, num)
                    except (ValueError, TypeError):
                        return (1, 0) if not rev else (0, -1)

                if sort_field in ("year", "release_year"):
                    val = item.get("year") or item.get("published_at") or ""
                    if not val:
                        return (1, 0) if not rev else (0, -1)
                    match = re.search(r"\b(19\d\d|20\d\d)\b", str(val))
                    if match:
                        year_num = int(match.group(1))
                        return (0, year_num) if not rev else (1, year_num)
                    return (1, 0) if not rev else (0, -1)

                if sort_field == "title":
                    return unicodedata.normalize("NFKC", str(item.get("title") or "")).casefold()

                if sort_field in ("duration", "duration_seconds"):
                    val = item.get("duration_seconds", item.get("duration", 0))
                    return val if isinstance(val, (int, float)) else 0

                val = item.get(sort_field)
                if isinstance(val, str):
                    return unicodedata.normalize("NFKC", val).casefold()
                return val if val is not None else ""

            sorted_list.sort(key=sort_key_func, reverse=reverse)

    for i, item in enumerate(sorted_list):
        item["position"] = i

    return sorted_list


def build_sort_preview(original: list[dict[str, Any]], sorted_items: list[dict[str, Any]]) -> dict[str, Any]:
    original_positions = {item["playlist_item_id"]: i for i, item in enumerate(original)}

    unchanged = 0
    moved = 0
    preview_items = []

    for i, item in enumerate(sorted_items):
        item_id = item["playlist_item_id"]
        orig_pos = original_positions.get(item_id, i)

        status = "unchanged" if orig_pos == i else "moved"
        if status == "unchanged":
            unchanged += 1
        else:
            moved += 1

        preview_item = item.copy()
        preview_item.update({"status": status, "original_position": orig_pos, "new_position": i})
        preview_items.append(preview_item)

    return {"total": len(original), "unchanged_count": unchanged, "moved_count": moved, "items": preview_items}


def apply_sort_to_playlist(
    context: YouTubeRequestContext,
    playlist_id: str,
    sorted_items: list[dict[str, Any]],
    original_items: list[dict[str, Any]] | None = None,
    mode: str = "in_place",
    new_playlist_title: str | None = None,
    use_youtube_api: bool = False,
) -> dict[str, Any]:
    """Apply sorting to the playlist.

    Defaults to YouTube Music API (0 API credit).
    Supports:
    1. mode="in_place": Moves items within the existing playlist.
    2. mode="new_playlist": Creates a brand new sorted playlist in 1 fast step.
    Falls back to YouTube Data API v3 if use_youtube_api=True.
    """
    if not use_youtube_api:
        try:
            if mode == "new_playlist":
                return create_sorted_ytmusic_playlist(
                    title=new_playlist_title or f"[已排序] {playlist_id}",
                    description="透過 YouTube Music 智慧排序建立",
                    sorted_items=sorted_items,
                    context=context,
                )
            else:
                orig = original_items or sorted(
                    [it for it in sorted_items], key=lambda x: x.get("original_position", x.get("position", 0))
                )
                return apply_ytmusic_sort_in_place(
                    playlist_id=playlist_id,
                    sorted_items=sorted_items,
                    original_items=orig,
                    context=context,
                )
        except Exception as exc:
            logger.warning("apply_sort_to_playlist using ytmusic_service failed: %s; falling back to Data API", exc)

    # Legacy Google YouTube Data API v3 update
    service = get_youtube_service(context)
    moved_count = 0
    succeeded = 0
    failed = 0
    failed_items = []
    quota_used = 0

    for item in sorted_items:
        if item.get("status") == "moved" or item.get("new_position", item.get("position")) != item.get(
            "original_position", item.get("position")
        ):
            moved_count += 1
            try:
                request = service.playlistItems().update(
                    part="snippet",
                    body={
                        "id": item["playlist_item_id"],
                        "snippet": {
                            "playlistId": playlist_id,
                            "resourceId": {"kind": "youtube#video", "videoId": item["video_id"]},
                            "position": item.get("new_position", item.get("position")),
                        },
                    },
                )
                _execute_with_quota(request, "playlistItems.update", context)
                succeeded += 1
                quota_used += 50
            except YouTubeQuotaUnavailable:
                logger.warning(
                    "YouTube quota exceeded while sorting playlist %s at item %s", playlist_id, item["playlist_item_id"]
                )
                raise
            except Exception as e:
                logger.error("Failed to update playlist item %s: %s", item["playlist_item_id"], e)
                failed += 1
                failed_items.append({"playlist_item_id": item["playlist_item_id"], "error": str(e)})

    return {
        "operation": "playlist_sort",
        "mode": "in_place",
        "total": len(sorted_items),
        "moved": moved_count,
        "succeeded": succeeded,
        "failed": failed,
        "failed_items": failed_items,
        "quota_used": quota_used,
    }
