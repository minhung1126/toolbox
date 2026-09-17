from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from backend.app.services.ytmusic_service import (
    apply_ytmusic_sort_in_place,
    create_sorted_ytmusic_playlist,
    fetch_ytmusic_playlist_tracks,
    fetch_ytmusic_playlists,
    parse_custom_token_input,
)


def test_parse_custom_token_input_json():
    json_str = '{"User-Agent": "Mozilla/5.0", "Cookie": "SID=abc", "authorization": "SAPISIDHASH 123"}'
    parsed = parse_custom_token_input(json_str)
    assert isinstance(parsed, dict)
    assert "SID=abc" in parsed.get("cookie", "")
    assert "authorization" in parsed


def test_parse_custom_token_input_cookie():
    cookie_str = "SID=abc12345; HSID=def67890; SAPISID=ghi13579"
    parsed = parse_custom_token_input(cookie_str)
    assert isinstance(parsed, dict)
    assert "cookie" in parsed
    assert "SID=abc12345" in parsed["cookie"]


def test_parse_custom_token_input_empty():
    with pytest.raises(ValueError, match="Token 內容不可為空"):
        parse_custom_token_input("   ")


@patch("backend.app.services.ytmusic_service.get_ytmusic_client")
def test_fetch_ytmusic_playlists(mock_get_client):
    mock_client = MagicMock()
    mock_client.get_library_playlists.return_value = [
        {
            "playlistId": "PL123",
            "title": "My Jams",
            "description": "Cool songs",
            "thumbnails": [{"url": "http://example.com/thumb.jpg"}],
            "count": "15",
            "public": False,
        }
    ]
    mock_get_client.return_value = mock_client

    playlists = fetch_ytmusic_playlists()
    assert len(playlists) == 1
    assert playlists[0]["id"] == "PL123"
    assert playlists[0]["title"] == "My Jams"
    assert playlists[0]["item_count"] == 15
    assert playlists[0]["privacy_status"] == "PRIVATE"


@patch("backend.app.services.ytmusic_service.get_ytmusic_client")
def test_fetch_ytmusic_playlist_tracks_with_album_resolution(mock_get_client):
    mock_client = MagicMock()
    mock_client.get_playlist.return_value = {
        "tracks": [
            {
                "videoId": "vid_1",
                "setVideoId": "set_1",
                "title": "Song One",
                "artists": [{"name": "Artist A", "id": "art_1"}],
                "album": {"name": "Album Alpha", "id": "MPREb_album1"},
                "duration_seconds": 210,
            },
            {
                "videoId": "vid_2",
                "setVideoId": "set_2",
                "title": "Song Two",
                "artists": [{"name": "Artist A", "id": "art_1"}],
                "album": {"name": "Album Alpha", "id": "MPREb_album1"},
                "duration_seconds": 180,
            },
            {
                "videoId": "vid_3",
                "setVideoId": "set_3",
                "title": "Single Song",
                "artists": [{"name": "Artist B", "id": "art_2"}],
                "album": None,
                "duration_seconds": 150,
            },
        ]
    }
    # Mock album details
    mock_client.get_album.return_value = {
        "year": "2023",
        "tracks": [
            {"videoId": "vid_1", "title": "Song One"},
            {"videoId": "vid_2", "title": "Song Two"},
        ],
    }
    mock_get_client.return_value = mock_client

    tracks = fetch_ytmusic_playlist_tracks("PL123", fetch_album_details=True)
    assert len(tracks) == 3

    # First track: album resolved, track number 1, year 2023
    assert tracks[0]["title"] == "Song One"
    assert tracks[0]["artist"] == "Artist A"
    assert tracks[0]["album"] == "Album Alpha"
    assert tracks[0]["track_number"] == 1
    assert tracks[0]["year"] == 2023

    # Second track: album resolved from cache, track number 2
    assert tracks[1]["title"] == "Song Two"
    assert tracks[1]["track_number"] == 2
    assert tracks[1]["year"] == 2023

    # Third track: no album → treated as video (影片) with track_number None and is_video True
    assert tracks[2]["title"] == "Single Song"
    assert tracks[2]["artist"] == "Artist B"
    assert tracks[2]["album"] == "影片"
    assert tracks[2]["track_number"] is None
    assert tracks[2]["is_video"] is True

    # Verify get_album was only called once for MPREb_album1 (cached!)
    mock_client.get_album.assert_called_once_with("MPREb_album1")


