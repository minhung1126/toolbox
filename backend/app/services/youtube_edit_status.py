"""Derive historical edit status from durable, per-video write evidence only."""


def video_edit_statuses(store, owner, channel_id, video_ids):
    statuses = {video_id: "unknown" for video_id in video_ids}
    uncertain = set()
    for operation in store.youtube_metadata_attempts(owner, channel_id):
        for item in operation.get("items", []):
            video_id = item.get("remote_id")
            if video_id not in statuses or item.get("phase") not in {"metadata", "metadata_publish"}:
                continue
            # A failed later attempt never erases a verified historical success.
            if statuses[video_id] == "applied":
                continue
            evidence = item.get("evidence") or {}
            reconciliation = item.get("reconciliation") or {}
            verified = evidence.get("provider_returned") is True or (
                reconciliation.get("provider_read") is True and reconciliation.get("matches_intent") is True
            )
            if item.get("state") == "completed" and verified:
                statuses[video_id] = "applied"
            elif item.get("state") == "failed_before_write":
                statuses[video_id] = "not_applied"
            else:
                # Pending, interrupted and legacy evidence remain unknown.
                statuses[video_id] = "unknown"
                uncertain.add(video_id)
    for video_id in uncertain:
        if statuses[video_id] != "applied":
            statuses[video_id] = "unknown"
    return statuses
