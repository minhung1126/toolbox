from __future__ import annotations

import json
import logging
import re
from typing import Any

from ytmusicapi import YTMusic
from ytmusicapi.auth.browser import setup_browser
from ytmusicapi.exceptions import YTMusicError

from backend.app.core.credential_store import credential_store
from backend.app.core.youtube_context import YouTubeRequestContext

logger = logging.getLogger(__name__)


def parse_custom_token_input(token_raw: str) -> dict[str, Any] | str:
    """Parse raw custom token input into a valid format accepted by YTMusic().

    Supports:
    1. JSON headers dict (e.g. {"Cookie": "...", "User-Agent": "..."})
    2. Raw request headers copied from Chrome/Firefox/Edge network tab
    3. Plain cookie string (e.g. "SID=...; SAPISID=...")
    """
    raw = str(token_raw or "").strip()
    if not raw:
        raise ValueError("Token 內容不可為空。")

    # If already a valid JSON dictionary
    if raw.startswith("{") and raw.endswith("}"):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass

    # If raw request headers or plain cookie string
    try:
        # Check if it looks like a pure cookie string without header prefix
        if "Cookie:" not in raw and "cookie:" not in raw and ("=" in raw and ";" in raw):
            headers_text = f"Cookie: {raw}\nX-Goog-AuthUser: 0"
        else:
            headers_text = raw
            if "x-goog-authuser" not in headers_text.lower():
                headers_text += "\nX-Goog-AuthUser: 0"

        parsed_json_str = setup_browser(headers_raw=headers_text)
        return json.loads(parsed_json_str)
    except Exception as exc:
        logger.warning("Failed to parse custom browser headers: %s", exc)
        raise ValueError(f"無法解析所提供的 YouTube Music Token 或 Headers：{exc}") from exc


def get_ytmusic_client(
    context: YouTubeRequestContext | None = None,
    owner_sub: str | None = None,
    custom_token: str | None = None,
) -> YTMusic:
    """Instantiate a configured YTMusic client.

    Priority:
    1. Explicit custom_token parameter
    2. Stored custom_token in credential_store (owner_sub or context.owner_sub)
    3. Google OAuth Bearer token from context.credentials
    4. Unauthenticated YTMusic() fallback
    """
    sub = owner_sub or (context.owner_sub if context else None)

    # 1. Custom token check
    token_to_use = custom_token
    if not token_to_use and sub:
        token_to_use = credential_store.get_ytmusic_custom_token(sub)

    if token_to_use:
        try:
            parsed_auth = parse_custom_token_input(token_to_use)
            return YTMusic(auth=parsed_auth)
        except Exception as e:
            logger.error("Failed to initialize YTMusic with custom token: %s", e)
            if not context or not context.credentials:
                raise

    # 2. Google OAuth credentials
    if context and context.credentials:
        creds = context.credentials
        if hasattr(creds, "expired") and creds.expired and getattr(creds, "refresh_token", None):
            try:
                from google.auth.transport.requests import Request

                creds.refresh(Request())
            except Exception as e:
                logger.warning("Failed to refresh Google OAuth token for YouTube Music: %s", e)

        token = getattr(creds, "token", None)
        if token:
            try:
                return YTMusic(auth={"authorization": f"Bearer {token}"})
            except Exception as e:
                logger.warning("Failed to initialize YTMusic with OAuth Bearer token: %s", e)

    # 3. Fallback to unauthenticated
    return YTMusic()