@patch("backend.app.services.ytmusic_service.get_ytmusic_client")
def test_apply_ytmusic_sort_in_place(mock_get_client):
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    original = [
        {"playlist_item_id": "item_b", "title": "B"},
        {"playlist_item_id": "item_c", "title": "C"},
        {"playlist_item_id": "item_a", "title": "A"},
    ]
    sorted_items = [
        {"playlist_item_id": "item_a", "title": "A"},
        {"playlist_item_id": "item_b", "title": "B"},
        {"playlist_item_id": "item_c", "title": "C"},
    ]

    result = apply_ytmusic_sort_in_place("PL_TEST", sorted_items, original)
    assert result["operation"] == "playlist_sort"
    assert result["mode"] == "in_place"
    assert result["quota_used"] == 0
    assert result["succeeded"] == 1
    assert result["failed"] == 0

    # item_a should be moved before item_b
    mock_client.edit_playlist.assert_called_once_with(
        playlistId="PL_TEST",
        moveItem=("item_a", "item_b"),
    )


@patch("backend.app.services.ytmusic_service.get_ytmusic_client")
def test_create_sorted_ytmusic_playlist(mock_get_client):
    mock_client = MagicMock()
    mock_client.create_playlist.return_value = "PL_NEW_123"
    mock_get_client.return_value = mock_client

    sorted_items = [
        {"video_id": "v1", "title": "Song 1"},
        {"video_id": "v2", "title": "Song 2"},
    ]

    result = create_sorted_ytmusic_playlist("My <Cool> Playlist", "Sorted description", sorted_items)
    assert result["operation"] == "playlist_sort"
    assert result["mode"] == "new_playlist"
    assert result["new_playlist_id"] == "PL_NEW_123"
    assert result["quota_used"] == 0
    assert result["succeeded"] == 2

    mock_client.create_playlist.assert_called_once_with(
        title="My Cool Playlist",
        description="Sorted description",
        privacy_status="PRIVATE",
        video_ids=["v1", "v2"],
    )


def test_parse_custom_token_input_curl():
    curl_input = """curl 'https://music.youtube.com/youtubei/v1/browse' \\
      -H 'accept: */*' \\
      -H 'authorization: SAPISIDHASH 1699999999_abcdef' \\
      -H 'cookie: SID=secret_sid; HSID=secret_hsid; SAPISID=secret_sapisid' \\
      -H 'user-agent: Mozilla/5.0' \\
      -H 'x-origin: https://music.youtube.com'"""

    parsed = parse_custom_token_input(curl_input)
    assert isinstance(parsed, dict)
    assert "cookie" in parsed
    assert "secret_sid" in parsed["cookie"]
    assert parsed.get("x-goog-authuser") == "0"


def test_parse_custom_token_input_cmd_curl():
    cmd_curl_input = r'''curl --url ^"https://music.youtube.com/youtubei/v1/browse^" ^
  -H ^"accept: */*^" ^
  -H ^"authorization: SAPISIDHASH 1699999999_abcdef^" ^
  -b ^"SID=cmd_sid; SAPISID=cmd_sapisid^" ^
  -H ^"origin: https://music.youtube.com^"'''

    parsed = parse_custom_token_input(cmd_curl_input)
    assert isinstance(parsed, dict)
    assert "cookie" in parsed
    assert "cmd_sid" in parsed["cookie"]
    assert "cmd_sapisid" in parsed["cookie"]
    assert parsed.get("x-goog-authuser") == "0"


def test_parse_custom_token_input_fetch():
    fetch_input = """fetch("https://music.youtube.com/youtubei/v1/browse?prettyPrint=false", {
  "headers": {
    "accept": "*/*",
    "authorization": "SAPISIDHASH 1699999999_abcdef",
    "cookie": "SID=fetch_sid; HSID=fetch_hsid; SAPISID=fetch_sapisid",
    "x-goog-authuser": "0"
  },
  "referrer": "https://music.youtube.com/",
  "body": null,
  "method": "POST"
});"""

    parsed = parse_custom_token_input(fetch_input)
    assert isinstance(parsed, dict)
    assert "cookie" in parsed
    assert "fetch_sid" in parsed["cookie"]
    assert "__Secure-3PAPISID=fetch_sapisid" in parsed["cookie"]
    assert parsed.get("x-goog-authuser") == "0"


