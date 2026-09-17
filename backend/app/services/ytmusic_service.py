from __future__ import annotations

import concurrent.futures
import json
import logging
import re
from collections import Counter
from functools import lru_cache
from typing import Any

try:
    import yt_dlp
except ImportError:
    yt_dlp = None
from ytmusicapi import YTMusic
from ytmusicapi.auth.browser import initialize_headers, setup_browser
from ytmusicapi.exceptions import YTMusicError

from backend.app.core.credential_store import credential_store
from backend.app.core.youtube_context import YouTubeRequestContext

logger = logging.getLogger(__name__)


def _extract_headers_from_curl(curl_cmd: str) -> list[str]:
    """Extract -H / --header parameters from a cURL command string."""
    pattern = r"""(?:-H|--header)\s+(?:'([^']*)'|"([^"]*)")"""
    matches = re.findall(pattern, curl_cmd)
    headers = []
    for m in matches:
        hdr = m[0] if m[0] else m[1]
        hdr = hdr.strip()
        if ":" in hdr:
            headers.append(hdr)
    return headers


def parse_custom_token_input(token_raw: str) -> dict[str, Any]:
    """Parse raw custom token input into a valid format accepted by YTMusic().

    Supports:
    1. JSON headers dict (e.g. {"Cookie": "...", "User-Agent": "..."})
    2. cURL command (copied from Chrome/Firefox/Edge network tab via 'Copy as cURL')
    3. Raw request headers copied from DevTools Headers panel
    4. Plain cookie string (e.g. "SID=...; SAPISID=...")
    """
    raw = str(token_raw or "").strip()
    if not raw:
        raise ValueError("Token 內容不可為空。")

    # 1. If already a valid JSON dictionary
    if raw.startswith("{") and raw.endswith("}"):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                norm = {k.lower(): str(v) for k, v in parsed.items()}
                if "cookie" in norm:
                    if "x-goog-authuser" not in norm:
                        norm["x-goog-authuser"] = "0"
                    init_hdrs = initialize_headers()
                    init_hdrs.update(norm)
                    return dict(init_hdrs)
                return parsed
        except Exception as exc:
            logger.debug("JSON parse attempt for custom token failed: %s", type(exc).__name__)

    # 2. If it is a cURL command (e.g. starts with or contains 'curl ')
    extracted_curl_headers = []
    if "curl" in raw.lower() and ("-h" in raw.lower() or "--header" in raw.lower()):
        extracted_curl_headers = _extract_headers_from_curl(raw)

    # 3. Build headers lines
    header_lines: list[str] = []
    if extracted_curl_headers:
        header_lines = extracted_curl_headers
    else:
        # Split raw by newline
        lines = [line.strip() for line in raw.splitlines() if line.strip()]
        for line in lines:
            # Skip pseudo headers like :authority:, :method:, etc.
            if line.startswith(":"):
                continue
            header_lines.append(line)

    # Check if raw input is just a plain cookie string without "Cookie:" prefix
    has_cookie_header = any(h.lower().startswith("cookie:") for h in header_lines)
    if not has_cookie_header:
        # Check if entire input or lines look like name=value cookie pairs
        if (
            "sid=" in raw.lower() or "sapisid=" in raw.lower() or ("=" in raw and ";" in raw)
        ) and not extracted_curl_headers:
            header_lines.insert(0, f"Cookie: {raw}")
            has_cookie_header = True

    if not has_cookie_header:
        raise ValueError("無法在輸入內容中偵測到有效的 Cookie (例如 SID=... 或 Cookie: ...)。請確認複製內容。")

    # Ensure x-goog-authuser is present
    has_auth_user = any("x-goog-authuser" in h.lower() for h in header_lines)
    if not has_auth_user:
        header_lines.append("X-Goog-AuthUser: 0")

    headers_text = "\n".join(header_lines)

    # Attempt setup_browser first
    try:
        parsed_json_str = setup_browser(headers_raw=headers_text)
        return json.loads(parsed_json_str)
    except Exception as exc:
        logger.debug("setup_browser failed (%s), constructing headers dictionary manually", exc)

    # Manual extraction fallback if setup_browser has strict header parsing constraints
    user_headers: dict[str, str] = {}
    for line in header_lines:
        if ": " in line:
            k, v = line.split(": ", 1)
            user_headers[k.strip().lower()] = v.strip()
        elif ":" in line:
            k, v = line.split(":", 1)
            user_headers[k.strip().lower()] = v.strip()

    if "cookie" not in user_headers:
        raise ValueError("無法解析所提供的 YouTube Music Token 或 Headers：未找到 Cookie。")

    if "x-goog-authuser" not in user_headers:
        user_headers["x-goog-authuser"] = "0"

    final_headers = initialize_headers()
    final_headers.update(user_headers)
    return dict(final_headers)


