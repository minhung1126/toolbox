import json
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.app.api.ffmpeg_generator import (
    BuildCommandRequest,
    build_command,
    parse_time_string,
    safe_quote_filename,
    seconds_to_hhmmss,
)
from backend.app.core.dependencies import require_login_credentials
from backend.app.main import create_app

CASES = json.loads(
    (Path(__file__).parents[1] / "app/resources/ffmpeg-command-cases.v1.json").read_text(encoding="utf-8")
)
BASH_EXECUTABLE = os.environ.get("TOOLBOX_TEST_BASH") or (None if os.name == "nt" else "bash")
CMD_UNSUPPORTED_CHARACTERS = ("%", "!", '"')


@pytest.fixture
def client():
    return TestClient(create_app(dependency_overrides={require_login_credentials: lambda: SimpleNamespace(valid=True)}))


def test_ffmpeg_endpoints_require_authentication():
    anonymous = TestClient(create_app())
    assert anonymous.get("/api/v1/ffmpeg-generator/presets").status_code == 401
    assert anonymous.post("/api/v1/ffmpeg-generator/parse-time", json={"seconds": 10}).status_code == 401
    assert anonymous.post("/api/v1/ffmpeg-generator/build", json={}).status_code == 401


def test_seconds_to_hhmmss_and_parse():
    assert seconds_to_hhmmss(0) == "00:00:00.000"
    assert seconds_to_hhmmss(65.5) == "00:01:05.500"
    assert seconds_to_hhmmss(3661.123) == "01:01:01.123"

    assert parse_time_string("00:01:05.500") == 65.5
    assert parse_time_string("01:01:01") == 3661.0
    assert parse_time_string("45.2") == 45.2
    assert parse_time_string("invalid") is None


def test_safe_quote_filename():
    for name in ["video.mp4", "my video.mp4", '"video.mp4"', "path\\to\\file.mp4", "中文 $((2+3)) `test` % (x).mp4"]:
        assert shlex.split(safe_quote_filename(name)) == [name]


@pytest.mark.parametrize("value", CASES["invalid_times"])
def test_invalid_times_are_not_coerced_to_zero(value):
    assert parse_time_string(value) is None
    with pytest.raises(HTTPException) as error:
        build_command(BuildCommandRequest(start_time=value))
    assert error.value.status_code == 400
    assert error.value.detail["code"] == "invalid_command"
    assert set(error.value.detail["field_errors"]) == {"start_time"}


@pytest.mark.parametrize(
    "patch, field",
    [
        pytest.param({"input_file": "output.mp4"}, "output_file", id="same-file"),
        pytest.param({"start_time": "10", "end_time": "5"}, "end_time", id="reversed-window"),
        pytest.param({"end_time": "21", "source_duration": 20}, "end_time", id="past-duration"),
        pytest.param({"input_file": "bad\nfile"}, "input_file", id="control-character"),
        pytest.param({"input_file": "50%.mp4", "shell": "cmd"}, "input_file", id="cmd-percent"),
        pytest.param({"input_file": "clip!.mp4", "shell": "cmd"}, "input_file", id="cmd-exclamation"),
        pytest.param({"input_file": 'clip".mp4', "shell": "cmd"}, "input_file", id="cmd-quote"),
    ],
)
def test_invalid_commands_return_field_errors(patch, field):
    with pytest.raises(HTTPException) as error:
        build_command(BuildCommandRequest(**patch))
    assert error.value.status_code == 400
    assert error.value.detail["code"] == "invalid_command"
    assert set(error.value.detail["field_errors"]) == {field}


