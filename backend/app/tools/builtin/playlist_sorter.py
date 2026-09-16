from __future__ import annotations

from backend.app.tools.base import ToolMetadata, ToolPlugin, ToolRoute


class PlaylistSorterPlugin(ToolPlugin):
    def __init__(self) -> None:
        self._metadata = ToolMetadata(
            id="playlist-sorter",
            name="Playlist Sorter",
            title="YouTube 播放清單排序",
            description="YouTube 播放清單智慧排序，支援多欄位自訂排序規則、即時模擬預覽與一鍵套用。",
            category="播放清單管理",
            icon="ArrowUpDown",
            version="1.0.0",
            status="active",
            entry_url="/youtube/playlist-sort",
            routes=[
                ToolRoute(
                    path="/youtube/playlist-sort",
                    label="播放清單排序",
                    description="讀取 YouTube 播放清單並以多種欄位自訂排序",
                ),
            ],
            required_scopes=["youtube"],
            tags=["youtube", "playlist", "sort", "music"],
        )

    @property
    def metadata(self) -> ToolMetadata:
        return self._metadata

    @property
    def router(self):
        from backend.app.api.playlist_sort import router as playlist_sort_router

        return playlist_sort_router
