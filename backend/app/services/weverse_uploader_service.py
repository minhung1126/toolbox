"""Weverse YouTube upload service supporting resumable video and multi-language captions."""

import logging
import os
import shutil
import threading
from concurrent.futures import Future, ThreadPoolExecutor, wait
from pathlib import Path
from typing import Any, Dict, List, Optional

import googleapiclient.discovery
from googleapiclient.http import MediaFileUpload

from backend.app.core.weverse_upload_store import WeverseUploadStore, weverse_upload_store

logger = logging.getLogger(__name__)


class UploadInterrupted(Exception):
    """Stop between provider calls without automatically repeating an upload."""


INTERRUPTED_MESSAGE = "服務停止前未能確認上傳結果。為避免重複建立影片，請先檢查 YouTube Studio。"


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
    *,
    store: WeverseUploadStore | None = None,
    service_factory=None,
    stop_event: threading.Event | None = None,
) -> None:
    """Synchronous worker function that executes YouTube video and captions upload."""
    store = store if store is not None else weverse_upload_store
    service_factory = service_factory or _get_youtube_service

    def check_stopping():
        if stop_event is not None and stop_event.is_set():
            raise UploadInterrupted(INTERRUPTED_MESSAGE)

    logger.info("Starting Weverse YouTube upload task %s for user %s", task_id, owner_sub)
    try:
        check_stopping()
        service = service_factory(credentials)
        check_stopping()

        # 1. Prepare video upload request
        store.update_task(
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
            check_stopping()
            status, response = request.next_chunk()
            if status:
                # Video progress covers 5% to 80%
                percent = int(5 + status.progress() * 75)
                store.update_task(
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

        store.update_task(
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

        check_stopping()

        # 2. Upload subtitles
        uploaded_captions = []
        failed_captions = []
        enabled_subs = [s for s in subtitles if s.get("enabled", True)]
        total_subs = len(enabled_subs)

        if total_subs > 0:
            store.update_task(
                owner_sub,
                task_id,
                {
                    "status": "uploading_captions",
                },
            )

            for index, sub in enumerate(enabled_subs, start=1):
                check_stopping()
                sub_path = sub.get("full_path")
                bcp47 = sub.get("bcp47") or "zh-TW"
                label = sub.get("label") or bcp47

                sub_percent = int(80 + (index / total_subs) * 18)
                store.update_task(
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

        check_stopping()

        # 3. Mark completed
        store.update_task(
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

    except UploadInterrupted:
        store.interrupt_task(owner_sub, task_id, INTERRUPTED_MESSAGE)
    except Exception as exc:
        logger.exception("Upload task %s failed: %s", task_id, exc)
        store.update_task(
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


class UploadWorker:
    """App-owned queue with lazy threads, injectable provider, and bounded draining."""

    def __init__(
        self, store: WeverseUploadStore, service_factory=None, *, drain_timeout: float = 20.0, max_workers: int = 3
    ):
        if drain_timeout < 0:
            raise ValueError("drain_timeout must be non-negative")
        self.store = store
        self.service_factory = service_factory or _get_youtube_service
        self.drain_timeout = drain_timeout
        self.max_workers = max_workers
        self._executor = None
        self._lock = threading.RLock()
        self._accepting = True
        self._tasks = {}

    def start(self) -> None:
        with self._lock:
            if self._tasks:
                raise RuntimeError("Cannot restart while previous upload workers are still running")
            self.store.mark_active_tasks_interrupted()
            self._executor = None
            self._accepting = True

    def enqueue(self, **options) -> Future:
        with self._lock:
            if not self._accepting:
                raise RuntimeError("Upload queue is stopping")
            if self._executor is None:
                self._executor = ThreadPoolExecutor(
                    max_workers=self.max_workers, thread_name_prefix="weverse_upload_worker"
                )
            stop_event = threading.Event()
            future = self._executor.submit(
                execute_upload_task,
                **options,
                store=self.store,
                service_factory=self.service_factory,
                stop_event=stop_event,
            )
            self._tasks[future] = (options, stop_event)
            future.add_done_callback(self._finished)
            return future

    def _finished(self, future):
        with self._lock:
            record = self._tasks.pop(future, None)
        if record and future.cancelled():
            options, _ = record
            directory = options.get("temp_dir_to_clean")
            if directory:
                shutil.rmtree(directory, ignore_errors=True)

    def shutdown(self) -> int:
        """Stop admission, drain up to the deadline, and preserve uncertain work."""
        with self._lock:
            self._accepting = False
            executor = self._executor
            pending = dict(self._tasks)
        if executor is None:
            return 0
        _, unfinished = wait(pending, timeout=self.drain_timeout) if pending else (set(), set())
        try:
            for future in unfinished:
                options, stop_event = pending[future]
                stop_event.set()
                try:
                    self.store.interrupt_task(options["owner_sub"], options["task_id"], INTERRUPTED_MESSAGE)
                finally:
                    future.cancel()
        finally:
            # Set every cancellation signal even if a repository write fails.
            for future in unfinished:
                pending[future][1].set()
            executor.shutdown(wait=False, cancel_futures=True)
        return len(unfinished)


_default_worker: UploadWorker | None = None
_default_worker_lock = threading.Lock()


def default_upload_worker() -> UploadWorker:
    global _default_worker
    with _default_worker_lock:
        if _default_worker is None:
            _default_worker = UploadWorker(weverse_upload_store)
        return _default_worker


def enqueue_upload_task(**options) -> Future:
    return default_upload_worker().enqueue(**options)


def shutdown_upload_executor() -> None:
    if _default_worker is not None:
        _default_worker.shutdown()


def recover_interrupted_upload_tasks() -> int:
    """Startup never blindly retries an upload with an uncertain provider result."""
    return weverse_upload_store.mark_active_tasks_interrupted()