def normalize_artist_name(name: str | None) -> str:
    """Normalize artist name by removing YouTube auto-generated Topic channel suffixes.

    YouTube generates "- Topic" (or localized variants like "- 主題", "(Topic)")
    channels for official audio tracks. Stripping this suffix ensures that
    tracks uploaded to the main artist channel and tracks released via Topic
    channels group under the same artist for sorting and display.

    Examples:
        'QWER - Topic' -> 'QWER'
        'QWER - 主題' -> 'QWER'
        'QWER (Topic)' -> 'QWER'
        'QWER（主題）' -> 'QWER'
    """
    if not name:
        return ""
    raw = str(name).strip()
    if not raw:
        return ""

    parts = [p.strip() for p in raw.split(",")]
    normalized_parts: list[str] = []
    for p in parts:
        cleaned = re.sub(r"\s*[-–—－]\s*(?:topic|主題|主题)\s*$", "", p, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*[\(（](?:topic|主題|主题)[\)）]\s*$", "", cleaned, flags=re.IGNORECASE)
        cleaned = cleaned.strip()
        normalized_parts.append(cleaned if cleaned else p)

    result = ", ".join(normalized_parts)
    return result if result.strip() else raw


@lru_cache(maxsize=500)
def get_ytdlp_video_date(video_id: str) -> dict[str, Any]:
    """Fetch exact release_date and year for a YouTube video using yt-dlp.

    Results are cached (LRU, max 500 entries) to avoid repeated network calls.
    Returns dict with keys: release_date (e.g. '2023-05-12'), year (int), upload_date (str).
    """
    if not video_id or yt_dlp is None:
        return {}

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": False,
        "ignoreerrors": True,
        "socket_timeout": 8,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_id, download=False)
            if not info or not isinstance(info, dict):
                return {}

            raw_date = info.get("release_date") or info.get("upload_date")
            release_date = None
            year = info.get("release_year")
            if raw_date and len(str(raw_date)) == 8 and str(raw_date).isdigit():
                s = str(raw_date)
                release_date = f"{s[0:4]}-{s[4:6]}-{s[6:8]}"
                if not year:
                    year = int(s[0:4])
            elif raw_date:
                release_date = str(raw_date)
                m = re.search(r"\b(19\d\d|20\d\d)\b", str(raw_date))
                if m and not year:
                    year = int(m.group(1))

            raw_artist = info.get("artist") or info.get("uploader") or info.get("channel")
            norm_artist = normalize_artist_name(raw_artist) if raw_artist else None

            return {
                "release_date": release_date,
                "year": year,
                "upload_date": str(info.get("upload_date") or ""),
                "album": info.get("album"),
                "track_number": info.get("track_number"),
                "artist": norm_artist,
            }
    except Exception as exc:
        logger.warning("yt-dlp metadata extraction failed for video %s: %s", video_id, type(exc).__name__)
        return {}


