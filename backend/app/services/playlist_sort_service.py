from __future__ import annotations

import logging
import random
import re
import unicodedata

from backend.app.core.youtube_context import YouTubeRequestContext
from backend.app.services.youtube_errors import YouTubeQuotaUnavailable
from backend.app.services.youtube_service import (
    _execute_with_quota,
    fetch_playlist_items,
    fetch_video_details,
    get_youtube_service,
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


def fetch_user_playlists(context: YouTubeRequestContext) -> list[dict]:
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


def fetch_playlist_items_for_sort(context: YouTubeRequestContext, playlist_id: str) -> list[dict]:
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
        result.append(
            {
                "playlist_item_id": item["id"],
                "video_id": video_id,
                "title": snippet["title"],
                "channel_title": snippet.get("videoOwnerChannelTitle", snippet.get("channelTitle", "")),
                "added_at": snippet["publishedAt"],
                "published_at": detail.get("published_at", ""),
                "duration_seconds": detail.get("duration_seconds", 0),
                "thumbnail_url": snippet.get("thumbnails", {}).get("default", {}).get("url", ""),
                "position": snippet["position"],
            }
        )
    return result


def sort_items(items: list[dict], sort_keys: list[dict]) -> list[dict]:
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

            def sort_key_func(item, sort_field=field):
                if sort_field == "artist":
                    return unicodedata.normalize("NFKC", str(item.get("channel_title") or "")).casefold()
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


def build_sort_preview(original: list[dict], sorted_items: list[dict]) -> dict:
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


def apply_sort_to_playlist(context: YouTubeRequestContext, playlist_id: str, sorted_items: list[dict]) -> dict:
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
        "total": len(sorted_items),
        "moved": moved_count,
        "succeeded": succeeded,
        "failed": failed,
        "failed_items": failed_items,
        "quota_used": quota_used,
    }
