from __future__ import annotations

import concurrent.futures
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
from ytmusicapi.auth.types import AuthType
from ytmusicapi.constants import SUPPORTED_LANGUAGES, SUPPORTED_LOCATIONS

from backend.app.core.credential_store import CredentialStore, credential_store, get_credential_store
from backend.app.core.youtube_context import YouTubeRequestContext
from backend.app.services.playlist_write_outcome import PlaylistWriteNotStarted
from backend.app.services.ytmusic_clients import YtmusicClientFactory, get_ytmusic_client_factory
from backend.app.services.ytmusic_metadata import (
    get_first_artist as get_first_artist,
)
from backend.app.services.ytmusic_metadata import (
    is_generic_artist as is_generic_artist,
)
from backend.app.services.ytmusic_metadata import (
    normalize_artist_name as normalize_artist_name,
)
from backend.app.services.ytmusic_metadata import (
    split_artists as split_artists,
)
from backend.app.services.ytmusic_tokens import (
    YtmusicTokenInputError as YtmusicTokenInputError,
)
from backend.app.services.ytmusic_tokens import (
    parse_custom_token_input as parse_custom_token_input,
)
from backend.app.services.ytmusic_writer import YtmusicPlaylistWriter

logger = logging.getLogger(__name__)

DEFAULT_YTMUSIC_LANGUAGE = "zh_TW"
DEFAULT_YTMUSIC_LOCATION = "TW"


LOCALE_PRESETS: dict[str, dict[str, str]] = {
    "TW": {"language": "zh_TW", "location": "TW", "label": "台灣（繁體中文）"},
    "US": {"language": "en", "location": "US", "label": "英文 (US)"},
    "KR": {"language": "ko", "location": "KR", "label": "韓文 (KR)"},
    "JP": {"language": "ja", "location": "JP", "label": "日文 (JP)"},
}


def resolve_ytmusic_locale(
    owner_sub: str | None = None,
    language: str | None = None,
    location: str | None = None,
) -> tuple[str, str]:
    """Resolve language and location for YTMusic API calls.

    Priority:
    1. Explicit language/location arguments
    2. Stored preferences in account_state_store ('ytmusic_preferences')
    3. Default fallback: language='zh_TW', location='TW'
    """
    resolved_lang = language
    resolved_loc = location

    if not resolved_lang or not resolved_loc:
        if owner_sub:
            try:
                from backend.app.core.account_state_store import get_account_state_store

                work_state = get_account_state_store().get_work_state(owner_sub)
                prefs = work_state.get("ytmusic_preferences") if isinstance(work_state, dict) else {}
                if isinstance(prefs, dict):
                    region_preset = prefs.get("regionPreset") or prefs.get("region_preset")
                    if region_preset in LOCALE_PRESETS:
                        preset_info = LOCALE_PRESETS[region_preset]
                        resolved_lang = resolved_lang or preset_info["language"]
                        resolved_loc = resolved_loc or preset_info["location"]
                    elif region_preset == "custom":
                        resolved_lang = resolved_lang or prefs.get("customLanguage") or prefs.get("language")
                        resolved_loc = resolved_loc or prefs.get("customLocation") or prefs.get("location")
                    else:
                        resolved_lang = resolved_lang or prefs.get("language")
                        resolved_loc = resolved_loc or prefs.get("location")
            except Exception as exc:
                logger.debug("Failed to read account locale preferences for sub %s: %s", owner_sub, exc)

    resolved_lang = (resolved_lang or DEFAULT_YTMUSIC_LANGUAGE).strip().replace("-", "_")
    resolved_loc = (resolved_loc or DEFAULT_YTMUSIC_LOCATION).strip().upper()

    if resolved_lang not in SUPPORTED_LANGUAGES:
        logger.warning(
            "Unsupported YTMusic language '%s', falling back to '%s'",
            resolved_lang,
            DEFAULT_YTMUSIC_LANGUAGE,
        )
        resolved_lang = DEFAULT_YTMUSIC_LANGUAGE

    if resolved_loc not in SUPPORTED_LOCATIONS:
        logger.warning(
            "Unsupported YTMusic location '%s', falling back to '%s'",
            resolved_loc,
            DEFAULT_YTMUSIC_LOCATION,
        )
        resolved_loc = DEFAULT_YTMUSIC_LOCATION

    return resolved_lang, resolved_loc


