"""Encrypted session vault. Mount SESSION_STORE_DIR on a persistent private volume."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

from .crypto import EphemeralSessionCipher


class EncryptedSessionStore:
    def __init__(self, base_dir: str, cipher: EphemeralSessionCipher) -> None:
        self._dir = Path(base_dir)
        self._dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self._dir, 0o700)
        self._cipher = cipher

    def _path(self, telegram_user_id: int) -> Path:
        if telegram_user_id <= 0:
            raise ValueError("Invalid Telegram user ID")
        return self._dir / f"{telegram_user_id}.session.enc"

    def load(self, telegram_user_id: int) -> str | None:
        path = self._path(telegram_user_id)
        if not path.exists():
            return None
        # AES-256-GCM with an AAD-bound Telegram ID. No plaintext session on disk.
        return self._cipher.decrypt(path.read_text(encoding="ascii"), telegram_user_id)

    def save(self, telegram_user_id: int, session: str) -> None:
        encrypted = self._cipher.encrypt(session, telegram_user_id)
        path = self._path(telegram_user_id)
        fd, temporary = tempfile.mkstemp(prefix=".session-", dir=self._dir)
        try:
            with os.fdopen(fd, "w", encoding="ascii") as output:
                os.fchmod(output.fileno(), 0o600)
                output.write(encrypted)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def delete(self, telegram_user_id: int) -> None:
        self._path(telegram_user_id).unlink(missing_ok=True)

    def has_session(self, telegram_user_id: int) -> bool:
        return self.load(telegram_user_id) is not None
