import re
from datetime import date
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, field_validator
from voiceplatform_shared.db_models import DoctorRole


# ---------- Auth / login (2 etapes) ----------

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginStepOneResponse(BaseModel):
    """Reponse a /token : jamais un access_token complet directement.
    - Si l'utilisateur a deja active la 2FA -> il doit encore verifier
      son code TOTP via /login/verify-2fa.
    - Sinon -> il doit d'abord configurer la 2FA via /2fa/setup puis
      /2fa/confirm (la 2FA est obligatoire pour tous les medecins).
    """
    requires_2fa_setup: bool
    pre_auth_token: str
    message: str


class TwoFactorVerify(BaseModel):
    pre_auth_token: str
    code: str  # code TOTP a 6 chiffres, ou un backup code


class TwoFactorSetupResponse(BaseModel):
    secret: str
    otpauth_url: str
    qr_code_base64: str


class TwoFactorConfirm(BaseModel):
    pre_auth_token: str
    code: str


class TwoFactorConfirmResponse(BaseModel):
    backup_codes: list[str]


# ---------- Doctor ----------

class DoctorRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    family_name: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 10:
            raise ValueError("Le mot de passe doit contenir au moins 10 caracteres")
        if not re.search(r"[A-Z]", v) or not re.search(r"[a-z]", v) or not re.search(r"\d", v):
            raise ValueError(
                "Le mot de passe doit contenir au moins une majuscule, "
                "une minuscule et un chiffre"
            )
        return v


class DoctorOut(BaseModel):
    id: UUID
    email: EmailStr
    name: str
    family_name: str
    role: DoctorRole
    totp_enabled: bool

    class Config:
        from_attributes = True


# ---------- Patient ----------

class PatientCreate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    external_ref: Optional[str] = None


class PatientOut(BaseModel):
    id: UUID
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    external_ref: Optional[str] = None
    doctor_id: Optional[UUID] = None

    class Config:
        from_attributes = True

class LoginSuccess(BaseModel):
    message: str = "Authentification reussie"