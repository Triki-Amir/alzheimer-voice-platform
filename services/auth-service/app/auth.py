import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import pyotp
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from . import models

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
JWT_SECRET_KEY = os.environ["JWT_SECRET_KEY"]
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "120"))
PRE_AUTH_EXPIRE_MINUTES = int(os.environ.get("PRE_AUTH_EXPIRE_MINUTES", "5"))
TOTP_ISSUER = os.environ.get("TOTP_ISSUER", "Alzheimer Voice Platform")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Mots de passe
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def authenticate_user(db: Session, email: str, password: str) -> Optional[models.Doctor]:
    user = db.query(models.Doctor).filter(models.Doctor.email == email).first()
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------
def _create_token(data: dict, expires_delta: timedelta) -> str:
    to_encode = data.copy()
    to_encode["exp"] = datetime.now(timezone.utc) + expires_delta
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_access_token(user: models.Doctor) -> str:
    """Jeton final, delivre uniquement apres verification du mot de passe
    ET du code TOTP. `amr` (Authentication Methods References) prouve que
    les deux facteurs ont ete verifies -> a checker par les autres services."""
    return _create_token(
        {"sub": str(user.id), "email": user.email, "role": user.role, "amr": ["pwd", "totp"]},
        timedelta(minutes=JWT_EXPIRE_MINUTES),
    )


def create_pre_auth_token(user: models.Doctor) -> str:
    """Jeton intermediaire, courte duree de vie, delivre juste apres le
    mot de passe. Ne donne acces a rien d'autre qu'aux routes /2fa/*."""
    return _create_token(
        {"sub": str(user.id), "email": user.email, "scope": "pre_2fa"},
        timedelta(minutes=PRE_AUTH_EXPIRE_MINUTES),
    )


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None


def decode_pre_auth_token(token: str) -> Optional[dict]:
    payload = decode_token(token)
    if not payload or payload.get("scope") != "pre_2fa":
        return None
    return payload


def is_fully_authenticated(payload: dict) -> bool:
    """Un token est considere pleinement authentifie (2FA passee) uniquement
    si `amr` contient a la fois 'pwd' et 'totp'."""
    amr = payload.get("amr", [])
    return "pwd" in amr and "totp" in amr


# ---------------------------------------------------------------------------
# TOTP (2FA)
# ---------------------------------------------------------------------------
def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, email: str) -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name=TOTP_ISSUER)


def verify_totp_code(secret: str, code: str) -> bool:
    return pyotp.totp.TOTP(secret).verify(code, valid_window=1)


# ---------------------------------------------------------------------------
# Backup codes (recuperation si le telephone est perdu)
# ---------------------------------------------------------------------------
def generate_backup_codes(count: int = 8) -> list[str]:
    # 8 bytes = 64 bits of entropy. The previous 4 bytes (32 bits, ~4 billion
    # combinations) is thin for a code that bypasses 2FA entirely rather than
    # a 30s TOTP window — bcrypt hashing and single-use consumption help, but
    # don't substitute for adequate entropy in the code itself.
    return [secrets.token_hex(8) for _ in range(count)]  # ex: '3f9a1c02e4b7d815'


def hash_backup_codes(codes: list[str]) -> list[str]:
    return [pwd_context.hash(code) for code in codes]


def verify_and_consume_backup_code(hashed_codes: list[str], submitted_code: str) -> Optional[list[str]]:
    """Retourne la nouvelle liste de hashs (code consomme retire) si le code
    soumis correspond a l'un d'entre eux, sinon None. Chaque backup code est
    a usage unique."""
    for hashed in hashed_codes:
        if pwd_context.verify(submitted_code, hashed):
            remaining = hashed_codes.copy()
            remaining.remove(hashed)
            return remaining
    return None

def create_ws_ticket(user: models.Doctor) -> str:
    """Jeton jetable, tres courte duree de vie, uniquement pour ouvrir
    une connexion WebSocket. Ne donne acces a rien d'autre."""
    return _create_token(
        {"sub": str(user.id), "scope": "ws_ticket"},
        timedelta(seconds=15),
    )