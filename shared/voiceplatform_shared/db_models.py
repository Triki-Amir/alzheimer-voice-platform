"""
Modèles SQLAlchemy (ORM) partagés entre les services.

Contrairement à `models.py` (schémas Pydantic pour les messages RabbitMQ),
ce module définit les classes mappées aux tables Postgres existantes :

- Doctor  -> table `users`    (seuls les médecins/cliniciens ont un compte)
- Patient -> table `patients` (fiche patient, pas de compte / pas de login)

Les tables sont créées par `infra/postgres/init.sql`. Ce module ne fait que
mapper dessus (pas de `Base.metadata.create_all` en prod - la source de
vérité du schéma reste le SQL).
"""
from sqlalchemy.dialects.postgresql import JSON
import uuid
from sqlalchemy import Float
from sqlalchemy.dialects.postgresql import ARRAY
from enum import Enum
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class DoctorRole(str, Enum):
    CLINICIAN = "clinician"
    SUPERADMIN = "superadmin"
    # add new ranks here later — one line, no migration
    # SENIOR_CLINICIAN = "senior_clinician"
    # DEPARTMENT_HEAD = "department_head"

class Doctor(Base):
    """Un médecin/clinicien = la seule entité qui se connecte à l'application.

    Mappée sur la table `users` déjà présente dans init.sql (role
    par défaut 'clinician'). On y ajoute les champs nécessaires à la 2FA.
    """

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(Text, nullable=False)
    role = Column(String, default="clinician", nullable=False)
    name = Column(String)
    family_name = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # --- Authentification à deux facteurs (TOTP) ---
    totp_secret = Column(String, nullable=True)          # secret base32 (pyotp)
    totp_enabled = Column(Boolean, default=False, nullable=False)
    backup_codes = Column(Text, nullable=True)            # JSON: liste de hashs bcrypt

    patients = relationship("Patient", back_populates="doctor")

    def __repr__(self) -> str:
        return f"<Doctor {self.email} (2FA={'on' if self.totp_enabled else 'off'})>"

class Patient(Base):
    """Fiche patient. Pas de mot de passe : le patient ne se connecte jamais,
    seul le médecin référent (doctor_id) accède à son dossier.
    """

    __tablename__ = "patients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_ref = Column(String, nullable=True)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    date_of_birth = Column(Date, nullable=True)
    doctor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    doctor = relationship("Doctor", back_populates="patients")

    def __repr__(self) -> str:
        return f"<Patient {self.first_name} {self.last_name}>"


class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=True)
    status = Column(String, default="created",nullable=False)
    raw_audio_path = Column(String, nullable=True)
    patient_audio_path = Column(String, nullable=True)
    wrapped_data_key = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class DoctorVoiceProfile(Base):
    """Empreinte vocale du médecin (embedding, pas l'audio brut).

    Écrite par voice-extraction-service après traitement de l'échantillon
    d'enrôlement. Lue par voice-extraction-service / diarization-service
    pour identifier les segments du médecin lors d'une vraie session.
    """

    __tablename__ = "doctor_voice_profiles"

    doctor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    embedding = Column(ARRAY(Float), nullable=False)  # ex: vecteur 192-d (ECAPA-TDNN)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    doctor = relationship("Doctor")

    def __repr__(self) -> str:
        return f"<DoctorVoiceProfile doctor_id={self.doctor_id}>"

class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    action = Column(String, nullable=False)
    target_type = Column(String, nullable=True)
    target_id = Column(UUID(as_uuid=True), nullable=True)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())