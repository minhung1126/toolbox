import os
import subprocess
import sys
from pathlib import Path

from backend.app.main import create_app


def test_importing_default_app_does_not_initialize_persistent_state(tmp_path):
    data_dir = tmp_path / "import-only"
    env = {**os.environ, "TOOLBOX_DATA_DIR": str(data_dir), "LC_ALL": "C", "PYTHONCOERCECLOCALE": "0"}
    result = subprocess.run(
        [sys.executable, "-X", "utf8=0", "-c", "import backend.app.main"],
        env=env,
        cwd=Path(__file__).resolve().parents[2],
        capture_output=True,
        timeout=15,
        check=False,
    )
    assert result.returncode == 0, result.stderr.decode(errors="replace")
    assert not data_dir.exists() or not any(data_dir.iterdir())


def test_factory_keeps_workflow_adapters_per_app():
    from starlette.requests import Request

    from backend.app.api.youtube_workflow_dependencies import get_youtube_workflow_service

    first_provider, second_provider = object(), object()
    first = create_app(youtube_workflow_adapters={"fetch_playlist_items": first_provider})
    second = create_app(youtube_workflow_adapters={"fetch_playlist_items": second_provider})
    first_service = get_youtube_workflow_service(Request({"type": "http", "app": first}))
    second_service = get_youtube_workflow_service(Request({"type": "http", "app": second}))
    assert first_service.ports.fetch_playlist_items is first_provider
    assert second_service.ports.fetch_playlist_items is second_provider
