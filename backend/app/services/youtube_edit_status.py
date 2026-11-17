"""Historical person application and pending work come from indexed journal projections."""


def video_edit_statuses(store, owner, channel_id, video_ids):
    return {
        video_id: state["edit_status"]
        for video_id, state in store.video_processing_states(owner, channel_id, video_ids).items()
    }
