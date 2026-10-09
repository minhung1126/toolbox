"""API Router for Weverse Local Video and Subtitle Uploader tool."""

import json
import logging
import os
import re
import shutil
import uuid
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from pydantic import BaseModel, Field

from backend.app.core.dependencies import (
    AuthenticatedSession,
    get_authenticated_session,
    require_video_uploader_context,
)
from backend.app.core.error_contract import http_error
from backend.app.core.weverse_upload_store import WeverseUploadStore, weverse_upload_store
from backend.app.core.youtube_context import YouTubeRequestContext
from backend.app.services.weverse_captions import caption_plan, public_task
from backend.app.services.weverse_scanner import (
    parse_browser_file_list,
    scan_local_path,
)
from backend.app.services.weverse_uploader_service import UploadWorker, default_upload_worker, enqueue_upload_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/weverse-uploader", tags=["Weverse Uploader"])


def get_upload_worker(request: Request) -> UploadWorker:
    configured = getattr(request.app.state, "upload_worker", None)
    return configured if configured is not None else default_upload_worker()


def get_upload_store(request: Request) -> WeverseUploadStore:
    return get_upload_worker(request).store


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


_UNSAFE_UPLOAD_FILENAME = re.compile(r'[\x00-\x1f<>:"/\\|?*]')
_WINDOWS_DEVICE_NAME = re.compile(r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)", re.IGNORECASE)


def _validated_upload_filename(filename: str | None) -> str:
    """Keep multipart filenames as plain, portable names within the task directory."""
    if (
        not filename
        or len(filename) > 255
        or filename != filename.strip()
        or filename.endswith(".")
        or filename in {".", ".."}
        or _UNSAFE_UPLOAD_FILENAME.search(filename)
        or _WINDOWS_DEVICE_NAME.match(filename)
    ):
        raise http_error(400, "upload_filename_invalid", "上傳檔案名稱不正確。")
    return filename


def _enqueue_persisted_upload(
    owner_sub: str, task_id: str, *, worker: UploadWorker | None = None, temp_dir_to_clean: str | None = None, **options
) -> None:
    """Queue a task only after its initial durable record has been written."""
    store = worker.store if worker is not None else weverse_upload_store
    enqueue = worker.enqueue if worker is not None else enqueue_upload_task
    try:
        enqueue(
            owner_sub=owner_sub,
            task_id=task_id,
            temp_dir_to_clean=temp_dir_to_clean,
            **options,
        )
    except Exception as exc:
        try:
            store.update_task(
                owner_sub,
                task_id,
                {
                    "status": "failed",
                    "error_message": "上傳佇列暫時無法接收此工作。",
                    "current_step": "上傳佇列目前無法接收新工作，請稍後重試。",
                },
            )
        except Exception:
            logger.exception("Could not persist queue failure for Weverse upload %s", task_id)

        if temp_dir_to_clean:
            shutil.rmtree(temp_dir_to_clean, ignore_errors=True)
        logger.exception("Could not enqueue Weverse upload task %s", task_id)
        raise http_error(
            503,
            "upload_queue_unavailable",
            "上傳佇列目前無法接收新工作，請稍後重試。",
            retryable=True,
        ) from exc


