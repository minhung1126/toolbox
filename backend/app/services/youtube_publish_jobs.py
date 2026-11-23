"""One app-owned bounded runner. Durable jobs recover state, never replay writes."""

from __future__ import annotations

import logging
import os
import queue
import threading
import time
import uuid
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass, replace

from itsdangerous import URLSafeTimedSerializer

from backend.app.api.youtube_models import DraftPublishInput
from backend.app.core.config import settings_context
from backend.app.core.error_contract import http_error
from backend.app.core.preview import PREVIEW_TOKEN_MAX_AGE, PREVIEW_TOKEN_SALT
from backend.app.core.youtube_context import YouTubeRequestContext
from backend.app.services.google_auth import (
    build_credentials_from_dict,
    get_sheets_credentials,
    has_sheets_scope,
    has_youtube_scope,
)
from backend.app.services.google_clients import google_client_context
from backend.app.services.operation_journal import Recorder, public_operation, recording
from backend.app.services.youtube_draft_publish import DraftPublishWorkflow

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class JobIdentity:
    owner: str
    channel_id: str
    slot: str
    routing_mode: str


class PublishJobRuntime:
    """Explicit app resources; a queued job contains no Request or credentials."""

    def __init__(self, *, config, credentials, accounts, trackers, client_factory, service, credential_loader=None):
        self.config, self.credentials, self.accounts = config, credentials, accounts
        self.trackers, self.client_factory, self.service = trackers, client_factory, service
        self.credential_loader = credential_loader

    @contextmanager
    def scope(self):
        from backend.app.core.account_state_store import account_state_context
        from backend.app.core.credential_store import credential_store_context
        from backend.app.services.youtube_quota_service import youtube_quota_context

        with ExitStack() as stack:
            stack.enter_context(settings_context(self.config))
            stack.enter_context(credential_store_context(self.credentials))
            stack.enter_context(account_state_context(self.accounts))
            stack.enter_context(youtube_quota_context(self.trackers))
            stack.enter_context(google_client_context(self.client_factory))
            yield

    def _youtube_context(self, identity):
        from backend.app.services.youtube_quota_service import get_youtube_quota_tracker

        public = self.credentials.get_youtube_public(identity.owner, slot=identity.slot) or {}
        token = self.credentials.get_youtube_credentials(identity.owner, slot=identity.slot)
        if not token or public.get("channel_id") != identity.channel_id:
            raise http_error(403, "youtube_authorization_changed", "YouTube 授權或頻道已變更，尚未寫入，請重新預覽。")
        creds = build_credentials_from_dict(
            token, credential_key="youtube", owner_sub=identity.owner, slot=identity.slot
        )
        if not creds or not creds.valid or not has_youtube_scope(creds):
            raise http_error(403, "youtube_scope_required", "YouTube 授權已失效，請重新連線。")
        return YouTubeRequestContext(
            slot=identity.slot,
            credentials=creds,
            quota_limiter=get_youtube_quota_tracker(identity.slot),
            owner_sub=identity.owner,
            channel_id=identity.channel_id,
            routing_mode=identity.routing_mode,
        )

    def load_credentials(self, identity):
        if self.credential_loader is not None:
            return self.credential_loader(identity)
        public = self.credentials.get_google_public(identity.owner) or {}
        email = (public.get("user") or {}).get("email") or public.get("email")
        if self.config.allowlist_required and (not email or not self.config.is_google_email_allowed(email)):
            raise http_error(403, "access_denied", "目前帳號未列於允許名單。")
        context = self._youtube_context(identity)
        sheets = get_sheets_credentials(owner_sub=identity.owner)
        if not sheets or not sheets.valid or not has_sheets_scope(sheets):
            raise http_error(403, "google_sheets_scope_required", "試算表授權已失效，請重新連線。")
        return context, sheets

    def fallback(self, context, *, estimated_units, attempted_slots):
        if context.routing_mode != "auto_primary":
            return None
        for slot in ("secondary", "primary"):
            if slot in attempted_slots or slot == context.slot:
                continue
            try:
                candidate = self._youtube_context(
                    JobIdentity(context.owner_sub, context.channel_id, slot, context.routing_mode)
                )
                if candidate.quota_limiter.get_usage().get("effective_available_units", 0) < estimated_units:
                    continue
                return replace(candidate, selection_reason="auto_secondary_quota_fallback")
            except Exception:
                continue
        return None


