import base64
import os

import pytest
from cryptography.exceptions import InvalidTag

from scanner.app.crypto import EphemeralSessionCipher
from scanner.app.session_store import EncryptedSessionStore


def make_store(tmp_path):
    cipher = EphemeralSessionCipher(base64.b64encode(os.urandom(32)).decode("ascii"))
    return EncryptedSessionStore(str(tmp_path / "private"), cipher)


def test_session_survives_new_store_instance(tmp_path):
    store = make_store(tmp_path)
    store.save(12345, "TEST-TELETHON-SESSION-NOT-REAL")
    assert store.load(12345) == "TEST-TELETHON-SESSION-NOT-REAL"
    on_disk = (tmp_path / "private" / "12345.session.enc").read_text()
    assert "TEST-TELETHON" not in on_disk
    assert store.has_session(12345)
    assert store._dir.stat().st_mode & 0o777 == 0o700
    assert store._path(12345).stat().st_mode & 0o777 == 0o600


def test_session_cipher_aad_prevents_cross_account_read(tmp_path):
    store = make_store(tmp_path)
    store.save(111, "SECRET")
    store._path(222).write_bytes(store._path(111).read_bytes())
    with pytest.raises(InvalidTag):
        store.load(222)


def test_deleting_one_session_does_not_affect_other_users(tmp_path):
    store = make_store(tmp_path)
    store.save(111, "SESSION-111")
    store.save(222, "SESSION-222")
    store.delete(111)
    assert store.load(111) is None
    assert store.load(222) == "SESSION-222"
