from __future__ import annotations

from backend.app.services.playlist_sort_service import (
    _parse_iso8601_duration,
    build_sort_preview,
    sort_items,
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
