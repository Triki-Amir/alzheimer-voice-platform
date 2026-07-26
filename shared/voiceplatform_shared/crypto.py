import os
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag


AUDIO_MASTER_KEY = os.environ["AUDIO_MASTER_KEY"]
AUDIO_MASTER_KEY = base64.b64decode(AUDIO_MASTER_KEY.encode("ascii"))

if len(AUDIO_MASTER_KEY) != 32:
    raise ValueError(f"Invalid master key length: expected 32 bytes, got {len(AUDIO_MASTER_KEY)}")

def generate_data_key() ->bytes:
    return os.urandom(32)  # AES-256 key size
def wrap_key(data_key: bytes) -> str:
    """Wrap a data key using the master key and return it as a base64 string."""
    aesgcm = AESGCM(AUDIO_MASTER_KEY)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, data_key, None)
    combined = nonce + ciphertext
    return base64.b64encode(combined).decode("ascii")


def unwrap_key(wrapped: str) -> bytes:
    aesgcm=AESGCM(AUDIO_MASTER_KEY)
    combined = base64.b64decode(wrapped.encode("ascii"))
    ciphertext=combined[12:]
    nonce=combined[:12]
    try:
        key=aesgcm.decrypt(nonce, ciphertext, None)
        return key
    except InvalidTag:
        raise ValueError("Invalid wrapped key") 
    


def encrypt_bytes(data_key:bytes, plaintext: bytes) -> bytes:
    aesgsm=AESGCM(data_key)
    nonce=os.urandom(12)
    ciphertext=aesgsm.encrypt(nonce,plaintext,None)
    combined=nonce+ciphertext
    return combined


def decrypt_bytes(data_key:bytes,data:bytes) -> bytes:
    aesgcm=AESGCM(data_key)
    ciphertext=data[12:]
    nonce=data[:12]
    try:
        plaintext=aesgcm.decrypt(nonce,ciphertext,None)
        return plaintext
    except InvalidTag:
        raise ValueError("Invalid ciphertext or key")
    
