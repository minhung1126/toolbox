"""Mutation adapter with conservative outcomes; callers reconcile before retrying unknown writes."""

import logging
import re
from typing import Any, Protocol

from ytmusicapi.auth.types import AuthType

from backend.app.services.playlist_write_outcome import PlaylistWriteNotStarted, PlaylistWriteOutcomeUnknown

logger = logging.getLogger(__name__)


class YtmusicWriteProvider(Protocol):
    auth_type: AuthType

    def edit_playlist(self, *, playlistId: str, moveItem: tuple[str, str]) -> Any: ...
    def create_playlist(self, *, title: str, description: str, privacy_status: str, video_ids: list[str]) -> str: ...


class YtmusicPlaylistWriter:
    def __init__(self, client: YtmusicWriteProvider):
        self.client = client

    def sort_in_place(
        self, playlist_id: str, sorted_items: list[dict[str, Any]], original_items: list[dict[str, Any]]
    ) -> dict[str, Any]:
        client = self.client
        auth_type = getattr(client, "auth_type", None)
        if auth_type != AuthType.BROWSER:
            raise PlaylistWriteNotStarted(
                "YouTube Music 尚未設定或未啟用有效的瀏覽器 Token (AuthType.BROWSER)，無法執行內部協定排序。"
            )

        # Check if items have valid setVideoId for inner API movement
        for item in sorted_items:
            pid = item.get("playlist_item_id", "")
            vid = item.get("video_id", "")
            if item.get("has_set_video_id") is False or (vid and pid.startswith(f"{vid}_")):
                raise PlaylistWriteNotStarted(
                    f"曲目「{item.get('title', pid)}」缺少有效的 YouTube Music setVideoId，無法執行內部協定移動。"
                )

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
                    response = client.edit_playlist(
                        playlistId=playlist_id,
                        moveItem=(target_id, successor_id),
                    )
                    status = response.get("status") if isinstance(response, dict) else response
                    if status != "STATUS_SUCCEEDED":
                        raise PlaylistWriteOutcomeUnknown()
                    succeeded += 1
                    # Update simulation state
                    cur_pos = current_ids.index(target_id)
                    current_ids.pop(cur_pos)
                    current_ids.insert(i, target_id)
                except Exception as exc:
                    logger.error("Move outcome unknown for item %s: %s", target_id, type(exc).__name__)
                    raise PlaylistWriteOutcomeUnknown(
                        {
                            "operation": "playlist_sort",
                            "mode": "in_place",
                            "total": len(sorted_items),
                            "moved": moved_count,
                            "succeeded": succeeded,
                            "failed": 1,
                            "failed_items": [{"playlist_item_id": target_id, "error": "寫入結果待核對。"}],
                            "quota_used": 0,
                        }
                    ) from exc

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

    def create_sorted(
        self, title: str, description: str, sorted_items: list[dict[str, Any]], privacy_status: str = "PRIVATE"
    ) -> dict[str, Any]:
        client = self.client
        auth_type = getattr(client, "auth_type", None)
        if auth_type != AuthType.BROWSER:
            raise PlaylistWriteNotStarted(
                "YouTube Music 尚未設定或未啟用有效的瀏覽器 Token (AuthType.BROWSER)，無法執行內部協定建立播放清單。"
            )

        video_ids = [item["video_id"] for item in sorted_items if item.get("video_id")]
        missing_video_ids = [
            {"playlist_item_id": item.get("playlist_item_id", ""), "error": "缺少影片 ID，無法加入新播放清單。"}
            for item in sorted_items
            if not item.get("video_id")
        ]

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
            logger.error("Failed to create new sorted playlist: %s", type(exc).__name__)
            raise PlaylistWriteOutcomeUnknown() from exc

        if not isinstance(new_playlist_id, str) or not new_playlist_id.strip():
            raise PlaylistWriteOutcomeUnknown()

        return {
            "operation": "playlist_sort",
            "mode": "new_playlist",
            "new_playlist_id": str(new_playlist_id),
            "new_playlist_url": f"https://music.youtube.com/playlist?list={new_playlist_id}",
            "total": len(sorted_items),
            "moved": len(sorted_items),
            "succeeded": len(video_ids),
            "failed": len(missing_video_ids),
            "failed_items": missing_video_ids,
            "quota_used": 0,
        }
