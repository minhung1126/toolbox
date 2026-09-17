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
    enrich_tracks_with_ytdlp_fallback,
    fetch_ytmusic_playlist_tracks,
    fetch_ytmusic_playlists,
    normalize_artist_name,
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
    use_ytdlp_fallback: bool = True,
) -> list[dict[str, Any]]:
    """Fetch playlist items for sorting.

    Prioritizes YouTube Music API to retrieve artist, album, track_number, and release year (0 quota).
    Falls back to YouTube Data API v3 if necessary.
    Uses yt-dlp fallback to acquire release_date when missing or for same-year tracks.
    """
    items: list[dict[str, Any]] = []
    try:
        ytm_items = fetch_ytmusic_playlist_tracks(
            playlist_id=playlist_id,
            context=context,
            fetch_album_details=fetch_album_details,
        )
        if ytm_items:
            logger.info("Retrieved %d tracks for playlist %s via YouTube Music client", len(ytm_items), playlist_id)
            items = ytm_items
    except Exception as exc:
        logger.debug("ytmusic_service.fetch_ytmusic_playlist_tracks fallback to Data API: %s", exc)

    # Fallback to Google YouTube Data API v3 if ytm_items empty
    if not items:
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
            norm_channel = normalize_artist_name(channel_name) or channel_name
            result.append(
                {
                    "playlist_item_id": item["id"],
                    "video_id": video_id,
                    "title": snippet["title"],
                    "artist": norm_channel,
                    "channel_title": norm_channel,
                    "album": "",
                    "album_id": None,
                    "track_number": None,
                    "year": None,
                    "release_date": None,
                    "added_at": snippet["publishedAt"],
                    "published_at": detail.get("published_at", ""),
                    "duration_seconds": detail.get("duration_seconds", 0),
                    "thumbnail_url": snippet.get("thumbnails", {}).get("default", {}).get("url", ""),
                    "position": snippet["position"],
                }
            )
        items = result

    if use_ytdlp_fallback and items:
        try:
            items = enrich_tracks_with_ytdlp_fallback(items, check_same_year=True)
        except Exception as exc:
            logger.warning("Failed to enrich tracks with yt-dlp fallback: %s", exc)

    # Final pass fallback: populate year and release_date from published_at if still missing
    for item in items:
        if item.get("artist"):
            item["artist"] = normalize_artist_name(item["artist"]) or item["artist"]
        if item.get("channel_title"):
            item["channel_title"] = normalize_artist_name(item["channel_title"]) or item["channel_title"]
        if not item.get("year"):
            if item.get("release_date"):
                m = re.search(r"\b(19\d\d|20\d\d)\b", str(item["release_date"]))
                if m:
                    item["year"] = int(m.group(1))
            elif item.get("published_at"):
                m = re.search(r"\b(19\d\d|20\d\d)\b", str(item["published_at"]))
                if m:
                    item["year"] = int(m.group(1))
        if not item.get("release_date") and item.get("published_at"):
            pub = str(item["published_at"]).strip()
            if len(pub) >= 10 and pub[4] == "-" and pub[7] == "-":
                item["release_date"] = pub[:10]
            elif len(pub) >= 8 and pub[:8].isdigit():
                item["release_date"] = f"{pub[:4]}-{pub[4:6]}-{pub[6:8]}"

    return items


def sort_items(items: list[dict[str, Any]], sort_keys: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sort playlist tracks according to multi-key rules.

    Supports fields:
    - artist: 藝人名稱 (artist or channel_title)
    - album: 專輯名稱（同專輯內自動尊重曲目 track_number 編號）
    - track_number / track: 歌曲曲目 / 第幾首 (numeric, missing sorted to end)
    - year / release_year / release_date: 發行年份 / 日期（以 yt-dlp 精確比對同年曲目）
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
                    val = normalize_artist_name(str(val))
                    return unicodedata.normalize("NFKC", val).casefold()

                if sort_field == "album":
                    raw_album = str(item.get("album") or "").strip()
                    is_real = bool(raw_album and raw_album != "單曲")
                    album_str = unicodedata.normalize("NFKC", raw_album).casefold() if is_real else ""

                    # Release year/date resolution as chronological anchor for albums & singles.
                    # Singles without an album use release date/year fallback to sort in the
                    # artist's chronological timeline rather than being forced to the very front.
                    raw_date = str(item.get("release_date") or "").replace("-", "").strip()
                    if raw_date and len(raw_date) >= 8 and raw_date[:8].isdigit():
                        year_key = raw_date[:8]
                    else:
                        yr = item.get("year") or item.get("published_at")
                        if yr:
                            year_match = re.search(r"\b(19\d\d|20\d\d)\b", str(yr))
                            year_key = year_match.group(1) + "0000" if year_match else "99999999"
                        else:
                            year_key = "99999999"  # unknown year → sort last within group

                    track_val = item.get("track_number")
                    # When sorting by album, respect the track order within that album (always track 1, 2, 3...)
                    if track_val is not None and str(track_val).strip() != "":
                        try:
                            track_num = int(track_val)
                            return (year_key, 0 if is_real else 1, album_str, 0, -track_num if rev else track_num)
                        except (ValueError, TypeError):
                            pass
                    # Missing track number goes after numbered tracks in both asc and desc
                    return (year_key, 0 if is_real else 1, album_str, -1 if rev else 1, 0)

                if sort_field in ("track_number", "track"):
                    val = item.get("track_number")
                    if val is None or val == "" or str(val).strip() == "":
                        return (1, 0) if not rev else (0, -1)
                    try:
                        num = int(val)
                        return (0, num) if not rev else (1, num)
                    except (ValueError, TypeError):
                        return (1, 0) if not rev else (0, -1)

                if sort_field in ("year", "release_year", "release_date"):
                    # Priority 1: Exact release_date (e.g. from yt-dlp "2023-05-12" or "20230512")
                    raw_date = str(item.get("release_date") or "").replace("-", "").strip()
                    if raw_date and len(raw_date) >= 8 and raw_date[:8].isdigit():
                        date_key = raw_date[:8]
                        return (0, date_key) if not rev else (1, date_key)

                    # Priority 2: Year string or published_at
                    val = item.get("year") or item.get("published_at") or ""
                    if val:
                        match = re.search(r"\b(19\d\d|20\d\d)\b", str(val))
                        if match:
                            year_key = match.group(1) + "0000"
                            return (0, year_key) if not rev else (1, year_key)

                    return (1, "") if not rev else (0, "")

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
                res = apply_ytmusic_sort_in_place(
                    playlist_id=playlist_id,
                    sorted_items=sorted_items,
                    original_items=orig,
                    context=context,
                )
                if res.get("failed", 0) > 0 and res.get("succeeded", 0) == 0 and res.get("moved", 0) > 0:
                    raise RuntimeError(f"YTMusic in-place sort failed: {res.get('failed_items')}")
                return res
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
