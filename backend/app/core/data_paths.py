"""Resolve storage before application imports; tests always select a temporary root."""

import os
from pathlib import Path


def data_directory() -> Path:
    configured = os.environ.get("TOOLBOX_DATA_DIR")
    return Path(configured).expanduser().resolve() if configured else Path(__file__).resolve().parents[3] / "data"
