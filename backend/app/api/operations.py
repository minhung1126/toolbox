"""Account-scoped journal queries. Reconciliation performs provider reads only."""

import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from backend.app.api.playlist_sort import get_playlist_client_factory, get_playlist_credential_store
from backend.app.api.youtube_helpers import _direct_workflow_response, _youtube_context_metadata, _youtube_thumbnail
from backend.app.api.youtube_workflow_dependencies import _quota_http_exception, get_youtube_workflow_service
from backend.app.core.dependencies import require_account_subject, require_youtube_context, require_ytmusic_context
from backend.app.core.error_contract import http_error
from backend.app.core.operation_store import OperationStore
from backend.app.services.operation_journal import get_operation_store, public_operation
from backend.app.services.playlist_sort_service import fetch_playlist_items_for_sort
from backend.app.services.provider_errors import map_youtube_error
from backend.app.services.sheets_service import normalize_text
from backend.app.services.youtube_errors import YouTubeQuotaUnavailable

router = APIRouter(prefix="/operations", tags=["Operations"])


def _reconcile_call_error(exc: Exception, *, context: Any, method: str) -> HTTPException:
    if isinstance(exc, YouTubeQuotaUnavailable):
        return _quota_http_exception(exc)
    if isinstance(exc, HTTPException):
        return exc
    return map_youtube_error(exc, method=method, youtube_slot=getattr(context, "slot", None)).to_http_exception()


def _update_progress_row(op: dict[str, Any], row: dict[str, Any], change_progress_fn: Any, **changes: Any) -> None:
    from backend.app.core.youtube_operation_state import PROGRESS_STATUSES

    progress = op.get("progress")
    rows = progress.get("rows") if isinstance(progress, dict) else None
    if (
        isinstance(progress, dict)
        and isinstance(progress.get("revision"), int)
        and isinstance(rows, list)
        and row.get("video_id") is not None
        and all(
            isinstance(item, dict) and item.get("video_id") is not None and item.get("status") in PROGRESS_STATUSES
            for item in rows
        )
    ):
        change_progress_fn(
            op,
            row["video_id"],
            playlist_item_id=row.get("playlist_item_id"),
            **changes,
        )
        return
    if isinstance(rows, list):
        target = next(
            (
                item
                for item in rows
                if isinstance(item, dict)
                and item.get("video_id") == row.get("video_id")
                and item.get("playlist_item_id") == row.get("playlist_item_id")
            ),
            row,
        )
        target.update(changes)
    else:
        row.update(changes)
    if isinstance(progress, dict) and isinstance(progress.get("counts"), dict) and isinstance(rows, list):
        counts = dict.fromkeys(PROGRESS_STATUSES, 0)
        for item in rows:
            if isinstance(item, dict) and item.get("status") in counts:
                counts[item["status"]] += 1
        progress["counts"] = counts


def _normalize_description(value: Any) -> str:
    return str(value or "").replace("\r\n", "\n").replace("\r", "\n")


def _has_real_set_video_id(entry: dict[str, Any]) -> bool:
    if "has_set_video_id" in entry:
        return bool(entry["has_set_video_id"])
    pid = str(entry.get("playlist_item_id") or "")
    vid = str(entry.get("video_id") or "")
    return bool(pid) and not (vid and pid.startswith(f"{vid}_"))


def _reconstruct_youtube_result(op: dict[str, Any], details: dict[str, Any], context: Any) -> dict[str, Any]:
    plan = op.get("plan") or {}
    if plan.get("video_id"):
        video_id = plan["video_id"]
        detail = details.get(video_id, {})
        snippet = detail.get("snippet") or {}
        return {
            "video_id": video_id,
            **_youtube_context_metadata(context),
            "title": snippet.get("title") or plan.get("title") or "",
            "description": snippet.get("description") if "description" in snippet else (plan.get("description") or ""),
            "thumbnail_url": _youtube_thumbnail(detail, video_id),
            "status": "succeeded",
            "reconciled": True,
        }
    latest_items: dict[str, dict[str, Any]] = {}
    for item in op.get("items", []):
        vid = item.get("remote_id", "")
        if vid:
            latest_items[vid] = item
    results = []
    for vid, item in latest_items.items():
        detail = details.get(vid, {})
        snippet = detail.get("snippet") or {}
        intended = item.get("intended") or {}
        results.append(
            {
                "video_id": vid,
                "youtube_slot": getattr(context, "slot", "primary"),
                "title": snippet.get("title") or intended.get("title") or vid,
                "description": snippet.get("description")
                if "description" in snippet
                else (intended.get("description") or ""),
                "thumbnail_url": _youtube_thumbnail(detail, vid),
                "status": "succeeded" if item.get("state") == "completed" else "failed",
                "reason": None if item.get("state") == "completed" else "唯讀核對確認遠端尚未更新。",
                "reconciled": True,
            }
        )
    response = _direct_workflow_response(op["kind"], results, slot=getattr(context, "slot", "primary"), context=context)
    response["reconciled"] = True
    return response


