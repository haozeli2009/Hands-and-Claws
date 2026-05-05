"""
Encrypt/decrypt user-supplied LLM API keys at rest with Fernet.

The feature is enabled only when LLM_KEY_ENCRYPTION_KEY is set (a url-safe
base64 32-byte Fernet key). When disabled, `encrypt` raises RuntimeError so
callers can surface a clear "feature off" message to the user.
"""
from __future__ import annotations
from functools import lru_cache
from cryptography.fernet import Fernet, InvalidToken
from config import Config


class LLMKeyFeatureDisabled(RuntimeError):
    """Raised when per-user LLM config is used but no server key is configured."""


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    if not Config.LLM_KEY_ENCRYPTION_KEY:
        raise LLMKeyFeatureDisabled(
            "LLM_KEY_ENCRYPTION_KEY is not set — per-user LLM keys are disabled."
        )
    return Fernet(Config.LLM_KEY_ENCRYPTION_KEY.encode())


def is_enabled() -> bool:
    return bool(Config.LLM_KEY_ENCRYPTION_KEY)


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError("Stored API key could not be decrypted — key rotated?") from exc


def mask(plaintext: str) -> str:
    """Return a display-safe hint of a secret, never its middle."""
    if not plaintext:
        return ""
    if len(plaintext) <= 8:
        return "…" + plaintext[-2:]
    return plaintext[:4] + "…" + plaintext[-4:]
