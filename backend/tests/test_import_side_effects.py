"""Importing core modules must not create persistent secrets or auth stores."""

import os
import subprocess
import sys
from pathlib import Path


def test_importing_core_modules_does_not_create_data_files(tmp_path):
    project_root = Path(__file__).resolve().parents[2]
    data_dir = tmp_path / "data"
    environment = os.environ.copy()
    environment.update(
        {
            "TOOLBOX_DATA_DIR": str(data_dir),
            "SECRET_KEY": "",
            "CREDENTIAL_ENCRYPTION_KEY": "",
            "ENVIRONMENT": "test",
            "PYTHONPATH": str(project_root),
        }
    )

    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import backend.app.core.config; "
            "import backend.app.core.session_store; "
            "import backend.app.core.credential_store",
        ],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert not data_dir.exists()


def test_explicit_store_construction_resolves_persistent_key_before_app_creation(tmp_path):
    project_root = Path(__file__).resolve().parents[2]
    data_dir = tmp_path / "data"
    environment = os.environ.copy()
    environment.update(
        {
            "TOOLBOX_DATA_DIR": str(data_dir),
            "SECRET_KEY": "",
            "CREDENTIAL_ENCRYPTION_KEY": "",
            "ENVIRONMENT": "test",
            "PYTHONPATH": str(project_root),
        }
    )
    script = """
import os
from backend.app.core.config import settings
from backend.app.core.credential_store import CredentialStore
from backend.app.core.session_store import SessionStore
from pathlib import Path

data_dir = Path(os.environ['TOOLBOX_DATA_DIR'])
assert not settings.CREDENTIAL_ENCRYPTION_KEY
sessions = SessionStore(data_dir / 'sessions.json')
credentials = CredentialStore(data_dir / 'credentials.json')
assert settings.CREDENTIAL_ENCRYPTION_KEY
session_id = sessions.create({'user': {'sub': 'test-user'}})
assert SessionStore(data_dir / 'sessions.json').get(session_id) == {'user': {'sub': 'test-user'}}
assert credentials._decrypt(credentials._encrypt('test-token')) == 'test-token'
assert (data_dir / '.secrets.json').is_file()
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    assert result.returncode == 0, result.stderr
