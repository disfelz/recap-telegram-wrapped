import logging
import re
from pydantic_settings import BaseSettings


class ScannerSettings(BaseSettings):
    telegram_api_id: int
    telegram_api_hash: str
    scanner_shared_secret: str
    session_encryption_key_b64: str
    max_concurrent_scans: int = 4
    checkpoint_dir: str = "/tmp/recap_checkpoints"

    class Config:
        env_file = ".env"
        extra = "ignore"


SENSITIVE_PATTERNS = [
    re.compile(r"\+?\d{10,15}"),
    re.compile(r"(?i)(password|code|hash|token|session)\s*[:=]\s*\S+"),
]


class RedactSecretsFilter(logging.Filter):
    """Удаляет секреты, коды, пароли и номера телефонов из любых записей лога."""

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        for pattern in SENSITIVE_PATTERNS:
            msg = pattern.sub("[REDACTED]", msg)
        record.msg = msg
        record.args = ()
        return True


def configure_logging() -> logging.Logger:
    logger = logging.getLogger("recap.scanner")
    logger.setLevel(logging.INFO)
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    handler.addFilter(RedactSecretsFilter())
    logger.handlers = [handler]
    return logger
