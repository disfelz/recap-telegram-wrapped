from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass
from typing import Dict, Optional

from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError
from telethon.sessions import StringSession
from telethon.tl.functions.auth import LogOutRequest

from .crypto import EphemeralSessionCipher


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

    def __init__(self, api_id: int, api_hash: str, cipher: EphemeralSessionCipher) -> None:
        self._api_id = api_id
        self._api_hash = api_hash
        self._cipher = cipher
        self._sessions: Dict[str, PendingAuth] = {}

    def _new_client(self, session_str: str = "") -> TelegramClient:
        return TelegramClient(
            StringSession(session_str),
            self._api_id,
            self._api_hash,
            device_model="RECAP Ephemeral Analyzer",
            system_version="Linux",
            app_version="1.0",
            lang_code="ru",
            system_lang_code="ru",
        )

    async def start_qr_login(self, telegram_user_id: int) -> dict:
        client = self._new_client()
        await client.connect()
        qr_login = await client.qr_login()

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
        state = self._sessions.get(auth_id)
        if not state or state.telegram_user_id != telegram_user_id:
            return {"status": "not_found"}
        return {"status": state.status}

    async def start_phone_login(self, telegram_user_id: int, phone: str) -> dict:
        client = self._new_client()
        await client.connect()
        sent = await client.send_code_request(phone)

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
            return {"status": "authorized", "authId": auth_id}
        except SessionPasswordNeededError:
            state.status = "needs_2fa"
            return {"status": "needs_2fa", "authId": auth_id}

    async def _finalize_auth(self, state: PendingAuth) -> None:
        me = await state.client.get_me()
        if not me or me.id != state.telegram_user_id:
            await self.terminate_client_session(state.client)
            state.status = "revoked"
            return

        session_str = state.client.session.save()
        state.encrypted_session = self._cipher.encrypt(session_str, state.telegram_user_id)
        state.status = "authorized"
        await state.client.disconnect()

    def build_client_for_scan(self, telegram_user_id: int, auth_id: str) -> TelegramClient:
        state = self._sessions.get(auth_id)
        if (
            not state
            or state.telegram_user_id != telegram_user_id
            or state.status != "authorized"
            or not state.encrypted_session
        ):
            raise PermissionError("Authorized MTProto session not found")

        session_str = self._cipher.decrypt(state.encrypted_session, telegram_user_id)
        return self._new_client(session_str)

    async def revoke_all_for_user(self, telegram_user_id: int) -> None:
        to_remove = [k for k, v in self._sessions.items() if v.telegram_user_id == telegram_user_id]
        for auth_id in to_remove:
            state = self._sessions.pop(auth_id)
            if state.encrypted_session:
                client = self._new_client(
                    self._cipher.decrypt(state.encrypted_session, telegram_user_id)
                )
                await self.terminate_client_session(client)
            else:
                await state.client.disconnect()

    @staticmethod
    async def terminate_client_session(client: TelegramClient) -> None:
        """Принудительно завершает временную MTProto-сессию на серверах Telegram."""
        try:
            if not client.is_connected():
                await client.connect()
            await client(LogOutRequest())
        except Exception:
            pass
        finally:
            await client.disconnect()