def enrich_tracks_with_ytdlp_fallback(
    tracks: list[dict[str, Any]],
    check_same_year: bool = True,
    max_workers: int = 8,
) -> list[dict[str, Any]]:
    """Enrich tracks with precise release_date / year using yt-dlp fallback.

    Triggers fallback when:
    1. A track has no year / release_date data.
    2. Multiple tracks share the same year ('同年'), requiring exact day comparison.
    """
    if not tracks:
        return tracks

    # Count frequencies of each year among tracks that have year data
    year_counts: Counter[str] = Counter()
    for trk in tracks:
        yr = trk.get("year")
        if yr is not None and str(yr).strip() != "":
            year_counts[str(yr).strip()] += 1

    # Find candidate tracks that need yt-dlp fallback
    candidates = []
    for trk in tracks:
        vid = trk.get("video_id")
        if not vid:
            continue

        has_year = trk.get("year") is not None and str(trk.get("year")).strip() != ""
        has_release_date = trk.get("release_date") is not None and str(trk.get("release_date")).strip() != ""

        # Condition 1: No date / year data
        needs_date = not has_year and not has_release_date
        # Condition 2: Same year as other songs in playlist ("同年")
        is_same_year = check_same_year and has_year and (year_counts[str(trk.get("year")).strip()] > 1)

        if needs_date or (is_same_year and not has_release_date):
            candidates.append(trk)

    if not candidates:
        return tracks

    logger.info("Enriching %d tracks with yt-dlp release date fallback...", len(candidates))

    def _fetch_for_track(track_item: dict[str, Any]) -> None:
        vid = track_item.get("video_id")
        if not vid:
            return
        meta = get_ytdlp_video_date(vid)
        if meta.get("release_date"):
            track_item["release_date"] = meta["release_date"]
        if meta.get("year") and not track_item.get("year"):
            track_item["year"] = meta["year"]
        # Fallback year from release_date if year is not set
        if not track_item.get("year") and track_item.get("release_date"):
            m = re.search(r"\b(19\d\d|20\d\d)\b", str(track_item["release_date"]))
            if m:
                track_item["year"] = int(m.group(1))
        # Fallback from upload_date
        if meta.get("upload_date"):
            ud = str(meta["upload_date"]).strip()
            if not track_item.get("published_at"):
                track_item["published_at"] = ud
            if not track_item.get("release_date") and len(ud) == 8 and ud.isdigit():
                track_item["release_date"] = f"{ud[:4]}-{ud[4:6]}-{ud[6:8]}"
            if not track_item.get("year"):
                m = re.search(r"\b(19\d\d|20\d\d)\b", ud)
                if m:
                    track_item["year"] = int(m.group(1))
        if meta.get("track_number") and track_item.get("track_number") is None:
            track_item["track_number"] = meta["track_number"]
        if meta.get("album") and (not track_item.get("album") or track_item.get("album") == "單曲"):
            track_item["album"] = meta["album"]
        if meta.get("artist") and (not track_item.get("artist") or track_item.get("artist") == "（無藝人）"):
            track_item["artist"] = meta["artist"]
            if not track_item.get("channel_title"):
                track_item["channel_title"] = meta["artist"]
        if track_item.get("artist"):
            track_item["artist"] = normalize_artist_name(track_item["artist"])
        if track_item.get("channel_title"):
            track_item["channel_title"] = normalize_artist_name(track_item["channel_title"])

    with concurrent.futures.ThreadPoolExecutor(max_workers=min(max_workers, len(candidates))) as executor:
        list(executor.map(_fetch_for_track, candidates))

    return tracks


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
        # Credentials are refreshed by the dependency injection layer (require_ytmusic_context).
        # Re-refreshing here without writing back to the credential store would cause the
        # refreshed token to be silently discarded, so we avoid it.
        if hasattr(creds, "expired") and creds.expired:
            logger.debug("YTMusic OAuth credentials appear expired; upstream refresh may have failed.")

        token = getattr(creds, "token", None)
        if token:
            try:
                return YTMusic(auth={"authorization": f"Bearer {token}"})
            except Exception as e:
                logger.warning("Failed to initialize YTMusic with OAuth Bearer token: %s", type(e).__name__)

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
            raw_artist = ", ".join(a.get("name", "") for a in artists_list if isinstance(a, dict) and a.get("name"))
        else:
            raw_artist = str(artists_list)
        if not raw_artist.strip() and t.get("author"):
            raw_artist = str(t.get("author") or "")
        artist_name = normalize_artist_name(raw_artist) or raw_artist

        # Album resolution
        album_info = t.get("album")
        if isinstance(album_info, dict):
            album_name = album_info.get("name") or ""
            album_id = album_info.get("id")
        else:
            album_name = str(album_info or "")
            album_id = None

        # Items without an album (pure YouTube videos, music videos, singles) are
        # displayed and sorted as "單曲" (Single). This prevents the empty string
        # from sorting before real album names, so a 2025 video does not appear
        # before a 2023 album when album-based sorting is applied.
        if not album_name.strip():
            album_name = "單曲"
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

        # Fallback year from track's own year field if not found in album
        if release_year is None and t.get("year"):
            try:
                release_year = int(str(t["year"]).strip())
            except (ValueError, TypeError):
                pass

        if track_number is None and t.get("trackNumber") is not None:
            try:
                track_number = int(t["trackNumber"])
            except (ValueError, TypeError):
                track_number = None

        # Singles (album="單曲") without a resolved track number default to 1
        if track_number is None and album_name == "單曲":
            track_number = 1

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
                "release_date": None,
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