@lru_cache(maxsize=500)
def get_ytdlp_video_date(video_id: str, language: str = "zh-TW") -> dict[str, Any]:
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
        "http_headers": {"Accept-Language": f"{language},en;q=0.8"},
        "extractor_args": {"youtube": {"lang": [language]}},
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
    language: str = "zh-TW",
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
    # High priority: Tracks that have no year or release_date (e.g. videos without album info)
    # Low priority: Same year tracks needing precise day-level release_date
    high_priority_candidates = []
    low_priority_candidates = []
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

        if needs_date:
            high_priority_candidates.append(trk)
        elif is_same_year and not has_release_date:
            low_priority_candidates.append(trk)

    candidates = high_priority_candidates + low_priority_candidates

    if not candidates:
        return tracks

    logger.info(
        "Enriching %d tracks (high_priority=%d, low_priority=%d) with yt-dlp release date fallback...",
        len(candidates),
        len(high_priority_candidates),
        len(low_priority_candidates),
    )

    def _fetch_for_track(track_item: dict[str, Any]) -> None:
        vid = track_item.get("video_id")
        if not vid:
            return
        try:
            meta = get_ytdlp_video_date(vid, language=language)
        except TypeError:
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
        if meta.get("album") and (not track_item.get("album") or track_item.get("album") in ("單曲", "影片")):
            track_item["album"] = meta["album"]
            track_item["is_video"] = False
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
    language: str | None = None,
    location: str | None = None,
    token_store: CredentialStore | None = None,
    client_factory: YtmusicClientFactory | None = None,
) -> YTMusic:
    """Instantiate a configured YTMusic client with localized language and location.

    Priority:
    1. Explicit custom_token parameter
    2. Stored custom_token in the supplied repository, falling back to request context for standalone callers
    3. Unauthenticated YTMusic() fallback (0 quota read access for public/unlisted playlists)
    """
    sub = owner_sub or (context.owner_sub if context else None)
    lang, loc = resolve_ytmusic_locale(owner_sub=sub, language=language, location=location)

    # 1. Custom token check
    token_to_use = custom_token
    if not token_to_use and sub:
        repository = token_store if token_store is not None else get_credential_store(credential_store)
        token_to_use = repository.get_ytmusic_custom_token(sub)

    if token_to_use:
        try:
            parsed_auth = parse_custom_token_input(token_to_use, language=lang, location=loc)
            return (client_factory or get_ytmusic_client_factory(YTMusic))(
                auth=parsed_auth, language=lang, location=loc
            )
        except Exception as e:
            logger.error("Failed to initialize YTMusic with custom token: %s", type(e).__name__)
            if not context or not context.credentials:
                raise

    # 2. Unauthenticated YTMusic client
    # Defaults to localized language (zh_TW) and location (TW)
    return (client_factory or get_ytmusic_client_factory(YTMusic))(language=lang, location=loc)


def validate_ytmusic_custom_token(
    token_str: str,
    language: str | None = None,
    location: str | None = None,
) -> dict[str, Any]:
    """Validate a custom YouTube Music token against the YouTube Music API.

    1. Parses token (cURL, Node.js fetch, Request Headers, or raw Cookie).
    2. Ensures client has BROWSER auth type.
    3. Queries YouTube Music API to verify authentication is active and not expired.
    """
    clean_token = (token_str or "").strip()
    if not clean_token:
        raise YtmusicTokenInputError("Token 內容不可為空。")

    resolved_lang = language or DEFAULT_YTMUSIC_LANGUAGE
    resolved_loc = location or DEFAULT_YTMUSIC_LOCATION

    parsed_auth = parse_custom_token_input(clean_token, language=resolved_lang, location=resolved_loc)

    client = get_ytmusic_client_factory(YTMusic)(auth=parsed_auth, language=resolved_lang, location=resolved_loc)
    auth_type = getattr(client, "auth_type", None)
    if auth_type != AuthType.BROWSER:
        raise YtmusicTokenInputError("Token 缺少必要的瀏覽器 Cookie (SID, HSID, SSID, SAPISID) 認證資訊。")

    account_info: dict[str, Any] = {}
    try:
        account_info = client.get_account_info() or {}
    except Exception as exc:
        logger.debug("client.get_account_info() failed: %s; falling back to get_library_playlists", type(exc).__name__)
        try:
            client.get_library_playlists(limit=1)
        except Exception as lib_exc:
            logger.warning("Token verification failed with YouTube Music API: %s", type(lib_exc).__name__)
            raise ValueError("Token 驗證失敗或 Cookie 已過期。") from lib_exc

    account_name = account_info.get("accountName")
    channel_handle = account_info.get("channelHandle")
    account_photo_url = account_info.get("accountPhotoUrl")

    if account_name:
        msg = f"Token 有效！已成功認證 YouTube Music 帳號：{account_name}"
        if channel_handle:
            msg += f" ({channel_handle})"
    else:
        msg = "Token 有效！已成功通過 YouTube Music 認證並連線至音樂庫。"

    return {
        "valid": True,
        "account_name": account_name,
        "channel_handle": channel_handle,
        "account_photo_url": account_photo_url,
        "message": msg,
    }