def fetch_ytmusic_playlists(
    context: YouTubeRequestContext | None = None,
    owner_sub: str | None = None,
) -> list[dict[str, Any]]:
    """Fetch user's YouTube Music playlists using YTMusic API (0 API credit)."""
    client = get_ytmusic_client(context=context, owner_sub=owner_sub)
    try:
        raw_playlists = client.get_library_playlists(limit=None)
    except Exception as exc:
        logger.warning("client.get_library_playlists failed: %s", exc)
        return []

    playlists: list[dict[str, Any]] = []
    for item in raw_playlists:
        pid = item.get("playlistId")
        if not pid:
            continue

        thumbnails = item.get("thumbnails") or []
        thumb_url = thumbnails[-1].get("url", "") if thumbnails else ""

        count_raw = item.get("count", 0)
        try:
            count = int(count_raw)
        except (ValueError, TypeError):
            count = 0

        playlists.append(
            {
                "id": pid,
                "title": item.get("title", ""),
                "description": item.get("description", ""),
                "thumbnail_url": thumb_url,
                "item_count": count,
                "privacy_status": "PUBLIC" if item.get("public") else "PRIVATE",
                "owned": item.get("owned", True),
            }
        )
    return playlists


def fetch_ytmusic_playlist_tracks(
    playlist_id: str,
    context: YouTubeRequestContext | None = None,
    owner_sub: str | None = None,
    fetch_album_details: bool = True,
) -> list[dict[str, Any]]:
    """Fetch full playlist track items including artists, album, track number, and duration.

    Uses an in-memory album cache so that multiple tracks from the same album
    only trigger one get_album query. Consumes 0 YouTube Data API quota.
    """
    client = get_ytmusic_client(context=context, owner_sub=owner_sub)
    try:
        playlist_data = client.get_playlist(playlist_id, limit=None)
    except Exception as e:
        logger.error("Failed to fetch playlist %s via ytmusicapi: %s", playlist_id, e)
        raise

    raw_tracks = playlist_data.get("tracks") or []
    if not raw_tracks:
        return []

    album_cache: dict[str, dict[str, Any]] = {}

    # Optional prefetch / resolution of album track numbers
    if fetch_album_details:
        for t in raw_tracks:
            album_info = t.get("album")
            if isinstance(album_info, dict) and album_info.get("id"):
                aid = album_info["id"]
                if aid.startswith("MPRE") and aid not in album_cache:
                    try:
                        album_cache[aid] = client.get_album(aid)
                    except Exception as album_err:
                        logger.debug("Could not fetch album details for %s: %s", aid, album_err)
                        album_cache[aid] = {}

    result: list[dict[str, Any]] = []
    for idx, t in enumerate(raw_tracks):
        video_id = t.get("videoId") or ""
        set_video_id = t.get("setVideoId") or f"{video_id}_{idx}"

        # Artist resolution
        artists_list = t.get("artists") or []
        if isinstance(artists_list, list):
            artist_name = ", ".join(a.get("name", "") for a in artists_list if isinstance(a, dict) and a.get("name"))
        else:
            artist_name = str(artists_list)

        # Album resolution
        album_info = t.get("album")
        if isinstance(album_info, dict):
            album_name = album_info.get("name") or ""
            album_id = album_info.get("id")
        else:
            album_name = str(album_info or "")
            album_id = None

        # Track number and year resolution from cached album data
        track_number: int | None = None
        release_year: int | None = None

        if album_id and album_id in album_cache:
            alb = album_cache[album_id]
            alb_year = alb.get("year")
            if alb_year:
                try:
                    release_year = int(alb_year)
                except (ValueError, TypeError):
                    pass

            alb_tracks = alb.get("tracks") or []
            for track_idx, atrack in enumerate(alb_tracks):
                if atrack.get("videoId") == video_id or (
                    atrack.get("title") and t.get("title") and atrack["title"].strip() == t["title"].strip()
                ):
                    track_number = track_idx + 1
                    break

        if track_number is None and t.get("trackNumber") is not None:
            try:
                track_number = int(t["trackNumber"])
            except (ValueError, TypeError):
                track_number = None

        thumbnails = t.get("thumbnails") or []
        thumb_url = thumbnails[-1].get("url", "") if thumbnails else ""

        result.append(
            {
                "playlist_item_id": set_video_id,
                "video_id": video_id,
                "title": t.get("title") or "",
                "artist": artist_name,
                "channel_title": artist_name,
                "album": album_name,
                "album_id": album_id,
                "track_number": track_number,
                "year": release_year,
                "duration_seconds": t.get("duration_seconds", 0),
                "thumbnail_url": thumb_url,
                "position": idx,
                "added_at": "",
                "published_at": str(release_year) if release_year else "",
            }
        )

    return result


