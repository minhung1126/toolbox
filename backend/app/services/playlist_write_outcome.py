"""Conservative write outcomes: only preflight failures permit provider fallback."""

from typing import Any

from ytmusicapi.exceptions import YTMusicError


class PlaylistWriteNotStarted(YTMusicError):
    """Validation or client setup failed before sending a mutation."""


class PlaylistWriteOutcomeUnknown(YTMusicError):
    """A sent mutation may have committed; reconcile before another write."""

    def __init__(self, result: dict[str, Any] | None = None):
        super().__init__("寫入結果待核對，請先檢查 YouTube Music 播放清單，勿直接重送。")
        self.result = result or {}
