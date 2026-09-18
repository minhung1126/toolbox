"""Built-in Toolbox tools and plugins."""

from backend.app.tools.builtin.creator_tools import CreatorToolsPlugin
from backend.app.tools.builtin.ffmpeg_generator import FfmpegGeneratorPlugin
from backend.app.tools.builtin.photo_curator import PhotoCuratorPlugin
from backend.app.tools.builtin.playlist_sorter import PlaylistSorterPlugin, YouTubeMusicPlugin
from backend.app.tools.builtin.sheets_tools import SheetsToolsPlugin
from backend.app.tools.builtin.sticky_notes import StickyNotesPlugin
from backend.app.tools.builtin.system_utility import SystemUtilityPlugin
from backend.app.tools.builtin.youtube_integrations import YouTubeIntegrationsPlugin
from backend.app.tools.registry import tool_registry

__all__ = [
    "CreatorToolsPlugin",
    "FfmpegGeneratorPlugin",
    "PhotoCuratorPlugin",
    "PlaylistSorterPlugin",
    "SheetsToolsPlugin",
    "StickyNotesPlugin",
    "SystemUtilityPlugin",
    "YouTubeIntegrationsPlugin",
    "YouTubeMusicPlugin",
    "register_builtin_tools",
]


def register_builtin_tools() -> None:
    """Register all default built-in tools into the global ToolRegistry."""
    plugins = [
        CreatorToolsPlugin,
        FfmpegGeneratorPlugin,
        PhotoCuratorPlugin,
        PlaylistSorterPlugin,
        SheetsToolsPlugin,
        StickyNotesPlugin,
        YouTubeIntegrationsPlugin,
        SystemUtilityPlugin,
    ]
    for plugin_cls in plugins:
        plugin = plugin_cls()
        if not tool_registry.get(plugin.metadata.id):
            tool_registry.register(plugin)