@router.get("")
def list_operations(owner=Depends(require_account_subject), store: OperationStore = Depends(get_operation_store)):
    return {"version": 1, "operations": [public_operation(operation, store) for operation in store.list(owner)]}


@router.get("/{operation_id}")
def get_operation(
    operation_id: str, owner=Depends(require_account_subject), store: OperationStore = Depends(get_operation_store)
):
    return public_operation(store.get(owner, operation_id), store)


def _check_channel(operation, context):
    if operation["channel_id"] and operation["channel_id"] != context.channel_id:
        raise http_error(409, "operation_channel_mismatch", "請連線至此作業原本的頻道再核對。")
    if operation["state"] in {"prepared", "running"}:
        # Reads may run during another process's write. Never mark an active plan completed.
        raise http_error(409, "operation_still_running", "作業仍在執行或已中斷；請稍後讀取紀錄。服務重啟後可重新核對。")


@router.post("/{operation_id}/reconcile-youtube")
def reconcile_youtube(
    operation_id: str,
    context=Depends(require_youtube_context),
    store: OperationStore = Depends(get_operation_store),
    service=Depends(get_youtube_workflow_service),
):
    operation = store.get(context.owner_sub, operation_id)
    if operation["kind"] not in {"youtube.metadata_update", "youtube.publish_cleanup", "youtube.metadata_publish"}:
        raise http_error(400, "operation_kind_mismatch", "此作業需要使用音樂播放清單核對。")
    operation = public_operation(operation, store)
    _check_channel(operation, context)
    snapshot = operation["plan"].get("preview_snapshot") or {}
    if operation["kind"] == "youtube.metadata_publish":
        return _reconcile_draft_publish(operation, context, store, service)
    if (
        operation["kind"] == "youtube.publish_cleanup"
        and snapshot.get("version") == 2
        and snapshot.get("mode") == "cleanup_only"
    ):
        return _reconcile_cleanup_only(operation, context, store, service)
    if not operation["items"] and operation.get("result") is None:
        if store.get(context.owner_sub, operation_id)["state"] != "failed_before_write":
            raise http_error(
                409, "operation_requires_reconciliation", "尚未確認原作業已結束，請稍後核對，不會重新送出。"
            )
        return public_operation(
            store.update(
                context.owner_sub,
                operation_id,
                lambda op: op.update(
                    state="failed_before_write", reconciliation={"provider_read": False, "no_writes_attempted": True}
                ),
            ),
            store,
        )
    expected_video_ids = snapshot.get("video_ids") or []
    ids = list(
        {item["remote_id"] for item in operation["items"] if item["phase"] in {"metadata", "publish"}}
        | (set(expected_video_ids) if operation["items"] and operation["kind"] == "youtube.publish_cleanup" else set())
    )
    try:
        details = {item["id"]: item for item in service.ports.fetch_video_details(context, ids)} if ids else {}
    except Exception as exc:
        raise _reconcile_call_error(exc, context=context, method="videos.list") from exc
    playlist = snapshot.get("playlist_id") or operation["plan"].get("playlist_id")
    try:
        raw_items = (
            service.ports.fetch_playlist_items(context, playlist)
            if playlist and operation["kind"] == "youtube.publish_cleanup"
            else []
        )
    except Exception as exc:
        raise _reconcile_call_error(exc, context=context, method="playlistItems.list") from exc
    playlist_ids = {item["id"] for item in raw_items}
    remaining_videos = {
        item.get("contentDetails", {}).get("videoId") or item.get("snippet", {}).get("resourceId", {}).get("videoId")
        for item in raw_items
    }

    def reconcile(op):
        verified_by_target: dict[tuple[str, str], bool] = {}
        for item in op["items"]:
            detail = details.get(item["remote_id"], {})
            if item["phase"] == "metadata":
                snippet = detail.get("snippet") or {}
                intended = item.get("intended") or {}
                title_matches = "title" not in intended or snippet.get("title") == intended.get("title")
                desc_matches = "description" not in intended or (
                    _normalize_description(snippet.get("description"))
                    == _normalize_description(intended.get("description"))
                )
                matched = bool(detail) and title_matches and desc_matches
            elif item["phase"] == "publish":
                matched = detail.get("status", {}).get("privacyStatus") == "public"
            else:
                matched = bool(playlist) and item["remote_id"] not in playlist_ids
            item["reconciliation"] = {"provider_read": True, "matches_intent": matched, "checked_at": time.time()}
            # An earlier success stays in history, while this read records current remote state.
            if matched and item["state"] != "failed_before_write":
                item["state"] = "completed"
            elif item["state"] in {"running", "needs_reconciliation"}:
                item["state"] = "failed"
            verified_by_target[(item["phase"], item["remote_id"])] = matched and item["state"] != "failed_before_write"
        # Missing/unattempted items must not be silently treated as completed.
        verified = list(verified_by_target.values())
        result = op.get("result")
        skipped_ids = (
            {
                row.get("video_id")
                for row in result.get("results", [])
                if isinstance(row, dict) and row.get("status") in {"skipped", "unchanged"} and row.get("video_id")
            }
            if isinstance(result, dict) and isinstance(result.get("results"), list)
            else set()
        )
        active_assignments = [
            assignment
            for assignment in op["plan"].get("assignments", [])
            if normalize_text(assignment.get("person") or "") not in {"", "不編輯"}
        ]
        expected = len(active_assignments) or (1 if op["plan"].get("video_id") else 0)
        seen = len({item["remote_id"] for item in op["items"] if item["phase"] == "metadata"} | skipped_ids)
        unknown = any(item["state"] in {"running", "needs_reconciliation"} for item in op["items"])
        all_skipped_completed = (
            not op["items"]
            and not op["plan"].get("video_id")
            and isinstance(result, dict)
            and isinstance(result.get("results"), list)
            and (bool(result["results"]) or expected == 0)
            and result.get("completed") is True
            and not unknown
            and (not active_assignments or seen >= expected)
            and all(
                isinstance(row, dict) and row.get("status") in {"skipped", "unchanged"} for row in result["results"]
            )
        )
        if op["kind"] == "youtube.publish_cleanup":
            complete = bool(expected_video_ids and playlist and op["items"]) and all(
                details.get(video_id, {}).get("status", {}).get("privacyStatus") == "public"
                and video_id not in remaining_videos
                for video_id in expected_video_ids
            )
        else:
            complete = (
                bool(verified)
                and all(verified)
                and (
                    seen >= expected > 0
                    or (expected == 0 and isinstance(result, dict) and result.get("completed") is True)
                )
            ) or all_skipped_completed
        op["state"] = "needs_reconciliation" if unknown else "completed" if complete else "partial"
        op["reconciliation"] = {"provider_read": True, "matches_intent": complete}
        if complete and op.get("result") is None:
            op["result"] = _reconstruct_youtube_result(op, details, context)
        elif isinstance(result, dict):
            reconciled_any = False
            if isinstance(result.get("results"), list):
                item_states: dict[str, list[str]] = {}
                for item in op["items"]:
                    item_states.setdefault(item["remote_id"], []).append(item["state"])
                for row in result["results"]:
                    if not isinstance(row, dict):
                        continue
                    vid = row.get("video_id")
                    if vid in item_states and row.get("status") in {"failed", "running", "needs_reconciliation"}:
                        states = item_states[vid]
                        latest_state = states[-1]
                        has_pending = any(state in {"running", "needs_reconciliation"} for state in states)
                        if (
                            latest_state == "completed"
                            and not has_pending
                            and verified_by_target.get(("metadata", vid), True)
                        ):
                            update_fields: dict[str, Any] = {
                                "status": "succeeded",
                                "reason": None,
                                "reconciled": True,
                            }
                            snippet = (details.get(vid) or {}).get("snippet") or {}
                            if "title" in row and "title" in snippet:
                                update_fields["title"] = snippet["title"]
                            if "description" in row and "description" in snippet:
                                update_fields["description"] = snippet["description"]
                            row.update(update_fields)
                            row.pop("error", None)
                            reconciled_any = True
                        elif latest_state == "failed" and not has_pending:
                            row.update(status="failed", reason="唯讀核對確認遠端尚未更新。", reconciled=True)
                            reconciled_any = True
                statuses = [str(row.get("status") or "") for row in result["results"] if isinstance(row, dict)]
                for key in ("succeeded", "skipped", "failed", "not_attempted"):
                    result[f"{key}_count"] = statuses.count(key)
                if "unchanged_count" in result or "unchanged" in statuses:
                    result["unchanged_count"] = statuses.count("unchanged")
                if (
                    any(not isinstance(row, dict) for row in result["results"])
                    or any(
                        status in {"failed", "not_attempted", "running", "needs_reconciliation"} for status in statuses
                    )
                    or (
                        not op["plan"].get("video_id")
                        and op["kind"] == "youtube.metadata_update"
                        and expected > 0
                        and not result["results"]
                    )
                ):
                    complete = False
                    op["state"] = "needs_reconciliation" if unknown else "partial"
                    op["reconciliation"]["matches_intent"] = False
            elif not op["plan"].get("video_id") and op["kind"] == "youtube.metadata_update":
                complete = False
                op["state"] = "needs_reconciliation" if unknown else "partial"
                op["reconciliation"]["matches_intent"] = False
            result["completed"] = complete
            if complete or reconciled_any:
                result["reconciled"] = True

    return public_operation(store.update(context.owner_sub, operation_id, reconcile), store)