@router.post("/scan")
def scan_folder(
    payload: ScanPathRequest,
    auth_session: AuthenticatedSession = Depends(get_authenticated_session),
    store: WeverseUploadStore = Depends(get_upload_store),
) -> Dict[str, Any]:
    """Scan a local folder on disk and automatically identify video and subtitle packages."""
    folder_path = payload.folder_path.strip().strip('"').strip("'")
    if not folder_path:
        raise http_error(400, "invalid_path", "資料夾路徑不可為空。")

    try:
        result = scan_local_path(folder_path)
        store.record_recent_path(auth_session.subject, folder_path)
        return {"status": "success", **result}
    except (FileNotFoundError, ValueError, PermissionError) as exc:
        raise http_error(400, "scan_failed", str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error scanning folder %s: %s", folder_path, exc)
        raise http_error(500, "scan_server_error", "掃描資料夾失敗，請檢查路徑與權限。") from exc


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
        raise http_error(400, "parse_failed", "解析檔案清單失敗，請檢查檔案格式。") from exc


@router.post("/upload-from-path")
def start_upload_from_path(
    payload: UploadFromPathRequest,
    context: YouTubeRequestContext = Depends(require_video_uploader_context),
    worker: UploadWorker = Depends(get_upload_worker),
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
        "caption_results": caption_plan([s.model_dump() for s in payload.subtitles]),
        "channel_id": getattr(context, "channel_id", None),
    }

    worker.store.create_task(context.owner_sub, task_record)

    _enqueue_persisted_upload(
        worker=worker,
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
    )

    logger.info("Enqueued upload task %s for user %s", task_id, context.owner_sub)
    return {"status": "queued", "task_id": task_id}


@router.post("/upload-files")
async def start_upload_files(
    metadata: str = Form(...),
    video: UploadFile = File(...),
    subtitles: List[UploadFile] = File(default=[]),
    context: YouTubeRequestContext = Depends(require_video_uploader_context),
    worker: UploadWorker = Depends(get_upload_worker),
) -> Dict[str, Any]:
    """Start an upload task where files were uploaded through the browser."""
    try:
        meta_dict = json.loads(metadata)
    except Exception as exc:
        raise http_error(400, "invalid_metadata", "詮釋資料 JSON 格式不正確。") from exc
    if not isinstance(meta_dict, dict):
        raise http_error(400, "invalid_metadata", "詮釋資料 JSON 格式不正確。")

    video_filename = _validated_upload_filename(video.filename)
    subtitle_filenames = [_validated_upload_filename(item.filename) for item in subtitles]
    if len({name.casefold() for name in [video_filename, *subtitle_filenames]}) != len(subtitle_filenames) + 1:
        raise http_error(400, "upload_filename_duplicate", "上傳檔案名稱不可重複。")
    subtitle_configs = meta_dict.get("subtitles") or []
    if not isinstance(subtitle_configs, list) or any(
        not isinstance(config, dict) or not isinstance(config.get("filename"), str) for config in subtitle_configs
    ):
        raise http_error(400, "invalid_metadata", "字幕設定格式不正確。")

    title = str(meta_dict.get("title") or video_filename).strip()
    if not title:
        raise http_error(400, "empty_title", "影片標題不可為空。")

    task_id = str(uuid.uuid4())
    base_dir = worker.store.data_file.parent / "weverse_temp" / task_id
    video_save_path = base_dir / video_filename
    subtitles_lookup = {s.get("filename"): s for s in subtitle_configs}
    saved_subtitles = []
    try:
        base_dir.mkdir(parents=True, exist_ok=True)
        with open(video_save_path, "wb") as f:
            while chunk := await video.read(1024 * 1024 * 4):  # 4MB buffer
                f.write(chunk)

        for sub_file, filename in zip(subtitles, subtitle_filenames, strict=True):
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
            "video_filename": video_filename,
            "video_path": str(video_save_path),
            "privacy_status": meta_dict.get("privacy_status", "private"),
            "status": "pending",
            "progress_percent": 0,
            "current_step": "任務已加入佇列...",
            "subtitles_count": len([s for s in saved_subtitles if s.get("enabled")]),
            "caption_results": caption_plan(saved_subtitles),
            "channel_id": getattr(context, "channel_id", None),
        }
        worker.store.create_task(context.owner_sub, task_record)
    except Exception as exc:
        shutil.rmtree(base_dir, ignore_errors=True)
        logger.exception("Could not save browser upload task %s", task_id)
        raise http_error(500, "file_save_error", "儲存上傳檔案失敗。") from exc

    _enqueue_persisted_upload(
        worker=worker,
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
    store: WeverseUploadStore = Depends(get_upload_store),
) -> Dict[str, Any]:
    """Get the current progress and result of an upload task."""
    task = store.get_task(auth_session.subject, task_id)
    if not task:
        raise http_error(404, "task_not_found", f"找不到任務 ID：{task_id}")
    return {"status": "success", "task": public_task(task)}


@router.get("/history")
def list_history(
    limit: int = Query(default=20, ge=1, le=50),
    auth_session: AuthenticatedSession = Depends(get_authenticated_session),
    store: WeverseUploadStore = Depends(get_upload_store),
) -> Dict[str, Any]:
    """List recent upload tasks."""
    tasks = store.list_tasks(auth_session.subject, limit=min(limit, 50))
    return {"status": "success", "tasks": [public_task(task) for task in tasks]}


