from __future__ import annotations

from backend.app.tools.base import ToolMetadata, ToolPlugin, ToolRoute


class YouTubeMusicPlugin(ToolPlugin):
    def __init__(self) -> None:
        self._metadata = ToolMetadata(
            id="youtube-music",
            name="YouTube Music",
            title="YouTube Music",
            description="讀取歌單並預覽排序；確認後改原歌單或建立新歌單，結果不明時先核對。",
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
                ToolRoute(
                    path="/ytmusic/settings",
                    label="YouTube Music 設定",
                    description="管理 YouTube Music 專屬帳號授權與偏好設定",
                    required_scopes=[],
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

    async def on_startup(self, app) -> None:
        account_state_store = app.state.account_state_store

        account_state_store.register_work_state_keys(
            [
                "ytmusic_pinned_playlists",
                "ytmusic_sort_config",
                "ytmusic_preferences",
            ]
        )


PlaylistSorterPlugin = YouTubeMusicPlugin