def _reconcile_cleanup_only(operation, context, store, service):
    from backend.app.core.youtube_operation_state import change_progress

    if not operation["items"] and operation.get("result") is None:
        if store.get(context.owner_sub, operation["id"])["state"] == "failed_before_write":
            return public_operation(
                store.update(
                    context.owner_sub,
                    operation["id"],
                    lambda op: op.update(
                        state="failed_before_write",
                        reconciliation={"provider_read": False, "no_writes_attempted": True},
                    ),
                ),
                store,
            )
        if not operation.get("progress"):
            raise http_error(
                409, "operation_requires_reconciliation", "尚未確認原作業已結束，請稍後核對，不會重新送出。"
            )

    snapshot = operation["plan"]["preview_snapshot"]
    playlist = snapshot["playlist_id"]
    try:
        members = {item["id"] for item in service.ports.fetch_playlist_items(context, playlist)}
    except Exception as exc:
        raise _reconcile_call_error(exc, context=context, method="playlistItems.list") from exc

    def reconcile(op):
        cleanup_attempts_by_id: dict[str, list[dict[str, Any]]] = {}
        for attempt in op.get("items", []):
            matched = bool(playlist) and attempt.get("phase") == "cleanup" and attempt.get("remote_id") not in members
            attempt["reconciliation"] = {"provider_read": True, "matches_intent": matched, "checked_at": time.time()}
            if matched and attempt.get("state") != "failed_before_write":
                attempt["state"] = "completed"
            elif attempt.get("state") in {"running", "needs_reconciliation"}:
                attempt["state"] = "failed"
            if attempt.get("phase") == "cleanup" and attempt.get("remote_id"):
                cleanup_attempts_by_id.setdefault(attempt["remote_id"], []).append(attempt)
        attempted = {
            remote_id
            for remote_id, attempts in cleanup_attempts_by_id.items()
            if attempts[-1].get("state") != "failed_before_write"
        }
        raw_progress = op.get("progress")
        raw_progress_rows = raw_progress.get("rows") if isinstance(raw_progress, dict) else None
        if isinstance(raw_progress_rows, list):
            for row in list(raw_progress_rows):
                if not isinstance(row, dict):
                    continue
                pid = row.get("playlist_item_id")
                status = row.get("status")
                if pid and pid in attempted and status != "skipped":
                    if pid not in members:
                        _update_progress_row(
                            op,
                            row,
                            change_progress,
                            status="succeeded",
                            confirmation="provider_read",
                            reason="唯讀核對確認清單成員已移除。",
                        )
                    elif status in {"queued", "running", "needs_reconciliation"}:
                        _update_progress_row(
                            op,
                            row,
                            change_progress,
                            status="failed",
                            confirmation="provider_read",
                            reason="唯讀核對確認清單成員尚未移除。",
                        )
                elif status in {"queued", "running", "needs_reconciliation"}:
                    _update_progress_row(
                        op,
                        row,
                        change_progress,
                        status="not_attempted",
                        reason="作業中斷，尚未執行寫入。",
                    )
        progress_rows = (
            [row for row in raw_progress_rows if isinstance(row, dict)] if isinstance(raw_progress_rows, list) else []
        )
        progress_completed = (
            all(isinstance(row, dict) and row.get("status") in {"succeeded", "skipped"} for row in raw_progress_rows)
            if isinstance(raw_progress_rows, list)
            else not raw_progress
        )
        items_completed = not any(
            attempts[-1].get("state") in {"failed", "running", "needs_reconciliation"}
            for attempts in cleanup_attempts_by_id.values()
        ) and not any(
            item.get("state") in {"failed", "running", "needs_reconciliation"}
            for item in op.get("items", [])
            if not (item.get("phase") == "cleanup" and item.get("remote_id"))
        )
        result = op.get("result")
        if isinstance(result, dict):
            has_valid_results_list = isinstance(result.get("results"), list)
            result_rows = result.get("results") if has_valid_results_list else []
            if (not has_valid_results_list or not result_rows) and progress_rows:
                result_rows = [dict(row) for row in progress_rows]
                result["results"] = result_rows
                result["total_count"] = len(result_rows)
                has_valid_results_list = True
            for row in result_rows:
                if not isinstance(row, dict):
                    continue
                pid = row.get("playlist_item_id")
                status = row.get("status")
                if pid and pid in attempted and status != "skipped":
                    if pid not in members:
                        row.update(
                            status="succeeded", confirmation="provider_read", reason="唯讀核對確認清單成員已移除。"
                        )
                    elif status in {"queued", "running", "needs_reconciliation"}:
                        row.update(
                            status="failed", confirmation="provider_read", reason="唯讀核對確認清單成員尚未移除。"
                        )
                elif status in {"queued", "running", "needs_reconciliation"}:
                    row.update(status="not_attempted", reason="作業中斷，尚未執行寫入。")
            for status in ("succeeded", "skipped", "failed", "not_attempted", "needs_reconciliation"):
                result[f"{status}_count"] = sum(
                    isinstance(row, dict) and row.get("status") == status for row in result_rows
                )
            result_rows_completed = (
                has_valid_results_list
                and (bool(result_rows) or not (op.get("items") or progress_rows))
                and all(isinstance(row, dict) and row.get("status") in {"succeeded", "skipped"} for row in result_rows)
            )
            result["completed"] = bool(result_rows_completed and progress_completed and items_completed)
            result["reconciled"] = True
        elif op.get("progress"):
            rows = [dict(row) for row in progress_rows]
            counts = {
                status: sum(row.get("status") == status for row in rows)
                for status in ("succeeded", "skipped", "failed", "not_attempted", "needs_reconciliation")
            }
            result = {
                "version": 2,
                "mode": "cleanup_only",
                "operation": "youtube.publish_cleanup",
                "playlist_id": playlist,
                "youtube_channel_id": getattr(context, "channel_id", None),
                "youtube_slot": getattr(context, "slot", "primary"),
                "completed": bool(
                    (bool(rows) or not op.get("items"))
                    and all(row.get("status") in {"succeeded", "skipped"} for row in rows)
                    and progress_completed
                    and items_completed
                ),
                "total_count": len(rows),
                **{f"{key}_count": value for key, value in counts.items()},
                "quota_blocked": False,
                "results": rows,
                "reconciled": True,
            }
            op["result"] = result
        elif op.get("items"):
            snapshot_items = snapshot.get("items") if isinstance(snapshot.get("items"), list) else []
            latest_attempts = {remote_id: attempts[-1] for remote_id, attempts in cleanup_attempts_by_id.items()}
            slot = getattr(context, "slot", "primary")
            if snapshot_items:
                rows = []
                for snap_row in snapshot_items:
                    if not isinstance(snap_row, dict):
                        continue
                    pid = snap_row.get("playlist_item_id")
                    base = {**snap_row, "youtube_slot": slot}
                    attempt = latest_attempts.get(pid) if pid else None
                    if not snap_row.get("candidate", True):
                        rows.append({**base, "status": "skipped"})
                    elif attempt is None:
                        rows.append({**base, "status": "not_attempted", "reason": "作業中斷，尚未執行寫入。"})
                    elif attempt.get("state") == "failed_before_write":
                        rows.append(
                            {
                                **base,
                                "status": "skipped",
                                "reason": snap_row.get("reason") or "刪除前已非公開或無法確認，保留清單成員。",
                            }
                        )
                    elif attempt.get("state") == "completed":
                        rows.append(
                            {
                                **base,
                                "status": "succeeded",
                                "confirmation": "provider_read",
                                "reason": "唯讀核對確認清單成員已移除。",
                            }
                        )
                    elif attempt.get("state") in {"running", "needs_reconciliation"}:
                        rows.append({**base, "status": "needs_reconciliation"})
                    else:
                        rows.append(
                            {
                                **base,
                                "status": "failed",
                                "confirmation": "provider_read",
                                "reason": "唯讀核對確認清單成員尚未移除。",
                            }
                        )
            else:
                rows = [
                    {
                        "playlist_id": playlist,
                        "playlist_item_id": attempt["remote_id"],
                        "status": "skipped"
                        if attempt.get("state") == "failed_before_write"
                        else "succeeded"
                        if attempt.get("state") == "completed"
                        else "needs_reconciliation"
                        if attempt.get("state") in {"running", "needs_reconciliation"}
                        else "failed",
                        "confirmation": "provider_read",
                    }
                    for attempt in latest_attempts.values()
                ]
            counts = {
                status: sum(row.get("status") == status for row in rows)
                for status in ("succeeded", "skipped", "failed", "not_attempted", "needs_reconciliation")
            }
            result = {
                "version": 2,
                "mode": "cleanup_only",
                "operation": "youtube.publish_cleanup",
                "playlist_id": playlist,
                "youtube_channel_id": getattr(context, "channel_id", None),
                "youtube_slot": slot,
                "completed": bool(
                    (bool(rows) or not op.get("items"))
                    and all(row.get("status") in {"succeeded", "skipped"} for row in rows)
                    and progress_completed
                    and items_completed
                ),
                "total_count": len(rows),
                **{f"{key}_count": value for key, value in counts.items()},
                "quota_blocked": False,
                "results": rows,
                "reconciled": True,
            }
            op["result"] = result
        unknown = any(item.get("state") in {"running", "needs_reconciliation"} for item in op.get("items", []))
        complete = bool(
            not unknown and result and result.get("completed") is True and progress_completed and items_completed
        )
        op["state"] = "needs_reconciliation" if unknown else "completed" if complete else "partial"
        op["reconciliation"] = {"provider_read": True, "matches_intent": op["state"] == "completed"}

    return public_operation(store.update(context.owner_sub, operation["id"], reconcile), store)


