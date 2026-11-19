"""Session lifecycle regression tests: terminal callbacks must follow MTProto LogOut."""
from __future__ import annotations

import asyncio
import base64
import importlib
import os

import pytest
from telethon.tl.functions.auth import LogOutRequest

from scanner.app.auth import MTProtoAuthManager
from scanner.app.crypto import EphemeralSessionCipher
from scanner.app.session_store import EncryptedSessionStore


class FakeTelegramClient:
    def __init__(self, *, fail_logout: bool = False):
        self.connected = False
        self.logouts = 0
        self.disconnected = False
        self.fail_logout = fail_logout

    async def connect(self):
        self.connected = True

    def is_connected(self):
        return self.connected

    async def __call__(self, request):
        assert isinstance(request, LogOutRequest)
        self.logouts += 1
        if self.fail_logout:
            raise ConnectionError("Telegram unreachable")
        return object()

    async def disconnect(self):
        self.connected = False
        self.disconnected = True


@pytest.fixture()
def configured_server(tmp_path, monkeypatch):
    cipher_key = base64.b64encode(os.urandom(32)).decode("ascii")
    monkeypatch.setenv("TELEGRAM_API_ID", "123")
    monkeypatch.setenv("TELEGRAM_API_HASH", "stub-api-hash")
    monkeypatch.setenv("SCANNER_SHARED_SECRET", "secret-for-test")
    monkeypatch.setenv("SESSION_ENCRYPTION_KEY_B64", cipher_key)
    monkeypatch.setenv("SESSION_STORE_DIR", str(tmp_path / "server_sessions"))
    monkeypatch.setenv("CHECKPOINT_DIR", str(tmp_path / "server_checkpoints"))

    server = importlib.import_module("scanner.app.server")
    cipher = EphemeralSessionCipher(cipher_key)
    store = EncryptedSessionStore(str(tmp_path / "test_sessions"), cipher)
    manager = MTProtoAuthManager(123, "stub-api-hash", cipher, store)
    monkeypatch.setattr(server, "auth_manager", manager)
    monkeypatch.setattr(server, "TelethonAdapter", lambda client: object())
    monkeypatch.setattr(server, "scan_semaphore", asyncio.Semaphore(1))
    return server, manager, store


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["completed", "cancelled", "failed"])
async def test_terminal_scan_logs_out_and_erases_temporary_file(configured_server, monkeypatch, status):
    server, manager, store = configured_server
    telegram_id = 845102
    store.save(telegram_id, "FAKE-ENCRYPTED-TELETHON-SESSION")
    temporary_file = store._path(telegram_id)
    assert temporary_file.is_file()
    client = FakeTelegramClient()
    monkeypatch.setattr(manager, "build_client_for_scan", lambda user_id, auth_id: client)
    monkeypatch.setattr(manager, "_new_client", lambda session_str="": client)

    class FakeAnalyzer:
        def __init__(self, *args, **kwargs):
            pass

        async def run(self, **kwargs):
            if status == "failed":
                raise RuntimeError("scanner unexpectedly failed")
            return {
                "completionStatus": "completed",
                "totalMessages": 37,
                "metrics": {"processedDialogs": 1, "totalEligibleDialogs": 1},
            }

    monkeypatch.setattr(server, "RecapAnalyzer", FakeAnalyzer)
    received = []

    async def capture_callback(url, payload):
        received.append(payload.copy())

    monkeypatch.setattr(server, "_post_callback", capture_callback)
    req = server.ScanStartReq(
        job_id="terminal-" + status,
        telegram_user_id=telegram_id,
        year=2026,
        timezone="Europe/Moscow",
        callback_url="https://example.invalid/internal/scanner/callback",
    )
    cancel = asyncio.Event()
    resume = asyncio.Event()
    resume.set()
    if status == "cancelled":
        cancel.set()
    await server._run_scan_job(req, cancel, resume)

    assert client.logouts == 1
    assert client.disconnected is True
    assert not temporary_file.exists()
    assert store.load(telegram_id) is None
    assert received[-1]["status"] == status
    assert received[-1]["sessionClosed"] is True


