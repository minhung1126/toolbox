from __future__ import annotations

import pytest

from backend.app.services.playlist_sort_service import (
    _parse_iso8601_duration,
    apply_sort_to_playlist,
    build_sort_preview,
    get_first_artist,
    is_generic_artist,
    normalize_artist_name,
    sort_items,
    split_artists,
)


def test_parse_iso8601_duration():
    assert _parse_iso8601_duration("PT1H2M3S") == 3723
    assert _parse_iso8601_duration("PT5M") == 300
    assert _parse_iso8601_duration("PT30S") == 30
    assert _parse_iso8601_duration("PT1H") == 3600
    assert _parse_iso8601_duration("") == 0
    assert _parse_iso8601_duration("INVALID") == 0


def test_sort_by_title():
    items = [{"title": "Banana"}, {"title": "apple"}, {"title": "Cherry"}]
    sorted_asc = sort_items(items, [{"field": "title", "direction": "asc"}])
    assert [i["title"] for i in sorted_asc] == ["apple", "Banana", "Cherry"]

    sorted_desc = sort_items(items, [{"field": "title", "direction": "desc"}])
    assert [i["title"] for i in sorted_desc] == ["Cherry", "Banana", "apple"]


def test_sort_by_artist():
    items = [
        {"title": "Song A", "channel_title": "Artist C"},
        {"title": "Song B", "channel_title": "Artist A"},
        {"title": "Song C", "channel_title": "artist B"},
    ]
    sorted_asc = sort_items(items, [{"field": "artist", "direction": "asc"}])
    assert [i["channel_title"] for i in sorted_asc] == ["Artist A", "artist B", "Artist C"]


def test_sort_by_added_at():
    items = [
        {"added_at": "2023-01-01T00:00:00Z"},
        {"added_at": "2021-01-01T00:00:00Z"},
        {"added_at": "2022-01-01T00:00:00Z"},
    ]
    sorted_asc = sort_items(items, [{"field": "added_at", "direction": "asc"}])
    assert [i["added_at"] for i in sorted_asc] == [
        "2021-01-01T00:00:00Z",
        "2022-01-01T00:00:00Z",
        "2023-01-01T00:00:00Z",
    ]


def test_sort_by_published_at():
    items = [
        {"published_at": "2020-01-01T00:00:00Z"},
        {"published_at": "2023-01-01T00:00:00Z"},
        {"published_at": "2021-01-01T00:00:00Z"},
    ]
    sorted_asc = sort_items(items, [{"field": "published_at", "direction": "asc"}])
    assert [i["published_at"] for i in sorted_asc] == [
        "2020-01-01T00:00:00Z",
        "2021-01-01T00:00:00Z",
        "2023-01-01T00:00:00Z",
    ]


def test_sort_by_duration():
    items = [
        {"duration_seconds": 300},
        {"duration_seconds": 150},
        {"duration_seconds": 400},
    ]
    sorted_asc = sort_items(items, [{"field": "duration_seconds", "direction": "asc"}])
    assert [i["duration_seconds"] for i in sorted_asc] == [150, 300, 400]

    sorted_by_duration = sort_items(items, [{"field": "duration", "direction": "desc"}])
    assert [i["duration_seconds"] for i in sorted_by_duration] == [400, 300, 150]


def test_sort_multi_keys():
    items = [
        {"title": "Song B", "channel_title": "Artist A"},
        {"title": "Song A", "channel_title": "Artist A"},
        {"title": "Song C", "channel_title": "Artist B"},
    ]
    sorted_asc = sort_items(items, [{"field": "artist", "direction": "asc"}, {"field": "title", "direction": "asc"}])
    assert [i["title"] for i in sorted_asc] == ["Song A", "Song B", "Song C"]


def test_sort_random():
    items = [{"title": str(i)} for i in range(10)]
    sorted_rand = sort_items(items, [{"field": "random"}])
    assert len(sorted_rand) == 10
    # Highly likely to be different order
    assert [i["title"] for i in sorted_rand] != [str(i) for i in range(10)]


def test_build_sort_preview():
    original = [{"playlist_item_id": "1"}, {"playlist_item_id": "2"}, {"playlist_item_id": "3"}]
    sorted_items = [{"playlist_item_id": "1"}, {"playlist_item_id": "3"}, {"playlist_item_id": "2"}]

    preview = build_sort_preview(original, sorted_items)
    assert preview["total"] == 3
    assert preview["unchanged_count"] == 1
    assert preview["moved_count"] == 2

    statuses = {item["playlist_item_id"]: item["status"] for item in preview["items"]}
    assert statuses["1"] == "unchanged"
    assert statuses["2"] == "moved"
    assert statuses["3"] == "moved"


