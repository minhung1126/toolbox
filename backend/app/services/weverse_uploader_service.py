"""Weverse YouTube upload service supporting resumable video and multi-language captions."""

import logging
import os
import shutil
import threading
from concurrent.futures import Future, ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional

import googleapiclient.discovery
from googleapiclient.http import MediaFileUpload

from backend.app.core.weverse_upload_store import weverse_upload_store

logger = logging.getLogger(__name__)

# Create the upload worker only when the first task is submitted, so importing
# API modules does not start a background thread.
_upload_executor: ThreadPoolExecutor | None = None
_upload_executor_lock = threading.Lock()


def _get_youtube_service(credentials):
    return googleapiclient.discovery.build("youtube", "v3", credentials=credentials)


def execute_upload_task(
    owner_sub: str,
    task_id: str,
    credentials: Any,
    video_path: str,
    title: str,
    description: str,
    privacy_status: str,
    subtitles: List[Dict[str, Any]],
    tags: Optional[List[str]] = None,
    category_id: str = "22",
    default_language: str = "ko",
    temp_dir_to_clean: Optional[str] = None,
) -> None:
    """Synchronous worker function that executes YouTube video and captions upload."""
    logger.info("Starting Weverse YouTube upload task %s for user %s", task_id, owner_sub)
    try:
        service = _get_youtube_service(credentials)

        # 1. Prepare video upload request
        weverse_upload_store.update_task(
            owner_sub,
            task_id,
            {
                "status": "uploading_video",
                "progress_percent": 5,
                "current_step": "正在準備上傳影片至 YouTube...",
            },
        )

        body = {
            "snippet": {
                "title": title[:100],
                "description": description[:5000],
                "tags": tags or [],
                "categoryId": category_id or "22",
                "defaultLanguage": default_language or "ko",
            },
            "status": {
                "privacyStatus": privacy_status if privacy_status in ("private", "unlisted", "public") else "private",
                "selfDeclaredMadeForKids": False,
            },
        }

        # 8MB chunk size for resumable video upload
        chunk_size = 1024 * 1024 * 8
        media = MediaFileUpload(video_path, chunksize=chunk_size, resumable=True)
        request = service.videos().insert(part="snippet,status", body=body, media_body=media)

        video_id = None
        response = None

        logger.info("Executing chunked video upload for task %s", task_id)
        while response is None:
            status, response = request.next_chunk()
            if status:
                # Video progress covers 5% to 80%
                percent = int(5 + status.progress() * 75)
                weverse_upload_store.update_task(
                    owner_sub,
                    task_id,
                    {
                        "progress_percent": percent,
                        "current_step": f"正在上傳影片... ({int(status.progress() * 100)}%)",
                    },
                )

        if not response or "id" not in response:
            raise RuntimeError("YouTube 未返回有效的影片 ID。")

        video_id = response["id"]
        video_url = f"https://youtu.be/{video_id}"
        studio_url = f"https://studio.youtube.com/video/{video_id}/edit"
        logger.info("Video uploaded successfully for task %s, video_id=%s", task_id, video_id)

        weverse_upload_store.update_task(
            owner_sub,
            task_id,
            {
                "video_id": video_id,
                "video_url": video_url,
                "studio_url": studio_url,
                "progress_percent": 80,
                "current_step": f"影片上傳完成 (ID: {video_id})，開始上傳字幕軌...",
            },
        )

        # 2. Upload subtitles
        uploaded_captions = []
        failed_captions = []
        enabled_subs = [s for s in subtitles if s.get("enabled", True)]
        total_subs = len(enabled_subs)

        if total_subs > 0:
            weverse_upload_store.update_task(
                owner_sub,
                task_id,
                {
                    "status": "uploading_captions",
                },
            )

            for index, sub in enumerate(enabled_subs, start=1):
                sub_path = sub.get("full_path")
                bcp47 = sub.get("bcp47") or "zh-TW"
                label = sub.get("label") or bcp47

                sub_percent = int(80 + (index / total_subs) * 18)
                weverse_upload_store.update_task(
                    owner_sub,
                    task_id,
                    {
                        "progress_percent": sub_percent,
                        "current_step": f"正在上傳字幕 ({index}/{total_subs})：{label} [{bcp47}]...",
                    },
                )

                if not sub_path or not Path(sub_path).exists():
                    logger.warning("Subtitle file not found: %s", sub_path)
                    failed_captions.append({"language": bcp47, "name": label, "error": "字幕檔案不存在"})
                    continue

                try:
                    caption_body = {
                        "snippet": {
                            "videoId": video_id,
                            "language": bcp47,
                            "name": label[:100],
                            "isDraft": False,
                        }
                    }
                    caption_media = MediaFileUpload(sub_path, mimetype="text/vtt", resumable=False)
                    caption_res = (
                        service.captions().insert(part="snippet", body=caption_body, media_body=caption_media).execute()
                    )
                    uploaded_captions.append(
                        {
                            "caption_id": caption_res.get("id"),
                            "language": bcp47,
                            "name": label,
                        }
                    )
                    logger.info("Uploaded caption [%s] for video %s", bcp47, video_id)
                except Exception as cap_err:
                    logger.error("Failed to upload caption [%s]: %s", bcp47, cap_err)
                    failed_captions.append({"language": bcp47, "name": label, "error": str(cap_err)})

        # 3. Mark completed
        weverse_upload_store.update_task(
            owner_sub,
            task_id,
            {
                "status": "completed",
                "progress_percent": 100,
                "current_step": f"上傳全部完成！共發布 1 部影片與 {len(uploaded_captions)} 語系字幕。",
                "uploaded_captions": uploaded_captions,
                "failed_captions": failed_captions,
            },
        )
        logger.info("Upload task %s finished successfully", task_id)

    except Exception as exc:
        logger.exception("Upload task %s failed: %s", task_id, exc)
        weverse_upload_store.update_task(
            owner_sub,
            task_id,
            {
                "status": "failed",
                "error_message": str(exc),
                "current_step": f"上傳失敗：{exc}",
            },
        )
    finally:
        # Clean up temporary uploaded files if provided
        if temp_dir_to_clean and os.path.exists(temp_dir_to_clean):
            try:
                shutil.rmtree(temp_dir_to_clean, ignore_errors=True)
                logger.info("Cleaned up temp directory: %s", temp_dir_to_clean)
            except Exception as clean_err:
                logger.warning("Could not clean temp dir %s: %s", temp_dir_to_clean, clean_err)


def enqueue_upload_task(
    owner_sub: str,
    task_id: str,
    credentials: Any,
    video_path: str,
    title: str,
    description: str,
    privacy_status: str,
    subtitles: List[Dict[str, Any]],
    tags: Optional[List[str]] = None,
    category_id: str = "22",
    default_language: str = "ko",
    temp_dir_to_clean: Optional[str] = None,
) -> Future:
    """Submit the upload task to the thread pool."""
    global _upload_executor
    with _upload_executor_lock:
        if _upload_executor is None:
            _upload_executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="weverse_upload_worker")
        return _upload_executor.submit(
            execute_upload_task,
            owner_sub=owner_sub,
            task_id=task_id,
            credentials=credentials,
            video_path=video_path,
            title=title,
            description=description,
            privacy_status=privacy_status,
            subtitles=subtitles,
            tags=tags,
            category_id=category_id,
            default_language=default_language,
            temp_dir_to_clean=temp_dir_to_clean,
        )


def shutdown_upload_executor() -> None:
    """Drain upload workers during application shutdown."""
    global _upload_executor
    with _upload_executor_lock:
        executor, _upload_executor = _upload_executor, None
        if executor is not None:
            executor.shutdown(wait=True, cancel_futures=False)
