"""Toolbox Registry for managing and discovering tool plugins.

Provides centralized registration, lifecycle management, and router mounting
for all tools in the Toolbox platform.
"""

import inspect
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, FastAPI

from backend.app.tools.base import ToolMetadata, ToolPlugin

logger = logging.getLogger(__name__)


class ToolRegistry:
    """Registry maintaining active ToolPlugins within the Toolbox platform."""

    def __init__(self) -> None:
        self._plugins: Dict[str, ToolPlugin] = {}
        self._startup_errors: Dict[str, str] = {}

    def register(self, plugin: ToolPlugin) -> None:
        """Register a new tool plugin into the platform."""
        tool_id = plugin.metadata.id
        if tool_id in self._plugins:
            raise ValueError(f"ToolPlugin '{tool_id}' is already registered.")
        self._startup_errors.pop(tool_id, None)
        self._plugins[tool_id] = plugin
        logger.info("Registered Toolbox plugin: %s (%s)", plugin.metadata.name, tool_id)

    def unregister(self, tool_id: str) -> Optional[ToolPlugin]:
        """Unregister a tool plugin by its ID."""
        self._startup_errors.pop(tool_id, None)
        return self._plugins.pop(tool_id, None)

    def get(self, tool_id: str) -> Optional[ToolPlugin]:
        """Retrieve a registered tool plugin by ID."""
        return self._plugins.get(tool_id)

    def list_plugins(self) -> List[ToolPlugin]:
        """Return all registered plugins."""
        return list(self._plugins.values())

    def list_metadata(self) -> List[ToolMetadata]:
        """Return metadata for all registered and enabled tools."""
        return [plugin.metadata for plugin in self._plugins.values()]

    def get_metadata(self, tool_id: str) -> Optional[ToolMetadata]:
        """Get metadata for a specific tool ID."""
        plugin = self.get(tool_id)
        return plugin.metadata if plugin else None

    def mount_routers(self, target_router: APIRouter) -> None:
        """Mount all tool routers onto the specified target router."""
        mounted_routers = getattr(target_router, "_mounted_tool_routers", None)
        if mounted_routers is None:
            mounted_routers = set()
            setattr(target_router, "_mounted_tool_routers", mounted_routers)

        for tool_id, plugin in self._plugins.items():
            router = plugin.router
            if router and id(router) not in mounted_routers:
                target_router.include_router(router)
                mounted_routers.add(id(router))
                logger.debug("Mounted router for tool: %s", tool_id)

    async def run_startup(self, app: FastAPI) -> None:
        """Execute on_startup lifecycle hooks for all registered plugins."""
        for tool_id, plugin in self._plugins.items():
            try:
                res = plugin.on_startup(app)
                if inspect.isawaitable(res):
                    await res
                self._startup_errors.pop(tool_id, None)
                logger.info("Initialized tool plugin: %s", tool_id)
            except Exception as exc:
                self._startup_errors[tool_id] = type(exc).__name__
                logger.error("Failed to initialize tool plugin %s: %s", tool_id, exc, exc_info=True)

    async def run_shutdown(self, app: FastAPI) -> None:
        """Execute on_shutdown lifecycle hooks for all registered plugins."""
        for tool_id, plugin in self._plugins.items():
            try:
                res = plugin.on_shutdown(app)
                if inspect.isawaitable(res):
                    await res
                logger.info("Cleaned up tool plugin: %s", tool_id)
            except Exception as exc:
                logger.error("Failed to cleanup tool plugin %s: %s", tool_id, exc, exc_info=True)

    def health_check(self) -> Dict[str, Any]:
        """Collect health status across all registered plugins."""
        results = {}
        for tool_id, plugin in self._plugins.items():
            if tool_id in self._startup_errors:
                results[tool_id] = {"status": "error", "error": self._startup_errors[tool_id]}
                continue
            try:
                results[tool_id] = plugin.health_check()
            except Exception as exc:
                results[tool_id] = {"status": "error", "error": type(exc).__name__}
        return results


# Global singleton instance
tool_registry = ToolRegistry()
