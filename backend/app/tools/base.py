"""Base classes and interfaces for Toolbox plugins and tools.

Every tool in the Toolbox platform inherits from ToolPlugin or provides a
ToolMetadata descriptor. This allows tools to be dynamically discovered,
registered, mounted, and controlled via lifecycle hooks.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, FastAPI
from pydantic import BaseModel, Field


class ToolRoute(BaseModel):
    """Metadata describing a frontend or API route provided by a tool."""

    path: str = Field(description="URL path for the route")
    label: str = Field(description="Display label for navigation and menus")
    description: Optional[str] = Field(default=None, description="Optional brief description of what this route does")


class ToolMetadata(BaseModel):
    """Complete metadata descriptor for a Toolbox tool module."""

    id: str = Field(description="Unique machine-readable tool identifier, e.g. 'creator-tools'")
    name: str = Field(description="English display name, e.g. 'Creator Tools'")
    title: str = Field(description="Localized / subtitle name, e.g. '創作者工作流控制台'")
    description: str = Field(description="Summary of tool capabilities and workflows")
    category: str = Field(default="一般工具", description="Category for grouping, e.g. '媒體與影音', '系統管理'")
    icon: str = Field(default="Tool", description="Lucide icon name, e.g. 'Youtube', 'Activity'")
    version: str = Field(default="1.0.0", description="Semver version string")
    status: str = Field(default="active", description="Status: 'active', 'beta', or 'disabled'")
    entry_url: str = Field(description="Primary entry point route for this tool")
    routes: List[ToolRoute] = Field(default_factory=list, description="Sub-routes provided by this tool")
    required_scopes: List[str] = Field(
        default_factory=list,
        description="OAuth scopes or capabilities needed, e.g. 'sheets_readonly', 'youtube'",
    )
    tags: List[str] = Field(default_factory=list, description="Searchable tags")


class ToolPlugin(ABC):
    """Abstract base class for all Toolbox plugins.

    Subclasses implement this class to register an independent tool into the platform.
    Plugins can contribute:
    - Metadata (name, description, routes)
    - An optional APIRouter containing backend endpoints
    - Startup and shutdown lifecycle hooks
    - Health check logic
    """

    @property
    @abstractmethod
    def metadata(self) -> ToolMetadata:
        """Return the metadata descriptor for this tool."""
        ...

    @property
    def router(self) -> Optional[APIRouter]:
        """Return the APIRouter for this tool, or None if no dedicated router."""
        return None

    async def on_startup(self, app: FastAPI) -> None:
        """Lifecycle hook executed during application startup."""
        pass

    async def on_shutdown(self, app: FastAPI) -> None:
        """Lifecycle hook executed during application shutdown."""
        pass

    def health_check(self) -> Dict[str, Any]:
        """Return tool health status dictionary."""
        return {"status": "ok", "tool_id": self.metadata.id}