def apply_ytmusic_sort_in_place(
    playlist_id: str,
    sorted_items: list[dict[str, Any]],
    original_items: list[dict[str, Any]],
    context: YouTubeRequestContext | None = None,
    owner_sub: str | None = None,
) -> dict[str, Any]:
    """Sort a YouTube Music playlist in-place using edit_playlist(moveItem=...).

    Simulates moves using greedy position alignment. Only calls moveItem for items
    that are out of order, consuming 0 YouTube Data API quota.
    """
    client = get_ytmusic_client(context=context, owner_sub=owner_sub)

    current_ids = [item["playlist_item_id"] for item in original_items]
    target_ids = [item["playlist_item_id"] for item in sorted_items]

    moved_count = 0
    succeeded = 0
    failed = 0
    failed_items = []

    for i in range(len(target_ids) - 1):
        target_id = target_ids[i]
        if current_ids[i] != target_id:
            successor_id = current_ids[i]
            moved_count += 1
            try:
                client.edit_playlist(
                    playlistId=playlist_id,
                    moveItem=(target_id, successor_id),
                )
                succeeded += 1
                # Update simulation state
                cur_pos = current_ids.index(target_id)
                current_ids.pop(cur_pos)
                current_ids.insert(i, target_id)
            except YTMusicError as yte:
                logger.error("Failed to move item %s before %s: %s", target_id, successor_id, yte)
                failed += 1
                failed_items.append({"playlist_item_id": target_id, "error": str(yte)})
            except Exception as e:
                logger.exception("Unexpected error moving item %s: %s", target_id, e)
                failed += 1
                failed_items.append({"playlist_item_id": target_id, "error": str(e)})

    return {
        "operation": "playlist_sort",
        "mode": "in_place",
        "total": len(sorted_items),
        "moved": moved_count,
        "succeeded": succeeded,
        "failed": failed,
        "failed_items": failed_items,
        "quota_used": 0,
    }


def create_sorted_ytmusic_playlist(
    title: str,
    description: str,
    sorted_items: list[dict[str, Any]],
    privacy_status: str = "PRIVATE",
    context: YouTubeRequestContext | None = None,
    owner_sub: str | None = None,
) -> dict[str, Any]:
    """Create a brand new YouTube Music playlist with tracks already in sorted order.

    Instantly completes in 1 request and preserves the original playlist intact.
    Consumes 0 YouTube Data API quota.
    """
    client = get_ytmusic_client(context=context, owner_sub=owner_sub)
    video_ids = [item["video_id"] for item in sorted_items if item.get("video_id")]

    # Clean title according to ytmusic requirements
    safe_title = re.sub(r"[<>]", "", title).strip() or "已排序播放清單"

    try:
        new_playlist_id = client.create_playlist(
            title=safe_title,
            description=description or "透過 Toolbox YouTube Music 智慧排序建立",
            privacy_status=privacy_status.upper(),
            video_ids=video_ids,
        )
    except Exception as exc:
        logger.exception("Failed to create new sorted playlist: %s", exc)
        raise

    return {
        "operation": "playlist_sort",
        "mode": "new_playlist",
        "new_playlist_id": str(new_playlist_id),
        "new_playlist_url": f"https://music.youtube.com/playlist?list={new_playlist_id}",
        "total": len(sorted_items),
        "moved": len(sorted_items),
        "succeeded": len(sorted_items),
        "failed": 0,
        "failed_items": [],
        "quota_used": 0,
    }
