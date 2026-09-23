"""API Router for Weverse Local Video and Subtitle Uploader tool."""

import json
import logging
import os
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel, Field

from backend.app.core.dependencies import (
    AuthenticatedSession,
    get_authenticated_session,
    require_video_uploader_context,
)
from backend.app.core.error_contract import http_error
from backend.app.core.weverse_upload_store import weverse_upload_store
from backend.app.core.youtube_context import YouTubeRequestContext
from backend.app.services.weverse_scanner import (
    parse_browser_file_list,
    scan_local_path,
)
from backend.app.services.weverse_uploader_service import enqueue_upload_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/weverse-uploader", tags=["Weverse Uploader"])


class ScanPathRequest(BaseModel):
    folder_path: str = Field(..., min_length=1, max_length=1000, description="本機資料夾路徑")


class ParseFilesRequest(BaseModel):
    files: List[Dict[str, Any]] = Field(..., description="瀏覽器選取檔案之元數據清單")


class SubtitleConfig(BaseModel):
    full_path: Optional[str] = Field(default=None, description="伺服器/本機完整路徑 (若從路徑上傳)")
    filename: str = Field(..., max_length=255)
    raw_lang: str = Field(default="", max_length=50)
    bcp47: str = Field(default="zh-TW", max_length=20)
    label: str = Field(default="字幕", max_length=100)
    enabled: bool = True


class UploadFromPathRequest(BaseModel):
    video_path: str = Field(..., min_length=1, max_length=1000)
    title: str = Field(..., min_length=1, max_length=100)
    description: str = Field(default="", max_length=5000)
    privacy_status: str = Field(default="private", pattern="^(private|unlisted|public)$")
    tags: List[str] = Field(default_factory=list)
    category_id: str = Field(default="22", max_length=10)
    default_language: str = Field(default="ko", max_length=20)
    subtitles: List[SubtitleConfig] = Field(default_factory=list)