class YouTubePublishRunner:
    def __init__(self, store, runtime, *, capacity=4, shutdown_timeout=5):
        self.store, self.runtime = store, runtime
        self.id = str(uuid.uuid4())
        self.capacity = threading.BoundedSemaphore(capacity)
        self.queue = queue.Queue(maxsize=capacity)
        self.shutdown_timeout = shutdown_timeout
        self.accepting = False
        self.lock = threading.RLock()
        self.stop_event = threading.Event()
        self.thread = self.heartbeat_thread = self.file_lock = None

    def start(self):
        import fcntl

        with self.lock:
            if self.accepting:
                return
            self.store.path.parent.mkdir(parents=True, exist_ok=True)
            handle = open(self.store.path.with_suffix(".runner.lock"), "a+")
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                handle.close()
                raise RuntimeError("YouTube publish runner requires one process per operation store") from None
            self.file_lock = handle
            try:
                self.store.recover_lost_executor_jobs()
                with self.store.transaction() as db:
                    db.execute(
                        "INSERT INTO operation_executors VALUES (?,?,?,'active')", (self.id, os.getpid(), time.time())
                    )
                self.store.executor_id = self.id
                self.stop_event.clear()
                self.accepting = True
                self.thread = threading.Thread(target=self._run, name="youtube-publish", daemon=True)
                self.heartbeat_thread = threading.Thread(
                    target=self._heartbeat, name="youtube-publish-heartbeat", daemon=True
                )
                self.thread.start()
                self.heartbeat_thread.start()
            except BaseException:
                handle.close()
                self.file_lock = None
                self.accepting = False
                raise

    def _heartbeat(self):
        while not self.stop_event.wait(5):
            with self.store.transaction() as db:
                db.execute("UPDATE operation_executors SET heartbeat=? WHERE id=?", (time.time(), self.id))

    def submit(self, payload, context):
        kind = "youtube.metadata_publish"
        with self.lock:
            existing = self.store.existing(context.owner_sub, kind, payload, context.channel_id)
            if existing:
                operation, _ = self.store.claim(context.owner_sub, kind, payload, channel_id=context.channel_id)
                return self.accepted(operation)
            if not self.accepting or not self.capacity.acquire(blocking=False):
                raise http_error(
                    503,
                    "publish_queue_full",
                    "發布佇列已滿或暫停受理，請稍後以相同請求重試。",
                    headers={"Retry-After": "5"},
                )
            try:
                workflow = DraftPublishWorkflow(self.runtime.service.ports)
                workflow.validate_submission(payload, context)
                _, issued = URLSafeTimedSerializer(self.runtime.config.SECRET_KEY).loads(
                    payload.preview_token, salt=PREVIEW_TOKEN_SALT, max_age=PREVIEW_TOKEN_MAX_AGE, return_timestamp=True
                )
                identity = JobIdentity(context.owner_sub, context.channel_id, context.slot, context.routing_mode)
                operation, created = self.store.claim(
                    context.owner_sub,
                    kind,
                    payload,
                    channel_id=context.channel_id,
                    progress_plan=payload.preview_snapshot["plan"],
                    executor_id=self.id,
                    acceptance={
                        "preview_expires_at": issued.timestamp() + PREVIEW_TOKEN_MAX_AGE,
                        "identity": identity.__dict__,
                    },
                )
                if not created:
                    self.capacity.release()
                    return self.accepted(operation)
                try:
                    self.queue.put_nowait((operation["owner"], operation["id"]))
                except BaseException:
                    Recorder(self.store, operation).finish(failed=True)
                    raise
                return self.accepted(operation)
            except BaseException:
                self.capacity.release()
                raise

    def accepted(self, operation):
        public = public_operation(operation, self.store)
        return {
            "version": 1,
            "operation_id": operation["id"],
            "state": public["state"],
            "progress": operation.get("progress"),
        }

    def _execute(self, owner, operation_id):
        operation = self.store.get(owner, operation_id)
        recorder = Recorder(self.store, operation)
        try:
            with self.runtime.scope(), recording(recorder):
                identity = JobIdentity(**operation["acceptance"]["identity"])
                context, sheets = self.runtime.load_credentials(identity)
                if context.owner_sub != owner or context.channel_id != identity.channel_id:
                    raise http_error(403, "youtube_authorization_changed", "發布授權與受理頻道不同。")
                payload = DraftPublishInput.model_validate(operation["plan"])
                service = recorder.youtube_service(self.runtime.service)
                result = DraftPublishWorkflow(service.ports).execute(
                    payload, context, sheets, self.store, accepted_operation=operation
                )
                recorder.finish({**result, "operation_id": operation_id})
        except BaseException as exc:
            logger.warning("Publish job ended before full completion: %s", type(exc).__name__)
            detail = getattr(exc, "detail", {})
            recorder.update(
                error={
                    "code": detail.get("code", "publish_job_interrupted")
                    if isinstance(detail, dict)
                    else "publish_job_interrupted",
                    "message": "發布未全部完成，請核對逐片結果並重新預覽。",
                }
            )
            recorder.finish(failed=True)

    def _run(self):
        try:
            while not self.stop_event.is_set() or not self.queue.empty():
                try:
                    owner, operation_id = self.queue.get(timeout=0.2)
                except queue.Empty:
                    continue
                try:
                    self._execute(owner, operation_id)
                finally:
                    self.capacity.release()
                    self.queue.task_done()
        finally:
            with self.store.transaction() as db:
                db.execute("UPDATE operation_executors SET state='stopped' WHERE id=?", (self.id,))
            if self.file_lock:
                self.file_lock.close()
                self.file_lock = None

    def shutdown(self):
        with self.lock:
            self.accepting = False
            while True:
                try:
                    owner, operation_id = self.queue.get_nowait()
                except queue.Empty:
                    break
                Recorder(self.store, self.store.get(owner, operation_id)).finish(failed=True)
                self.capacity.release()
                self.queue.task_done()
            self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=self.shutdown_timeout)
        if self.heartbeat_thread:
            self.heartbeat_thread.join(timeout=1)
        # A still-running worker retains the file lock and durable active ownership.
