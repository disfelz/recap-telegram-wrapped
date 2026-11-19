import base64
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class EphemeralSessionCipher:
    """Шифрует MTProto StringSession с помощью AES-256-GCM с привязкой к ID."""

    def __init__(self, key_b64: str) -> None:
        raw_key = base64.b64decode(key_b64)
        if len(raw_key) != 32:
            raise ValueError("SESSION_ENCRYPTION_KEY_B64 must decode to exactly 32 bytes")
        self._aesgcm = AESGCM(raw_key)

    def encrypt(self, plaintext: str, aad_user_id: int) -> str:
        nonce = os.urandom(12)
        aad = f"recap-uid:{aad_user_id}".encode("utf-8")
        ct = self._aesgcm.encrypt(nonce, plaintext.encode("utf-8"), aad)
        return base64.b64encode(nonce + ct).decode("ascii")

    def decrypt(self, ciphertext_b64: str, aad_user_id: int) -> str:
        raw = base64.b64decode(ciphertext_b64)
        nonce, ct = raw[:12], raw[12:]
        aad = f"recap-uid:{aad_user_id}".encode("utf-8")
        pt = self._aesgcm.decrypt(nonce, ct, aad)
        return pt.decode("utf-8")
