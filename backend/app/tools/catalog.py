"""Toolbox module catalog and registration hub.

This module provides a registry of available tools inside the Toolbox platform.
New tools can be registered here to automatically expose their metadata and
capabilities to the frontend and API consumers.
"""

from typing import Any, Dict, List

from fastapi import APIRouter

router = APIRouter(prefix="/tools", tags=["Toolbox Catalog"])

REGISTERED_TOOLS: List[Dict[str, Any]] = [
    {
        "id": "creator-tools",
        "name": "Creator Tools",
        "title": "創作者工作流控制台",
        "description": "Google Sheets 整合、YouTube 影片/Shorts 草稿維護、Drive 斷點續傳背景上傳與配額自動分流。",
        "category": "媒體與影音",
        "icon": "Youtube",
        "status": "active",
        "entry_url": "/dashboard",
        "routes": [
            {"path": "/youtube/uploads/new", "label": "Drive 上傳 YouTube"},
            {"path": "/youtube/drafts/videos", "label": "Video 草稿管理"},
            {"path": "/youtube/drafts/shorts", "label": "Shorts 草稿管理"},
            {"path": "/youtube/publish-cleanup", "label": "發布並清理清單"},
            {"path": "/sheets/copy", "label": "Sheet 內容複製"},
            {"path": "/youtube/settings/connections", "label": "YouTube 授權設定"},
            {"path": "/youtube/settings/quota", "label": "YouTube 配額與計帳"},
        ],
    },
    {
        "id": "system-utility",
        "name": "System Utility",
        "title": "系統診斷與部署資訊",
        "description": "即時監控 Toolbox API 健康狀態、OAuth 憑證就緒度、環境參數與 Commit 部署版本。",
        "category": "系統管理",
        "icon": "Activity",
        "status": "active",
        "entry_url": "/system/health",
        "routes": [
            {"path": "/system/health", "label": "API 健康度檢查"},
            {"path": "/system/info", "label": "系統與部署資訊"},
        ],
    },
]


@router.get("", response_model=Dict[str, Any])
def list_tools() -> Dict[str, Any]:
    """Return the list of all registered tools in the Toolbox platform."""
    return {
        "platform": "Toolbox",
        "total_tools": len(REGISTERED_TOOLS),
        "tools": REGISTERED_TOOLS,
    }


@router.get("/{tool_id}", response_model=Dict[str, Any])
def get_tool_detail(tool_id: str) -> Dict[str, Any]:
    """Return detailed metadata for a specific tool."""
    tool = next((t for t in REGISTERED_TOOLS if t["id"] == tool_id), None)
    if not tool:
        return {
            "found": False,
            "error": f"找不到工具模組: {tool_id}",
        }
    return {
        "found": True,
        "tool": tool,
    }
