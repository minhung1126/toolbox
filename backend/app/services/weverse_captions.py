"""Caption checkpoints and read-before-write reconciliation for existing videos."""

import logging
from copy import deepcopy
from pathlib import Path

from googleapiclient.http import MediaFileUpload

logger = logging.getLogger(__name__)


def caption_plan(subtitles: list[dict]) -> list[dict]:
    return [
        {
            "filename": sub.get("filename") or Path(sub.get("full_path") or "").name,
            "language": sub.get("bcp47") or "zh-TW",
            "name": (sub.get("label") or sub.get("bcp47") or "zh-TW")[:100],
            "status": "pending",
        }
        for sub in subtitles
        if sub.get("enabled", True)
    ]


def remote_captions(service, video_id: str) -> list[dict]:
    response = service.captions().list(part="snippet", videoId=video_id).execute()
    if not isinstance(response, dict) or not isinstance(response.get("items"), list):
        raise ValueError("Invalid caption listing")
    items = response["items"]
    if response.get("nextPageToken") or any(
        not isinstance(item, dict)
        or not item.get("id")
        or not isinstance(item.get("snippet"), dict)
        or not isinstance(item["snippet"].get("language"), str)
        or not isinstance(item["snippet"].get("name"), str)
        for item in items
    ):
        raise ValueError("Incomplete caption listing")
    return items


def upload_captions(service, video_id, subtitles, results, *, checkpoint, check_stopping, reconcile=False):
    results = deepcopy(results)
    files = {sub.get("filename") or Path(sub.get("full_path") or "").name: sub for sub in subtitles}
    check_stopping()
    remote = remote_captions(service, video_id) if reconcile else []
    checkpoint({"status": "uploading_captions"})
    for index, item in enumerate(results):
        check_stopping()
        if item["status"] == "uploaded":
            continue
        matches = [
            track
            for track in remote
            if track["snippet"]["language"] == item["language"] and track["snippet"]["name"] == item["name"]
        ]
        if matches:
            item.update(status="uploaded", caption_id=matches[0]["id"], reconciled=True)
            item.pop("error", None)
        else:
            sub = files.get(item["filename"], {})
            path = sub.get("full_path")
            if not path or not Path(path).is_file():
                # Preserve uncertainty if an earlier request may have committed.
                item.update(
                    status="missing_file" if item["status"] == "pending" else item["status"],
                    error="請重新選取此字幕檔案後補傳。",
                )
            elif reconcile and item["status"] == "unknown":
                # A list can be eventually consistent: absence cannot prove a timed-out insert failed.
                item.update(error="上次寫入結果不明且尚未查到字幕，請先至 YouTube Studio 核對；不自動重送。")
            else:
                item.update(status="unknown", error="字幕寫入結果待核對。")
                checkpoint({"caption_results": deepcopy(results)})
                check_stopping()
                try:
                    response = (
                        service.captions()
                        .insert(
                            part="snippet",
                            body={
                                "snippet": {
                                    "videoId": video_id,
                                    "language": item["language"],
                                    "name": item["name"],
                                    "isDraft": False,
                                }
                            },
                            media_body=MediaFileUpload(path, mimetype="application/octet-stream", resumable=False),
                        )
                        .execute()
                    )
                    if not isinstance(response, dict) or not isinstance(response.get("id"), str) or not response["id"]:
                        raise ValueError("Missing caption ID")
                    item.update(status="uploaded", caption_id=response["id"])
                    item.pop("error", None)
                except Exception:
                    # Do not expose provider exception text or retry an uncertain mutation.
                    logger.exception("Caption upload requires reconciliation")
                    checkpoint({"caption_results": deepcopy(results)})
                    break
        checkpoint(
            {
                "caption_results": deepcopy(results),
                "progress_percent": int(80 + (index + 1) / max(len(results), 1) * 18),
            }
        )
    return results


def public_task(task: dict) -> dict:
    """Normalize legacy errors as well as new checkpoints at the HTTP boundary."""
    result = deepcopy(task)
    if result.get("error_message"):
        result["error_message"] = "任務未完整完成，請核對 YouTube Studio 與字幕清單。"
        result["current_step"] = result["error_message"]
    for key in ("failed_captions", "caption_results"):
        for caption in result.get(key, []):
            if caption.get("error"):
                caption["error"] = "字幕尚待處理；請核對 YouTube Studio，或重新選取缺少的字幕檔。"
    return result