def fetch_ytmusic_playlists(
    context: YouTubeRequestContext | None = None,
    owner_sub: str | None = None,
    language: str | None = None,
    location: str | None = None,
    token_store: CredentialStore | None = None,
    client_factory: YtmusicClientFactory | None = None,
) -> list[dict[str, Any]]:
    """Fetch user's YouTube Music playlists using YTMusic API (0 API credit)."""
    client = get_ytmusic_client(
        context=context,
        owner_sub=owner_sub,
        language=language,
        location=location,
        token_store=token_store,
        client_factory=client_factory,
    )
    try:
        raw_playlists = client.get_library_playlists(limit=None)
    except Exception as exc:
        logger.warning("client.get_library_playlists failed: %s", type(exc).__name__)
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
    language: str | None = None,
    location: str | None = None,
    token_store: CredentialStore | None = None,
    client_factory: YtmusicClientFactory | None = None,
) -> list[dict[str, Any]]:
    """Fetch full playlist track items including artists, album, track number, and duration.

    Uses an in-memory album cache so that multiple tracks from the same album
    only trigger one get_album query. Consumes 0 YouTube Data API quota.
    """
    client = get_ytmusic_client(
        context=context,
        owner_sub=owner_sub,
        language=language,
        location=location,
        token_store=token_store,
        client_factory=client_factory,
    )
    try:
        playlist_data = client.get_playlist(playlist_id, limit=None)
    except Exception as e:
        logger.error("Failed to fetch playlist %s via ytmusicapi: %s", playlist_id, type(e).__name__)
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
                        logger.debug("Could not fetch album details for %s: %s", aid, type(album_err).__name__)
                        album_cache[aid] = {}

    result: list[dict[str, Any]] = []
    for idx, t in enumerate(raw_tracks):
        video_id = t.get("videoId") or ""
        raw_set_video_id = t.get("setVideoId")
        set_video_id = raw_set_video_id or f"{video_id}_{idx}"

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

        # Items without an album (pure YouTube videos, music videos, covers, etc.)
        # are classified as "影片" (Video) instead of "單曲". They do NOT have an
        # album track number (no fake #1), and will fallback to yt-dlp / upload date.
        is_video = False
        if not album_name.strip() or t.get("resultType") == "video":
            album_name = "影片"
            is_video = True

        # Track number and year resolution from cached album data
        track_number: int | None = None
        release_year: int | None = None
        album_artist: str | None = None

        if album_id and album_id in album_cache:
            alb = album_cache[album_id]
            alb_year = alb.get("year")
            if alb_year:
                try:
                    release_year = int(alb_year)
                except (ValueError, TypeError):
                    pass

            alb_artists = alb.get("artists")
            if isinstance(alb_artists, list) and alb_artists:
                alb_artist_names = [
                    a.get("name", "").strip() for a in alb_artists if isinstance(a, dict) and a.get("name")
                ]
                album_artist = ", ".join(alb_artist_names)
            elif isinstance(alb.get("artist"), str):
                album_artist = alb.get("artist")
            if album_artist:
                album_artist = normalize_artist_name(album_artist)

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

        # Singles (album="單曲") without a resolved track number default to 1,
        # but videos ("影片") should remain track_number = None.
        if track_number is None and album_name == "單曲":
            track_number = 1
        elif is_video:
            track_number = None

        thumbnails = t.get("thumbnails") or []
        thumb_url = thumbnails[-1].get("url", "") if thumbnails else ""

        result.append(
            {
                "playlist_item_id": set_video_id,
                "has_set_video_id": bool(raw_set_video_id),
                "video_id": video_id,
                "title": t.get("title") or "",
                "artist": artist_name,
                "channel_title": artist_name,
                "album_artist": album_artist,
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
                "is_video": is_video,
            }
        )

    return result


def _get_write_client(**kwargs):
    try:
        return get_ytmusic_client(**kwargs)
    except Exception as exc:
        raise PlaylistWriteNotStarted("無法建立 YouTube Music 寫入連線。") from exc


def apply_ytmusic_sort_in_place(
    playlist_id: str,
    sorted_items: list[dict[str, Any]],
    original_items: list[dict[str, Any]],
    context: YouTubeRequestContext | None = None,
    owner_sub: str | None = None,
    language: str | None = None,
    location: str | None = None,
    token_store: CredentialStore | None = None,
    client_factory: YtmusicClientFactory | None = None,
) -> dict[str, Any]:
    client = _get_write_client(
        context=context,
        owner_sub=owner_sub,
        language=language,
        location=location,
        token_store=token_store,
        client_factory=client_factory,
    )
    return YtmusicPlaylistWriter(client).sort_in_place(playlist_id, sorted_items, original_items)


def create_sorted_ytmusic_playlist(
    title: str,
    description: str,
    sorted_items: list[dict[str, Any]],
    privacy_status: str = "PRIVATE",
    context: YouTubeRequestContext | None = None,
    owner_sub: str | None = None,
    language: str | None = None,
    location: str | None = None,
    token_store: CredentialStore | None = None,
    client_factory: YtmusicClientFactory | None = None,
) -> dict[str, Any]:
    client = _get_write_client(
        context=context,
        owner_sub=owner_sub,
        language=language,
        location=location,
        token_store=token_store,
        client_factory=client_factory,
    )
    return YtmusicPlaylistWriter(client).create_sorted(title, description, sorted_items, privacy_status)
