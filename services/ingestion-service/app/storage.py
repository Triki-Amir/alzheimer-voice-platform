import uuid
import json
from datetime import datetime
from sqlalchemy.orm import Session as DBSession
from voiceplatform_shared.db_models import Session, Patient
from voiceplatform_shared.crypto import generate_data_key, wrap_key, encrypt_bytes
from voiceplatform_shared.minio_client import get_minio_client


def create_session(db: DBSession, patient_id, audio_bytes: bytes) -> tuple[Session, bytes]:
    # Generated up front (instead of relying on the DB default) so it can be
    # used as AAD: binds the wrapped key and the ciphertext to *this* session
    # row, so neither can be silently swapped onto a different session.
    session_id = uuid.uuid4()
    aad = str(session_id).encode("ascii")

    data_key = generate_data_key()
    wrapped = wrap_key(data_key, aad=aad)
    encrypted_audio = encrypt_bytes(data_key, audio_bytes, aad=aad)

    session = Session(
        id=session_id,
        patient_id=patient_id,
        wrapped_data_key=wrapped,
        status="pending",  # ✅ Ajout du statut
        created_at=datetime.utcnow(),  # ✅ Ajout de la date
        metadata=json.dumps({  # ✅ Ajout des métadonnées
            "uploaded_at": datetime.utcnow().isoformat(),
            "status": "uploaded"
        })
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    # NOTE: caller is responsible for uploading `encrypted_audio` to MinIO
    # (e.g. under raw_audio_path) — not done here, this function only
    # creates the DB row and returns the ciphertext.
    return session, encrypted_audio


# ===================== FONCTIONS MANQUANTES À AJOUTER =====================

def get_session(db: DBSession, session_id: uuid.UUID):
    """Get a session by ID."""
    return db.query(Session).filter(Session.id == session_id).first()


def get_session_status(db: DBSession, session_id: uuid.UUID):
    """Get the status of a session with formatted response."""
    session = get_session(db, session_id)
    if not session:
        return None
    
    # ✅ Parse metadata if it exists
    metadata = {}
    if session.metadata:
        try:
            metadata = json.loads(session.metadata)
        except:
            metadata = {"raw": session.metadata}
    
    return {
        "session_id": str(session.id),
        "patient_id": str(session.patient_id),
        "status": session.status if hasattr(session, 'status') else "pending",
        "created_at": session.created_at.isoformat() if session.created_at else datetime.utcnow().isoformat(),
        "metadata": metadata,
        "has_audio": session.raw_audio_path is not None if hasattr(session, 'raw_audio_path') else False
    }


def get_patient_by_id(db: DBSession, patient_id: uuid.UUID, doctor_id: uuid.UUID):
    """Get a patient by ID and verify doctor ownership."""
    return db.query(Patient).filter(
        Patient.id == patient_id,
        Patient.doctor_id == doctor_id
    ).first()


def get_patient_sessions(db: DBSession, patient_id: uuid.UUID, limit: int = 10):
    """Get all sessions for a patient, ordered by creation date."""
    return db.query(Session).filter(
        Session.patient_id == patient_id
    ).order_by(Session.created_at.desc()).limit(limit).all()


def delete_session(db: DBSession, session_id: uuid.UUID):
    """Delete a session and its audio file from MinIO."""
    session = get_session(db, session_id)
    if not session:
        return False
    
    # Delete audio from MinIO if it exists
    if hasattr(session, 'raw_audio_path') and session.raw_audio_path:
        try:
            minio = get_minio_client()
            minio.remove_object("raw-audio", session.raw_audio_path)
        except Exception as e:
            print(f"Error deleting audio from MinIO: {e}")
    
    db.delete(session)
    db.commit()
    return True


def update_session_status(db: DBSession, session_id: uuid.UUID, status: str, error: str = None):
    """Update the status of a session."""
    session = get_session(db, session_id)
    if not session:
        return False
    
    session.status = status
    
    # Update metadata with status change
    metadata = {}
    if session.metadata:
        try:
            metadata = json.loads(session.metadata)
        except:
            pass
    
    metadata["updated_at"] = datetime.utcnow().isoformat()
    metadata["status"] = status
    
    if error:
        metadata["error"] = error
        metadata["failed_at"] = datetime.utcnow().isoformat()
    
    session.metadata = json.dumps(metadata)
    
    db.commit()
    return True