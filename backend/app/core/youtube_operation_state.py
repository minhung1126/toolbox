"""Versioned content evidence and per-target progress, independent of write attempts."""

from __future__ import annotations

import hashlib
import json

PROGRESS_STATUSES = (
    "queued",
    "running",
    "succeeded",
    "unchanged",
    "skipped",
    "failed",
    "not_attempted",
    "needs_reconciliation",
)


def content_fingerprint(title, description):
    def canonical(value):
        return str(value).replace("\r\n", "\n").replace("\r", "\n")

    content = {"version": 1, "title": canonical(title), "description": canonical(description)}
    return (
        "v1:"
        + hashlib.sha256(
            json.dumps(content, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
        ).hexdigest()
    )


def recount_progress(progress):
    counts = dict.fromkeys(PROGRESS_STATUSES, 0)
    for row in progress["rows"]:
        if row["status"] not in counts:
            raise ValueError("Invalid progress status")
        counts[row["status"]] += 1
    progress.update(total=len(progress["rows"]), counts=counts)
    return progress


def initial_progress(plan):
    rows = []
    identities = set()
    for item in plan:
        identity = (item["video_id"], item.get("playlist_item_id"))
        if identity in identities:
            raise ValueError("Duplicate progress target")
        identities.add(identity)
        row = {
            key: item[key]
            for key in ("video_id", "title", "description", "person_key", "playlist_id", "playlist_item_id")
            if key in item
        }
        row.update(
            status="skipped" if item.get("status") == "skipped" else "queued",
            reason=item.get("reason") or "",
            attempted_parts=[],
            confirmation=None,
        )
        rows.append(row)
    return recount_progress({"version": 1, "revision": 1, "rows": rows})


def change_progress(operation, video_id, *, playlist_item_id=None, **changes):
    progress = operation["progress"]
    row = next(
        row
        for row in progress["rows"]
        if row["video_id"] == video_id and row.get("playlist_item_id") == playlist_item_id
    )
    row.update(changes)
    recount_progress(progress)
    progress["revision"] += 1


def write_targets(operation):
    """All unfinished video writers, including legacy interrupted plans."""
    if operation["kind"] not in {"youtube.metadata_publish", "youtube.metadata_update"}:
        return set()
    if operation.get("progress"):
        return {
            row["video_id"]
            for row in operation["progress"]["rows"]
            if row["status"] in {"queued", "running", "needs_reconciliation"}
        }
    pending = {
        item["remote_id"] for item in operation.get("items", []) if item["state"] in {"running", "needs_reconciliation"}
    }
    if operation["state"] in {"prepared", "running"}:
        plan = operation.get("plan") or {}
        pending.update(
            item["video_id"] for item in plan.get("edits", plan.get("assignments", [])) if not item.get("skip")
        )
        if plan.get("video_id"):
            pending.add(plan["video_id"])
    return pending


def _projection_get(db, table, keys, values):
    row = db.execute(
        f"SELECT document FROM {table} WHERE " + " AND ".join(f"{key}=?" for key in keys), values
    ).fetchone()
    return json.loads(row[0]) if row else {}


def _projection_put(db, table, values, document):
    db.execute(
        f"INSERT OR REPLACE INTO {table} VALUES (" + ",".join("?" for _ in (*values, document)) + ")",
        (*values, json.dumps(document, ensure_ascii=False)),
    )


def project_operation(db, operation):
    """Only confirmed dimensions are projected; repeated evidence is idempotent."""
    owner, channel = operation["owner"], operation.get("channel_id")
    if not channel or not operation["kind"].startswith("youtube."):
        return
    plan = operation.get("plan") or {}
    snapshot = plan.get("preview_snapshot") or {}
    stage = plan.get("stage_snapshot") or {}
    prepared = {row["video_id"]: row for row in stage.get("plan", [])}
    planned = {row.get("video_id"): row for row in snapshot.get("plan", [])}
    assignments = {row["video_id"]: row.get("person") for row in plan.get("assignments", [])}
    cleanup = {row["playlist_item_id"]: row for row in snapshot.get("items", [])}
    for index, attempt in enumerate(operation.get("items", [])):
        phase, remote = attempt.get("phase"), attempt.get("remote_id")
        intended = attempt.get("intended") or {}
        evidence = attempt.get("evidence") or {}
        reconciliation = attempt.get("reconciliation") or {}
        verified = attempt.get("state") == "completed" and (
            evidence.get("provider_returned") is True
            or (reconciliation.get("provider_read") is True and reconciliation.get("matches_intent") is True)
        )
        timestamp = attempt.get("confirmed_at") or attempt.get("created_at") or operation.get("created_at", 0)
        order = [timestamp, operation["id"], index]
        source = (
            "provider_read"
            if reconciliation.get("matches_intent") or evidence.get("provider_read")
            else "provider_response"
        )
        if phase == "cleanup":
            row = cleanup.get(remote)
            if not row:
                continue
            keys = (owner, channel, row["playlist_id"], remote)
            previous = _projection_get(
                db, "youtube_cleanup_state", ("owner", "channel_id", "playlist_id", "playlist_item_id"), keys
            )
            if previous.get("order", []) > order:
                continue
            state = (
                "removed"
                if verified
                else "unknown"
                if attempt.get("state") in {"running", "needs_reconciliation"}
                else "failed"
            )
            if previous.get("status") == "removed" and state != "removed":
                continue
            _projection_put(
                db,
                "youtube_cleanup_state",
                keys,
                {
                    "video_id": row["video_id"],
                    "playlist_id": row["playlist_id"],
                    "playlist_item_id": remote,
                    "status": state,
                    "operation_id": operation["id"],
                    "confirmed_at": timestamp,
                    "source": source if verified else None,
                    "order": order,
                },
            )
            continue
        if phase not in {"metadata", "metadata_publish", "publish"} or not remote:
            continue
        keys = (owner, channel, remote)
        previous = _projection_get(db, "youtube_video_state", ("owner", "channel_id", "video_id"), keys)
        previous.setdefault("video_id", remote)
        target = planned.get(remote) or {}
        parts = evidence.get("parts", intended.get("parts"))
        if parts is None:
            # Legacy combined operations require their signed per-video parts.
            parts = target.get("parts") if phase == "metadata_publish" else ["status"] if phase == "publish" else []
        parts = parts or []
        person = intended.get("person_key") or prepared.get(remote, {}).get("person_key")
        if (
            not person
            and phase == "metadata"
            and target.get("newTitle") == intended.get("title")
            and target.get("newDescription") == intended.get("description")
        ):
            person = assignments.get(remote)
        if person == "不編輯":
            person = None
        if (
            verified
            and "snippet" in parts
            and person
            and isinstance(intended.get("title"), str)
            and isinstance(intended.get("description"), str)
        ):
            old = previous.get("person_application") or {}
            if old.get("order", []) <= order:
                previous["person_application"] = {
                    "person_key": person,
                    "content_fingerprint": content_fingerprint(intended["title"], intended["description"]),
                    "operation_id": operation["id"],
                    "confirmed_at": timestamp,
                    "parts": parts,
                    "attempted_write": True,
                    "source": source,
                    "order": order,
                }
        elif person and "snippet" in parts and attempt.get("state") == "failed_before_write":
            previous["known_not_applied"] = True
        if verified and (
            phase == "publish" or phase == "metadata_publish" and intended.get("privacyStatus") == "public"
        ):
            checked_at = reconciliation.get("checked_at") or timestamp
            if (previous.get("public_observation") or {}).get("checked_at", 0) <= checked_at:
                previous["public_observation"] = {
                    "privacy": "public",
                    "checked_at": checked_at,
                    "operation_id": operation["id"],
                    "source": source,
                }
        if (
            attempt.get("state") in {"failed_before_write", "needs_reconciliation"}
            and (previous.get("last_error") or {}).get("order", []) <= order
        ):
            previous["last_error"] = {"operation_id": operation["id"], "state": attempt["state"], "order": order}
        _projection_put(db, "youtube_video_state", keys, previous)
