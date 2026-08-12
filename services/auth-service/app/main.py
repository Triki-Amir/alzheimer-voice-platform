import base64
import io
import json
import os
import uuid
from uuid import UUID

import qrcode
from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from datetime import datetime, timedelta, timezone
from . import auth, models, schemas
from .database import get_db
from voiceplatform_shared.audit import log_action
from fastapi import File, UploadFile
from voiceplatform_shared.crypto import generate_data_key, wrap_key, encrypt_bytes, encrypt_secret, decrypt_secret
from voiceplatform_shared.minio_client import get_minio_client
from voiceplatform_shared.publisher import publish_session_message
from voiceplatform_shared.constants import Queues

app = FastAPI(title="Auth Service")

# CORS: explicit allow-list only. ALLOWED_ORIGINS is a comma-separated list
# in .env, e.g. "https://app.example.com,http://localhost:5173" for local
# frontend dev. Never use "*" here once the frontend sends the JWT via
# credentials/Authorization header from a browser.
_allowed_origins = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

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

def get_current_superadmin(
    doctor: models.Doctor = Depends(get_current_doctor),
) -> models.Doctor:
    """Comme get_current_doctor, mais exige en plus le role superadmin."""
    if doctor.role != models.DoctorRole.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acces reserve au superadmin",
        )
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
        name=payload.name,
        family_name=payload.family_name,
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
    # Recherche de l'utilisateur
    user = (
        db.query(models.Doctor)
        .filter(models.Doctor.email == form.username)
        .first()
    )

    # Ne pas révéler si l'utilisateur existe
    if not user:
        raise HTTPException(status_code=401, detail="Identifiants invalides")

    # Vérifier si le compte est temporairement verrouillé
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=423,
            detail="Compte temporairement verrouillé. Réessayez plus tard."
        )

    # Vérification du mot de passe
    if not auth.verify_password(form.password, user.hashed_password):
        user.failed_login_attempts += 1

        # Verrouillage après 5 échecs
        if user.failed_login_attempts >= 5:
            user.failed_login_attempts = 0
            user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)

        db.commit()

        raise HTTPException(status_code=401, detail="Identifiants invalides")

    # Connexion réussie : réinitialiser les compteurs
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()

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
        message="Mot de passe correct. La 2FA n'est pas encore configurée : "
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
    # Stored encrypted: a plaintext TOTP seed in the DB would let anyone with
    # read access to that table generate valid 2FA codes for any account,
    # which defeats the point of having 2FA. AAD = doctor id, so this
    # ciphertext can't be copy-pasted into another doctor's row.
    doctor.totp_secret = encrypt_secret(secret, aad=str(doctor.id).encode("ascii"))  # pas encore 'enabled' tant que /2fa/confirm n'est pas appele
    db.commit()

    uri = auth.totp_provisioning_uri(secret, doctor.email)
    return schemas.TwoFactorSetupResponse(
        secret=secret,
        otpauth_url=uri,
        qr_code_base64=_qr_code_base64(uri),
    )


@app.post("/2fa/confirm", response_model=schemas.TwoFactorConfirmResponse)
def confirm_2fa(
    payload: schemas.TwoFactorConfirm,
    response: Response,
    db: Session = Depends(get_db),
):
    doctor = get_pre_auth_doctor(payload.pre_auth_token, db)

    if not doctor.totp_secret:
        raise HTTPException(
            status_code=400,
            detail="Appelez d'abord /2fa/setup"
        )

    secret = decrypt_secret(
        doctor.totp_secret,
        aad=str(doctor.id).encode("ascii")
    )

    if not auth.verify_totp_code(secret, payload.code):
        raise HTTPException(
            status_code=400,
            detail="Code TOTP invalide"
        )

    backup_codes = auth.generate_backup_codes()

    doctor.totp_enabled = True
    doctor.backup_codes = json.dumps(
        auth.hash_backup_codes(backup_codes)
    )
    db.commit()

    access_token = auth.create_access_token(doctor)

    response.set_cookie(
        key="ehealth_auth_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=auth.JWT_EXPIRE_MINUTES * 60,
        path="/",
    )

    return schemas.TwoFactorConfirmResponse(
        backup_codes=backup_codes,
    )
