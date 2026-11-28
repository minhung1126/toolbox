"""To-Post cleanup only: exact item consent and a public guard at every delete."""

from __future__ import annotations

from backend.app.core.error_contract import http_error
from backend.app.services.operation_journal import current_recorder, known_rejected_write
from backend.app.services.youtube_errors import YouTubeQuotaUnavailable


class CleanupRetained(Exception):
    """The pre-delete read proved that this item must remain; no delete attempted."""

    def __init__(self, reason, privacy="unknown"):
        super().__init__(reason)
        self.privacy = privacy


class ToPostCleanupWorkflow:
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

    @staticmethod
    def _identity(item):
        return (
            str(item.get("id") or ""),
            str(
                item.get("contentDetails", {}).get("videoId")
                or item.get("snippet", {}).get("resourceId", {}).get("videoId")
                or ""
            ),
        )

    def _items(self, raw, playlist_id):
        items = []
        seen = set()
        for item in raw:
            item_id, video_id = self._identity(item)
            if not item_id or not video_id or item_id in seen:
                raise http_error(400, "cleanup_item_invalid", "To-Post 項目資料不完整，請重新讀取。")
            seen.add(item_id)
            items.append({"playlist_id": playlist_id, "playlist_item_id": item_id, "video_id": video_id})
        return items

    def preview(self, payload, context):
        if not context.channel_id:
            raise http_error(409, "youtube_channel_required", "請重新連線並確認 YouTube 頻道。")
        playlist = self.ports.resolve_playlist_id(context, payload.playlist_id)
        if not playlist:
            raise http_error(400, "playlist_required", "請提供播放清單 ID。")
        attempted = {context.slot}
        context, raw = self._read(context, lambda ctx: self.ports.fetch_playlist_items(ctx, playlist), attempted)
        rows = self._items(raw, playlist)
        ids = list(dict.fromkeys(row["video_id"] for row in rows))
        details = []
        if ids:
            context, details = self._read(context, lambda ctx: self.ports.fetch_video_details(ctx, ids), attempted)
        details = {item["id"]: item for item in details}
        for row in rows:
            detail = details.get(row["video_id"], {})
            snippet = detail.get("snippet") or {}
            privacy = (detail.get("status") or {}).get("privacyStatus", "unknown")
            owned = snippet.get("channelId") == context.channel_id
            candidate = owned and privacy == "public"
            row.update(
                title=snippet.get("title") or row["video_id"],
                description=snippet.get("description") or "",
                observed_privacy=privacy if owned else "unknown",
                candidate=candidate,
                reason="已公開，可移除清單成員。"
                if candidate
                else "尚未公開，保留清單成員。"
                if owned and privacy in {"private", "unlisted"}
                else "無法確認影片或頻道，保留清單成員。",
            )
        snapshot = {
            "version": 2,
            "mode": "cleanup_only",
            "youtube_channel_id": context.channel_id,
            "youtube_slot": context.slot,
            "playlist_id": playlist,
            "items": rows,
        }
        token = self.ports.build_preview_token(
            owner_sub=context.owner_sub,
            youtube_slot=context.slot,
            operation="youtube.cleanup_only",
            youtube_channel_id=context.channel_id or "",
            request_digest=self.ports.input_digest(snapshot),
        )
        counts = {
            privacy: sum(row["observed_privacy"] == privacy for row in rows)
            for privacy in ("public", "private", "unlisted", "unknown")
        }
        return {
            "version": 2,
            "mode": "cleanup_only",
            "playlist_id": playlist,
            "youtube_channel_id": context.channel_id,
            "youtube_slot": context.slot,
            "total_count": len(rows),
            "candidate_count": sum(row["candidate"] for row in rows),
            "counts": counts,
            "items": rows,
            "preview_snapshot": snapshot,
            "preview_token": token,
        }

    def verify(self, payload, context):
        snapshot = payload.preview_snapshot or {}
        if (
            snapshot.get("version") != 2
            or snapshot.get("mode") != "cleanup_only"
            or snapshot.get("youtube_channel_id") != context.channel_id
            or not context.channel_id
        ):
            raise self.ports.stale_preview_exception()
        playlist = self.ports.resolve_playlist_id(context, payload.playlist_id)
        if playlist != snapshot.get("playlist_id") or not self.ports.verify_preview_token(
            payload.preview_token,
            owner_sub=context.owner_sub,
            youtube_slot=snapshot.get("youtube_slot", ""),
            operation="youtube.cleanup_only",
            youtube_channel_id=context.channel_id or "",
            request_digest=self.ports.input_digest(snapshot),
        ):
            raise self.ports.stale_preview_exception()
        return snapshot

    def execute(self, payload, context):
        snapshot = self.verify(payload, context)
        playlist = snapshot["playlist_id"]
        attempted = {context.slot}
        context, raw = self._read(context, lambda ctx: self.ports.fetch_playlist_items(ctx, playlist), attempted)
        submitted = [
            {key: row[key] for key in ("playlist_id", "playlist_item_id", "video_id")} for row in snapshot["items"]
        ]
        if self._items(raw, playlist) != submitted:
            raise self.ports.stale_preview_exception()
        recorder = current_recorder()
        if recorder:
            recorder.initialize_progress(
                [{**row, "status": "ready" if row["candidate"] else "skipped"} for row in snapshot["items"]]
            )
        results, quota_error = [], None
        for row in snapshot["items"]:
            base = {**row, "youtube_slot": context.slot}
            if not row["candidate"]:
                result = {**base, "status": "skipped"}
            elif quota_error:
                result = {**base, "status": "not_attempted", "reason": quota_error.user_message}
            else:
                if recorder:
                    recorder.progress(row["video_id"], playlist_item_id=row["playlist_item_id"], status="running")
                try:

                    def remove(candidate):
                        if candidate.channel_id != snapshot["youtube_channel_id"]:
                            raise self.ports.stale_preview_exception()

                        def guard():
                            # Invoked by the provider immediately before EVERY actual delete,
                            # including internal retries. Quota slot fallback builds a fresh guard.
                            members = self.ports.fetch_playlist_items(candidate, playlist)
                            mapping = dict(self._identity(item) for item in members)
                            if mapping.get(row["playlist_item_id"]) != row["video_id"]:
                                raise CleanupRetained("清單成員已變更，請重新預覽。")
                            videos = self.ports.fetch_video_details(candidate, [row["video_id"]])
                            detail = next((item for item in videos if item.get("id") == row["video_id"]), {})
                            privacy = detail.get("status", {}).get("privacyStatus", "unknown")
                            if (
                                detail.get("snippet", {}).get("channelId") != candidate.channel_id
                                or privacy != "public"
                            ):
                                raise CleanupRetained("刪除前已非公開或無法確認，保留清單成員。", privacy)

                        return self.ports.remove_playlist_item(
                            candidate, row["playlist_item_id"], pre_delete_guard=guard
                        )

                    context, response = self.ports.run_youtube_operation_with_quota_fallback(
                        context, remove, estimated_units=54, attempted_slots=attempted
                    )
                    if recorder:

                        def confirm_attempts(op):
                            import time

                            for attempt in op["items"]:
                                if (
                                    attempt["phase"] == "cleanup"
                                    and attempt["remote_id"] == row["playlist_item_id"]
                                    and attempt["state"] in {"running", "needs_reconciliation"}
                                ):
                                    attempt.update(
                                        state="completed",
                                        reconciliation={
                                            "provider_read": True,
                                            "matches_intent": True,
                                            "checked_at": time.time(),
                                        },
                                    )

                        recorder.store.update(recorder.owner, recorder.id, confirm_attempts)
                    result = {
                        **base,
                        "youtube_slot": context.slot,
                        "status": "succeeded",
                        "reason": "已確認移除清單成員。",
                        "confirmation": "provider_read",
                        "reconciled": bool(response.get("reconciled")),
                    }
                except CleanupRetained as exc:
                    uncertain = getattr(exc, "cleanup_write_attempted", False) or bool(
                        recorder
                        and any(
                            attempt["phase"] == "cleanup"
                            and attempt["remote_id"] == row["playlist_item_id"]
                            and attempt["state"] == "needs_reconciliation"
                            for attempt in recorder.store.get(recorder.owner, recorder.id)["items"]
                        )
                    )
                    result = {
                        **base,
                        "status": "needs_reconciliation" if uncertain else "skipped",
                        "reason": str(exc),
                        "observed_privacy": exc.privacy,
                    }
                except YouTubeQuotaUnavailable as exc:
                    quota_error = exc
                    result = {**base, "status": "needs_reconciliation", "reason": exc.user_message}
                except Exception as exc:
                    result = {
                        **base,
                        "status": "failed" if known_rejected_write(exc) else "needs_reconciliation",
                        "reason": self.ports.workflow_error_detail(exc, slot=context.slot)["message"],
                    }
            results.append(result)
            if recorder:
                recorder.progress(
                    row["video_id"],
                    playlist_item_id=row["playlist_item_id"],
                    **{key: result[key] for key in ("status", "reason", "confirmation") if key in result},
                )
        counts = {
            status: sum(row["status"] == status for row in results)
            for status in ("succeeded", "skipped", "failed", "not_attempted", "needs_reconciliation")
        }
        return {
            "version": 2,
            "mode": "cleanup_only",
            "operation": "youtube.publish_cleanup",
            "playlist_id": playlist,
            "youtube_channel_id": context.channel_id,
            "youtube_slot": context.slot,
            "completed": not any(counts[key] for key in ("failed", "not_attempted", "needs_reconciliation")),
            "total_count": len(results),
            **{f"{key}_count": value for key, value in counts.items()},
            "quota_blocked": quota_error is not None,
            "results": results,
        }
