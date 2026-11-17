"""Account-scoped journal queries. Reconciliation performs provider reads only."""

from fastapi import APIRouter, Depends

from backend.app.api.playlist_sort import get_playlist_client_factory, get_playlist_credential_store
from backend.app.api.youtube_workflow_dependencies import get_youtube_workflow_service
from backend.app.core.dependencies import require_account_subject, require_youtube_context, require_ytmusic_context
from backend.app.core.error_contract import http_error
from backend.app.core.operation_store import OperationStore
from backend.app.services.operation_journal import get_operation_store, public_operation
from backend.app.services.playlist_sort_service import fetch_playlist_items_for_sort

router = APIRouter(prefix="/operations", tags=["Operations"])


@router.get("")
def list_operations(owner=Depends(require_account_subject), store: OperationStore = Depends(get_operation_store)):
    return {"version": 1, "operations": [public_operation(operation) for operation in store.list(owner)]}


@router.get("/{operation_id}")
def get_operation(
    operation_id: str, owner=Depends(require_account_subject), store: OperationStore = Depends(get_operation_store)
):
    return public_operation(store.get(owner, operation_id))


def _check_channel(operation, context):
    if operation["channel_id"] and operation["channel_id"] != context.channel_id:
        raise http_error(409, "operation_channel_mismatch", "請連線至此作業原本的頻道再核對。")
    if operation["state"] == "running":
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
    operation = public_operation(operation)
    _check_channel(operation, context)
    snapshot = operation["plan"].get("preview_snapshot") or {}
    if operation["kind"] == "youtube.metadata_publish":
        return _reconcile_draft_publish(operation, context, store, service)
    expected_video_ids = snapshot.get("video_ids") or []
    ids = list(
        {item["remote_id"] for item in operation["items"] if item["phase"] in {"metadata", "publish"}}
        | (set(expected_video_ids) if operation["items"] and operation["kind"] == "youtube.publish_cleanup" else set())
    )
    details = {item["id"]: item for item in service.ports.fetch_video_details(context, ids)} if ids else {}
    playlist = snapshot.get("playlist_id") or operation["plan"].get("playlist_id")
    raw_items = (
        service.ports.fetch_playlist_items(context, playlist)
        if playlist and operation["kind"] == "youtube.publish_cleanup"
        else []
    )
    playlist_ids = {item["id"] for item in raw_items}
    remaining_videos = {
        item.get("contentDetails", {}).get("videoId") or item.get("snippet", {}).get("resourceId", {}).get("videoId")
        for item in raw_items
    }

    def reconcile(op):
        verified = []
        for item in op["items"]:
            detail = details.get(item["remote_id"], {})
            if item["phase"] == "metadata":
                matched = all(
                    detail.get("snippet", {}).get(key) == value for key, value in item["intended"].items()
                ) and bool(detail)
            elif item["phase"] == "publish":
                matched = detail.get("status", {}).get("privacyStatus") == "public"
            else:
                matched = bool(playlist) and item["remote_id"] not in playlist_ids
            item["reconciliation"] = {"provider_read": True, "matches_intent": matched}
            # An earlier success stays in history, while this read records current remote state.
            if matched:
                item["state"] = "completed"
            verified.append(matched)
        # Missing/unattempted items must not be silently treated as completed.
        expected = len(op["plan"].get("assignments", []))
        seen = len({item["remote_id"] for item in op["items"] if item["phase"] == "metadata"})
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
                and (seen >= expected > 0 or (op.get("result") or {}).get("completed") is True)
            )
        op["state"] = "completed" if complete else "partial" if any(verified) else "needs_reconciliation"
        op["reconciliation"] = {"provider_read": True, "matches_intent": complete}

    return public_operation(store.update(context.owner_sub, operation_id, reconcile))


def _reconcile_draft_publish(operation, context, store, service):
    from backend.app.services.youtube_service import video_matches_public_draft

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
            )
        )

    plan = (operation["plan"].get("preview_snapshot") or {}).get("plan") or []
    active = {item["video_id"]: item for item in plan if item["status"] != "skipped"}
    details = {item["id"]: item for item in service.ports.fetch_video_details(context, list(active))} if active else {}
    matches = {
        video_id: video_matches_public_draft(details.get(video_id, {}), item["title"], item["description"])
        for video_id, item in active.items()
    }

    def reconcile(op):
        for item in op["items"]:
            matched = matches.get(item["remote_id"], False)
            item["reconciliation"] = {"provider_read": True, "matches_intent": matched}
            if matched:
                item["state"] = "completed"
        result = op.get("result")
        if result:
            for item in result["results"]:
                if matches.get(item["video_id"]):
                    item.update(status="succeeded", reason="唯讀核對已確認文字與公開狀態。", reconciled=True)
            for status in ("succeeded", "skipped", "failed", "not_attempted", "needs_reconciliation"):
                result[f"{status}_count"] = sum(item["status"] == status for item in result["results"])
            result["completed"] = all(item["status"] in {"succeeded", "skipped"} for item in result["results"])
        complete = bool(plan) and all(matches.values())
        op["state"] = "completed" if complete else "partial" if any(matches.values()) else "needs_reconciliation"
        op["reconciliation"] = {"provider_read": True, "matches_intent": complete, "videos": matches}

    return public_operation(store.update(context.owner_sub, operation["id"], reconcile))


@router.post("/{operation_id}/reconcile-music")
def reconcile_music(
    operation_id: str,
    context=Depends(require_ytmusic_context),
    store: OperationStore = Depends(get_operation_store),
    token_store=Depends(get_playlist_credential_store),
    client_factory=Depends(get_playlist_client_factory),
):
    operation = public_operation(store.get(context.owner_sub, operation_id))
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
        raise http_error(
            409, "operation_remote_id_unknown", "新歌單 ID 未確認，請先在 YouTube Music 核對；不會再次建立。"
        )
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
    expected = plan.get("validated_order")
    matched = bool(expected) and (
        [item.get("playlist_item_id") for item in items] == [item["playlist_item_id"] for item in expected]
        if plan.get("mode") == "in_place"
        else [item.get("video_id") for item in items] == [item["video_id"] for item in expected]
    )
    return public_operation(
        store.update(
            context.owner_sub,
            operation_id,
            lambda op: op.update(
                state="completed" if matched else "needs_reconciliation",
                reconciliation={"provider_read": True, "matches_intent": matched, "playlist_id": playlist},
            ),
        )
    )
