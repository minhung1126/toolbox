"""Feature adapters for synchronous operations and read-only reconciliation evidence."""

from __future__ import annotations

import time
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import replace

from fastapi import HTTPException, Request

from backend.app.core.error_contract import http_error
from backend.app.core.operation_store import OperationStore
from backend.app.core.youtube_operation_state import initial_progress
from backend.app.services.youtube_errors import YouTubeQuotaUnavailable


def known_rejected_write(exc):
    """An explicit provider 4xx rejection cannot have committed a video update."""
    status = getattr(getattr(exc, "resp", None), "status", None)
    return isinstance(status, int) and 400 <= status < 500 and status not in {408, 409, 429}


_current = ContextVar("operation_recorder", default=None)


def get_operation_store(request: Request) -> OperationStore:
    return request.app.state.operation_store


def public_operation(operation, store=None):
    result = {key: value for key, value in operation.items() if key not in {"owner", "request_id"}}
    active = False
    if store is not None:
        with store.active_lock:
            active = operation["id"] in store.active
        if operation.get("executor_id"):
            active = active or store.executor_alive(operation["executor_id"])
    if operation["state"] in {"prepared", "running"} and not active:
        result = {**result, "state": "needs_reconciliation", "interrupted": True}
    return result


class Recorder:
    def __init__(self, store, operation):
        self.store, self.owner, self.id = store, operation["owner"], operation["id"]

    def update(self, **changes):
        return self.store.update(self.owner, self.id, lambda op: op.update(changes))

    def initialize_progress(self, plan):
        return self.store.update(self.owner, self.id, lambda op: op.setdefault("progress", initial_progress(plan)))

    def progress(self, video_id, **changes):
        return self.store.progress_row(self.owner, self.id, video_id, **changes)

    def write(self, phase, remote_id, call, intended=None):
        item_id = len(self.store.get(self.owner, self.id)["items"])
        item = {
            "index": item_id,
            "created_at": time.time(),
            "phase": phase,
            "remote_id": remote_id,
            "state": "running",
            "intended": intended or {},
        }
        self.store.update(self.owner, self.id, lambda op: op["items"].append(item))
        try:
            result = call()
            if (
                phase == "ytmusic_move"
                and (result.get("status") if isinstance(result, dict) else result) != "STATUS_SUCCEEDED"
            ):
                raise RuntimeError("Write outcome unknown")
            if phase == "ytmusic_create" and (not isinstance(result, str) or not result.strip()):
                raise RuntimeError("Write outcome unknown")
        except BaseException as exc:
            state = (
                "failed_before_write"
                if (type(exc).__name__ == "CleanupRetained" and not getattr(exc, "cleanup_write_attempted", False))
                or (isinstance(exc, YouTubeQuotaUnavailable) and phase != "cleanup")
                or (phase in {"metadata_publish", "cleanup"} and known_rejected_write(exc))
                else "needs_reconciliation"
            )
            self.store.update(self.owner, self.id, lambda op: op["items"][item_id].update(state=state))
            raise
        unchanged = isinstance(result, dict) and (
            result.get("unchanged") is True or phase == "cleanup" and result.get("already_removed") is True
        )
        evidence = {"provider_returned": True, "attempted_write": not unchanged}
        if isinstance(result, dict) and result.get("reconciled"):
            evidence["provider_read"] = True
        if phase in {"metadata", "metadata_publish"}:
            evidence["parts"] = (
                [] if unchanged else (intended or {}).get("parts", ["snippet"] if phase == "metadata" else [])
            )
        if isinstance(result, dict) and isinstance(result.get("id"), str):
            evidence["id"] = result["id"]
        elif isinstance(result, str):
            evidence["id"] = result
        self.store.update(
            self.owner,
            self.id,
            lambda op: op["items"][item_id].update(state="completed", evidence=evidence, confirmed_at=time.time()),
        )
        return result

    def finish(self, result=None, *, failed=False):
        if failed:

            def stop_progress(op):
                from backend.app.core.youtube_operation_state import change_progress

                for row in (op.get("progress") or {}).get("rows", []):
                    if row["status"] in {"queued", "running"}:
                        attempted = any(
                            item["remote_id"] == row["video_id"]
                            and item["state"] in {"running", "needs_reconciliation"}
                            for item in op["items"]
                        )
                        change_progress(
                            op,
                            row["video_id"],
                            playlist_item_id=row.get("playlist_item_id"),
                            status="needs_reconciliation" if attempted else "not_attempted",
                            reason="作業未完成，請核對結果或重新預覽。",
                        )

            self.store.update(self.owner, self.id, stop_progress)
        operation = self.store.get(self.owner, self.id)
        items = operation["items"]
        uncertain = operation.get("outcome_unknown", False) or any(
            item["state"] in {"running", "needs_reconciliation"} for item in items
        )
        if uncertain:
            state = "needs_reconciliation"
        elif failed:
            state = "partial" if any(item["state"] == "completed" for item in items) else "failed_before_write"
        elif result and (
            result.get("completed") is False or result.get("failed", 0) > 0 or result.get("failed_count", 0) > 0
        ):
            state = "partial"
        else:
            state = "completed"
        return self.update(state=state, result=result)

    def youtube_service(self, service):
        if not hasattr(service, "ports"):
            return service

        def wrap(name, phase):
            original = getattr(service.ports, name)

            def call(context, remote_id, *args, **kwargs):
                journal_evidence = kwargs.pop("_journal_evidence", None)
                intended = (
                    {"title": args[0], "description": args[1]}
                    if name in {"update_single_video_metadata", "update_and_publish_video"}
                    else {}
                )
                if name == "update_and_publish_video":
                    intended["privacyStatus"] = "public"
                if journal_evidence:
                    intended.update(journal_evidence)
                return self.write(phase, remote_id, lambda: original(context, remote_id, *args, **kwargs), intended)

            return call

        writers = {
            "update_single_video_metadata": "metadata",
            "set_video_public": "publish",
            "remove_playlist_item": "cleanup",
            "update_and_publish_video": "metadata_publish",
        }
        return type(service)(
            replace(
                service.ports,
                **{name: wrap(name, phase) for name, phase in writers.items() if hasattr(service.ports, name)},
            )
        )


