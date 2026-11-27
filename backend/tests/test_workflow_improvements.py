import json
import os
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel

from backend.app.api.ffmpeg_generator import BuildCommandRequest, build_command, parse_time_string
from backend.app.core.dependencies import require_account_subject
from backend.app.core.operation_store import OperationStore
from backend.app.main import create_app
from backend.app.services.operation_journal import public_operation, recording, start_operation

CASES = json.loads(
    (Path(__file__).parents[1] / "app/resources/ffmpeg-command-cases.v1.json").read_text(encoding="utf-8")
)


def _resolve_bash_executable() -> str | None:
    if sys.platform != "win32":
        return "bash"
    candidates: list[str] = []
    which_bash = shutil.which("bash")
    if which_bash and not which_bash.lower().endswith(r"\system32\bash.exe"):
        candidates.append(which_bash)
    for env_var, suffix in (
        ("PROGRAMFILES", r"Git\bin\bash.exe"),
        ("PROGRAMFILES", r"Git\usr\bin\bash.exe"),
        ("PROGRAMFILES(X86)", r"Git\bin\bash.exe"),
        ("LOCALAPPDATA", r"Programs\Git\bin\bash.exe"),
    ):
        base = os.environ.get(env_var)
        if base:
            candidates.append(str(Path(base) / suffix))
    git_path = shutil.which("git")
    if git_path:
        git_root = Path(git_path).resolve().parents[1]
        candidates.extend([str(git_root / "bin" / "bash.exe"), str(git_root / "usr" / "bin" / "bash.exe")])
    if which_bash and which_bash not in candidates:
        candidates.append(which_bash)
    seen: set[str] = set()
    for candidate in candidates:
        norm = os.path.normcase(candidate)
        if norm in seen or not Path(candidate).is_file():
            continue
        seen.add(norm)
        try:
            probe = subprocess.run([candidate, "-c", "printf '%s' ok"], capture_output=True, timeout=5)
            if probe.returncode == 0 and probe.stdout == b"ok":
                return candidate
        except OSError:
            continue
    return None


@pytest.mark.parametrize("name", CASES["filenames"])
@pytest.mark.parametrize("layout", ["single", "multiline"])
def test_bash_receives_exact_argv(name, layout):
    bash = _resolve_bash_executable()
    if bash is None:
        pytest.skip("bash unavailable on Windows: Git Bash not found")
    command = build_command(
        BuildCommandRequest(
            input_file=name, output_file="out.mp4", shell_dialect="bash", line_layout=layout, video_codec="libx264"
        )
    )
    script = "ffmpeg() { printf '%s\\0' \"$@\"; }; " + (
        command.command_single if layout == "single" else command.command_multi
    )
    result = subprocess.run([bash, "-c", script], check=True, capture_output=True)
    argv = result.stdout.decode("utf-8").split("\0")[:-1]
    assert argv[argv.index("-i") + 1] == name
    assert argv[-1] == "out.mp4"


@pytest.mark.parametrize("value", CASES["invalid_times"])
def test_invalid_times_are_not_coerced_to_zero(value):
    assert parse_time_string(value) is None
    with pytest.raises(HTTPException) as error:
        build_command(BuildCommandRequest(start_time=value))
    assert "start_time" in error.value.detail["field_errors"]


@pytest.mark.parametrize(
    "patch",
    [
        {"input_file": "output.mp4"},
        {"start_time": "10", "end_time": "5"},
        {"end_time": "21", "source_duration": 20},
        {"input_file": "bad\nfile"},
        {"input_file": "50%.mp4", "shell": "cmd"},
    ],
)
def test_invalid_commands_return_field_errors(patch):
    with pytest.raises(HTTPException) as error:
        build_command(BuildCommandRequest(**patch))
    assert error.value.detail["field_errors"]