@router.get("/recent-paths")
def get_recent_paths(
    auth_session: AuthenticatedSession = Depends(get_authenticated_session),
    store: WeverseUploadStore = Depends(get_upload_store),
) -> Dict[str, Any]:
    """Get recently scanned folder paths."""
    paths = store.get_recent_paths(auth_session.subject)
    return {"status": "success", "paths": paths}


@router.post("/tasks/{task_id}/retry-captions")
async def retry_captions(
    task_id: str,
    expected_updated_at: str = Form(...),
    confirmed_missing: str = Form(default="[]"),
    subtitles: List[UploadFile] = File(default=[]),
    context: YouTubeRequestContext = Depends(require_video_uploader_context),
    worker: UploadWorker = Depends(get_upload_worker),
) -> Dict[str, Any]:
    """Create a caption-only child task after atomically claiming the source revision."""
    parent = worker.store.get_task(context.owner_sub, task_id)
    if not parent:
        raise http_error(404, "task_not_found", "找不到任務。")
    if worker.is_task_running(context.owner_sub, task_id):
        raise http_error(409, "caption_retry_conflict", "任務仍在執行，請稍後重新讀取。")
    if not parent.get("video_id") or not parent.get("caption_results"):
        raise http_error(
            409, "caption_retry_unavailable", "此紀錄沒有可補傳的影片與字幕資料，請至 YouTube Studio 處理。"
        )
    if parent.get("channel_id") and parent["channel_id"] != context.channel_id:
        raise http_error(409, "channel_mismatch", "請連結原影片所屬的上傳頻道。")
    results = deepcopy(parent["caption_results"])
    candidates = {item["filename"]: item for item in results if item["status"] != "uploaded"}
    names = [_validated_upload_filename(item.filename) for item in subtitles]
    try:
        confirmed = json.loads(confirmed_missing)
    except ValueError as exc:
        raise http_error(400, "invalid_metadata", "核對清單格式不正確。") from exc
    if (
        not isinstance(confirmed, list)
        or any(not isinstance(name, str) or name not in candidates for name in confirmed)
        or len(set(name.casefold() for name in names)) != len(names)
        or any(name not in candidates or Path(name).suffix.lower() not in {".vtt", ".srt"} for name in names)
    ):
        raise http_error(400, "invalid_caption_selection", "請只選取清單中待處理的字幕檔案。")
    if not candidates:
        raise http_error(409, "caption_retry_unavailable", "字幕已全部完成。")
    for name in confirmed:
        if candidates[name]["status"] == "unknown":
            candidates[name].update(status="missing_file", manually_confirmed_missing=True)
    retry_id = str(uuid.uuid4())
    directory = worker.store.data_file.parent / "weverse_temp" / retry_id
    saved = []
    try:
        directory.mkdir(parents=True, exist_ok=True)
        for upload, name in zip(subtitles, names, strict=True):
            target = directory / name
            with target.open("wb") as handle:
                while chunk := await upload.read(65536):
                    handle.write(chunk)
            item = candidates[name]
            saved.append({"filename": name, "full_path": str(target), "bcp47": item["language"], "label": item["name"]})
        child = {
            key: parent[key]
            for key in (
                "title",
                "video_filename",
                "privacy_status",
                "video_id",
                "video_url",
                "studio_url",
                "channel_id",
            )
            if key in parent
        }
        child.update(
            task_id=retry_id,
            status="pending",
            progress_percent=0,
            current_step="字幕核對與補傳已排入佇列。",
            caption_results=results,
            subtitles_count=len(results),
            operation="caption_retry",
        )
        worker.store.create_caption_retry(context.owner_sub, task_id, expected_updated_at, child)
    except ValueError as exc:
        shutil.rmtree(directory, ignore_errors=True)
        raise http_error(409, "caption_retry_conflict", "任務已變更或已建立補傳工作，請重新讀取歷史。") from exc
    except Exception as exc:
        shutil.rmtree(directory, ignore_errors=True)
        logger.exception("Could not prepare caption retry")
        raise http_error(500, "caption_retry_save_failed", "無法保存字幕補傳工作。") from exc
    _enqueue_persisted_upload(
        worker=worker,
        owner_sub=context.owner_sub,
        task_id=retry_id,
        credentials=context.credentials,
        video_path="",
        title=parent["title"],
        description="",
        privacy_status=parent.get("privacy_status", "private"),
        subtitles=saved,
        existing_video_id=parent["video_id"],
        caption_results=results,
        temp_dir_to_clean=str(directory),
    )
    return {"status": "queued", "task_id": retry_id}
