# storage.py
import uuid
import json
from datetime import datetime
from sqlalchemy.orm import Session as DBSession
from voiceplatform_shared.db_models import Session, Patient
from voiceplatform_shared.crypto import generate_data_key, wrap_key, encrypt_bytes
from voiceplatform_shared.minio_client import get_minio_client

def create_session(db: DBSession, patient_id: uuid.UUID, audio_bytes: bytes):
    """
    Create a new session record in the database and encrypt the audio data.
    
    Args:
        db: Database session
        patient_id: UUID of the patient
        audio_bytes: Raw audio bytes to encrypt
    
    Returns:
        tuple: (session_record, encrypted_audio_bytes)
    """
    # Generate encryption key
    data_key = generate_data_key()
    wrapped_key = wrap_key(data_key)
    
    # Encrypt the audio
    encrypted_audio = encrypt_bytes(data_key, audio_bytes)
    
    # Create session record
    session = Session(
        id=uuid.uuid4(),
        patient_id=patient_id,
        created_at=datetime.utcnow(),
        status="pending",
        wrapped_data_key=wrapped_key,
        metadata=json.dumps({
            "uploaded_at": datetime.utcnow().isoformat(),
            "status": "uploaded"
        })
    )
    
    db.add(session)
    db.commit()
    db.refresh(session)
    
    return session, encrypted_audio

def get_session(db: DBSession, session_id: uuid.UUID):
    """
    Get a session by ID.
    
    Args:
        db: Database session
        session_id: UUID of the session
    
    Returns:
        Session record or None
    """
    return db.query(Session).filter(Session.id == session_id).first()

def update_session_status(db: DBSession, session_id: uuid.UUID, status: str, error: str = None):
    """
    Update the status of a session.
    
    Args:
        db: Database session
        session_id: UUID of the session
        status: New status (pending, processing, completed, failed)
        error: Optional error message
    """
    session = get_session(db, session_id)
    if session:
        session.status = status
        if error:
            # Update metadata with error
            metadata = json.loads(session.metadata or "{}")
            metadata["error"] = error
            metadata["failed_at"] = datetime.utcnow().isoformat()
            session.metadata = json.dumps(metadata)
        else:
            # Update metadata with status
            metadata = json.loads(session.metadata or "{}")
            metadata["updated_at"] = datetime.utcnow().isoformat()
            metadata["status"] = status
            session.metadata = json.dumps(metadata)
        
        db.commit()

def get_patient_sessions(db: DBSession, patient_id: uuid.UUID, limit: int = 10):
    """
    Get all sessions for a patient.
    
    Args:
        db: Database session
        patient_id: UUID of the patient
        limit: Maximum number of sessions to return
    
    Returns:
        List of Session records
    """
    return (
        db.query(Session)
        .filter(Session.patient_id == patient_id)
        .order_by(Session.created_at.desc())
        .limit(limit)
        .all()
    )

def delete_session(db: DBSession, session_id: uuid.UUID):
    """
    Delete a session and its associated audio file from MinIO.
    
    Args:
        db: Database session
        session_id: UUID of the session
    
    Returns:
        bool: True if deleted, False if not found
    """
    session = get_session(db, session_id)
    if not session:
        return False
    
    # Delete audio from MinIO
    if session.raw_audio_path:
        try:
            minio = get_minio_client()
            minio.remove_object("raw-audio", session.raw_audio_path)
        except Exception as e:
            print(f"Error deleting audio from MinIO: {e}")
    
    # Delete session from database
    db.delete(session)
    db.commit()
    
    return True

def get_session_status(db: DBSession, session_id: uuid.UUID):
    """
    Get the status of a session.
    
    Args:
        db: Database session
        session_id: UUID of the session
    
    Returns:
        dict: Session status info
    """
    session = get_session(db, session_id)
    if not session:
        return None
    
    metadata = json.loads(session.metadata or "{}")
    
    return {
        "session_id": str(session.id),
        "patient_id": str(session.patient_id),
        "status": session.status,
        "created_at": session.created_at.isoformat(),
        "metadata": metadata,
        "has_audio": session.raw_audio_path is not None
    }

def get_patient_by_id(db: DBSession, patient_id: uuid.UUID, doctor_id: uuid.UUID):
    """
    Get a patient by ID and verify doctor ownership.
    
    Args:
        db: Database session
        patient_id: UUID of the patient
        doctor_id: UUID of the doctor
    
    Returns:
        Patient record or None
    """
    return (
        db.query(Patient)
        .filter(Patient.id == patient_id, Patient.doctor_id == doctor_id)
        .first()
    )