def start_operation(store, owner, kind, payload, *, channel_id=None):
    operation, claimed = store.claim(
        owner, kind, payload, channel_id=channel_id, executor_id=getattr(store, "executor_id", None)
    )
    if not claimed:
        if operation["state"] == "completed" and operation["result"] is not None:
            return operation, None
        raise http_error(
            409, "operation_requires_reconciliation", f"作業 {operation['id']} 已受理，請至作業紀錄核對；不會重新送出。"
        )
    return operation, Recorder(store, operation)


@contextmanager
def recording(recorder):
    with recorder.store.active_lock:
        recorder.store.active.add(recorder.id)
    token = _current.set(recorder)
    try:
        recorder.update(state="running")
        yield
    finally:
        _current.reset(token)
        with recorder.store.active_lock:
            recorder.store.active.discard(recorder.id)


def tracked_write(phase, remote_id, call, intended=None):
    recorder = _current.get()
    return recorder.write(phase, remote_id, call, intended) if recorder else call()


def current_operation_id():
    recorder = _current.get()
    return recorder.id if recorder else None


def run_youtube_recorded(store, payload, context, service, kind, execute):
    operation, recorder = start_operation(store, context.owner_sub, kind, payload, channel_id=context.channel_id)
    if recorder is None:
        return {**operation["result"], "operation_id": operation["id"]}
    try:
        with recording(recorder):
            result = execute(recorder.youtube_service(service))
            recorder.finish(result)
        return {**result, "operation_id": recorder.id}
    except BaseException as exc:
        recorder.finish(failed=True)
        if isinstance(exc, HTTPException):
            exc.headers = {**(exc.headers or {}), "X-Operation-Id": recorder.id}
        raise


def current_recorder():
    return _current.get()