def _reconcile_publish_progress(operation, context, store, service):
    from backend.app.core.youtube_operation_state import change_progress
    from backend.app.services.youtube_service import video_matches_public_draft

    recheckable_attempts = {
        attempt["remote_id"]
        for attempt in operation.get("items", [])
        if attempt.get("state") in {"running", "needs_reconciliation", "failed"}
    }
    raw_progress = operation.get("progress")
    raw_rows = raw_progress.get("rows") if isinstance(raw_progress, dict) else None
    pending = (
        [
            row
            for row in raw_rows
            if isinstance(row, dict)
            and row.get("video_id")
            and (
                row.get("status") in {"running", "needs_reconciliation"}
                or (row.get("status") in {"queued", "failed"} and row.get("video_id") in recheckable_attempts)
            )
        ]
        if isinstance(raw_rows, list)
        else []
    )
    try:
        details = (
            {
                item["id"]: item
                for item in service.ports.fetch_video_details(context, [row["video_id"] for row in pending])
            }
            if pending
            else {}
        )
    except Exception as exc:
        raise _reconcile_call_error(exc, context=context, method="videos.list") from exc

    def reconcile(op):
        for row in pending:
            matched = video_matches_public_draft(
                details.get(row["video_id"], {}), row.get("title", ""), row.get("description", "")
            )
            for attempt in op["items"]:
                if attempt["remote_id"] == row["video_id"]:
                    attempt["reconciliation"] = {
                        "provider_read": True,
                        "matches_intent": matched,
                        "checked_at": time.time(),
                    }
                    if matched and attempt["state"] in {"running", "needs_reconciliation", "failed"}:
                        attempt["state"] = "completed"
                    elif not matched and attempt["state"] in {"running", "needs_reconciliation"}:
                        attempt["state"] = "failed"
            if matched:
                _update_progress_row(
                    op,
                    row,
                    change_progress,
                    status="succeeded" if row.get("attempted_parts") else "unchanged",
                    confirmation="provider_read",
                    reason="唯讀核對確認最終文字與公開狀態。",
                )
            elif row.get("status") in {"queued", "running", "needs_reconciliation"}:
                _update_progress_row(
                    op,
                    row,
                    change_progress,
                    status="failed",
                    confirmation="provider_read",
                    reason="唯讀核對確認遠端尚未更新。",
                )
        op_progress = op.get("progress")
        op_raw_rows = op_progress.get("rows") if isinstance(op_progress, dict) else None
        if isinstance(op_raw_rows, list):
            for row in list(op_raw_rows):
                if isinstance(row, dict) and row.get("status") == "queued" and row.get("video_id"):
                    _update_progress_row(
                        op,
                        row,
                        change_progress,
                        status="not_attempted",
                        reason="作業中斷，尚未執行寫入。",
                    )
        rows = [row for row in op_raw_rows if isinstance(row, dict)] if isinstance(op_raw_rows, list) else []
        progress_valid = (
            isinstance(op_progress, dict)
            and isinstance(op_raw_rows, list)
            and all(isinstance(row, dict) for row in op_raw_rows)
        )
        raw_counts = op_progress.get("counts") if isinstance(op_progress, dict) else None
        if isinstance(raw_counts, dict) and all(
            key in raw_counts
            for key in ("succeeded", "unchanged", "skipped", "failed", "not_attempted", "needs_reconciliation")
        ):
            counts = raw_counts
        else:
            counts = {
                status: sum(row.get("status") == status for row in rows)
                for status in (
                    "queued",
                    "running",
                    "succeeded",
                    "unchanged",
                    "skipped",
                    "failed",
                    "not_attempted",
                    "needs_reconciliation",
                )
            }
        complete = progress_valid and all(row.get("status") in {"succeeded", "unchanged", "skipped"} for row in rows)
        op["result"] = {
            "operation": "youtube.metadata_publish",
            "operation_id": op["id"],
            "completed": complete,
            "total_count": len(rows),
            "results": [dict(row) for row in rows],
            **{f"{key}_count": value for key, value in counts.items()},
        }
        op["state"] = (
            "needs_reconciliation" if counts["needs_reconciliation"] else "completed" if complete else "partial"
        )
        op["reconciliation"] = {"provider_read": bool(pending), "matches_intent": complete}

    return public_operation(store.update(context.owner_sub, operation["id"], reconcile), store)


