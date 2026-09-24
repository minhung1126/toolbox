"""Toolbox module catalog and registration hub.

This module provides a registry of available tools inside the Toolbox platform.
Tools registered in `tool_registry` are automatically exposed here to the
frontend and API consumers.
"""

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Request

from backend.app.tools.builtin import register_builtin_tools
from backend.app.tools.registry import ToolRegistry, tool_registry

# Ensure built-in tools are registered
register_builtin_tools()

router = APIRouter(prefix="/tools", tags=["Toolbox Catalog"])


def get_tool_registry(request: Request) -> ToolRegistry:
    return getattr(request.app.state, "tool_registry", tool_registry)


def get_registered_tools(registry: ToolRegistry = tool_registry) -> List[Dict[str, Any]]:
    """Return serialized metadata for all currently registered tools."""
    return [meta.model_dump() for meta in registry.list_metadata()]


@router.get("", response_model=Dict[str, Any])
def list_tools(registry: ToolRegistry = Depends(get_tool_registry)) -> Dict[str, Any]:
    """Return the list of all registered tools in the Toolbox platform."""
    tools = get_registered_tools(registry)
    return {
        "platform": "Toolbox",
        "total_tools": len(tools),
        "tools": tools,
    }


@router.get("/{tool_id}", response_model=Dict[str, Any])
def get_tool_detail(tool_id: str, registry: ToolRegistry = Depends(get_tool_registry)) -> Dict[str, Any]:
    """Return detailed metadata for a specific tool."""
    meta = registry.get_metadata(tool_id)
    if not meta:
        return {
            "found": False,
            "error": f"找不到工具模組: {tool_id}",
        }
    return {
        "found": True,
        "tool": meta.model_dump(),
    }