# =============================================================================
# Etape 2b : verification 2FA a chaque connexion suivante
# =============================================================================
@app.post("/login/verify-2fa", response_model=schemas.Token)
def verify_2fa(payload: schemas.TwoFactorVerify, db: Session = Depends(get_db)):
    doctor = get_pre_auth_doctor(payload.pre_auth_token, db)
    if not doctor.totp_enabled:
        raise HTTPException(status_code=400, detail="2FA non configuree pour ce compte")

    # Meme verrouillage que pour le mot de passe : sans ca, un attaquant qui
    # a deja le mot de passe pourrait brute-forcer les 6 chiffres du TOTP.
    if doctor.locked_until and doctor.locked_until > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=423,
            detail="Compte temporairement verrouille. Reessayez plus tard.",
        )

    if auth.verify_totp_code(decrypt_secret(doctor.totp_secret, aad=str(doctor.id).encode("ascii")), payload.code):
        doctor.failed_login_attempts = 0
        doctor.locked_until = None
        db.commit()
        return schemas.Token(access_token=auth.create_access_token(doctor))

    # Code TOTP invalide : tenter un backup code (perte du telephone)
    stored_codes = json.loads(doctor.backup_codes or "[]")
    remaining = auth.verify_and_consume_backup_code(stored_codes, payload.code)
    if remaining is not None:
        doctor.backup_codes = json.dumps(remaining)
        doctor.failed_login_attempts = 0
        doctor.locked_until = None
        db.commit()
        return schemas.Token(access_token=auth.create_access_token(doctor))

    doctor.failed_login_attempts += 1
    if doctor.failed_login_attempts >= 5:
        doctor.failed_login_attempts = 0
        doctor.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
    db.commit()

    raise HTTPException(status_code=401, detail="Code TOTP / backup code invalide")


# =============================================================================
# Verification de token (utilisee par les autres services / nginx auth_request)
# =============================================================================
@app.get("/verify")
def verify(token: str = Depends(oauth2_scheme)):
    """Le token voyage dans l'en-tete Authorization: Bearer <token>, jamais
    en query string (une query string finit dans les logs nginx, l'historique
    du navigateur, etc.)."""
    payload = auth.decode_token(token)
    if not payload or not auth.is_fully_authenticated(payload):
        raise HTTPException(status_code=401, detail="Token invalide ou 2FA non verifiee")
    return payload

@app.get("/ws-ticket")
def get_ws_ticket(doctor: models.Doctor = Depends(get_current_doctor)):
    return {"ticket": auth.create_ws_ticket(doctor)}


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

# =============================================================================
# Enrôlement vocal du médecin (échantillon de référence pour l'extraction)
# =============================================================================
@app.post("/doctors/voice-enroll", status_code=202)
async def enroll_doctor_voice(
    audio: UploadFile = File(...),
    doctor: models.Doctor = Depends(get_current_doctor),  # exige 2FA complète
):
    raw_audio = await audio.read()

    data_key = generate_data_key()
    wrapped_key = wrap_key(data_key)
    encrypted_audio = encrypt_bytes(data_key, raw_audio)

    object_name = f"{doctor.id}/enrollment.enc"
    minio = get_minio_client()
    minio.put_object(
        "doctor-voice-enrollment",
        object_name,
        io.BytesIO(encrypted_audio),
        length=len(encrypted_audio),
    )

    publish_session_message(
        Queues.VOICE_ENROLLMENT,
        {
            "doctor_id": str(doctor.id),
            "audio_path": object_name,
            "wrapped_data_key": wrapped_key,
        },
    )

    return {"status": "enrollment_queued"}


@app.delete("/admin/doctors/{doctor_id}")
def delete_doctor(doctor_id: UUID, admin: models.Doctor = Depends(get_current_superadmin), db: Session = Depends(get_db)):
    doctor = db.query(models.Doctor).filter(models.Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Medecin introuvable")

    log_action(db, actor_id=admin.id, action="delete_doctor", target_type="doctor", target_id=doctor.id, details={"email": doctor.email})
    db.delete(doctor)
    db.commit()   # <- log ET suppression valides ensemble, ou aucun des deux
    return {"message": "Medecin supprime"}

@app.delete("/admin/patients/{patient_id}")
def delete_patient(patient_id: UUID, admin: models.Doctor = Depends(get_current_superadmin), db: Session = Depends(get_db)):
    """Supprime un compte patient (superadmin uniquement)."""
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient introuvable")
    
    log_action(db, actor_id=admin.id, action="delete_patient", target_type="patient", target_id=patient.id, details={"email": patient.email})
    db.delete(patient)
    db.commit()
    return {"message": "Patient deleted"}

@app.get("/admin/doctors", response_model=list[schemas.DoctorOut])
def list_doctors(admin: models.Doctor = Depends(get_current_superadmin), db: Session = Depends(get_db)):
    """Liste tous les médecins (superadmin uniquement)."""
    log_action(db, actor_id=admin.id, action="list_doctors")
    return db.query(models.Doctor).all()

@app.get("/admin/patients", response_model=list[schemas.PatientOut])
def list_patients(admin: models.Doctor = Depends(get_current_superadmin),db: Session = Depends(get_db)):
    """Liste tous les patients (superadmin uniquement)."""
    log_action(db, actor_id=admin.id, action="list_patients")
    return db.query(models.Patient).all()