def test_sort_empty_list():
    assert sort_items([], [{"field": "title", "direction": "asc"}]) == []


def test_sort_single_item():
    items = [{"title": "A"}]
    assert sort_items(items, [{"field": "title", "direction": "desc"}]) == [{"title": "A", "position": 0}]


def test_locale_aware_sort():
    items = [{"title": "測試"}, {"title": "apple"}, {"title": "Banana"}, {"title": "啊"}]
    sorted_asc = sort_items(items, [{"field": "title", "direction": "asc"}])
    titles = [i["title"] for i in sorted_asc]
    # English first, then CJK based on unicode
    assert titles[0] == "apple"
    assert titles[1] == "Banana"


def test_sort_by_album():
    items = [
        {"title": "Song 1", "album": "Midnights"},
        {"title": "Song 2", "album": "1989"},
        {"title": "Song 3", "album": "folklore"},
    ]
    sorted_asc = sort_items(items, [{"field": "album", "direction": "asc"}])
    assert [i["album"] for i in sorted_asc] == ["1989", "folklore", "Midnights"]

    sorted_desc = sort_items(items, [{"field": "album", "direction": "desc"}])
    assert [i["album"] for i in sorted_desc] == ["Midnights", "folklore", "1989"]


def test_sort_by_track_number():
    items = [
        {"title": "Track 3", "track_number": 3},
        {"title": "Track 1", "track_number": 1},
        {"title": "Track 10", "track_number": "10"},
        {"title": "Track 2", "track_number": 2},
    ]
    sorted_asc = sort_items(items, [{"field": "track_number", "direction": "asc"}])
    assert [i["title"] for i in sorted_asc] == ["Track 1", "Track 2", "Track 3", "Track 10"]

    sorted_desc = sort_items(items, [{"field": "track_number", "direction": "desc"}])
    assert [i["title"] for i in sorted_desc] == ["Track 10", "Track 3", "Track 2", "Track 1"]


def test_sort_track_number_missing_at_end():
    items = [
        {"title": "Track 2", "track_number": 2},
        {"title": "No Track", "track_number": None},
        {"title": "Track 1", "track_number": 1},
    ]
    sorted_asc = sort_items(items, [{"field": "track_number", "direction": "asc"}])
    assert [i["title"] for i in sorted_asc] == ["Track 1", "Track 2", "No Track"]

    sorted_desc = sort_items(items, [{"field": "track_number", "direction": "desc"}])
    assert [i["title"] for i in sorted_desc] == ["Track 2", "Track 1", "No Track"]


def test_sort_by_year():
    items = [
        {"title": "Album 2022", "year": 2022},
        {"title": "Album 1989", "year": 1989},
        {"title": "Album 2014", "year": "2014"},
        {"title": "No Year", "year": None},
    ]
    sorted_asc = sort_items(items, [{"field": "year", "direction": "asc"}])
    assert [i["title"] for i in sorted_asc] == ["Album 1989", "Album 2014", "Album 2022", "No Year"]

    sorted_desc = sort_items(items, [{"field": "year", "direction": "desc"}])
    assert [i["title"] for i in sorted_desc] == ["Album 2022", "Album 2014", "Album 1989", "No Year"]


def test_sort_artist_album_track_multi_key():
    items = [
        {"artist": "Taylor Swift", "album": "Red", "track_number": 2, "title": "Red (Track 2)"},
        {"artist": "Adele", "album": "30", "track_number": 1, "title": "Strangers By Nature"},
        {"artist": "Taylor Swift", "album": "1989", "track_number": 1, "title": "Welcome To New York"},
        {"artist": "Taylor Swift", "album": "Red", "track_number": 1, "title": "State of Grace"},
        {"artist": "Adele", "album": "21", "track_number": 1, "title": "Rolling in the Deep"},
    ]
    keys = [
        {"field": "artist", "direction": "asc"},
        {"field": "album", "direction": "asc"},
        {"field": "track_number", "direction": "asc"},
    ]
    sorted_res = sort_items(items, keys)
    assert [i["title"] for i in sorted_res] == [
        "Rolling in the Deep",  # Adele, 21, Track 1
        "Strangers By Nature",  # Adele, 30, Track 1
        "Welcome To New York",  # Taylor Swift, 1989, Track 1
        "State of Grace",  # Taylor Swift, Red, Track 1
        "Red (Track 2)",  # Taylor Swift, Red, Track 2
    ]


