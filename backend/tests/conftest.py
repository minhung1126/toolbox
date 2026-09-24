"""Select disposable storage before pytest imports any application modules."""

import ipaddress
import os
import socket
from tempfile import TemporaryDirectory

import pytest

_TEST_DATA = TemporaryDirectory(prefix="toolbox-pytest-data-")
os.environ["TOOLBOX_DATA_DIR"] = _TEST_DATA.name


@pytest.fixture(autouse=True)
def block_provider_network(monkeypatch):
    def denied(*args, **kwargs):
        raise AssertionError("Tests must inject a fake provider instead of opening network connections")

    monkeypatch.setattr(socket, "create_connection", denied)
    original_connect = socket.socket.connect

    def guarded_connect(sock, address):
        # Windows asyncio implements socketpair using an IPv4 loopback socket.
        if isinstance(address, tuple):
            try:
                if ipaddress.ip_address(address[0]).is_loopback:
                    return original_connect(sock, address)
            except ValueError:
                pass
        return denied(sock, address)

    monkeypatch.setattr(socket.socket, "connect", guarded_connect)


@pytest.fixture
def unicode_sheet_headers():
    return "\u6240\u5c6c\u5718\u9ad4", "\u4eba"