def test_parse_custom_token_input_fetch_missing_cookie_explains_chrome_behavior():
    fetch_without_cookie = """fetch("https://music.youtube.com/youtubei/v1/browse", {
  "headers": {
    "accept": "*/*",
    "authorization": "SAPISIDHASH 1699999999_abcdef"
  },
  "credentials": "include"
});"""
    with pytest.raises(ValueError) as exc_info:
        parse_custom_token_input(fetch_without_cookie)
    assert "缺少 Cookie" in str(exc_info.value)
    assert "Copy as cURL" in str(exc_info.value)


def test_parse_custom_token_input_raw_headers():
    raw_headers = """
Accept: */*
Accept-Language: zh-TW,zh;q=0.9
Authorization: SAPISIDHASH 1699999999_abcdef
Cookie: SID=my_sid_val; HSID=my_hsid_val
User-Agent: Mozilla/5.0
X-Goog-AuthUser: 0
"""
    parsed = parse_custom_token_input(raw_headers)
    assert isinstance(parsed, dict)
    assert "cookie" in parsed
    assert "my_sid_val" in parsed["cookie"]
    assert parsed.get("x-goog-authuser") == "0"


@patch("backend.app.services.ytmusic_service.get_ytdlp_video_date")
def test_enrich_tracks_with_ytdlp_fallback(mock_get_date):
    from backend.app.services.ytmusic_service import enrich_tracks_with_ytdlp_fallback

    mock_get_date.side_effect = lambda vid: {
        "v_same_1": {"release_date": "2023-05-12", "year": 2023},
        "v_same_2": {"release_date": "2023-10-01", "year": 2023},
        "v_missing": {"release_date": "2019-03-20", "year": 2019},
    }.get(vid, {})

    tracks = [
        {"video_id": "v_same_1", "title": "Song 1", "year": 2023, "release_date": None},
        {"video_id": "v_same_2", "title": "Song 2", "year": 2023, "release_date": None},
        {"video_id": "v_missing", "title": "Song Missing", "year": None, "release_date": None},
        {"video_id": "v_unique", "title": "Song Unique", "year": 2021, "release_date": None},
    ]

    enriched = enrich_tracks_with_ytdlp_fallback(tracks, check_same_year=True)
    assert enriched[0]["release_date"] == "2023-05-12"
    assert enriched[1]["release_date"] == "2023-10-01"
    assert enriched[2]["release_date"] == "2019-03-20"
    assert enriched[2]["year"] == 2019
    # v_unique has a unique year and does not collide, so yt-dlp is not called
    assert enriched[3]["release_date"] is None
    called_vids = [call.args[0] for call in mock_get_date.call_args_list]
    assert "v_unique" not in called_vids


def test_parse_custom_token_input_creates_valid_browser_client():
    from ytmusicapi import YTMusic
    from ytmusicapi.auth.types import AuthType

    cookie_input = "SID=abc12345; HSID=def67890; SAPISID=ghi13579; SSID=xyz24680"
    parsed = parse_custom_token_input(cookie_input)
    assert isinstance(parsed, dict)
    assert "__Secure-3PAPISID=ghi13579" in parsed["cookie"]
    assert "authorization" in parsed
    assert "SAPISIDHASH" in parsed["authorization"]

    # Verify YTMusic accepts the parsed auth as BROWSER auth type
    client = YTMusic(auth=parsed)
    assert client.auth_type == AuthType.BROWSER
    assert client.sapisid == "ghi13579"


@patch("backend.app.services.ytmusic_service.get_ytmusic_client")
def test_apply_ytmusic_sort_in_place_rejects_unauthenticated(mock_get_client):
    from ytmusicapi.auth.types import AuthType
    from ytmusicapi.exceptions import YTMusicError

    mock_client = MagicMock()
    mock_client.auth_type = AuthType.UNAUTHORIZED
    # Set explicit non-MagicMock name or check
    type(mock_client).__name__ = "YTMusic"
    mock_get_client.return_value = mock_client

    original = [{"playlist_item_id": "item_1", "title": "A"}]
    sorted_items = [{"playlist_item_id": "item_1", "title": "A"}]

    with pytest.raises(YTMusicError, match="尚未設定或未啟用有效的瀏覽器 Token"):
        apply_ytmusic_sort_in_place("PL_TEST", sorted_items, original)