def test_sort_album_respects_track_number():
    items = [
        {"title": "Track 3", "album": "Midnights", "track_number": 3},
        {"title": "Track 1", "album": "Midnights", "track_number": 1},
        {"title": "Track 2", "album": "Midnights", "track_number": 2},
        {"title": "Bonus", "album": "Midnights", "track_number": None},
        {"title": "1989 Track 2", "album": "1989", "track_number": 2},
        {"title": "1989 Track 1", "album": "1989", "track_number": 1},
    ]
    # Sorting by album alone must respect track numbers within each album
    sorted_asc = sort_items(items, [{"field": "album", "direction": "asc"}])
    assert [i["title"] for i in sorted_asc] == [
        "1989 Track 1",
        "1989 Track 2",
        "Track 1",
        "Track 2",
        "Track 3",
        "Bonus",
    ]

    sorted_desc = sort_items(items, [{"field": "album", "direction": "desc"}])
    assert [i["title"] for i in sorted_desc] == [
        "Track 1",
        "Track 2",
        "Track 3",
        "Bonus",
        "1989 Track 1",
        "1989 Track 2",
    ]


def test_sort_by_year_with_same_year_release_date_fallback():
    items = [
        {"title": "October Single", "year": 2023, "release_date": "2023-10-01"},
        {"title": "May Single", "year": 2023, "release_date": "2023-05-12"},
        {"title": "January Single", "year": 2023, "release_date": "2023-01-15"},
        {"title": "Old Song", "year": 2020, "release_date": "2020-06-01"},
        {"title": "No Date Song", "year": None, "release_date": None},
    ]
    sorted_asc = sort_items(items, [{"field": "year", "direction": "asc"}])
    assert [i["title"] for i in sorted_asc] == [
        "Old Song",
        "January Single",
        "May Single",
        "October Single",
        "No Date Song",
    ]

    sorted_desc = sort_items(items, [{"field": "year", "direction": "desc"}])
    assert [i["title"] for i in sorted_desc] == [
        "October Single",
        "May Single",
        "January Single",
        "Old Song",
        "No Date Song",
    ]


def test_sort_artist_and_album_respects_track_number():
    items = [
        {"artist": "Taylor Swift", "album": "Red", "track_number": 2, "title": "Red (Track 2)"},
        {"artist": "Taylor Swift", "album": "Red", "track_number": 1, "title": "State of Grace"},
        {"artist": "Taylor Swift", "album": "Red", "track_number": None, "title": "Red Bonus"},
        {"artist": "Taylor Swift", "album": "1989", "track_number": 2, "title": "Blank Space"},
        {"artist": "Taylor Swift", "album": "1989", "track_number": 1, "title": "Welcome To New York"},
        {"artist": "Adele", "album": "21", "track_number": 2, "title": "Rumour Has It"},
        {"artist": "Adele", "album": "21", "track_number": 1, "title": "Rolling in the Deep"},
    ]
    keys = [
        {"field": "artist", "direction": "asc"},
        {"field": "album", "direction": "asc"},
    ]
    sorted_res = sort_items(items, keys)
    assert [i["title"] for i in sorted_res] == [
        "Rolling in the Deep",
        "Rumour Has It",
        "Welcome To New York",
        "Blank Space",
        "State of Grace",
        "Red (Track 2)",
        "Red Bonus",
    ]


def test_sort_album_singles_ordered_by_year():
    """Verify that singles (album='單曲') and albums are ordered chronologically by release year.

    A 2025 video (single) must not appear before a 2023 album track when sorting
    by album, and non-album singles should slot into their chronological release positions.
    """
    items = [
        {
            "title": "2025 Single",
            "album": "單曲",
            "track_number": 1,
            "year": None,
            "release_date": "2025-03-15",
        },
        {
            "title": "2023 Album Track",
            "album": "My Album",
            "track_number": 1,
            "year": 2023,
            "release_date": None,
        },
        {
            "title": "2021 Single",
            "album": "單曲",
            "track_number": 1,
            "year": 2021,
            "release_date": "2021-07-04",
        },
    ]
    sorted_res = sort_items(items, [{"field": "album", "direction": "asc"}])
    titles = [i["title"] for i in sorted_res]
    # Chronological by release year: 2021 single < 2023 album track < 2025 single
    assert titles[0] == "2021 Single", f"Expected 2021 single first, got: {titles}"
    assert titles[1] == "2023 Album Track", f"Expected 2023 album track second, got: {titles}"
    assert titles[2] == "2025 Single", f"Expected 2025 single third, got: {titles}"


