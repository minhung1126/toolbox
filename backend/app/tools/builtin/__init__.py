"""Built-in Toolbox tools and plugins."""

from backend.app.tools.builtin.creator_tools import CreatorToolsPlugin
from backend.app.tools.builtin.photo_curator import PhotoCuratorPlugin
from backend.app.tools.builtin.playlist_sorter import PlaylistSorterPlugin
from backend.app.tools.builtin.sheets_tools import SheetsToolsPlugin
from backend.app.tools.builtin.sticky_notes import StickyNotesPlugin
from backend.app.tools.builtin.system_utility import SystemUtilityPlugin
from backend.app.tools.builtin.youtube_integrations import YouTubeIntegrationsPlugin
from backend.app.tools.registry import tool_registry

__all__ = [
    "CreatorToolsPlugin",
    "PhotoCuratorPlugin",
    "PlaylistSorterPlugin",
    "SheetsToolsPlugin",
    "StickyNotesPlugin",
    "SystemUtilityPlugin",
    "YouTubeIntegrationsPlugin",
    "register_builtin_tools",
]


def register_builtin_tools() -> None:
    """Register all default built-in tools into the global ToolRegistry."""
    tool_registry.register(CreatorToolsPlugin())
    tool_registry.register(PhotoCuratorPlugin())
    tool_registry.register(PlaylistSorterPlugin())
    tool_registry.register(SheetsToolsPlugin())
    tool_registry.register(StickyNotesPlugin())
    tool_registry.register(YouTubeIntegrationsPlugin())
    tool_registry.register(SystemUtilityPlugin())
