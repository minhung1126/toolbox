from types import SimpleNamespace

import pytest

from backend.app.core.youtube_context import YouTubeRequestContext
from backend.app.services import youtube_service


def youtube_context():
    return YouTubeRequestContext(
        slot="primary",
        credentials=object(),
        quota_limiter=SimpleNamespace(),
        owner_sub="test-user",
    )


class FakeRequest:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error

    def execute(self):
        if self.error:
            raise self.error
        return self.response


class FakeVideos:
    def __init__(self):
        self.update_body = None

    def list(self, **_kwargs):
        return FakeRequest({"items": [{"status": {"privacyStatus": "public"}}]})

    def update(self, *, body, **_kwargs):
        self.update_body = body
        return FakeRequest(error=RuntimeError("response lost after write"))


class FakeService:
    def __init__(self):
        self.video_resource = FakeVideos()

    def videos(self):
        return self.video_resource


def test_set_video_public_reconciles_a_successful_write_with_a_lost_response(monkeypatch):
    service = FakeService()
    monkeypatch.setattr(youtube_service, "get_youtube_service", lambda _context: service)
    monkeypatch.setattr(
        youtube_service,
        "_execute_with_quota",
        lambda request, _method, _context: request.execute(),
    )

    result = youtube_service.set_video_public(
        youtube_context(),
        "video-1",
        current_video={"status": {"privacyStatus": "private"}},
    )

    assert result["status"]["privacyStatus"] == "public"
    assert result["reconciled"] is True
    assert service.video_resource.update_body == {
        "id": "video-1",
        "status": {"privacyStatus": "public"},
    }


def test_set_video_public_preserves_a_real_write_failure(monkeypatch):
    service = FakeService()
    service.video_resource.list = lambda **_kwargs: FakeRequest({"items": [{"status": {"privacyStatus": "private"}}]})
    monkeypatch.setattr(youtube_service, "get_youtube_service", lambda _context: service)
    monkeypatch.setattr(
        youtube_service,
        "_execute_with_quota",
        lambda request, _method, _context: request.execute(),
    )

    with pytest.raises(RuntimeError, match="response lost after write"):
        youtube_service.set_video_public(
            youtube_context(),
            "video-1",
            current_video={"status": {"privacyStatus": "private"}},
        )