def test_sort_album_singles_with_cjk_album():
    """Verify non-album tracks are not shoved before CJK album tracks when sorting by album."""
    items = [
        {
            "title": "2024 Single",
            "album": "",
            "track_number": 1,
            "year": 2024,
            "release_date": "2024-05-20",
        },
        {
            "title": "2003 Album Track",
            "album": "葉惠美",
            "track_number": 1,
            "year": 2003,
            "release_date": "2003-07-31",
        },
    ]
    sorted_res = sort_items(items, [{"field": "album", "direction": "asc"}])
    titles = [i["title"] for i in sorted_res]
    assert titles[0] == "2003 Album Track"
    assert titles[1] == "2024 Single"


def test_sort_album_videos_ordered_chronologically():
    """Verify that videos (album='影片') with fallback release_date are sorted chronologically with albums."""
    items = [
        {
            "title": "2026 Album Track",
            "album": "To Be Continued",
            "track_number": 1,
            "year": 2026,
            "release_date": None,
        },
        {
            "title": "[DNFM] 'Embracing me' (Video)",
            "album": "影片",
            "track_number": None,
            "year": 2023,
            "release_date": "2023-11-09",
        },
        {
            "title": "Good Bye Bye (Cover Video)",
            "album": "影片",
            "track_number": None,
            "year": 2024,
            "release_date": "2024-02-08",
        },
    ]
    sorted_res = sort_items(items, [{"field": "album", "direction": "asc"}])
    titles = [i["title"] for i in sorted_res]
    assert titles == [
        "[DNFM] 'Embracing me' (Video)",
        "Good Bye Bye (Cover Video)",
        "2026 Album Track",
    ]


def test_normalize_artist_name():
    """Verify stripping of YouTube Topic channel suffixes."""
    assert normalize_artist_name("QWER - Topic") == "QWER"
    assert normalize_artist_name("QWER - 主題") == "QWER"
    assert normalize_artist_name("QWER - 主题") == "QWER"
    assert normalize_artist_name("QWER (Topic)") == "QWER"
    assert normalize_artist_name("QWER（主題）") == "QWER"
    assert normalize_artist_name("QWER — Topic") == "QWER"
    assert normalize_artist_name("QWER － 主題") == "QWER"
    assert normalize_artist_name("QWER-Topic") == "QWER"
    assert normalize_artist_name("QWER") == "QWER"
    assert normalize_artist_name("IU - Topic, Suga") == "IU, Suga"
    assert normalize_artist_name("Topic") == "Topic"
    assert normalize_artist_name("- Topic") == "- Topic"
    assert normalize_artist_name("") == ""
    assert normalize_artist_name(None) == ""


def test_sort_artist_normalizes_topic_channels_together():
    """Verify that 'Artist' and 'Artist - Topic' tracks are grouped under the same artist and sorted chronologically."""
    items = [
        {
            "title": "2024 Single (from main channel)",
            "artist": "QWER",
            "album": "單曲",
            "track_number": 1,
            "release_date": "2024-02-08",
        },
        {
            "title": "2023 Album Track 1 (from Topic channel)",
            "artist": "QWER - Topic",
            "album": "Harmony from Discord",
            "track_number": 1,
            "release_date": "2023-10-18",
        },
        {
            "title": "2023 Single (from main channel)",
            "artist": "QWER",
            "album": "單曲",
            "track_number": 1,
            "release_date": "2023-11-09",
        },
        {
            "title": "2024 Album Track 1 (from Topic channel)",
            "artist": "QWER - 主題",
            "album": "MANITO",
            "track_number": 1,
            "release_date": "2024-04-01",
        },
    ]

    # Preset: artist -> album -> track_number
    sort_keys = [
        {"field": "artist", "direction": "asc"},
        {"field": "album", "direction": "asc"},
        {"field": "track_number", "direction": "asc"},
    ]
    sorted_res = sort_items(items, sort_keys)
    titles = [i["title"] for i in sorted_res]

    # Without normalization, "QWER" sorts before "QWER - Topic", shoving both 2023 & 2024 singles ahead of 2023 album.
    # With normalization, all 4 belong to "QWER" and sort chronologically:
    # 1. 2023-10-18 Album track
    # 2. 2023-11-09 Single
    # 3. 2024-02-08 Single
    # 4. 2024-04-01 Album track
    assert titles == [
        "2023 Album Track 1 (from Topic channel)",
        "2023 Single (from main channel)",
        "2024 Single (from main channel)",
        "2024 Album Track 1 (from Topic channel)",
    ]


