import logging
from typing import Any, Dict, List, Optional, Tuple

import googleapiclient.discovery

from backend.app.core.youtube_context import YouTubeRequestContext
from backend.app.services.youtube_errors import YouTubeQuotaUnavailable

logger = logging.getLogger(__name__)
MAX_PLAYLIST_ITEMS = 5_000
MAX_VIDEO_IDS = 5_000


def get_youtube_service(context: YouTubeRequestContext):
    return googleapiclient.discovery.build("youtube", "v3", credentials=context.credentials)


def _execute_with_quota(request, method: str, context: YouTubeRequestContext):
    """Reserve the documented cost before executing the request."""

    logger.debug("Executing YouTube method=%s slot=%s", method, context.slot)
    return context.quota_limiter.execute(request, method)


def _deduplicate_videos(videos: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Keep the first occurrence of each video ID while preserving source order."""
    unique_videos: List[Dict[str, Any]] = []
    seen_video_ids = set()

    for video in videos:
        video_id = str(video.get("video_id") or "").strip()
        if not video_id or video_id in seen_video_ids:
            continue
        seen_video_ids.add(video_id)
        unique_videos.append(
            {
                **video,
                "sequence": len(unique_videos) + 1,
                "video_id": video_id,
            }
        )

    return unique_videos


def _deduplicate_video_ids(video_ids: List[str]) -> List[str]:
    """Return non-empty video IDs in first-appearance order without duplicates."""
    return list(dict.fromkeys(str(video_id).strip() for video_id in video_ids if str(video_id or "").strip()))


def _snippet_thumbnail(snippet: Dict[str, Any], video_id: str) -> str:
    thumbnails = snippet.get("thumbnails") or {}
    url = (
        thumbnails.get("maxres", {}).get("url")
        or thumbnails.get("standard", {}).get("url")
        or thumbnails.get("high", {}).get("url")
        or thumbnails.get("medium", {}).get("url")
        or thumbnails.get("default", {}).get("url")
        or (f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg" if video_id else "")
    )
    if url and url.startswith("http://"):
        return "https://" + url[7:]
    return url


def fetch_playlist_items(
    context: YouTubeRequestContext,
    playlist_id: str,
    hl: str = "zh-TW",
) -> List[Dict[str, Any]]:
    """Fetch all items from a YouTube playlist (handles pagination)."""
    service = get_youtube_service(context)
    items = []
    next_page_token = None
    while True:
        request = service.playlistItems().list(
            part="snippet,contentDetails",
            playlistId=playlist_id,
            maxResults=50,
            pageToken=next_page_token,
            hl=hl,
        )
        response = _execute_with_quota(request, "playlistItems.list", context)
        items.extend(response.get("items", []))
        if len(items) > MAX_PLAYLIST_ITEMS:
            raise ValueError("播放清單項目數超過系統上限")
        next_page_token = response.get("nextPageToken")
        if not next_page_token:
            break
    return items


def validate_playlist(context: YouTubeRequestContext, playlist_id: str) -> Dict[str, Any]:
    """Read one playlist before a workflow starts so invalid IDs fail closed."""

    service = get_youtube_service(context)
    request = service.playlists().list(part="id,snippet,status", id=playlist_id, maxResults=1)
    response = _execute_with_quota(request, "playlists.list", context)
    items = response.get("items") or []
    if not items:
        raise ValueError("找不到指定的 YouTube To-Post 播放清單，或目前帳號沒有權限。")
    return dict(items[0])


def fetch_video_details(
    context: YouTubeRequestContext,
    video_ids: List[str],
    hl: str = "zh-TW",
) -> List[Dict[str, Any]]:
    """Fetch detailed info for unique video IDs in batches of 50."""
    video_ids = _deduplicate_video_ids(video_ids)
    if not video_ids:
        return []
    if len(video_ids) > MAX_VIDEO_IDS:
        raise ValueError("影片數量超過系統上限")
    service = get_youtube_service(context)
    detailed_videos = []
    for i in range(0, len(video_ids), 50):
        chunk = video_ids[i : i + 50]
        request = service.videos().list(
            part="snippet,contentDetails,status",
            id=",".join(chunk),
            hl=hl,
        )
        response = _execute_with_quota(request, "videos.list", context)
        detailed_videos.extend(response.get("items", []))
    return detailed_videos


def _api_playlist_preview(context: YouTubeRequestContext, playlist_id: str) -> List[Dict[str, Any]]:
    raw_items = fetch_playlist_items(context, playlist_id)
    if not raw_items:
        return []
    video_ids = [
        item.get("contentDetails", {}).get("videoId")
        for item in raw_items
        if item.get("contentDetails", {}).get("videoId")
    ]
    details_map = {item["id"]: item for item in fetch_video_details(context, video_ids) if item.get("id")}
    parsed_videos = []
    for index, item in enumerate(raw_items, start=1):
        video_id = item.get("contentDetails", {}).get("videoId")
        detail = details_map.get(video_id, {})
        snippet = detail.get("snippet", item.get("snippet", {}))
        title = snippet.get("localized", {}).get("title") or snippet.get("title", "")
        parsed_videos.append(
            {
                "sequence": index,
                "video_id": video_id,
                "playlist_item_id": item.get("id"),
                "title": title,
                "description": snippet.get("description", ""),
                "thumbnail_url": _snippet_thumbnail(snippet, video_id),
                "published_at": snippet.get("publishedAt", ""),
                "category_id": snippet.get("categoryId", ""),
            }
        )
    return _deduplicate_videos(parsed_videos)


def fetch_playlist_preview(
    context: YouTubeRequestContext,
    playlist_id: str,
) -> Tuple[List[Dict[str, Any]], str, Optional[str]]:
    """Use authenticated playlistItems and videos API data for preview/order."""
    return _api_playlist_preview(context, playlist_id), "youtube-api", None


def update_single_video_metadata(
    context: YouTubeRequestContext,
    video_id: str,
    new_title: str,
    new_description: str,
    current_snippet: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Update title/description while preserving existing snippet properties."""

    def normalize_description(value: Any) -> str:
        return str(value or "").replace("\r\n", "\n").replace("\r", "\n")

    service = get_youtube_service(context)
    if current_snippet is None:
        request = service.videos().list(part="snippet", id=video_id)
        response = _execute_with_quota(request, "videos.list", context)
        items = response.get("items", [])
        if not items:
            raise ValueError(f"YouTube 找不到影片 ID：{video_id}。")
        current_snippet = items[0]["snippet"]
    if str(current_snippet.get("title") or "") == str(new_title or "") and normalize_description(
        current_snippet.get("description")
    ) == normalize_description(new_description):
        return {"id": video_id, "snippet": dict(current_snippet), "unchanged": True}
    category_id = current_snippet.get("categoryId")
    if not category_id:
        raise ValueError(f"無法取得影片 {video_id} 的類別 ID。")
    updated_snippet = {
        "title": new_title,
        "description": new_description,
        "categoryId": category_id,
    }
    if "tags" in current_snippet:
        updated_snippet["tags"] = current_snippet["tags"]
    if current_snippet.get("defaultLanguage"):
        updated_snippet["defaultLanguage"] = current_snippet["defaultLanguage"]
    if current_snippet.get("defaultAudioLanguage"):
        updated_snippet["defaultAudioLanguage"] = current_snippet["defaultAudioLanguage"]
    update_request = service.videos().update(
        part="snippet",
        body={"id": video_id, "snippet": updated_snippet},
    )
    return _execute_with_quota(update_request, "videos.update", context)


def get_video_status(
    context: YouTubeRequestContext,
    video_id: str,
    current_video: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Return the status object needed by the idempotent publish handler."""

    if current_video is not None:
        return dict(current_video.get("status", {}))
    service = get_youtube_service(context)
    request = service.videos().list(part="status", id=video_id)
    response = _execute_with_quota(request, "videos.list", context)
    items = response.get("items", [])
    if not items:
        raise ValueError(f"YouTube 找不到影片：{video_id}。")
    return dict(items[0].get("status", {}))


def set_video_public(
    context: YouTubeRequestContext,
    video_id: str,
    current_video: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Set a video public and reconcile an ambiguous provider response.

    YouTube may commit a non-idempotent update and then fail while returning
    the response (for example, when the connection is interrupted).  A
    second status read lets the workflow distinguish that case from a real
    publish failure, so the UI does not report a successful publish as failed.
    """

    status = get_video_status(context, video_id, current_video)
    if status.get("privacyStatus") == "public":
        return {"id": video_id, "status": status, "already_public": True}
    service = get_youtube_service(context)
    request = service.videos().update(
        part="status",
        body={"id": video_id, "status": {"privacyStatus": "public"}},
    )
    try:
        return _execute_with_quota(request, "videos.update", context)
    except YouTubeQuotaUnavailable:
        raise
    except Exception as update_error:
        # The write may have reached YouTube even when its response did not.
        # Do not hide the original error unless the fresh read proves that the
        # requested state was committed.
        try:
            confirmed_status = get_video_status(context, video_id)
        except Exception:
            raise update_error from None
        if confirmed_status.get("privacyStatus") == "public":
            logger.warning("YouTube publish response was ambiguous; video %s is public", video_id)
            return {"id": video_id, "status": confirmed_status, "reconciled": True}
        raise update_error from None


def remove_playlist_item(context: YouTubeRequestContext, playlist_item_id: Optional[str]) -> Dict[str, Any]:
    """Remove a To-Post item; a 404 is the idempotent 'already removed' case."""

    if not playlist_item_id:
        return {"already_removed": True}
    service = get_youtube_service(context)
    try:
        request = service.playlistItems().delete(id=playlist_item_id)
        _execute_with_quota(request, "playlistItems.delete", context)
        return {"deleted_playlist_item_id": playlist_item_id}
    except Exception as exc:
        response = getattr(exc, "resp", None)
        if getattr(response, "status", None) == 404:
            return {"deleted_playlist_item_id": playlist_item_id, "already_removed": True}
        raise


def publish_and_remove_playlist_item(
    context: YouTubeRequestContext,
    video_id: str,
    playlist_item_id: str,
    current_video: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Set a video public and remove its playlist item without deleting it."""
    if current_video is None:
        service = get_youtube_service(context)
        request = service.videos().list(part="status", id=video_id)
        response = _execute_with_quota(request, "videos.list", context)
        items = response.get("items", [])
        if not items:
            raise ValueError(f"YouTube 找不到影片：{video_id}。")
        current_video = items[0]
    update_result = set_video_public(context, video_id, current_video)
    try:
        playlist_cleanup = remove_playlist_item(context, playlist_item_id)
    except YouTubeQuotaUnavailable:
        raise
    except Exception as exc:
        logger.warning("Failed to delete playlist item: %s", type(exc).__name__)
        playlist_cleanup = {"error": "YouTube 播放清單清理失敗"}
    return {
        "video": update_result,
        "playlist_cleanup": playlist_cleanup,
    }


__all__ = [
    "fetch_playlist_items",
    "fetch_playlist_preview",
    "fetch_video_details",
    "get_video_status",
    "remove_playlist_item",
    "set_video_public",
    "update_single_video_metadata",
    "validate_playlist",
]