@pytest.mark.asyncio
async def test_failed_telegram_logout_erases_file_but_reports_unconfirmed(configured_server, monkeypatch):
    server, manager, store = configured_server
    user_id = 845103
    store.save(user_id, "FAKE-SESSION")
    client = FakeTelegramClient(fail_logout=True)
    monkeypatch.setattr(manager, "build_client_for_scan", lambda user_id, auth_id: client)

    class FakeAnalyzer:
        def __init__(self, *args, **kwargs):
            pass

        async def run(self, **kwargs):
            return {
                "completionStatus": "completed",
                "totalMessages": 12,
                "metrics": {"processedDialogs": 1, "totalEligibleDialogs": 1},
            }

    monkeypatch.setattr(server, "RecapAnalyzer", FakeAnalyzer)
    callback = []

    async def capture(url, payload):
        callback.append(payload)

    monkeypatch.setattr(server, "_post_callback", capture)
    req = server.ScanStartReq(
        job_id="telegram-logout-error", telegram_user_id=user_id,
        year=2026, callback_url="https://example.invalid/internal/scanner/callback",
    )
    resume = asyncio.Event()
    resume.set()
    await server._run_scan_job(req, asyncio.Event(), resume)

    assert client.logouts == 1
    assert not store._path(user_id).exists()
    assert callback[-1]["sessionClosed"] is False


@pytest.mark.asyncio
async def test_manual_pause_keeps_session_until_resume(configured_server, monkeypatch):
    server, manager, store = configured_server
    user_id = 845104
    store.save(user_id, "FAKE-SESSION")
    client = FakeTelegramClient()
    monkeypatch.setattr(manager, "build_client_for_scan", lambda user_id, auth_id: client)
    started = asyncio.Event()
    resume = asyncio.Event()

    class PausedAnalyzer:
        def __init__(self, *args, **kwargs):
            pass

        async def run(self, **kwargs):
            started.set()
            await resume.wait()
            return {
                "completionStatus": "completed",
                "totalMessages": 1,
                "metrics": {"processedDialogs": 1, "totalEligibleDialogs": 1},
            }

    monkeypatch.setattr(server, "RecapAnalyzer", PausedAnalyzer)

    async def discard_callback(url, payload):
        pass

    monkeypatch.setattr(server, "_post_callback", discard_callback)
    req = server.ScanStartReq(
        job_id="paused-user", telegram_user_id=user_id,
        year=2026, callback_url="https://example.invalid/internal/scanner/callback",
    )
    task = asyncio.create_task(server._run_scan_job(req, asyncio.Event(), resume))
    await asyncio.wait_for(started.wait(), timeout=3)
    assert client.logouts == 0
    assert store._path(user_id).exists()
    resume.set()
    await asyncio.wait_for(task, timeout=3)
    assert client.logouts == 1
    assert not store._path(user_id).exists()


@pytest.mark.asyncio
async def test_explicit_revoke_retry_keeps_credential_when_telegram_fails(configured_server, monkeypatch):
    _server, manager, store = configured_server
    user_id = 845105
    store.save(user_id, "RETRYABLE-ENCRYPTED-SESSION")
    failing = FakeTelegramClient(fail_logout=True)
    async def authorized():
        return True
    failing.is_user_authorized = authorized  # type: ignore[attr-defined]
    monkeypatch.setattr(manager, "_new_client", lambda session_str="": failing)

    with pytest.raises(ConnectionError):
        await manager.revoke_all_for_user(user_id)

    assert failing.logouts == 1
    assert store._path(user_id).is_file()
    assert store.load(user_id) == "RETRYABLE-ENCRYPTED-SESSION"

    restored = FakeTelegramClient()
    restored.is_user_authorized = authorized  # type: ignore[attr-defined]
    monkeypatch.setattr(manager, "_new_client", lambda session_str="": restored)
    await manager.revoke_all_for_user(user_id)

    assert restored.logouts == 1
    assert not store._path(user_id).exists()


@pytest.mark.asyncio
async def test_abandoned_authorization_is_revoked_but_paused_scan_is_preserved(configured_server, monkeypatch):
    import time
    _server, manager, store = configured_server
    old_id, paused_id = 845106, 845107
    store.save(old_id, "ABANDONED-SESSION")
    store.save(paused_id, "PAUSED-SCAN-SESSION")
    now = time.time()
    os.utime(store._path(old_id), (now - 700, now - 700))
    os.utime(store._path(paused_id), (now - 700, now - 700))
    client = FakeTelegramClient()
    monkeypatch.setattr(manager, "_new_client", lambda session_str="": client)

    await manager.expire_idle_sessions({paused_id}, idle_seconds=600)

    assert client.logouts == 1
    assert not store._path(old_id).exists()
    assert store._path(paused_id).is_file()