def test_apply_sort_to_playlist_resolves_synthetic_ids_via_data_api(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import MagicMock

    from ytmusicapi.exceptions import YTMusicError

    import backend.app.services.playlist_sort_service as pss
    from backend.app.core.youtube_context import YouTubeRequestContext

    context = YouTubeRequestContext(
        slot="primary",
        credentials=object(),
        quota_limiter=SimpleNamespace(),
        owner_sub="test-user",
    )

    # YTMusic in-place sort fails (e.g. no browser token)
    monkeypatch.setattr(
        pss,
        "apply_ytmusic_sort_in_place",
        MagicMock(side_effect=YTMusicError("No browser token")),
    )

    # Mock Data API fetch_playlist_items returning real Data API IDs
    mock_data_api_items = [
        {
            "id": "REAL_ID_BLnk",
            "snippet": {
                "resourceId": {"videoId": "BLnkLdzlCx4"},
                "position": 0,
            },
        },
        {
            "id": "REAL_ID_rgNd",
            "snippet": {
                "resourceId": {"videoId": "rgNdeflYdYw"},
                "position": 1,
            },
        },
    ]
    monkeypatch.setattr(pss, "fetch_playlist_items", lambda _ctx, _pid: mock_data_api_items)

    # Mock YouTube Service and playlistItems().update()
    mock_service = MagicMock()
    recorded_updates = []

    def mock_update(part, body):
        recorded_updates.append(body)
        mock_req = MagicMock()
        mock_req.execute.return_value = body
        return mock_req

    mock_service.playlistItems().update.side_effect = mock_update
    monkeypatch.setattr(pss, "get_youtube_service", lambda _ctx: mock_service)
    monkeypatch.setattr(pss, "_execute_with_quota", lambda req, _op, _ctx: req.execute())

    original_items = [
        {"playlist_item_id": "BLnkLdzlCx4_80", "video_id": "BLnkLdzlCx4", "position": 0},
        {"playlist_item_id": "rgNdeflYdYw_82", "video_id": "rgNdeflYdYw", "position": 1},
    ]
    sorted_items = [
        {
            "playlist_item_id": "rgNdeflYdYw_82",
            "video_id": "rgNdeflYdYw",
            "original_position": 1,
            "new_position": 0,
            "status": "moved",
        },
        {
            "playlist_item_id": "BLnkLdzlCx4_80",
            "video_id": "BLnkLdzlCx4",
            "original_position": 0,
            "new_position": 1,
            "status": "moved",
        },
    ]

    res = apply_sort_to_playlist(
        context=context,
        playlist_id="PL_TEST",
        sorted_items=sorted_items,
        original_items=original_items,
        mode="in_place",
        use_youtube_api=False,
    )

    assert res["succeeded"] == 2
    assert res["failed"] == 0
    assert len(recorded_updates) == 2

    # Verify that synthetic IDs (rgNdeflYdYw_82, BLnkLdzlCx4_80) were remapped to real Data API IDs
    assert recorded_updates[0]["id"] == "REAL_ID_rgNd"
    assert recorded_updates[0]["snippet"]["position"] == 0
    assert recorded_updates[0]["snippet"]["resourceId"]["videoId"] == "rgNdeflYdYw"

    assert recorded_updates[1]["id"] == "REAL_ID_BLnk"
    assert recorded_updates[1]["snippet"]["position"] == 1
    assert recorded_updates[1]["snippet"]["resourceId"]["videoId"] == "BLnkLdzlCx4"


def test_apply_sort_to_playlist_new_playlist_via_data_api(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import MagicMock

    import backend.app.services.playlist_sort_service as pss
    from backend.app.core.youtube_context import YouTubeRequestContext

    context = YouTubeRequestContext(
        slot="primary",
        credentials=object(),
        quota_limiter=SimpleNamespace(),
        owner_sub="test-user",
    )

    mock_service = MagicMock()
    mock_pl_req = MagicMock()
    mock_pl_req.execute.return_value = {"id": "NEW_PL_123"}
    mock_service.playlists().insert.return_value = mock_pl_req

    added_videos = []

    def mock_item_insert(part, body):
        added_videos.append(body["snippet"]["resourceId"]["videoId"])
        mock_item_req = MagicMock()
        mock_item_req.execute.return_value = {"id": "NEW_ITEM_ID"}
        return mock_item_req

    mock_service.playlistItems().insert.side_effect = mock_item_insert
    monkeypatch.setattr(pss, "get_youtube_service", lambda _ctx: mock_service)
    monkeypatch.setattr(pss, "_execute_with_quota", lambda req, _op, _ctx: req.execute())

    sorted_items = [
        {"video_id": "v1", "playlist_item_id": "v1_0"},
        {"video_id": "v2", "playlist_item_id": "v2_1"},
    ]

    res = apply_sort_to_playlist(
        context=context,
        playlist_id="PL_ORIG",
        sorted_items=sorted_items,
        mode="new_playlist",
        new_playlist_title="My New Sorted Playlist",
        use_youtube_api=True,
    )

    assert res["mode"] == "new_playlist"
    assert res["new_playlist_id"] == "NEW_PL_123"
    assert res["succeeded"] == 2
    assert added_videos == ["v1", "v2"]


@pytest.mark.anyio
async def test_preview_sort_quota_estimate_no_custom_token(monkeypatch):
    from types import SimpleNamespace

    import backend.app.api.playlist_sort as ps_api
    from backend.app.api.playlist_sort import SortKeyInput, SortPreviewInput, preview_sort
    from backend.app.core.credential_store import credential_store
    from backend.app.core.youtube_context import YouTubeRequestContext

    context = YouTubeRequestContext(
        slot="primary",
        credentials=object(),
        quota_limiter=SimpleNamespace(),
        owner_sub="user-no-token",
    )

    monkeypatch.setattr(credential_store, "get_ytmusic_custom_token", lambda sub: None)

    mock_items = [
        {"playlist_item_id": "v1_0", "video_id": "v1", "title": "B", "position": 0, "has_set_video_id": False},
        {"playlist_item_id": "v2_1", "video_id": "v2", "title": "A", "position": 1, "has_set_video_id": False},
    ]
    monkeypatch.setattr(ps_api, "fetch_playlist_items_for_sort", lambda *args, **kwargs: mock_items)

    inp = SortPreviewInput(
        playlist_id="PL_123",
        sort_keys=[SortKeyInput(field="title", direction="asc")],
        use_youtube_api=False,
    )

    res = await preview_sort(inp, context=context)
    assert res["quota_estimate"]["engine"] == "youtube_data_api_v3"
    assert res["quota_estimate"]["units_per_move"] == 50
    assert res["quota_estimate"]["moved_count"] == 2
    assert res["quota_estimate"]["total_units"] == 100
    assert "未設定 YouTube Music 瀏覽器 Token" in res["quota_estimate"]["message"]


def test_split_artists_and_collaboration_detection():
    assert split_artists("周杰倫, 費玉清") == ["周杰倫", "費玉清"]
    assert split_artists("周杰倫、費玉清") == ["周杰倫", "費玉清"]
    assert split_artists("周杰倫 & 費玉清") == ["周杰倫", "費玉清"]
    assert split_artists("周杰倫 feat. 費玉清") == ["周杰倫", "費玉清"]
    assert split_artists("周杰倫 (feat. 費玉清)") == ["周杰倫", "費玉清"]
    assert split_artists("Ed Sheeran & Justin Bieber") == ["Ed Sheeran", "Justin Bieber"]
    assert split_artists("QWER - Topic") == ["QWER"]
    assert split_artists("QWER") == ["QWER"]
    assert get_first_artist("周杰倫, 費玉清") == "周杰倫"
    assert get_first_artist("Ed Sheeran & Justin Bieber") == "Ed Sheeran"
    assert is_generic_artist("Various Artists") is True
    assert is_generic_artist("群星") is True
    assert is_generic_artist("周杰倫") is False


def test_sort_collaborative_song_first_author_in_album_order():
    """If a song is collaborative, prioritize the first author in classic album sort."""
    tracks = [
        {
            "title": "夜的第七章 (feat. 潘兒)",
            "artist": "周杰倫, 潘兒",
            "album": "依然范特西",
            "track_number": 1,
            "year": 2006,
        },
        {"title": "聽媽媽的話", "artist": "周杰倫", "album": "依然范特西", "track_number": 2, "year": 2006},
        {
            "title": "千里之外 (feat. 費玉清)",
            "artist": "周杰倫, 費玉清",
            "album": "依然范特西",
            "track_number": 3,
            "year": 2006,
        },
        {"title": "本草綱目", "artist": "周杰倫", "album": "依然范特西", "track_number": 4, "year": 2006},
        {"title": "可愛女人", "artist": "周杰倫", "album": "Jay", "track_number": 1, "year": 2000},
    ]
    keys = [
        {"field": "artist", "direction": "asc"},
        {"field": "year", "direction": "asc"},
        {"field": "album", "direction": "asc"},
        {"field": "track_number", "direction": "asc"},
    ]
    sorted_res = sort_items(tracks, keys)
    assert [t["title"] for t in sorted_res] == [
        "可愛女人",  # Jay (2000) Track 1
        "夜的第七章 (feat. 潘兒)",  # 依然范特西 (2006) Track 1
        "聽媽媽的話",  # 依然范特西 (2006) Track 2
        "千里之外 (feat. 費玉清)",  # 依然范特西 (2006) Track 3 (collaborative stays intact!)
        "本草綱目",  # 依然范特西 (2006) Track 4
    ]


def test_sort_collaborative_song_uncertain_first_author_stays_with_album():
    """If uncertain who the first author is (e.g. guest listed first), keep with the album."""
    tracks = [
        {"title": "夜的第七章", "artist": "周杰倫", "album": "依然范特西", "track_number": 1, "year": 2006},
        # Here Fei Yu-ching is listed first, but Jay Chou is co-artist and album belongs to Jay Chou
        {"title": "千里之外", "artist": "費玉清, 周杰倫", "album": "依然范特西", "track_number": 2, "year": 2006},
        {"title": "本草綱目", "artist": "周杰倫", "album": "依然范特西", "track_number": 3, "year": 2006},
        # Distinct solo album from Fei Yu-ching
        {"title": "一剪梅", "artist": "費玉清", "album": "一剪梅", "track_number": 1, "year": 1983},
    ]
    keys = [
        {"field": "artist", "direction": "asc"},
        {"field": "year", "direction": "asc"},
        {"field": "album", "direction": "asc"},
        {"field": "track_number", "direction": "asc"},
    ]
    sorted_res = sort_items(tracks, keys)
    titles = [t["title"] for t in sorted_res]

    # "依然范特西" tracks must stay together under Jay Chou, not torn away to Fei Yu-ching
    jay_idx = [titles.index("夜的第七章"), titles.index("千里之外"), titles.index("本草綱目")]
    assert jay_idx[1] == jay_idx[0] + 1
    assert jay_idx[2] == jay_idx[1] + 1


def test_sort_compilation_soundtrack_album_stays_together():
    """Compilation/Soundtrack albums with various artists stay together in album order."""
    tracks = [
        {"title": "City of Stars", "artist": "Ryan Gosling", "album": "La La Land", "track_number": 1, "year": 2016},
        {"title": "Audition", "artist": "Emma Stone", "album": "La La Land", "track_number": 2, "year": 2016},
        {
            "title": "A Lovely Night",
            "artist": "Ryan Gosling, Emma Stone",
            "album": "La La Land",
            "track_number": 3,
            "year": 2016,
        },
        {"title": "Solo Pop Song", "artist": "Adele", "album": "21", "track_number": 1, "year": 2011},
    ]
    keys = [
        {"field": "artist", "direction": "asc"},
        {"field": "year", "direction": "asc"},
        {"field": "album", "direction": "asc"},
        {"field": "track_number", "direction": "asc"},
    ]
    sorted_res = sort_items(tracks, keys)
    titles = [t["title"] for t in sorted_res]

    la_la_idx = [titles.index("City of Stars"), titles.index("Audition"), titles.index("A Lovely Night")]
    assert la_la_idx[1] == la_la_idx[0] + 1
    assert la_la_idx[2] == la_la_idx[1] + 1


def test_sort_single_collaboration_uses_first_author():
    """Collaborative singles without albums use the first author."""
    tracks = [
        {
            "title": "I Don't Care",
            "artist": "Ed Sheeran & Justin Bieber",
            "album": "單曲",
            "release_date": "2019-05-10",
        },
        {"title": "Shape of You", "artist": "Ed Sheeran", "album": "單曲", "release_date": "2017-01-06"},
        {"title": "Baby", "artist": "Justin Bieber", "album": "單曲", "release_date": "2010-01-18"},
    ]
    keys = [
        {"field": "artist", "direction": "asc"},
        {"field": "year", "direction": "asc"},
    ]
    sorted_res = sort_items(tracks, keys)
    titles = [t["title"] for t in sorted_res]
    # Ed Sheeran comes first alphabetically, Justin Bieber second
    # "I Don't Care" (first author Ed Sheeran) must be grouped with "Shape of You" before "Baby"
    assert titles.index("Shape of You") < titles.index("Baby")
    assert titles.index("I Don't Care") < titles.index("Baby")


@pytest.mark.anyio
async def test_apply_sort_strict_defense_blocks_fallback_when_token_fails(monkeypatch):
    """When a custom token is present but fails, apply_sort blocks silent fallback to Data API."""
    from types import SimpleNamespace
    from unittest.mock import MagicMock

    from fastapi import HTTPException
    from ytmusicapi.exceptions import YTMusicError

    import backend.app.api.playlist_sort as ps_api
    from backend.app.api.playlist_sort import SortApplyInput, SortKeyInput, apply_sort
    from backend.app.core.credential_store import credential_store
    from backend.app.core.youtube_context import YouTubeRequestContext

    context = YouTubeRequestContext(
        slot="primary",
        credentials=object(),
        quota_limiter=SimpleNamespace(),
        owner_sub="user-with-failing-token",
    )

    # Simulate that user has a custom token
    monkeypatch.setattr(credential_store, "get_ytmusic_custom_token", lambda sub: "dummy-token")
    monkeypatch.setattr(ps_api, "verify_preview_token", lambda *args, **kwargs: True)

    mock_items = [
        {"playlist_item_id": "v1_0", "video_id": "v1", "title": "B", "position": 0, "has_set_video_id": True},
        {"playlist_item_id": "v2_1", "video_id": "v2", "title": "A", "position": 1, "has_set_video_id": True},
    ]
    monkeypatch.setattr(ps_api, "fetch_playlist_items_for_sort", lambda *args, **kwargs: mock_items)

    # YTMusic execution fails (e.g. expired session)
    monkeypatch.setattr(
        ps_api,
        "apply_sort_to_playlist",
        MagicMock(side_effect=YTMusicError("Unauthorized: Session expired")),
    )

    inp = SortApplyInput(
        playlist_id="PL_FAIL",
        sort_keys=[SortKeyInput(field="title", direction="asc")],
        preview_token="valid_token",
        mode="in_place",
        allow_quota_fallback=False,
    )

    with pytest.raises(HTTPException) as exc_info:
        await apply_sort(inp, context=context)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail["code"] == "TOKEN_FALLBACK_BLOCKED"
    assert "已啟動嚴格防禦保護" in exc_info.value.detail["message"]


@pytest.mark.anyio
async def test_apply_sort_allows_fallback_when_explicitly_permitted(monkeypatch):
    """When allow_quota_fallback=True is passed, apply_sort permits Data API fallback."""
    from types import SimpleNamespace
    from unittest.mock import MagicMock

    import backend.app.api.playlist_sort as ps_api
    from backend.app.api.playlist_sort import SortApplyInput, SortKeyInput, apply_sort
    from backend.app.core.credential_store import credential_store
    from backend.app.core.youtube_context import YouTubeRequestContext

    context = YouTubeRequestContext(
        slot="primary",
        credentials=object(),
        quota_limiter=SimpleNamespace(),
        owner_sub="user-with-token",
    )

    monkeypatch.setattr(credential_store, "get_ytmusic_custom_token", lambda sub: "dummy-token")
    monkeypatch.setattr(ps_api, "verify_preview_token", lambda *args, **kwargs: True)

    mock_items = [
        {"playlist_item_id": "v1_0", "video_id": "v1", "title": "B", "position": 0, "has_set_video_id": True},
        {"playlist_item_id": "v2_1", "video_id": "v2", "title": "A", "position": 1, "has_set_video_id": True},
    ]
    monkeypatch.setattr(ps_api, "fetch_playlist_items_for_sort", lambda *args, **kwargs: mock_items)

    mock_apply = MagicMock(return_value={"status": "success", "quota_used": 100, "succeeded": 2})
    monkeypatch.setattr(ps_api, "apply_sort_to_playlist", mock_apply)

    inp = SortApplyInput(
        playlist_id="PL_ALLOWED",
        sort_keys=[SortKeyInput(field="title", direction="asc")],
        preview_token="valid_token",
        mode="in_place",
        allow_quota_fallback=True,
    )

    res = await apply_sort(inp, context=context)
    assert res["status"] == "success"
    # verify allow_quota_fallback was passed as True
    _, kwargs = mock_apply.call_args
    assert kwargs.get("allow_quota_fallback") is True