@pytest.mark.parametrize("shell, executable", [("powershell", "pwsh"), ("cmd", "cmd.exe")])
def test_native_shell_round_trip_when_available(shell, executable, tmp_path):
    path = shutil.which(executable)
    if not path:
        pytest.skip(f"{executable} unavailable: native argv verification not completed")
    # Native integration is intentionally separate from string quoting assertions.
    fake = tmp_path / "argv.py"
    fake.write_text("import json,sys; print(json.dumps(sys.argv[1:]))", encoding="utf-8")

    from backend.app.api.ffmpeg_generator import safe_quote_filename

    for name in CASES["filenames"]:
        try:
            quoted = safe_quote_filename(name, shell)
        except ValueError:
            assert shell == "cmd" and any(char in name for char in '%!"')
            continue
        command = f"{safe_quote_filename(sys.executable, shell)} {safe_quote_filename(str(fake), shell)} {quoted}"
        if shell == "powershell":
            command = "$PSNativeCommandArgumentPassing = 'Standard'; & " + command
            args: str | list[str] = [path, "-NoProfile", "-Command", command]
        else:
            args = f'"{path}" /d /v:off /s /c "{command}"'
        result = subprocess.run(args, check=True, capture_output=True, text=True, encoding="utf-8")
        assert json.loads(result.stdout) == [name]


class Plan(BaseModel):
    request_id: str = "request-1"
    preview_token: str = "signed-plan-1"
    playlist_id: str = "source"


def test_claim_is_atomic_across_repository_instances_and_accounts(tmp_path):
    path = tmp_path / "operations.sqlite3"

    def claim(_):
        return OperationStore(path).claim("one", "youtube.metadata_update", Plan())

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(claim, range(16)))
    assert sum(claimed for _, claimed in results) == 1
    operation = results[0][0]
    assert "preview_token" not in operation["plan"]
    assert len(OperationStore(path).list("one")) == 1
    assert OperationStore(path).list("two") == []
    with pytest.raises(HTTPException) as error:
        OperationStore(path).get("two", operation["id"])
    assert error.value.status_code == 404
    with pytest.raises(HTTPException):
        OperationStore(path).claim("one", "youtube.metadata_update", Plan(playlist_id="changed"))
    assert OperationStore(path).claim("two", "youtube.metadata_update", Plan())[1]


def test_unknown_write_is_durable_and_never_replayed_after_restart(tmp_path):
    path = tmp_path / "operations.sqlite3"
    store = OperationStore(path)
    operation, recorder = start_operation(store, "one", "youtube.metadata_update", Plan())
    provider_calls = []
    with pytest.raises(TimeoutError):
        with recording(recorder):
            recorder.write("metadata", "known", lambda: provider_calls.append("known"))

            def lost_response():
                provider_calls.append("unknown")
                raise TimeoutError()

            recorder.write("metadata", "unknown", lost_response)
    recorder.finish(failed=True)
    reloaded = OperationStore(path).get("one", operation["id"])
    assert reloaded["state"] == "needs_reconciliation"
    assert [item["state"] for item in reloaded["items"]] == ["completed", "needs_reconciliation"]
    with pytest.raises(HTTPException):
        start_operation(OperationStore(path), "one", "youtube.metadata_update", Plan())
    assert provider_calls == ["known", "unknown"]
    # An interrupted running record is exposed as uncertain, never as unstarted.
    store.update("one", operation["id"], lambda op: op.update(state="running"))
    assert public_operation(store.get("one", operation["id"]))["state"] == "needs_reconciliation"


def test_backup_restore_and_version_rejection_leave_existing_json_untouched(tmp_path):
    existing = tmp_path / "notes.json"
    existing.write_text('{"version":1,"users":{}}', encoding="utf-8")
    store = OperationStore(tmp_path / "operations.sqlite3")
    store.claim("one", "youtube.metadata_update", Plan())
    backup = tmp_path / "journal.backup"
    store.backup(backup)
    store.claim("two", "youtube.metadata_update", Plan())
    store.restore(backup)
    assert len(store.list("one")) == 1 and store.list("two") == []
    assert existing.read_text(encoding="utf-8") == '{"version":1,"users":{}}'
    import sqlite3

    with sqlite3.connect(backup) as db:
        db.execute("PRAGMA user_version=99")
    with pytest.raises(ValueError):
        store.restore(backup)
    assert len(store.list("one")) == 1


def test_journal_queries_are_account_scoped_and_retired_routes_unavailable(tmp_path):
    store = OperationStore(tmp_path / "ops.sqlite3")
    operation, _ = store.claim("one", "youtube.metadata_update", Plan())
    app = create_app(operation_store=store, dependency_overrides={require_account_subject: lambda: "two"})
    client = TestClient(app)
    assert client.get("/api/v1/operations").json()["operations"] == []
    assert client.get("/api/v1/operations/" + operation["id"]).status_code == 404
    assert client.post("/api/v1/weverse-uploader/upload-from-path", json={}).status_code == 404
    assert client.get("/api/v1/auth/video-uploader/url").status_code == 404
    assert len(client.get("/api/v1/tools").json()["tools"]) == 8


