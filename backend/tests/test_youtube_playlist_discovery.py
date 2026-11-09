import json
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient
from googleapiclient.discovery import build
from googleapiclient.http import HttpMockSequence

from backend.app.core.dependencies import require_youtube_context
from backend.app.core.youtube_context import YouTubeRequestContext
from backend.app.main import create_app


@pytest.mark.parametrize("has_videos", [False, True], ids=["empty", "paginated"])
def test_playlist_preview_accepts_real_discovery_parameters_and_localizes_videos(has_videos):
    # Keep the real SDK's parameter validation; only replace the HTTP transport.
    responses = [{"items": []}]
    if has_videos:
        responses = [
            {
                "items": [{"id": "item-1", "contentDetails": {"videoId": "video-1"}}],
                "nextPageToken": "page-2",
            },
            {"items": [{"id": "item-2", "contentDetails": {"videoId": "video-2"}}]},
            {
                "items": [
                    {"id": "video-1", "snippet": {"title": "Original title", "localized": {"title": "繁中標題"}}},
                    {"id": "video-2", "snippet": {"title": "Default title"}},
                ]
            },
        ]
    http = HttpMockSequence([({"status": "200"}, json.dumps(response)) for response in responses])
    service = build("youtube", "v3", http=http, static_discovery=True)
    calls = []

    def execute(request, method):
        calls.append((method, parse_qs(urlsplit(request.uri).query)))
        return request.execute()

    context = YouTubeRequestContext(
        slot="primary",
        credentials=object(),
        quota_limiter=SimpleNamespace(execute=execute, get_usage=lambda: {"used_units": len(calls)}),
        owner_sub="test-user",
    )
    client = TestClient(
        create_app(
            google_client_factory=lambda *_args, **_kwargs: service,
            dependency_overrides={require_youtube_context: lambda: context},
        )
    )

    response = client.post("/api/v1/youtube/playlist-items", json={"playlist_id": "playlist-1"})

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["source"] == "youtube-api"
    assert data["preview_token"]
    assert data["quota_usage"] == {"used_units": len(responses)}
    if has_videos:
        assert data["total"] == 2
        assert [video["title"] for video in data["videos"]] == ["繁中標題", "Default title"]
        assert [video["playlist_item_id"] for video in data["videos"]] == ["item-1", "item-2"]
        assert data["preview_snapshot"]["video_ids"] == ["video-1", "video-2"]
        assert [method for method, _ in calls] == ["playlistItems.list", "playlistItems.list", "videos.list"]
        assert "pageToken" not in calls[0][1]
        assert calls[1][1]["pageToken"] == ["page-2"]
        assert calls[2][1]["hl"] == ["zh-TW"]
    else:
        assert data["total"] == 0
        assert data["videos"] == []
        assert [method for method, _ in calls] == ["playlistItems.list"]
