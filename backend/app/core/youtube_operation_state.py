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