def _reconcile_draft_publish(operation, context, store, service):
    from backend.app.services.youtube_service import video_matches_public_draft

    if operation.get("progress"):
        return _reconcile_publish_progress(operation, context, store, service)

    if not operation["items"] and operation.get("result") is None:
        # An empty running plan may belong to another live worker. Only a
        # durable preflight failure proves it cannot still start a write.
        if store.get(context.owner_sub, operation["id"])["state"] != "failed_before_write":
            raise http_error(
                409, "operation_requires_reconciliation", "尚未確認原作業已結束，請稍後核對，不會重新送出。"
            )
        return public_operation(
            store.update(
                context.owner_sub,
                operation["id"],
                lambda op: op.update(
                    state="failed_before_write", reconciliation={"provider_read": False, "no_writes_attempted": True}
                ),
            ),
            store,
        )

    raw_plan = ((operation.get("plan") or {}).get("preview_snapshot") or {}).get("plan") or []
    plan = raw_plan if isinstance(raw_plan, list) else []
    active = {
        item["video_id"]: item
        for item in plan
        if isinstance(item, dict) and item.get("video_id") and item.get("status") != "skipped"
    }
    writable_active = {vid for vid, item in active.items() if item.get("status") != "unchanged"}
    try:
        details = (
            {item["id"]: item for item in service.ports.fetch_video_details(context, list(active))} if active else {}
        )
    except Exception as exc:
        raise _reconcile_call_error(exc, context=context, method="videos.list") from exc
    matches = {
        video_id: video_matches_public_draft(
            details.get(video_id, {}), item.get("title", ""), item.get("description", "")
        )
        for video_id, item in active.items()
    }

    def reconcile(op):
        verified_by_video: dict[str, bool] = {}
        item_states: dict[str, list[str]] = {}
        for item in op.get("items", []):
            vid = item.get("remote_id") or ""
            matched = matches.get(vid, False)
            item["reconciliation"] = {"provider_read": True, "matches_intent": matched, "checked_at": time.time()}
            if matched and item.get("state") != "failed_before_write":
                item["state"] = "completed"
            elif item.get("state") in {"running", "needs_reconciliation"}:
                item["state"] = "failed"
            if vid:
                item_states.setdefault(vid, []).append(str(item.get("state") or ""))
                verified_by_video[vid] = matched and item.get("state") != "failed_before_write"
        result = op.get("result")
        if isinstance(result, dict):
            result_rows = result.get("results") if isinstance(result.get("results"), list) else None
            if result_rows is not None:
                for row in result_rows:
                    if not isinstance(row, dict):
                        continue
                    vid = row.get("video_id")
                    if vid in item_states and row.get("status") in {"failed", "running", "needs_reconciliation"}:
                        states = item_states[vid]
                        latest_state = states[-1]
                        has_pending = any(state in {"running", "needs_reconciliation"} for state in states)
                        if latest_state == "completed" and not has_pending and verified_by_video.get(vid, False):
                            row.update(
                                status="succeeded",
                                reason="唯讀核對已確認文字與公開狀態。",
                                reconciled=True,
                            )
                            row.pop("error", None)
                        elif latest_state == "failed" and not has_pending:
                            row.update(
                                status="failed",
                                reason="唯讀核對確認遠端尚未更新。",
                                reconciled=True,
                            )
                for status in ("succeeded", "unchanged", "skipped", "failed", "not_attempted", "needs_reconciliation"):
                    result[f"{status}_count"] = sum(
                        isinstance(row, dict) and row.get("status") == status for row in result_rows
                    )
                result_completed = (bool(result_rows) or not active) and all(
                    isinstance(row, dict) and row.get("status") in {"succeeded", "unchanged", "skipped"}
                    for row in result_rows
                )
            else:
                result_completed = False
        else:
            rebuilt_rows = []
            for item in plan:
                if not isinstance(item, dict):
                    continue
                vid = item.get("video_id")
                if not vid:
                    continue
                base = {key: item[key] for key in ("video_id", "title", "description", "person") if key in item}
                base["youtube_slot"] = getattr(context, "slot", "primary")
                states = item_states.get(vid, [])
                latest_state = states[-1] if states else None
                if item.get("status") == "skipped":
                    rebuilt_rows.append({**base, "status": "skipped", "reason": item.get("reason", "")})
                elif item.get("status") == "unchanged" and matches.get(vid):
                    rebuilt_rows.append(
                        {
                            **base,
                            "status": "unchanged",
                            "reason": "唯讀核對已確認文字與公開狀態。",
                            "reconciled": True,
                        }
                    )
                elif latest_state == "completed" and verified_by_video.get(vid, False):
                    rebuilt_rows.append(
                        {
                            **base,
                            "status": "succeeded"
                            if item.get("parts") or item.get("status") != "unchanged"
                            else "unchanged",
                            "reason": "唯讀核對已確認文字與公開狀態。",
                            "reconciled": True,
                        }
                    )
                elif latest_state == "failed_before_write":
                    rebuilt_rows.append({**base, "status": "not_attempted", "reason": "尚未執行寫入。"})
                elif vid in item_states:
                    rebuilt_rows.append(
                        {
                            **base,
                            "status": "needs_reconciliation"
                            if any(state in {"running", "needs_reconciliation"} for state in states)
                            else "failed",
                            "reason": "唯讀核對確認遠端尚未更新。",
                            "reconciled": True,
                        }
                    )
                else:
                    rebuilt_rows.append({**base, "status": "not_attempted", "reason": "尚未執行寫入。"})
            counts = {
                status: sum(row["status"] == status for row in rebuilt_rows)
                for status in ("succeeded", "unchanged", "skipped", "failed", "not_attempted", "needs_reconciliation")
            }
            op["result"] = {
                "operation": "youtube.metadata_publish",
                "youtube_slot": getattr(context, "slot", "primary"),
                "completed": False,
                "total_count": len(rebuilt_rows),
                **{f"{status}_count": count for status, count in counts.items()},
                "quota_blocked": False,
                "results": rebuilt_rows,
                "reconciled": True,
            }
            result_completed = not (counts["failed"] or counts["not_attempted"] or counts["needs_reconciliation"])
        unknown = any(item.get("state") in {"running", "needs_reconciliation"} for item in op.get("items", []))
        items_complete = (not writable_active or writable_active.issubset(item_states)) and all(
            states[-1] == "completed" and verified_by_video.get(vid, False) for vid, states in item_states.items()
        )
        complete = not unknown and bool(plan) and all(matches.values()) and items_complete and result_completed
        op["result"]["completed"] = complete
        op["result"]["reconciled"] = True
        op["state"] = "needs_reconciliation" if unknown else "completed" if complete else "partial"
        op["reconciliation"] = {"provider_read": True, "matches_intent": complete, "videos": matches}

    return public_operation(store.update(context.owner_sub, operation["id"], reconcile), store)