@pytest.mark.skipif(BASH_EXECUTABLE is None, reason="Set TOOLBOX_TEST_BASH to run native Bash checks on Windows")
@pytest.mark.parametrize("name", CASES["filenames"])
@pytest.mark.parametrize("layout", ["single", "multiline"])
def test_bash_receives_exact_argv(name, layout, tmp_path):
    command = build_command(
        BuildCommandRequest(
            input_file=name,
            output_file="out.mp4",
            shell_dialect="bash",
            line_layout=layout,
            video_codec="copy",
            audio_codec="copy",
        )
    )
    result = subprocess.run(
        [
            BASH_EXECUTABLE,
            "--noprofile",
            "--norc",
            "-c",
            "ffmpeg() { printf '%s\\0' \"$@\"; }\n" + command.command_active,
        ],
        cwd=tmp_path,
        env={**os.environ, "BASH_ENV": ""},
        capture_output=True,
        timeout=5,
        check=False,
    )
    assert result.returncode == 0, result.stderr.decode(errors="replace")
    assert result.stdout.decode("utf-8").split("\0") == ["-i", name, "-c:v", "copy", "-c:a", "copy", "out.mp4", ""]


@pytest.mark.parametrize(("shell", "binary"), [("powershell", "pwsh"), ("cmd", "cmd.exe")])
def test_native_shell_round_trip_when_available(shell, binary, tmp_path):
    if shell == "cmd" and os.name != "nt":
        pytest.skip("CMD argv verification runs on Windows")
    executable = shutil.which(binary)
    if executable is None:
        pytest.skip(f"{binary} unavailable: native argv verification requires the shell")

    names = CASES["filenames"]
    if shell == "cmd":
        names = [name for name in names if not any(char in name for char in CMD_UNSUPPORTED_CHARACTERS)]

    (tmp_path / "argv.py").write_text("import json, sys\nprint(json.dumps(sys.argv[1:]))\n", encoding="ascii")
    command = " ".join(safe_quote_filename(value, shell) for value in [sys.executable, "argv.py", *names])
    if shell == "powershell":
        script = "$PSNativeCommandArgumentPassing = 'Standard'\n& " + command + "\nexit $LASTEXITCODE\n"
        (tmp_path / "capture.ps1").write_text(script, encoding="utf-8")
        args = [executable, "-NoProfile", "-NonInteractive", "-File", "capture.ps1"]
    else:
        # CMD's /s removes this outer quote pair. Build the raw command line for
        # CMD rather than letting subprocess apply C-runtime escaping to it.
        args = f'{subprocess.list2cmdline([executable])} /d /v:off /s /c "{command}"'

    result = subprocess.run(args, executable=executable, cwd=tmp_path, capture_output=True, timeout=10, check=False)
    assert result.returncode == 0, result.stderr.decode(errors="replace")
    assert json.loads(result.stdout) == names


def test_ffmpeg_presets_api(client):
    resp = client.get("/api/v1/ffmpeg-generator/presets", headers={"Origin": "http://localhost:3000"})
    assert resp.status_code == 200
    presets = {preset["id"]: preset for preset in resp.json()}
    assert len(presets) >= 5
    lossless = presets["lossless-trim"]
    assert (lossless["mode"], lossless["video_codec"]) == ("copy", "copy")
    assert "關鍵影格" in lossless["description"]


def test_ffmpeg_parse_time_api(client):
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


def test_ffmpeg_build_command_stream_copy(client):
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
    assert "ffmpeg -ss 00:00:10.000 -i 'my test video.mp4' -t 00:00:25.000" in cmd
    assert "-c:v copy -c:a copy 'output.mp4'" in cmd
    assert "`" in res["command_multi"]
    assert len(res["breakdown"]) >= 5


def test_ffmpeg_build_command_reencode(client):
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
    assert "ffmpeg -i 'clip.mp4' -ss 00:00:05.000 -t 00:00:20.000" in cmd
    assert "-c:v libx264 -crf 21 -preset slow" in cmd
    assert "-c:a aac -b:a 256k" in cmd
    assert "-vf" in cmd
    assert "scale=1920:1080" in cmd
    assert "fps=60" in cmd
    assert "'encoded.mp4'" in cmd
    assert "\\" in res["command_multi"]