def test_retired_callback_does_not_exchange_tokens():
    from unittest.mock import Mock
    from urllib.parse import unquote

    from backend.app.core.security import GOOGLE_OAUTH_STATE_SALT, sign_timed_data
    from backend.app.services.oauth_clients import OAuthClientFactories

    flow = Mock(side_effect=AssertionError("retired callback must not create a flow"))
    app = create_app(oauth_client_factories=OAuthClientFactories(flow=flow))
    client = TestClient(app)
    cookie = sign_timed_data(
        {"flow_type": "video_uploader", "state": "state", "code_verifier": "pkce"}, salt=GOOGLE_OAUTH_STATE_SALT
    )
    client.cookies.set(app.state.settings.oauth_flow_cookie_name, cookie)
    response = client.get("/api/v1/auth/callback?code=fake&state=state", follow_redirects=False)
    assert response.status_code in (302, 307)
    assert "auth_error=" in response.headers["location"]
    assert "此 OAuth 用途已停用" in unquote(response.headers["location"])
    flow.assert_not_called()


def test_http_journal_survives_restart_and_reconciliation_only_reads_provider(tmp_path):
    from dataclasses import dataclass

    from backend.app.api.youtube_workflow_dependencies import get_youtube_workflow_service
    from backend.app.core.dependencies import require_sheets_credentials, require_youtube_context

    calls = []
    remote = {"one": "New-one", "two": "Old-two"}
    context = SimpleNamespace(owner_sub="owner", channel_id="channel")

    def write(_context, video_id, title, description, **kwargs):
        calls.append(video_id)
        if video_id == "two":
            raise TimeoutError("provider response lost")
        return {"id": video_id}

    @dataclass
    class Ports:
        update_single_video_metadata: object = write
        set_video_public: object = lambda *args, **kwargs: None
        remove_playlist_item: object = lambda *args, **kwargs: None
        fetch_video_details: object = lambda _context, ids: [
            {"id": video_id, "snippet": {"title": remote[video_id], "description": ""}} for video_id in ids
        ]
        fetch_playlist_items: object = lambda *args: []

    class Workflow:
        def __init__(self, ports=None):
            self.ports = ports or Ports()

        def run_batch_metadata_update(self, payload, *, creds, sheet_creds):
            results = []
            for assignment in payload.assignments:
                try:
                    self.ports.update_single_video_metadata(
                        creds, assignment.video_id, "New-" + assignment.video_id, "", current_snippet={}
                    )
                    state = "succeeded"
                except TimeoutError:
                    state = "failed"
                results.append({"video_id": assignment.video_id, "status": state})
            return {"completed": False, "results": results}

    store_path = tmp_path / "journal.sqlite3"

    def client():
        return TestClient(
            create_app(
                operation_store=OperationStore(store_path),
                dependency_overrides={
                    require_youtube_context: lambda: context,
                    require_sheets_credentials: lambda: object(),
                    require_account_subject: lambda: "owner",
                    get_youtube_workflow_service: lambda: Workflow(),
                },
            )
        )

    payload = {
        "request_id": "fixed",
        "worksheet_name": "Videos",
        "title_column": "Title",
        "description_column": "Description",
        "assignments": [{"video_id": key, "person": "甲"} for key in remote],
    }
    first = client().post("/api/v1/youtube/batch-update", json=payload)
    assert first.status_code == 200
    operation_id = first.json()["operation_id"]
    restarted = client()
    assert restarted.get("/api/v1/operations/" + operation_id).json()["state"] == "needs_reconciliation"
    assert restarted.post("/api/v1/youtube/batch-update", json=payload).status_code == 409
    assert calls == ["one", "two"]
    reconciled = restarted.post("/api/v1/operations/" + operation_id + "/reconcile-youtube")
    assert reconciled.status_code == 200, reconciled.text
    assert reconciled.json()["state"] == "partial"
    remote["two"] = "New-two"
    assert restarted.post("/api/v1/operations/" + operation_id + "/reconcile-youtube").json()["state"] == "completed"
    assert calls == ["one", "two"]
