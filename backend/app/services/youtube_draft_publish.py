"""Account/channel-bound staging and signed final edits. Preparation never writes to YouTube."""

from __future__ import annotations

import math
import time
import uuid

from backend.app.core.error_contract import http_error
from backend.app.core.youtube_operation_state import content_fingerprint
from backend.app.services.operation_journal import current_operation_id, current_recorder, known_rejected_write
from backend.app.services.sheets_service import person_display
from backend.app.services.youtube_errors import YouTubeQuotaUnavailable
from backend.app.services.youtube_service import video_matches_public_draft, video_publish_state


class DraftPublishWorkflow:
    def __init__(self, ports):
        self.ports = ports

    def _read(self, context, call, attempted):
        channel = context.channel_id

        def checked(candidate):
            if not channel or candidate.channel_id != channel:
                raise self.ports.stale_preview_exception()
            return call(candidate)

        return self.ports.run_youtube_operation_with_quota_fallback(
            context, checked, estimated_units=1, attempted_slots=attempted
        )

    def _token(self, snapshot, context, operation):
        return self.ports.build_preview_token(
            owner_sub=context.owner_sub,
            youtube_slot=snapshot["youtube_slot"],
            operation=operation,
            request_digest=self.ports.input_digest(snapshot),
        )

    def _verify(self, token, snapshot, context, operation, *, stage=False):
        if (
            not isinstance(snapshot, dict)
            or not context.channel_id
            or snapshot.get("youtube_channel_id") != context.channel_id
            or not self.ports.verify_preview_token(
                token,
                owner_sub=context.owner_sub,
                youtube_slot=snapshot.get("youtube_slot", ""),
                operation=operation,
                request_digest=self.ports.input_digest(snapshot),
                **({"max_age": 30 * 24 * 60 * 60} if stage else {}),
            )
        ):
            raise self.ports.stale_preview_exception()

    def prepare(self, payload, context, sheet_creds):
        spreadsheet, title_col, desc_col, assignments, _ = self.ports.validate_batch_inputs(payload, context.owner_sub)
        if not context.channel_id:
            raise http_error(409, "youtube_channel_required", "請先重新連線並確認 YouTube 頻道。")
        playlist_id = self.ports.resolve_playlist_id(context, payload.playlist_id)
        headers, rows = self.ports.load_and_validate_sheet_data(
            sheet_creds, spreadsheet, payload.worksheet_name, title_col, desc_col
        )
        attempted = {context.slot}
        playlist = self.ports.playlist_snapshot([])
        if playlist_id:
            context, items = self._read(
                context, lambda ctx: self.ports.fetch_playlist_items(ctx, playlist_id), attempted
            )
            playlist = self.ports.playlist_snapshot(items)
            if not {video_id for video_id, _ in assignments}.issubset(set(playlist["video_ids"])):
                raise self.ports.stale_preview_exception()
        ids = [video_id for video_id, _ in assignments]
        context, details = self._read(context, lambda ctx: self.ports.fetch_video_details(ctx, ids), attempted)
        details = {item["id"]: item for item in details}
        plan, baseline = [], {}
        team = self.ports.normalize_text(payload.team)
        for video_id, person in assignments:
            detail = details.get(video_id) or {}
            snippet = detail.get("snippet") or {}
            reason, title, description = "", "", ""
            if not person or person == "不編輯":
                reason = "未指定人物／不編輯"
            elif not detail or snippet.get("channelId") != context.channel_id:
                reason = "找不到影片，或影片不屬於目前授權頻道。"
            else:
                matches = [row for row in rows if self.ports.matches_team_person(row, team, person)]
                reason, title, description = self.ports.resolve_person_metadata(
                    matches, team, person, title_col, desc_col
                )
            baseline[video_id] = self.ports.input_digest(video_publish_state(detail))
            plan.append(
                {
                    "video_id": video_id,
                    "person": person_display(person, team),
                    "person_key": person,
                    "currentTitle": str(snippet.get("title") or ""),
                    "currentDescription": str(snippet.get("description") or ""),
                    "currentPrivacy": (detail.get("status") or {}).get("privacyStatus", "unknown"),
                    "newTitle": title,
                    "newDescription": description,
                    "status": "skipped" if reason else "ready",
                    "reason": reason,
                    "thumbnailUrl": self.ports.youtube_thumbnail(detail, video_id),
                }
            )
        snapshot = {
            "version": 1,
            "stage_id": str(uuid.uuid4()),
            "video_type": payload.video_type,
            "youtube_slot": context.slot,
            "youtube_channel_id": context.channel_id,
            "source": {
                "spreadsheet_id": spreadsheet,
                "worksheet_name": payload.worksheet_name,
                "title_column": title_col,
                "description_column": desc_col,
                "playlist_id": playlist_id,
                "team": team,
                "assignments": [{"video_id": video_id, "person": person} for video_id, person in assignments],
            },
            "sheet": self.ports.sheet_snapshot(spreadsheet, payload.worksheet_name, headers, rows),
            "playlist": playlist,
            "baseline": baseline,
            "plan": plan,
        }
        return {"stage_token": self._token(snapshot, context, "youtube.draft.prepare"), "stage_snapshot": snapshot}

    def _plan(self, payload, context, sheet_creds, operations):
        stage = payload.stage_snapshot
        self._verify(payload.stage_token, stage, context, "youtube.draft.prepare", stage=True)
        source = stage["source"]
        if [edit.video_id for edit in payload.edits] != [item["video_id"] for item in stage["plan"]]:
            raise self.ports.stale_preview_exception()
        if self.ports.resolve_playlist_id(context, source["playlist_id"]) != source["playlist_id"]:
            raise self.ports.stale_preview_exception()
        headers, rows = self.ports.load_and_validate_sheet_data(
            sheet_creds,
            source["spreadsheet_id"],
            source["worksheet_name"],
            source["title_column"],
            source["description_column"],
        )
        sheet = self.ports.sheet_snapshot(source["spreadsheet_id"], source["worksheet_name"], headers, rows)
        if sheet != stage["sheet"]:
            raise self.ports.stale_preview_exception()
        attempted = {context.slot}
        playlist = self.ports.playlist_snapshot([])
        if source["playlist_id"]:
            context, items = self._read(
                context, lambda ctx: self.ports.fetch_playlist_items(ctx, source["playlist_id"]), attempted
            )
            playlist = self.ports.playlist_snapshot(items)
            if playlist != stage["playlist"]:
                raise self.ports.stale_preview_exception()
        ids = [edit.video_id for edit in payload.edits]
        context, videos = self._read(context, lambda ctx: self.ports.fetch_video_details(ctx, ids), attempted)
        details = {item["id"]: item for item in videos}
        prior = operations.draft_publish_attempts(context.owner_sub, context.channel_id)
        plan = []
        for prepared, edit in zip(stage["plan"], payload.edits):
            detail = details.get(edit.video_id) or {}
            state = video_publish_state(detail)
            skipped = edit.skip or prepared["status"] == "skipped"
            reason = prepared["reason"] or ("手動略過" if edit.skip else "")
            if not skipped:
                if state["channel_id"] != context.channel_id:
                    raise self.ports.stale_preview_exception()
                matches = video_matches_public_draft(detail, edit.title, edit.description)
                if not matches and self.ports.input_digest(state) != stage["baseline"][edit.video_id]:
                    raise self.ports.stale_preview_exception()
                for operation in prior:
                    if operation["id"] == current_operation_id():
                        continue
                    pending_ids = (
                        {
                            row["video_id"]
                            for row in operation["progress"]["rows"]
                            if row["status"] in {"queued", "running", "needs_reconciliation"}
                        }
                        if operation.get("progress")
                        else {edit["video_id"] for edit in operation["plan"].get("edits", []) if not edit.get("skip")}
                    )
                    if operation["state"] in {"prepared", "running"} and edit.video_id in pending_ids:
                        raise http_error(
                            409, "operation_requires_reconciliation", "此影片已有執行中的作業，請先核對結果。"
                        )
                    attempts = [item for item in operation["items"] if item["remote_id"] == edit.video_id]
                    same_stage = (operation["plan"].get("stage_snapshot") or {}).get("stage_id") == stage["stage_id"]
                    if any(item["state"] in {"running", "needs_reconciliation"} for item in attempts):
                        raise http_error(
                            409, "operation_requires_reconciliation", "此影片有待核對的寫入，請先至作業紀錄唯讀核對。"
                        )
                    if same_stage and any(item["state"] == "completed" for item in attempts) and not matches:
                        raise self.ports.stale_preview_exception()
                if (
                    state["snippet"].get("title") != edit.title
                    or state["snippet"].get("description", "") != edit.description
                ):
                    if not state["snippet"].get("categoryId"):
                        raise http_error(400, "youtube_category_required", "影片缺少類別，請重新讀取影片。")
            text_changed = (
                state["snippet"].get("title") != edit.title
                or state["snippet"].get("description", "") != edit.description
            )
            privacy_changed = state["status"].get("privacyStatus") != "public"
            parts = [] if skipped else (["snippet"] if text_changed else []) + (["status"] if privacy_changed else [])
            plan.append(
                {
                    "video_id": edit.video_id,
                    "person": prepared["person"],
                    "person_key": prepared.get("person_key"),
                    "title": edit.title,
                    "description": edit.description,
                    "status": "skipped" if skipped else "ready" if parts else "unchanged",
                    "reason": reason or ("文字與公開狀態已符合，無需寫入。" if not parts else ""),
                    "parts": parts,
                    "write_units": 50 if parts else 0,
                    "current": state,
                }
            )
        snapshot = {
            "stage_id": stage["stage_id"],
            "video_type": stage["video_type"],
            "youtube_slot": stage["youtube_slot"],
            "youtube_channel_id": context.channel_id,
            "sheet": sheet,
            "playlist": playlist,
            "edits": [edit.model_dump() for edit in payload.edits],
            "plan": plan,
        }
        return snapshot, details, context, attempted

    def preview(self, payload, context, sheet_creds, operations):
        snapshot, _, context, _ = self._plan(payload, context, sheet_creds, operations)
        count = sum(bool(item["parts"]) for item in snapshot["plan"])
        pages = math.ceil(len(payload.edits) / 50)
        playlist_pages = math.ceil(snapshot["playlist"]["video_count"] / 50)
        # Includes the upcoming preflight and one immediate video read per intended write.
        reads = pages + playlist_pages + count
        return {
            "preview_token": self._token(snapshot, context, "youtube.metadata_publish"),
            "preview_snapshot": snapshot,
            "plan": snapshot["plan"],
            "quota": {
                "write_calls": count,
                "write_units": count * 50,
                "read_units": reads,
                "projected_units": count * 50 + reads,
            },
        }

    def validate_submission(self, payload, context):
        self._verify(payload.preview_token, payload.preview_snapshot, context, "youtube.metadata_publish")
        self._verify(payload.stage_token, payload.stage_snapshot, context, "youtube.draft.prepare", stage=True)
        snapshot = payload.preview_snapshot
        if snapshot.get("stage_id") != payload.stage_snapshot.get("stage_id") or snapshot.get("edits") != [
            edit.model_dump() for edit in payload.edits
        ]:
            raise self.ports.stale_preview_exception()
        if [item["video_id"] for item in snapshot.get("plan", [])] != [edit.video_id for edit in payload.edits]:
            raise self.ports.stale_preview_exception()

    def execute(self, payload, context, sheet_creds, operations, *, accepted_operation=None):
        recorder = current_recorder()
        if accepted_operation is None:
            self.validate_submission(payload, context)
        elif (
            not recorder
            or recorder.id != accepted_operation["id"]
            or time.time() > accepted_operation["acceptance"]["preview_expires_at"]
        ):
            raise self.ports.stale_preview_exception()
        if recorder:
            recorder.initialize_progress(payload.preview_snapshot["plan"])
        snapshot, details, context, attempted = self._plan(payload, context, sheet_creds, operations)
        if self.ports.input_digest(snapshot) != self.ports.input_digest(payload.preview_snapshot):
            raise self.ports.stale_preview_exception()
        results, quota_error = [], None

        def append_result(result, item):
            results.append(result)
            if recorder:
                recorder.progress(
                    item["video_id"],
                    **{
                        key: result[key]
                        for key in ("status", "reason", "confirmation", "attempted_parts")
                        if key in result
                    },
                )

        for item in snapshot["plan"]:
            base = {key: item[key] for key in ("video_id", "title", "description", "person")}
            base["youtube_slot"] = context.slot
            if not item["parts"]:
                append_result(
                    {
                        **base,
                        "status": "skipped" if item["status"] == "skipped" else "unchanged",
                        "reason": item["reason"],
                        "confirmation": "provider_read" if item["status"] == "unchanged" else None,
                    },
                    item,
                )
                continue
            if quota_error:
                append_result({**base, "status": "not_attempted", "reason": quota_error.user_message}, item)
                continue
            if recorder:
                recorder.progress(item["video_id"], status="running")
            write_started = False
            try:
                # Revalidate all writable metadata immediately before this video's sole update.
                context, current = self._read(
                    context, lambda ctx: self.ports.fetch_video_details(ctx, [item["video_id"]]), attempted
                )
                detail = next((video for video in current if video.get("id") == item["video_id"]), {})
                if video_publish_state(detail) != item["current"]:
                    append_result(
                        {
                            **base,
                            "status": "failed",
                            "reason": "影片在確認後變更，請重建暫存。",
                            "code": "stale_preview",
                        },
                        item,
                    )
                    continue

                def write(candidate):
                    nonlocal write_started
                    if candidate.channel_id != snapshot["youtube_channel_id"]:
                        raise self.ports.stale_preview_exception()
                    write_started = True
                    if recorder:
                        recorder.progress(item["video_id"], attempted_parts=item["parts"])
                    return self.ports.update_and_publish_video(
                        candidate,
                        item["video_id"],
                        item["title"],
                        item["description"],
                        current_video=detail,
                        _journal_evidence={
                            "parts": item["parts"],
                            "person_key": item.get("person_key"),
                            "content_fingerprint": content_fingerprint(item["title"], item["description"]),
                            "attempted_write": True,
                        },
                    )

                context, response = self.ports.run_youtube_operation_with_quota_fallback(
                    context, write, estimated_units=50, attempted_slots=attempted
                )
                append_result(
                    {
                        **base,
                        "youtube_slot": context.slot,
                        "status": "succeeded",
                        "reconciled": bool(response.get("reconciled")),
                        "confirmation": "provider_read" if response.get("reconciled") else "provider_response",
                        "attempted_parts": item["parts"],
                    },
                    item,
                )
            except YouTubeQuotaUnavailable as exc:
                quota_error = exc
                append_result({**base, "status": "not_attempted", "reason": exc.user_message}, item)
            except Exception as exc:
                error = self.ports.workflow_error_detail(exc, slot=context.slot)
                append_result(
                    {
                        **base,
                        "status": "failed"
                        if not write_started or known_rejected_write(exc)
                        else "needs_reconciliation",
                        "reason": error["message"],
                        "error": error,
                    },
                    item,
                )
        counts = {
            status: sum(item["status"] == status for item in results)
            for status in ("succeeded", "unchanged", "skipped", "failed", "not_attempted", "needs_reconciliation")
        }
        return {
            "operation": "youtube.metadata_publish",
            "youtube_slot": context.slot,
            "completed": not (counts["failed"] or counts["not_attempted"] or counts["needs_reconciliation"]),
            "total_count": len(results),
            **{f"{status}_count": count for status, count in counts.items()},
            "quota_blocked": quota_error is not None,
            "results": results,
        }
