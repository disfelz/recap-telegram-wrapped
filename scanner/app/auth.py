from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass
from typing import Dict, Optional

from telethon import TelegramClient
from fastapi import HTTPException
from telethon.errors import (
    FloodWaitError,
    PasswordHashInvalidError,
    PhoneCodeExpiredError,
    PhoneCodeInvalidError,
    PhoneNumberInvalidError,
    SessionPasswordNeededError,
)
from telethon.sessions import StringSession
from telethon.tl.functions.auth import LogOutRequest

from .crypto import EphemeralSessionCipher
from .session_store import EncryptedSessionStore


@dataclass
class PendingAuth:
    auth_id: str
    telegram_user_id: int
    client: TelegramClient
    created_at: float
    qr_login: Optional[object] = None
    phone: Optional[str] = None
    phone_code_hash: Optional[str] = None
    status: str = "pending"
    encrypted_session: Optional[str] = None


class MTProtoAuthManager:
    """Управляет временными MTProto-авторизациями без хранения секретов в открытом виде."""

    def __init__(self, api_id: int, api_hash: str, cipher: EphemeralSessionCipher, store: EncryptedSessionStore) -> None:
        self._api_id = api_id
        self._api_hash = api_hash
        self._cipher = cipher
        self._store = store
        self._sessions: Dict[str, PendingAuth] = {}

    @staticmethod
    def _friendly_auth_error(error: Exception) -> None:
        """Map common Telegram RPC errors to safe, actionable HTTP responses."""
        if isinstance(error, FloodWaitError):
            seconds = max(1, int(error.seconds))
            raise HTTPException(
                status_code=429,
                detail=f"Telegram ограничил попытки входа. Повтори через {seconds} сек.",
                headers={"Retry-After": str(seconds)},
            ) from error
        messages = {
            PhoneNumberInvalidError: "Неверный номер телефона. Проверь код страны и цифры.",
            PhoneCodeInvalidError: "Неверный код из Telegram. Проверь цифры и попробуй снова.",
            PhoneCodeExpiredError: "Срок действия кода истёк. Запроси новый код.",
            PasswordHashInvalidError: "Неверный облачный пароль Telegram. Попробуй ещё раз.",
        }
        for error_type, message in messages.items():
            if isinstance(error, error_type):
                raise HTTPException(status_code=400, detail=message) from error
        raise error

    async def _expire_pending(self) -> None:
        """Disconnect temporary login clients after ten minutes of inactivity."""
        cutoff = time.time() - 600
        expired = [auth_id for auth_id, state in self._sessions.items()
                   if state.created_at < cutoff]
        for auth_id in expired:
            state = self._sessions.pop(auth_id, None)
            if state is None:
                continue
            state.encrypted_session = None
            try:
                await state.client.disconnect()
            except Exception:
                pass

    def _new_client(self, session_str: str = "") -> TelegramClient:
        return TelegramClient(
            StringSession(session_str),
            self._api_id,
            self._api_hash,
            device_model="RECAP Analyzer",
            system_version="Linux",
            app_version="1.0",
            lang_code="ru",
            system_lang_code="ru",
        )

    async def start_qr_login(self, telegram_user_id: int) -> dict:
        await self._expire_pending()
        client = self._new_client()
        try:
            await client.connect()
            qr_login = await client.qr_login()
        except (FloodWaitError, PhoneNumberInvalidError, PhoneCodeInvalidError,
                PhoneCodeExpiredError, PasswordHashInvalidError) as exc:
            await client.disconnect()
            self._friendly_auth_error(exc)
        except Exception:
            await client.disconnect()
            raise

        auth_id = str(uuid.uuid4())
        state = PendingAuth(
            auth_id=auth_id,
            telegram_user_id=telegram_user_id,
            client=client,
            created_at=time.time(),
            qr_login=qr_login,
        )
        self._sessions[auth_id] = state
        asyncio.create_task(self._watch_qr_login(state))

        return {
            "authId": auth_id,
            "qrUrl": qr_login.url,
            "expiresAt": qr_login.expires.isoformat(),
        }

    async def _watch_qr_login(self, state: PendingAuth) -> None:
        try:
            await state.qr_login.wait(timeout=35)
            await self._finalize_auth(state)
        except SessionPasswordNeededError:
            state.status = "needs_2fa"
        except asyncio.TimeoutError:
            state.status = "expired"
            await state.client.disconnect()
        except Exception:
            state.status = "expired"
            await state.client.disconnect()

    async def get_qr_status(self, telegram_user_id: int, auth_id: str) -> dict:
        await self._expire_pending()
        state = self._sessions.get(auth_id)
        if not state or state.telegram_user_id != telegram_user_id:
            return {"status": "not_found"}
        return {"status": state.status}

    async def start_phone_login(self, telegram_user_id: int, phone: str) -> dict:
        await self._expire_pending()
        client = self._new_client()
        try:
            await client.connect()
            sent = await client.send_code_request(phone)
        except (PhoneNumberInvalidError, PhoneCodeInvalidError, PhoneCodeExpiredError,
                PasswordHashInvalidError, FloodWaitError) as exc:
            await client.disconnect()
            self._friendly_auth_error(exc)
        except Exception:
            await client.disconnect()
            raise

        auth_id = str(uuid.uuid4())
        self._sessions[auth_id] = PendingAuth(
            auth_id=auth_id,
            telegram_user_id=telegram_user_id,
            client=client,
            created_at=time.time(),
            phone=phone,
            phone_code_hash=sent.phone_code_hash,
        )
        return {"authId": auth_id, "status": "code_sent"}

    async def verify_phone_login(
        self,
        telegram_user_id: int,
        auth_id: str,
        code: Optional[str] = None,
        password: Optional[str] = None,
    ) -> dict:
        await self._expire_pending()
        state = self._sessions.get(auth_id)
        if not state or state.telegram_user_id != telegram_user_id:
            return {"status": "not_found"}

        try:
            if password:
                await state.client.sign_in(password=password)
            elif code and state.phone and state.phone_code_hash:
                await state.client.sign_in(
                    phone=state.phone,
                    code=code,
                    phone_code_hash=state.phone_code_hash,
                )
            else:
                return {"status": "invalid_request"}

            await self._finalize_auth(state)
            return {"status": state.status, "authId": auth_id}
        except SessionPasswordNeededError:
            state.status = "needs_2fa"
            return {"status": "needs_2fa", "authId": auth_id}
        except (PhoneNumberInvalidError, PhoneCodeInvalidError, PhoneCodeExpiredError,
                PasswordHashInvalidError, FloodWaitError) as exc:
            if isinstance(exc, PhoneCodeExpiredError):
                self._sessions.pop(auth_id, None)
                await state.client.disconnect()
            self._friendly_auth_error(exc)

    async def _finalize_auth(self, state: PendingAuth) -> None:
        me = await state.client.get_me()
        if not me or me.id != state.telegram_user_id:
            await self.terminate_client_session(state.client)
            state.status = "revoked"
            return

        session_str = state.client.session.save()
        # A new login supersedes the old saved Telegram authorization.
        await self._revoke_saved_session(state.telegram_user_id)
        self._store.save(state.telegram_user_id, session_str)
        state.encrypted_session = self._cipher.encrypt(session_str, state.telegram_user_id)
        state.status = "authorized"
        await state.client.disconnect()

    def has_saved_session(self, telegram_user_id: int) -> bool:
        return self._store.has_session(telegram_user_id)

    def build_client_for_scan(self, telegram_user_id: int, auth_id: str = "") -> TelegramClient:
        state = self._sessions.get(auth_id) if auth_id else None
        if auth_id and state and state.telegram_user_id != telegram_user_id:
            raise PermissionError("Authorization belongs to another user")
        if auth_id and state and state.status != "authorized":
            raise PermissionError("Authorization is not completed")
        session_str = self._store.load(telegram_user_id)
        if not session_str:
            raise PermissionError("Saved Telegram authorization is missing")
        return self._new_client(session_str)

    async def _revoke_saved_session(self, telegram_user_id: int) -> None:
        session = self._store.load(telegram_user_id)
        if not session:
            return
        client = self._new_client(session)
        try:
            await client.connect()
            # If already revoked in Telegram, deleting the local credential is safe.
            if await client.is_user_authorized():
                await client(LogOutRequest())
            self._store.delete(telegram_user_id)
        finally:
            await client.disconnect()

    async def revoke_all_for_user(self, telegram_user_id: int) -> None:
        # Keep the encrypted credential if the Telegram LogOut call fails:
        # the caller must not report successful deletion in that case.
        await self._revoke_saved_session(telegram_user_id)
        to_remove = [k for k, v in self._sessions.items() if v.telegram_user_id == telegram_user_id]
        for auth_id in to_remove:
            state = self._sessions.pop(auth_id)
            # Pending login clients are not yet authorized; disconnect the transport.
            await state.client.disconnect()
            state.encrypted_session = None

    @staticmethod
    async def terminate_client_session(client: TelegramClient) -> None:
        """Explicit LogOut only; never call after ordinary analysis or cancellation."""
        try:
            if not client.is_connected():
                await client.connect()
            await client(LogOutRequest())
        finally:
            await client.disconnect()