@router.post("/scan")
def scan_folder(
    payload: ScanPathRequest,
    auth_session: AuthenticatedSession = Depends(get_authenticated_session),
) -> Dict[str, Any]:
    """Scan a local folder on disk and automatically identify video and subtitle packages."""
    folder_path = payload.folder_path.strip().strip('"').strip("'")
    if not folder_path:
        raise http_error(400, "invalid_path", "資料夾路徑不可為空。")

    try:
        result = scan_local_path(folder_path)
        weverse_upload_store.record_recent_path(auth_session.subject, folder_path)
        return {"status": "success", **result}
    except (FileNotFoundError, ValueError, PermissionError) as exc:
        raise http_error(400, "scan_failed", str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error scanning folder %s: %s", folder_path, exc)
        raise http_error(500, "scan_server_error", f"掃描資料夾時發生未預期錯誤：{exc}") from exc


@router.post("/parse-files")
def parse_files(
    payload: ParseFilesRequest,
    auth_session: AuthenticatedSession = Depends(get_authenticated_session),
) -> Dict[str, Any]:
    """Analyze file list chosen via browser folder picker or drag-and-drop."""
    if not payload.files:
        raise http_error(400, "empty_files", "請提供至少一個檔案。")

    try:
        result = parse_browser_file_list(payload.files)
        return {"status": "success", **result}
    except Exception as exc:
        logger.exception("Failed to parse file list: %s", exc)
        raise http_error(400, "parse_failed", f"解析檔案清單失敗：{exc}") from exc


@router.post("/upload-from-path")
def start_upload_from_path(
    payload: UploadFromPathRequest,
    context: YouTubeRequestContext = Depends(require_video_uploader_context),
) -> Dict[str, Any]:
    """Start an upload task reading directly from a local path on disk."""
    video_path = payload.video_path.strip().strip('"').strip("'")
    if not os.path.exists(video_path) or not os.path.isfile(video_path):
        raise http_error(400, "video_not_found", f"找不到影片檔案：{video_path}")

    task_id = str(uuid.uuid4())
    task_record = {
        "task_id": task_id,
        "title": payload.title,
        "video_filename": os.path.basename(video_path),
        "video_path": video_path,
        "privacy_status": payload.privacy_status,
        "status": "pending",
        "progress_percent": 0,
        "current_step": "任務已加入佇列...",
        "subtitles_count": len([s for s in payload.subtitles if s.enabled]),
    }

    weverse_upload_store.create_task(context.owner_sub, task_record)

    enqueue_upload_task(
        owner_sub=context.owner_sub,
        task_id=task_id,
        credentials=context.credentials,
        video_path=video_path,
        title=payload.title,
        description=payload.description,
        privacy_status=payload.privacy_status,
        subtitles=[s.model_dump() for s in payload.subtitles],
        tags=payload.tags,
        category_id=payload.category_id,
        default_language=payload.default_language,
        temp_dir_to_clean=None,
    )

    logger.info("Enqueued upload task %s for user %s", task_id, context.owner_sub)
    return {"status": "queued", "task_id": task_id}


@router.post("/upload-files")
async def start_upload_files(
    metadata: str = Form(...),
    video: UploadFile = File(...),
    subtitles: List[UploadFile] = File(default=[]),
    context: YouTubeRequestContext = Depends(require_video_uploader_context),
) -> Dict[str, Any]:
    """Start an upload task where files were uploaded through the browser."""
    try:
        meta_dict = json.loads(metadata)
    except Exception as exc:
        raise http_error(400, "invalid_metadata", "詮釋資料 JSON 格式不正確。") from exc

    title = str(meta_dict.get("title") or video.filename or "").strip()
    if not title:
        raise http_error(400, "empty_title", "影片標題不可為空。")

    task_id = str(uuid.uuid4())
    base_dir = Path(__file__).resolve().parent.parent.parent.parent / "data" / "weverse_temp" / task_id
    base_dir.mkdir(parents=True, exist_ok=True)

    # Save video file
    video_save_path = base_dir / (video.filename or "video.mp4")
    try:
        with open(video_save_path, "wb") as f:
            while chunk := await video.read(1024 * 1024 * 4):  # 4MB buffer
                f.write(chunk)
    except Exception as exc:
        raise http_error(500, "file_save_error", f"儲存上傳影片失敗：{exc}") from exc

    # Save subtitle files
    subtitle_configs = meta_dict.get("subtitles") or []
    subtitles_lookup = {s.get("filename"): s for s in subtitle_configs}
    saved_subtitles = []

    for sub_file in subtitles:
        filename = sub_file.filename
        if not filename:
            continue
        sub_save_path = base_dir / filename
        with open(sub_save_path, "wb") as f:
            while chunk := await sub_file.read(1024 * 64):
                f.write(chunk)

        cfg = subtitles_lookup.get(filename, {})
        saved_subtitles.append(
            {
                "full_path": str(sub_save_path.resolve()),
                "filename": filename,
                "bcp47": cfg.get("bcp47") or "zh-TW",
                "label": cfg.get("label") or filename,
                "enabled": cfg.get("enabled", True),
            }
        )

    task_record = {
        "task_id": task_id,
        "title": title,
        "video_filename": video.filename,
        "video_path": str(video_save_path),
        "privacy_status": meta_dict.get("privacy_status", "private"),
        "status": "pending",
        "progress_percent": 0,
        "current_step": "任務已加入佇列...",
        "subtitles_count": len([s for s in saved_subtitles if s.get("enabled")]),
    }

    weverse_upload_store.create_task(context.owner_sub, task_record)

    enqueue_upload_task(
        owner_sub=context.owner_sub,
        task_id=task_id,
        credentials=context.credentials,
        video_path=str(video_save_path),
        title=title,
        description=meta_dict.get("description", ""),
        privacy_status=meta_dict.get("privacy_status", "private"),
        subtitles=saved_subtitles,
        tags=meta_dict.get("tags") or [],
        category_id=meta_dict.get("category_id", "22"),
        default_language=meta_dict.get("default_language", "ko"),
        temp_dir_to_clean=str(base_dir),
    )

    logger.info("Enqueued file-upload task %s for user %s", task_id, context.owner_sub)
    return {"status": "queued", "task_id": task_id}


@router.get("/tasks/{task_id}")
def get_task_status(
    task_id: str,
    auth_session: AuthenticatedSession = Depends(get_authenticated_session),
) -> Dict[str, Any]:
    """Get the current progress and result of an upload task."""
    task = weverse_upload_store.get_task(auth_session.subject, task_id)
    if not task:
        raise http_error(404, "task_not_found", f"找不到任務 ID：{task_id}")
    return {"status": "success", "task": task}


@router.get("/history")
def list_history(
    limit: int = 20,
    auth_session: AuthenticatedSession = Depends(get_authenticated_session),
) -> Dict[str, Any]:
    """List recent upload tasks."""
    tasks = weverse_upload_store.list_tasks(auth_session.subject, limit=min(limit, 50))
    return {"status": "success", "tasks": tasks}


@router.get("/recent-paths")
def get_recent_paths(
    auth_session: AuthenticatedSession = Depends(get_authenticated_session),
) -> Dict[str, Any]:
    """Get recently scanned folder paths."""
    paths = weverse_upload_store.get_recent_paths(auth_session.subject)
    return {"status": "success", "paths": paths}