@router.post("/{operation_id}/reconcile-music")
def reconcile_music(
    operation_id: str,
    context=Depends(require_ytmusic_context),
    store: OperationStore = Depends(get_operation_store),
    token_store=Depends(get_playlist_credential_store),
    client_factory=Depends(get_playlist_client_factory),
):
    operation = public_operation(store.get(context.owner_sub, operation_id), store)
    if operation["kind"] != "youtube.playlist_sort":
        raise http_error(400, "operation_kind_mismatch", "此作業需要使用影片核對。")
    _check_channel(operation, context)
    plan = operation["plan"]
    playlist = (
        plan.get("playlist_id")
        if plan.get("mode") == "in_place"
        else (operation.get("result") or {}).get("new_playlist_id")
    )
    if not playlist:
        playlist = next(
            (
                item.get("evidence", {}).get("id")
                for item in operation["items"]
                if item["phase"] in {"ytmusic_create", "playlists.insert"} and item.get("evidence", {}).get("id")
            ),
            None,
        )
    if not playlist:
        if not operation["items"] and operation.get("result") is None:
            if store.get(context.owner_sub, operation_id)["state"] == "failed_before_write":
                return public_operation(
                    store.update(
                        context.owner_sub,
                        operation_id,
                        lambda op: op.update(
                            state="failed_before_write",
                            reconciliation={"provider_read": False, "no_writes_attempted": True},
                        ),
                    ),
                    store,
                )
        raise http_error(
            409, "operation_remote_id_unknown", "新歌單 ID 未確認，請先在 YouTube Music 核對；不會再次建立。"
        )
    try:
        items = fetch_playlist_items_for_sort(
            context,
            playlist,
            fetch_album_details=False,
            use_ytdlp_fallback=False,
            language=plan.get("language"),
            location=plan.get("location"),
            token_store=token_store,
            client_factory=client_factory,
        )
    except Exception as exc:
        raise _reconcile_call_error(exc, context=context, method="playlistItems.list") from exc
    expected = plan.get("validated_order")
    use_set_ids = (
        plan.get("mode") == "in_place"
        and bool(items)
        and bool(expected)
        and all(_has_real_set_video_id(item) for item in items)
        and all(_has_real_set_video_id(entry) for entry in expected)
    )
    matched = bool(expected) and (
        [item.get("playlist_item_id") for item in items] == [entry["playlist_item_id"] for entry in expected]
        if use_set_ids
        else [item.get("video_id") for item in items] == [entry.get("video_id") for entry in expected]
    )

    def reconcile(op):
        for attempt in op["items"]:
            attempt["reconciliation"] = {
                "provider_read": True,
                "matches_intent": matched,
                "checked_at": time.time(),
            }
            if matched and attempt["state"] in {"running", "needs_reconciliation"}:
                attempt["state"] = "completed"
            elif not matched and attempt["state"] in {"running", "needs_reconciliation"}:
                attempt["state"] = "failed"
        unknown = any(item["state"] in {"running", "needs_reconciliation"} for item in op["items"])
        op["state"] = "completed" if matched else "needs_reconciliation" if unknown else "partial"
        op["reconciliation"] = {"provider_read": True, "matches_intent": matched, "playlist_id": playlist}
        if matched and op.get("result") is None:
            mode = plan.get("mode", "in_place")
            total = len(expected or [])
            result_payload = {
                "operation": "playlist_sort",
                "mode": mode,
                "total": total,
                "moved": total,
                "succeeded": total,
                "failed": 0,
                "failed_items": [],
                "quota_used": 0,
                "reconciled": True,
            }
            if mode == "new_playlist":
                result_payload["new_playlist_id"] = playlist
                result_payload["new_playlist_url"] = f"https://www.youtube.com/playlist?list={playlist}"
            op["result"] = result_payload

    return public_operation(store.update(context.owner_sub, operation_id, reconcile), store)
