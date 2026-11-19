"""Regression checks for ten-minute login cleanup and user-facing Telegram errors."""
import time

import pytest
from fastapi import HTTPException
from telethon.errors import (
    FloodWaitError,
    PasswordHashInvalidError,
    PhoneCodeExpiredError,
    PhoneCodeInvalidError,
    PhoneNumberInvalidError,
)

from scanner.app.auth import MTProtoAuthManager, PendingAuth


class FakeClient:
    def __init__(self) -> None:
        self.disconnected = False

    async def disconnect(self) -> None:
        self.disconnected = True


@pytest.mark.asyncio
async def test_expired_login_is_removed_and_disconnected():
    manager = MTProtoAuthManager(1, "unused", None, None)  # type: ignore[arg-type]
    old_client = FakeClient()
    new_client = FakeClient()
    manager._sessions["old"] = PendingAuth("old", 1, old_client, time.time() - 601)  # type: ignore[arg-type]
    manager._sessions["new"] = PendingAuth("new", 1, new_client, time.time())  # type: ignore[arg-type]

    await manager._expire_pending()

    assert "old" not in manager._sessions
    assert old_client.disconnected
    assert "new" in manager._sessions
    assert not new_client.disconnected


@pytest.mark.parametrize(
    ("error", "fragment"),
    [
        (PhoneNumberInvalidError(request=None), "номер"),
        (PhoneCodeInvalidError(request=None), "код"),
        (PhoneCodeExpiredError(request=None), "истёк"),
        (PasswordHashInvalidError(request=None), "пароль"),
    ],
)
def test_telegram_login_errors_are_explained_in_russian(error, fragment):
    with pytest.raises(HTTPException) as caught:
        MTProtoAuthManager._friendly_auth_error(error)
    assert caught.value.status_code == 400
    assert fragment in caught.value.detail.lower()


def test_flood_wait_is_rate_limited_with_retry_after():
    with pytest.raises(HTTPException) as caught:
        MTProtoAuthManager._friendly_auth_error(FloodWaitError(request=None, capture=15))
    assert caught.value.status_code == 429
    assert caught.value.headers == {"Retry-After": "15"}
    assert "15" in caught.value.detail
