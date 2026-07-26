import base64
import io
import json
import uuid

import qrcode
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from . import auth, models, schemas
from .database import get_db

app = FastAPI(title="Auth Service")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


# =============================================================================
# Dependencies
# =============================================================================
def get_current_doctor(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> models.Doctor:
    """Exige un token COMPLET (mot de passe + TOTP verifies)."""
    payload = auth.decode_token(token)
    if not payload or not auth.is_fully_authenticated(payload):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentification a deux facteurs requise",
        )
    doctor = db.query(models.Doctor).filter(models.Doctor.id == uuid.UUID(payload["sub"])).first()
    if not doctor:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur introuvable")
    return doctor


def get_pre_auth_doctor(token: str, db: Session) -> models.Doctor:
    payload = auth.decode_pre_auth_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Jeton pre-2FA invalide ou expire")
    doctor = db.query(models.Doctor).filter(models.Doctor.id == uuid.UUID(payload["sub"])).first()
    if not doctor:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur introuvable")
    return doctor


def _qr_code_base64(data: str) -> str:
    img = qrcode.make(data)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


# =============================================================================
# Bootstrap : creation de compte medecin
# =============================================================================
# NOTE : a proteger (reserver a un admin, ou remplacer par un script de seed
# comme scripts/enroll_doctor.py) avant un deploiement reel. Laisse ouvert
# ici pour faciliter le developpement / les tests.
@app.post("/doctors/register", response_model=schemas.DoctorOut, status_code=201)
def register_doctor(payload: schemas.DoctorRegister, db: Session = Depends(get_db)):
    existing = db.query(models.Doctor).filter(models.Doctor.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Un compte existe deja avec cet email")
    doctor = models.Doctor(
        email=payload.email,
        hashed_password=auth.hash_password(payload.password),
        full_name=payload.full_name,
        role="clinician",
    )
    db.add(doctor)
    db.commit()
    db.refresh(doctor)
    return doctor


# =============================================================================
# Etape 1 : login (email + mot de passe)
# =============================================================================
@app.post("/token", response_model=schemas.LoginStepOneResponse)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = auth.authenticate_user(db, form.username, form.password)
    if not user:
        raise HTTPException(status_code=401, detail="Identifiants invalides")

    pre_auth_token = auth.create_pre_auth_token(user)

    if user.totp_enabled:
        return schemas.LoginStepOneResponse(
            requires_2fa_setup=False,
            pre_auth_token=pre_auth_token,
            message="Mot de passe correct. Appelez /login/verify-2fa avec votre code TOTP.",
        )
    return schemas.LoginStepOneResponse(
        requires_2fa_setup=True,
        pre_auth_token=pre_auth_token,
        message="Mot de passe correct. La 2FA n'est pas encore configuree : "
        "appelez /2fa/setup puis /2fa/confirm avec ce pre_auth_token.",
    )


# =============================================================================
# Etape 2a : premiere configuration de la 2FA (obligatoire, une seule fois)
# =============================================================================
@app.post("/2fa/setup", response_model=schemas.TwoFactorSetupResponse)
def setup_2fa(pre_auth_token: str, db: Session = Depends(get_db)):
    doctor = get_pre_auth_doctor(pre_auth_token, db)
    if doctor.totp_enabled:
        raise HTTPException(status_code=400, detail="La 2FA est deja activee, utilisez /login/verify-2fa")

    secret = auth.generate_totp_secret()
    doctor.totp_secret = secret  # pas encore 'enabled' tant que /2fa/confirm n'est pas appele
    db.commit()

    uri = auth.totp_provisioning_uri(secret, doctor.email)
    return schemas.TwoFactorSetupResponse(
        secret=secret,
        otpauth_url=uri,
        qr_code_base64=_qr_code_base64(uri),
    )


@app.post("/2fa/confirm", response_model=schemas.TwoFactorConfirmResponse)
def confirm_2fa(payload: schemas.TwoFactorConfirm, db: Session = Depends(get_db)):
    doctor = get_pre_auth_doctor(payload.pre_auth_token, db)
    if not doctor.totp_secret:
        raise HTTPException(status_code=400, detail="Appelez d'abord /2fa/setup")
    if not auth.verify_totp_code(doctor.totp_secret, payload.code):
        raise HTTPException(status_code=400, detail="Code TOTP invalide")

    backup_codes = auth.generate_backup_codes()
    doctor.totp_enabled = True
    doctor.backup_codes = json.dumps(auth.hash_backup_codes(backup_codes))
    db.commit()

    return schemas.TwoFactorConfirmResponse(
        access_token=auth.create_access_token(doctor),
        backup_codes=backup_codes,  # affiches UNE SEULE fois, a stocker par le medecin
    )


# =============================================================================
# Etape 2b : verification 2FA a chaque connexion suivante
# =============================================================================
@app.post("/login/verify-2fa", response_model=schemas.Token)
def verify_2fa(payload: schemas.TwoFactorVerify, db: Session = Depends(get_db)):
    doctor = get_pre_auth_doctor(payload.pre_auth_token, db)
    if not doctor.totp_enabled:
        raise HTTPException(status_code=400, detail="2FA non configuree pour ce compte")

    if auth.verify_totp_code(doctor.totp_secret, payload.code):
        return schemas.Token(access_token=auth.create_access_token(doctor))

    # Code TOTP invalide : tenter un backup code (perte du telephone)
    stored_codes = json.loads(doctor.backup_codes or "[]")
    remaining = auth.verify_and_consume_backup_code(stored_codes, payload.code)
    if remaining is not None:
        doctor.backup_codes = json.dumps(remaining)
        db.commit()
        return schemas.Token(access_token=auth.create_access_token(doctor))

    raise HTTPException(status_code=401, detail="Code TOTP / backup code invalide")


# =============================================================================
# Verification de token (utilisee par les autres services / nginx auth_request)
# =============================================================================
@app.get("/verify")
def verify(token: str):
    payload = auth.decode_token(token)
    if not payload or not auth.is_fully_authenticated(payload):
        raise HTTPException(status_code=401, detail="Token invalide ou 2FA non verifiee")
    return payload


# =============================================================================
# Patients (proteges : necessitent un medecin pleinement authentifie)
# =============================================================================
@app.post("/patients", response_model=schemas.PatientOut, status_code=201)
def create_patient(
    payload: schemas.PatientCreate,
    doctor: models.Doctor = Depends(get_current_doctor),
    db: Session = Depends(get_db),
):
    patient = models.Patient(**payload.model_dump(), doctor_id=doctor.id)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@app.get("/patients", response_model=list[schemas.PatientOut])
def list_my_patients(
    doctor: models.Doctor = Depends(get_current_doctor),
    db: Session = Depends(get_db),
):
    return db.query(models.Patient).filter(models.Patient.doctor_id == doctor.id).all()
