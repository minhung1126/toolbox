from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException

from backend.app.api.youtube_models import BatchUpdateInput, PublishCleanupInput
from backend.app.services.youtube_errors import YouTubeQuotaUnavailable


class YoutubeWorkflowService:
    """Coordinate YouTube use cases through explicitly supplied adapters.

    The API layer supplies the current adapter set, which keeps provider and
    storage calls replaceable in tests while the workflows remain independent
    of FastAPI route registration.
    """

    def __init__(self, dependencies: dict[str, Any]):
        self.dependencies = dependencies

    def create_batch_metadata_preview(self, payload: BatchUpdateInput, *, creds, sheet_creds):
        """Build a signed, account-bound batch plan without performing writes."""
        youtube_context = creds
        spreadsheet_id, title_column, description_column, all_assignments, active_assignments = self.dependencies[
            "_validate_batch_inputs"
        ](payload, youtube_context.owner_sub, action_label="預覽")
        playlist_id = self.dependencies["_resolve_playlist_id"](youtube_context, payload.playlist_id)
        normalized_team = self.dependencies["normalize_text"](payload.team)
        try:
            headers, sheet_rows = self.dependencies["_load_and_validate_sheet_data"](
                sheet_creds, spreadsheet_id, payload.worksheet_name, title_column, description_column
            )
            sheet_state = self.dependencies["sheet_snapshot"](
                spreadsheet_id, payload.worksheet_name, headers, sheet_rows
            )
            if playlist_id:
                playlist_state = self.dependencies["playlist_snapshot"](
                    self.dependencies["fetch_playlist_items"](youtube_context, playlist_id)
                )
            else:
                playlist_state = self.dependencies["playlist_snapshot"](
                    [{"id": "", "contentDetails": {"videoId": video_id}} for video_id, _ in active_assignments]
                )
            requested_video_ids = [video_id for video_id, _ in all_assignments]
            active_video_ids = [video_id for video_id, _ in active_assignments]
            if playlist_id and (not set(requested_video_ids).issubset(set(playlist_state["video_ids"]))):
                raise self.dependencies["_stale_preview_exception"]()
            details_map = {
                item["id"]: item
                for item in self.dependencies["fetch_video_details"](youtube_context, requested_video_ids)
                if item.get("id")
            }
            request_state = self.dependencies["input_digest"](
                {
                    "spreadsheet_id": spreadsheet_id,
                    "worksheet_name": payload.worksheet_name,
                    "title_column": title_column,
                    "description_column": description_column,
                    "team": normalized_team,
                    "assignments": active_assignments,
                    "video_snapshot": self.dependencies["video_snapshot_digest"](details_map, active_video_ids),
                }
            )
            plan = []
            for video_id, person in all_assignments:
                detail = details_map.get(video_id) or {}
                snippet = detail.get("snippet") or {}
                current_title = str(snippet.get("title") or "")
                current_description = str(snippet.get("description") or "")
                matches = [
                    row for row in sheet_rows if self.dependencies["matches_team_person"](row, normalized_team, person)
                ]
                reason = ""
                new_title = ""
                new_description = ""
                status = "ready"
                if not person or person == "不編輯":
                    status = "skipped"
                    reason = "未指定人物"
                elif not detail:
                    status = "skipped"
                    reason = "找不到指定的 YouTube 影片，或目前帳號無權存取。"
                else:
                    skip_reason, new_title, new_description = self.dependencies["_resolve_person_metadata"](
                        matches, normalized_team, person, title_column, description_column
                    )
                    if skip_reason:
                        status = "skipped"
                        reason = skip_reason
                plan.append(
                    {
                        "videoId": video_id,
                        "video_id": video_id,
                        "person": person,
                        "currentTitle": current_title,
                        "currentDescription": current_description,
                        "newTitle": new_title,
                        "newDescription": new_description,
                        "status": status,
                        "willUpdate": status == "ready",
                        "reason": reason,
                        "thumbnailUrl": self.dependencies["_youtube_thumbnail"](detail, video_id),
                    }
                )
            preview_token = self.dependencies["build_preview_token"](
                owner_sub=youtube_context.owner_sub,
                youtube_slot=youtube_context.slot,
                operation="youtube.batch_update",
                playlist_id=playlist_id,
                playlist=playlist_state,
                sheet=sheet_state,
                request_digest=request_state,
            )
            preview_snapshot = {
                "spreadsheet_id": spreadsheet_id,
                "worksheet_name": payload.worksheet_name,
                "playlist_id": playlist_id,
                "youtube_slot": youtube_context.slot,
                "youtube_channel_id": youtube_context.channel_id,
                "youtube_routing_mode": youtube_context.routing_mode,
                "youtube_slot_reason": youtube_context.selection_reason,
                "sheet_digest": sheet_state["sheet_digest"],
                "playlist_digest": playlist_state["playlist_digest"],
                "video_ids": requested_video_ids,
                "plan": plan,
            }
            return {
                "preview_token": preview_token,
                "preview_snapshot": preview_snapshot,
                "plan": plan,
                "playlist_id": playlist_id,
                **self.dependencies["_youtube_context_metadata"](youtube_context),
            }
        except YouTubeQuotaUnavailable as exc:
            raise self.dependencies["_quota_http_exception"](exc) from exc
        except HTTPException:
            raise
        except Exception as exc:
            self.dependencies["logger"].error(
                "Batch metadata preview failed for slot %s: %s", youtube_context.slot, type(exc).__name__
            )
            raise self.dependencies["map_youtube_error"](
                exc, method="videos.list", youtube_slot=youtube_context.slot
            ).to_http_exception() from exc

    def run_batch_metadata_update(self, payload: BatchUpdateInput, *, creds, sheet_creds):
        """Validate and update selected videos synchronously, returning one result per video."""
        youtube_context = creds
        active_context = youtube_context
        attempted_slots = {active_context.slot}
        fallback_estimate = max(int(youtube_context.estimated_units or 0), 1)
        spreadsheet_id, title_column, description_column, _, active_assignments = self.dependencies[
            "_validate_batch_inputs"
        ](payload, youtube_context.owner_sub, action_label="執行")
        playlist_id = self.dependencies["_resolve_playlist_id"](youtube_context, payload.playlist_id)
        normalized_team = self.dependencies["normalize_text"](payload.team)
        try:
            headers, sheet_rows = self.dependencies["_load_and_validate_sheet_data"](
                sheet_creds, spreadsheet_id, payload.worksheet_name, title_column, description_column
            )
            sheet_state = self.dependencies["sheet_snapshot"](
                spreadsheet_id, payload.worksheet_name, headers, sheet_rows
            )
            if playlist_id:
                active_context, current_playlist_items = self.dependencies[
                    "_run_youtube_operation_with_quota_fallback"
                ](
                    active_context,
                    lambda context: self.dependencies["fetch_playlist_items"](context, playlist_id),
                    estimated_units=fallback_estimate,
                    attempted_slots=attempted_slots,
                )
                initial_playlist_state = self.dependencies["playlist_snapshot"](current_playlist_items)
            else:
                initial_playlist_state = self.dependencies["playlist_snapshot"](
                    [{"id": "", "contentDetails": {"videoId": video_id}} for video_id, _person in active_assignments]
                )
            requested_video_ids = [video_id for video_id, _person in active_assignments]
            if playlist_id and (not set(requested_video_ids).issubset(set(initial_playlist_state["video_ids"]))):
                raise self.dependencies["_stale_preview_exception"]()
            prepared: list[dict] = []
            for video_id, person in active_assignments:
                matches = [
                    row for row in sheet_rows if self.dependencies["matches_team_person"](row, normalized_team, person)
                ]
                skip_reason, new_title, new_description = self.dependencies["_resolve_person_metadata"](
                    matches, normalized_team, person, title_column, description_column
                )
                if skip_reason:
                    prepared.append(
                        {"video_id": video_id, "person": person, "status": "skipped", "reason": skip_reason}
                    )
                else:
                    prepared.append(
                        {
                            "video_id": video_id,
                            "person": person,
                            "status": "pending",
                            "new_title": new_title,
                            "new_description": new_description,
                        }
                    )
            active_context, video_details = self.dependencies["_run_youtube_operation_with_quota_fallback"](
                active_context,
                lambda context: self.dependencies["fetch_video_details"](
                    context, [item["video_id"] for item in prepared]
                ),
                estimated_units=fallback_estimate,
                attempted_slots=attempted_slots,
            )
            details_map = {item["id"]: item for item in video_details if item.get("id")}
            request_state = self.dependencies["input_digest"](
                {
                    "spreadsheet_id": spreadsheet_id,
                    "worksheet_name": payload.worksheet_name,
                    "title_column": title_column,
                    "description_column": description_column,
                    "team": normalized_team,
                    "assignments": active_assignments,
                    "video_snapshot": self.dependencies["video_snapshot_digest"](details_map, requested_video_ids),
                }
            )
            submitted_preview_snapshot = payload.preview_snapshot if isinstance(payload.preview_snapshot, dict) else {}
            preview_slot = self.dependencies["_preview_slot"](submitted_preview_snapshot, youtube_context.slot)
            preview_channel_id = str(submitted_preview_snapshot.get("youtube_channel_id") or "").strip()
            if preview_channel_id and active_context.channel_id and (preview_channel_id != active_context.channel_id):
                raise self.dependencies["_stale_preview_exception"]()
            if not payload.preview_token or not self.dependencies["verify_preview_token"](
                payload.preview_token,
                owner_sub=youtube_context.owner_sub,
                youtube_slot=preview_slot,
                operation="youtube.batch_update",
                playlist_id=playlist_id,
                playlist=initial_playlist_state,
                sheet=sheet_state,
                request_digest=request_state,
            ):
                raise self.dependencies["_stale_preview_exception"]()
            pending_video_ids = [item["video_id"] for item in prepared if item["status"] == "pending"]
            if pending_video_ids:
                current_headers = self.dependencies["get_sheet_headers"](
                    sheet_creds, spreadsheet_id, payload.worksheet_name
                )
                current_rows = self.dependencies["get_all_rows_for_sheet"](
                    sheet_creds, spreadsheet_id, payload.worksheet_name
                )
                if (
                    self.dependencies["sheet_snapshot"](
                        spreadsheet_id, payload.worksheet_name, current_headers, current_rows
                    )
                    != sheet_state
                ):
                    raise self.dependencies["_stale_preview_exception"]()
                if playlist_id:
                    active_context, current_playlist_items = self.dependencies[
                        "_run_youtube_operation_with_quota_fallback"
                    ](
                        active_context,
                        lambda context: self.dependencies["fetch_playlist_items"](context, playlist_id),
                        estimated_units=fallback_estimate,
                        attempted_slots=attempted_slots,
                    )
                    if self.dependencies["playlist_snapshot"](current_playlist_items) != initial_playlist_state:
                        raise self.dependencies["_stale_preview_exception"]()
                    if not set(requested_video_ids).issubset(
                        set(self.dependencies["playlist_snapshot"](current_playlist_items)["video_ids"])
                    ):
                        raise self.dependencies["_stale_preview_exception"]()
                else:
                    active_context, current_details = self.dependencies["_run_youtube_operation_with_quota_fallback"](
                        active_context,
                        lambda context: self.dependencies["fetch_video_details"](context, pending_video_ids),
                        estimated_units=fallback_estimate,
                        attempted_slots=attempted_slots,
                    )
                    if {item.get("id") for item in current_details if item.get("id")} != {
                        item_id for item_id in details_map if item_id in pending_video_ids
                    }:
                        raise self.dependencies["_stale_preview_exception"]()
            results: list[dict] = []
            quota_error: Optional[YouTubeQuotaUnavailable] = None
            for item in prepared:
                detail = details_map.get(item["video_id"])
                missing_video = item["status"] == "pending" and (not detail)
                skipped = item["status"] != "pending" or missing_video
                snippet = (detail or {}).get("snippet") or {}
                base_result = {
                    "video_id": item["video_id"],
                    "youtube_slot": active_context.slot,
                    "title": snippet.get("title") or item["video_id"],
                    "description": snippet.get("description") or "",
                    "thumbnail_url": self.dependencies["_youtube_thumbnail"](detail or {}, item["video_id"]),
                    "person": item["person"],
                }
                if skipped:
                    skipped_error = None
                    if missing_video:
                        skipped_error = self.dependencies["http_error"](
                            404,
                            "youtube_not_found",
                            "找不到指定的 YouTube 影片，或目前帳號無權存取。",
                            youtube_slot=active_context.slot,
                        ).detail
                    results.append(
                        {
                            **base_result,
                            "status": "skipped",
                            "reason": item.get("reason") or "YouTube 找不到此影片或目前帳號無權存取。",
                            "error": skipped_error,
                        }
                    )
                    continue
                if quota_error is not None:
                    results.append(
                        {
                            **base_result,
                            "status": "not_attempted",
                            "reason": quota_error.user_message,
                            "error": quota_error.to_dict(),
                        }
                    )
                    continue
                try:
                    self.dependencies["update_single_video_metadata"](
                        active_context,
                        item["video_id"],
                        str(item.get("new_title") or ""),
                        str(item.get("new_description") or ""),
                        current_snippet=snippet,
                    )
                    results.append(
                        {
                            **base_result,
                            "title": item.get("new_title") or base_result["title"],
                            "description": item.get("new_description") or "",
                            "status": "succeeded",
                            "reason": None,
                        }
                    )
                except YouTubeQuotaUnavailable as exc:
                    fallback_context = self.dependencies["_switch_youtube_context"](
                        active_context, estimated_units=50, attempted_slots=attempted_slots
                    )
                    if fallback_context is not None:
                        attempted_slots.add(fallback_context.slot)
                        active_context = fallback_context
                        fallback_result = {**base_result, "youtube_slot": active_context.slot}
                        try:
                            self.dependencies["update_single_video_metadata"](
                                active_context,
                                item["video_id"],
                                str(item.get("new_title") or ""),
                                str(item.get("new_description") or ""),
                                current_snippet=snippet,
                            )
                            results.append(
                                {
                                    **fallback_result,
                                    "title": item.get("new_title") or fallback_result["title"],
                                    "description": item.get("new_description") or "",
                                    "status": "succeeded",
                                    "reason": None,
                                }
                            )
                            continue
                        except YouTubeQuotaUnavailable as fallback_exc:
                            quota_error = fallback_exc
                            results.append(
                                {
                                    **fallback_result,
                                    "status": "not_attempted",
                                    "reason": fallback_exc.user_message,
                                    "error": fallback_exc.to_dict(),
                                }
                            )
                            continue
                    quota_error = exc
                    results.append(
                        {**base_result, "status": "not_attempted", "reason": exc.user_message, "error": exc.to_dict()}
                    )
                except Exception as exc:
                    item_error = self.dependencies["_workflow_error_detail"](exc, slot=active_context.slot)
                    results.append(
                        {**base_result, "status": "failed", "reason": item_error["message"], "error": item_error}
                    )
            return self.dependencies["_direct_workflow_response"](
                "youtube.metadata_update",
                results,
                quota_error=quota_error,
                slot=active_context.slot,
                context=active_context,
            )
        except YouTubeQuotaUnavailable as exc:
            raise self.dependencies["_quota_http_exception"](exc) from exc
        except HTTPException:
            raise
        except Exception as exc:
            self.dependencies["logger"].error(
                "Batch metadata update failed for slot %s: %s", active_context.slot, type(exc).__name__
            )
            raise self.dependencies["map_youtube_error"](
                exc, method="videos.update", youtube_slot=active_context.slot
            ).to_http_exception() from exc

    def run_publish_and_cleanup(self, payload: PublishCleanupInput, *, creds):
        """Snapshot To-Post, sort oldest-first, then publish each video synchronously."""
        youtube_context = creds
        active_context = youtube_context
        attempted_slots = {active_context.slot}
        fallback_estimate = max(int(youtube_context.estimated_units or 0), 1)
        playlist_id = self.dependencies["_resolve_playlist_id"](youtube_context, payload.playlist_id)
        if not playlist_id:
            raise self.dependencies["http_error"](400, "playlist_required", "請提供播放清單 ID。")
        try:
            active_context, raw_items = self.dependencies["_run_youtube_operation_with_quota_fallback"](
                active_context,
                lambda context: self.dependencies["fetch_playlist_items"](context, playlist_id),
                estimated_units=fallback_estimate,
                attempted_slots=attempted_slots,
            )
            initial_playlist_state = self.dependencies["playlist_snapshot"](raw_items)
            submitted_preview_snapshot = payload.preview_snapshot if isinstance(payload.preview_snapshot, dict) else {}
            preview_slot = self.dependencies["_preview_slot"](submitted_preview_snapshot, active_context.slot)
            preview_channel_id = str(submitted_preview_snapshot.get("youtube_channel_id") or "").strip()
            if preview_channel_id and active_context.channel_id and (preview_channel_id != active_context.channel_id):
                raise self.dependencies["_stale_preview_exception"]()
            self.dependencies["_verify_playlist_preview_token"](
                active_context, playlist_id, initial_playlist_state, payload.preview_token, token_slot=preview_slot
            )
            if not raw_items:
                response = self.dependencies["_direct_workflow_response"](
                    "youtube.publish_cleanup", [], slot=active_context.slot, context=active_context
                )
                response["message"] = "To-Post 播放清單目前沒有影片。"
                return response
            playlist_item_map: dict[str, str] = {}
            api_order: list[str] = []
            title_map: dict[str, str] = {}
            for item in raw_items:
                video_id = item.get("contentDetails", {}).get("videoId")
                if not video_id or video_id in playlist_item_map:
                    continue
                playlist_item_map[video_id] = item.get("id")
                api_order.append(video_id)
                title_map[video_id] = item.get("snippet", {}).get("title", "")
            active_context, details = self.dependencies["_run_youtube_operation_with_quota_fallback"](
                active_context,
                lambda context: self.dependencies["fetch_video_details"](context, api_order),
                estimated_units=fallback_estimate,
                attempted_slots=attempted_slots,
            )
            details_map = {item["id"]: item for item in details if item.get("id")}
            original_positions = {video_id: index for index, video_id in enumerate(api_order)}
            ordered_ids = sorted(
                api_order,
                key=lambda video_id: self.dependencies["upload_time_sort_key"](
                    video_id, details_map, original_positions
                ),
            )
            active_context, latest_playlist_items = self.dependencies["_run_youtube_operation_with_quota_fallback"](
                active_context,
                lambda context: self.dependencies["fetch_playlist_items"](context, playlist_id),
                estimated_units=fallback_estimate,
                attempted_slots=attempted_slots,
            )
            if self.dependencies["playlist_snapshot"](latest_playlist_items) != initial_playlist_state:
                raise self.dependencies["_stale_preview_exception"]()
            results: list[dict] = []
            quota_error: Optional[YouTubeQuotaUnavailable] = None
            stopped_reason: Optional[str] = None

            def execute_with_quota_fallback(operation, *, estimated_units: int):
                nonlocal active_context
                try:
                    return (operation(active_context), None)
                except YouTubeQuotaUnavailable as exc:
                    fallback_context = self.dependencies["_switch_youtube_context"](
                        active_context, estimated_units=estimated_units, attempted_slots=attempted_slots
                    )
                    if fallback_context is None:
                        return (None, exc)
                    attempted_slots.add(fallback_context.slot)
                    active_context = fallback_context
                    try:
                        return (operation(active_context), None)
                    except YouTubeQuotaUnavailable as fallback_exc:
                        return (None, fallback_exc)

            for video_id in ordered_ids:
                detail = details_map.get(video_id)
                missing = detail is None
                snippet = (detail or {}).get("snippet") or {}
                base_result = {
                    "video_id": video_id,
                    "youtube_slot": active_context.slot,
                    "title": title_map.get(video_id) or snippet.get("title") or video_id,
                    "description": snippet.get("description") or "",
                    "thumbnail_url": self.dependencies["_youtube_thumbnail"](detail or {}, video_id),
                }
                if missing:
                    results.append(
                        {
                            **base_result,
                            "status": "skipped",
                            "reason": "YouTube 找不到此影片或目前帳號無權存取。",
                            "error": self.dependencies["http_error"](
                                404,
                                "youtube_not_found",
                                "找不到指定的 YouTube 影片，或目前帳號無權存取。",
                                youtube_slot=active_context.slot,
                            ).detail,
                        }
                    )
                    continue
                if quota_error is not None:
                    results.append(
                        {
                            **base_result,
                            "status": "not_attempted",
                            "reason": quota_error.user_message,
                            "error": quota_error.to_dict(),
                        }
                    )
                    continue
                if stopped_reason is not None:
                    results.append({**base_result, "status": "not_attempted", "reason": stopped_reason})
                    continue
                try:
                    _public_result, public_quota_error = execute_with_quota_fallback(
                        lambda context: self.dependencies["set_video_public"](context, video_id, current_video=detail),
                        estimated_units=50,
                    )
                except Exception as exc:
                    item_error = self.dependencies["_workflow_error_detail"](exc, slot=active_context.slot)
                    stopped_reason = f"前一支影片無法設為公開，後續影片未執行：{item_error['message']}"
                    results.append(
                        {
                            **base_result,
                            "youtube_slot": active_context.slot,
                            "status": "failed",
                            "reason": item_error["message"],
                            "error": item_error,
                        }
                    )
                    continue
                if public_quota_error is not None:
                    exc = public_quota_error
                    quota_error = exc
                    results.append(
                        {
                            **base_result,
                            "youtube_slot": active_context.slot,
                            "status": "not_attempted",
                            "reason": exc.user_message,
                            "error": exc.to_dict(),
                        }
                    )
                    continue
                try:
                    _cleanup_result, cleanup_quota_error = execute_with_quota_fallback(
                        lambda context: self.dependencies["remove_playlist_item"](
                            context, playlist_item_map.get(video_id)
                        ),
                        estimated_units=50,
                    )
                except Exception as exc:
                    item_error = self.dependencies["_workflow_error_detail"](exc, slot=active_context.slot)
                    results.append(
                        {
                            **base_result,
                            "youtube_slot": active_context.slot,
                            "status": "succeeded_with_warnings",
                            "reason": f"影片已設為公開，但移出 To-Post 失敗：{item_error['message']}",
                            "error": item_error,
                        }
                    )
                    continue
                if cleanup_quota_error is None:
                    results.append(
                        {**base_result, "youtube_slot": active_context.slot, "status": "succeeded", "reason": None}
                    )
                else:
                    exc = cleanup_quota_error
                    quota_error = exc
                    results.append(
                        {
                            **base_result,
                            "youtube_slot": active_context.slot,
                            "status": "succeeded_with_warnings",
                            "reason": f"影片已設為公開，但尚未移出 To-Post：{exc.user_message}",
                            "error": exc.to_dict(),
                        }
                    )
            response = self.dependencies["_direct_workflow_response"](
                "youtube.publish_cleanup",
                results,
                quota_error=quota_error,
                slot=active_context.slot,
                context=active_context,
            )
            response.update({"playlist_id": playlist_id, "sort_order": "published_at_ascending"})
            return response
        except YouTubeQuotaUnavailable as exc:
            raise self.dependencies["_quota_http_exception"](exc) from exc
        except HTTPException:
            raise
        except Exception as exc:
            self.dependencies["logger"].error(
                "Publish cleanup workflow failed for slot %s: %s", active_context.slot, type(exc).__name__
            )
            raise self.dependencies["map_youtube_error"](
                exc, method="playlistItems.delete", youtube_slot=active_context.slot
            ).to_http_exception() from exc
