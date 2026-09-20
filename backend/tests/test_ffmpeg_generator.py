from fastapi.testclient import TestClient

from backend.app.api.ffmpeg_generator import (
    parse_time_string,
    safe_quote_filename,
    seconds_to_hhmmss,
)
from backend.app.main import app
from backend.app.tools.builtin.ffmpeg_generator import FfmpegGeneratorPlugin
from backend.app.tools.registry import tool_registry


def test_ffmpeg_generator_plugin_metadata():
    plugin = FfmpegGeneratorPlugin()
    assert plugin.metadata.id == "ffmpeg-generator"
    assert plugin.metadata.name == "FFmpeg Generator"
    assert plugin.metadata.status == "active"
    assert plugin.metadata.entry_url == "/ffmpeg-generator"
    assert tool_registry.get("ffmpeg-generator") is not None


def test_seconds_to_hhmmss_and_parse():
    assert seconds_to_hhmmss(0) == "00:00:00.000"
    assert seconds_to_hhmmss(65.5) == "00:01:05.500"
    assert seconds_to_hhmmss(3661.123) == "01:01:01.123"

    assert parse_time_string("00:01:05.500") == 65.5
    assert parse_time_string("01:01:01") == 3661.0
    assert parse_time_string("45.2") == 45.2
    assert parse_time_string("invalid") is None


def test_safe_quote_filename():
    assert safe_quote_filename("video.mp4") == '"video.mp4"'
    assert safe_quote_filename("my video.mp4") == '"my video.mp4"'
    assert safe_quote_filename('"video.mp4"') == '"video.mp4"'
    assert safe_quote_filename('"my video.mp4"') == '"my video.mp4"'
    assert safe_quote_filename("video [1080p] (cut).mp4") == '"video [1080p] (cut).mp4"'
    assert safe_quote_filename('my "special" video.mp4') == r'"my \"special\" video.mp4"'
    assert safe_quote_filename(r"path\to\file.mp4") == r'"path\\to\\file.mp4"'
    assert safe_quote_filename("") == '""'
    assert safe_quote_filename("   ") == '""'


def test_ffmpeg_presets_api():
    client = TestClient(app)
    resp = client.get("/api/v1/ffmpeg-generator/presets", headers={"Origin": "http://localhost:3000"})
    assert resp.status_code == 200
    presets = resp.json()
    assert isinstance(presets, list)
    assert len(presets) >= 5

    lossless = next((p for p in presets if p["id"] == "lossless-trim"), None)
    assert lossless is not None
    assert lossless["mode"] == "copy"
    assert lossless["video_codec"] == "copy"


def test_ffmpeg_parse_time_api():
    client = TestClient(app)
    # Valid string
    resp = client.post(
        "/api/v1/ffmpeg-generator/parse-time",
        json={"time_str": "00:02:15.500"},
        headers={"Origin": "http://localhost:3000"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is True
    assert data["seconds"] == 135.5
    assert data["formatted"] == "00:02:15.500"

    # Valid seconds
    resp = client.post(
        "/api/v1/ffmpeg-generator/parse-time",
        json={"seconds": 90.0},
        headers={"Origin": "http://localhost:3000"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["formatted"] == "00:01:30.000"

    # Invalid time
    resp = client.post(
        "/api/v1/ffmpeg-generator/parse-time",
        json={"time_str": "not-a-timestamp"},
        headers={"Origin": "http://localhost:3000"},
    )
    assert resp.status_code == 400


def test_ffmpeg_build_command_stream_copy():
    client = TestClient(app)
    payload = {
        "input_file": "my test video.mp4",
        "output_file": "output.mp4",
        "start_time": "00:00:10.000",
        "end_time": "00:00:35.000",
        "cut_mode": "to",
        "seek_mode": "fast",
        "mode": "copy",
        "shell": "powershell",
    }
    resp = client.post(
        "/api/v1/ffmpeg-generator/build",
        json=payload,
        headers={"Origin": "http://localhost:3000"},
    )
    assert resp.status_code == 200
    res = resp.json()

    cmd = res["command_single"]
    assert 'ffmpeg -ss 00:00:10.000 -i "my test video.mp4" -to 00:00:35.000' in cmd
    assert '-c:v copy -c:a copy "output.mp4"' in cmd
    assert "`" in res["command_multi"]
    assert len(res["breakdown"]) >= 5


def test_ffmpeg_build_command_reencode():
    client = TestClient(app)
    payload = {
        "input_file": "clip.mp4",
        "output_file": "encoded.mp4",
        "start_time": "00:00:05",
        "duration": "00:00:20",
        "cut_mode": "duration",
        "seek_mode": "accurate",
        "mode": "reencode",
        "video_codec": "libx264",
        "audio_codec": "aac",
        "crf": 21,
        "preset": "slow",
        "resolution": "1080p",
        "fps": 60,
        "audio_bitrate": "256k",
        "shell": "bash",
    }
    resp = client.post(
        "/api/v1/ffmpeg-generator/build",
        json=payload,
        headers={"Origin": "http://localhost:3000"},
    )
    assert resp.status_code == 200
    res = resp.json()

    cmd = res["command_single"]
    assert 'ffmpeg -i "clip.mp4" -ss 00:00:05.000 -t 00:00:20.000' in cmd
    assert "-c:v libx264 -crf 21 -preset slow" in cmd
    assert "-c:a aac -b:a 256k" in cmd
    assert "-vf" in cmd
    assert "scale=1920:1080" in cmd
    assert "fps=60" in cmd
    assert '"encoded.mp4"' in cmd
    assert "\\" in res["command_multi"]
