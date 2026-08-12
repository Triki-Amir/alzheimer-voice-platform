import os
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from cryptography.exceptions import InvalidTag


AUDIO_MASTER_KEY = os.environ["AUDIO_MASTER_KEY"]
AUDIO_MASTER_KEY = base64.b64decode(AUDIO_MASTER_KEY.encode("ascii"))

if len(AUDIO_MASTER_KEY) != 32:
    raise ValueError(f"Invalid master key length: expected 32 bytes, got {len(AUDIO_MASTER_KEY)}")

# A malformed/truncated ciphertext can make the underlying C bindings raise
# ValueError instead of InvalidTag (e.g. a nonce that isn't 12 bytes) — treat
# both as "this ciphertext is not valid", never leak the raw exception.
_CIPHER_ERRORS = (InvalidTag, ValueError)


def _derive_subkey(info: bytes) -> bytes:
    """Domain-separate a purpose-specific key from AUDIO_MASTER_KEY via HKDF,
    so a bug or leak in one use (e.g. TOTP secrets) can't be leveraged against
    another (e.g. patient audio) even though both trace back to one root key.
    """
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=info).derive(AUDIO_MASTER_KEY)


def generate_data_key() -> bytes:
    return os.urandom(32)  # AES-256 key size


def wrap_key(data_key: bytes, aad: bytes | None = None) -> str:
    """Wrap a data key using the master key and return it as a base64 string.

    `aad` should be something that identifies the record this key belongs to
    (e.g. the session id). It isn't encrypted, but GCM authenticates it, so a
    wrapped key silently moved to a different record's row will fail to
    decrypt instead of being trusted.
    """
    aesgcm = AESGCM(AUDIO_MASTER_KEY)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, data_key, aad)
    combined = nonce + ciphertext
    return base64.b64encode(combined).decode("ascii")


def unwrap_key(wrapped: str, aad: bytes | None = None) -> bytes:
    aesgcm = AESGCM(AUDIO_MASTER_KEY)
    combined = base64.b64decode(wrapped.encode("ascii"))
    nonce, ciphertext = combined[:12], combined[12:]
    try:
        return aesgcm.decrypt(nonce, ciphertext, aad)
    except _CIPHER_ERRORS:
        raise ValueError("Invalid wrapped key")


def encrypt_bytes(data_key: bytes, plaintext: bytes, aad: bytes | None = None) -> bytes:
    """`aad` ties the ciphertext to its record (e.g. session id) — same
    rationale as wrap_key: prevents two patients' encrypted audio blobs from
    being swapped in storage without detection."""
    aesgcm = AESGCM(data_key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext, aad)
    return nonce + ciphertext


def decrypt_bytes(data_key: bytes, data: bytes, aad: bytes | None = None) -> bytes:
    aesgcm = AESGCM(data_key)
    nonce, ciphertext = data[:12], data[12:]
    try:
        return aesgcm.decrypt(nonce, ciphertext, aad)
    except _CIPHER_ERRORS:
        raise ValueError("Invalid ciphertext or key")


# ---------------------------------------------------------------------------
# Small secrets stored directly in Postgres (TOTP seed, etc). Same AES-256-GCM
# primitive as the audio path, but under an HKDF-derived subkey so this domain
# never reuses key material with the audio-encryption domain.
# ---------------------------------------------------------------------------
_SECRET_KEY = _derive_subkey(b"voiceapp:db-secret-field:v1")


def encrypt_secret(plaintext: str, aad: bytes) -> str:
    """`aad` must uniquely identify the row (e.g. str(doctor.id).encode()) so
    a secret can't be copy-pasted into a different user's row and still
    decrypt — the ciphertext is cryptographically bound to whose it is."""
    aesgcm = AESGCM(_SECRET_KEY)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), aad)
    return base64.b64encode(nonce + ciphertext).decode("ascii")


def decrypt_secret(token: str, aad: bytes) -> str:
    aesgcm = AESGCM(_SECRET_KEY)
    combined = base64.b64decode(token.encode("ascii"))
    nonce, ciphertext = combined[:12], combined[12:]
    try:
        return aesgcm.decrypt(nonce, ciphertext, aad).decode("utf-8")
    except _CIPHER_ERRORS:
        raise ValueError("Invalid secret ciphertext")