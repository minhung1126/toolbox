from __future__ import annotations

from backend.app.tools.base import ToolMetadata, ToolPlugin, ToolRoute


class YouTubeMusicPlugin(ToolPlugin):
    def __init__(self) -> None:
        self._metadata = ToolMetadata(
            id="youtube-music",
            name="YouTube Music",
            title="YouTube Music",
            description="YouTube Music 專屬音樂工具箱，提供智慧播放清單排序、自訂排序規則與即時雙欄模擬比對。",
            category="YouTube Music",
            icon="Disc3",
            version="1.0.0",
            status="active",
            entry_url="/ytmusic/playlist-sort",
            routes=[
                ToolRoute(
                    path="/ytmusic/playlist-sort",
                    label="播放清單排序",
                    description="讀取 YouTube Music 播放清單並以多種欄位自訂排序",
                ),
            ],
            required_scopes=["youtube"],
            tags=["ytmusic", "youtube-music", "playlist", "sort", "music"],
        )

    @property
    def metadata(self) -> ToolMetadata:
        return self._metadata

    @property
    def router(self):
        from backend.app.api.playlist_sort import router as playlist_sort_router

        return playlist_sort_router


PlaylistSorterPlugin = YouTubeMusicPlugin
