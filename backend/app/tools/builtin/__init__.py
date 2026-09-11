"""Built-in Toolbox tools and plugins."""

from backend.app.tools.builtin.creator_tools import CreatorToolsPlugin
from backend.app.tools.builtin.system_utility import SystemUtilityPlugin
from backend.app.tools.registry import tool_registry

__all__ = ["CreatorToolsPlugin", "SystemUtilityPlugin", "register_builtin_tools"]


def register_builtin_tools() -> None:
    """Register all default built-in tools into the global ToolRegistry."""
    tool_registry.register(CreatorToolsPlugin())
    tool_registry.register(SystemUtilityPlugin())
