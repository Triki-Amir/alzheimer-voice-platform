# main.py
import io
import uuid
import os
from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session as DBSession

from voiceplatform_shared.audio_upload_validation import validate_audio_upload, AudioValidationError
from voiceplatform_shared.minio_client import get_minio_client
from voiceplatform_shared.publisher import publish_session_message
from voiceplatform_shared.constants import Queues
from voiceplatform_shared.db_models import Patient

from .auth_client import get_current_doctor
from .database import get_db
from . import storage

app = FastAPI(title="Ingestion Service")

# ===================== CORS =====================
# Allow requests from the frontend
_allowed_origins = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,https://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "PUT", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
)

# ===================== Health Check Endpoints =====================

@app.get("/health")
def health_check():
    """Health check endpoint for the service."""
    return {"status": "healthy", "service": "ingestion-service"}

@app.get("/ready")
def readiness_check():
    """Readiness check endpoint."""
    return {"status": "ready"}

@app.get("/live")
def liveness_check():
    """Liveness check endpoint."""
    return {"status": "alive"}

# ===================== Session Endpoints =====================

@app.post("/sessions/upload", status_code=202)
async def upload_session_audio(
    patient_id: uuid.UUID = Form(...),
    audio: UploadFile = File(...),
    doctor: dict = Depends(get_current_doctor),
    db: DBSession = Depends(get_db),
):
    """
    Upload audio for a patient session.
    
    - **patient_id**: UUID of the patient
    - **audio**: Audio file (webm/opus format)
    
    Returns session_id and status.
    """
    # --- 1. Authorization: doctor must own this patient ---
    patient = (
        db.query(Patient)
        .filter(Patient.id == patient_id, Patient.doctor_id == doctor["sub"])
        .first()
    )
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Patient introuvable ou non autorisé"
        )

    # --- 2. Validate the audio file ---
    try:
        validated = await validate_audio_upload(audio)
    except AudioValidationError as exc:
        raise exc.to_http_exception()

    try:
        # --- 3. Encrypt + create the Session DB row ---
        audio_bytes = validated.tmp_path.read_bytes()
        session, encrypted_audio = storage.create_session(db, patient_id, audio_bytes)

        # --- 4. Upload the encrypted bytes to MinIO ---
        object_name = f"{session.id}/raw.enc"
        minio = get_minio_client()
        minio.put_object(
            "raw-audio",
            object_name,
            io.BytesIO(encrypted_audio),
            length=len(encrypted_audio),
        )

        session.raw_audio_path = object_name
        db.commit()

        # --- 5. Publish to the pipeline ---
        publish_session_message(
            Queues.PREPROCESSING,
            {
                "session_id": str(session.id),
                "patient_id": str(patient_id),
                "raw_audio_path": object_name,
                "wrapped_data_key": session.wrapped_data_key,
            },
        )
        
        return {"session_id": str(session.id), "status": "queued"}
        
    finally:
        # --- 6. Always clean up the temp file ---
        validated.tmp_path.unlink(missing_ok=True)


@app.get("/sessions/{session_id}/status")
def get_session_status(
    session_id: uuid.UUID,
    doctor: dict = Depends(get_current_doctor),
    db: DBSession = Depends(get_db),
):
    """
    Get the status of a session.
    
    - **session_id**: UUID of the session
    
    Returns session details including status, patient_id, and metadata.
    """
    session = storage.get_session(db, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Session not found"
        )
    
    # Verify doctor owns this patient
    patient = storage.get_patient_by_id(db, session.patient_id, doctor["sub"])
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Patient not found or unauthorized"
        )
    
    return storage.get_session_status(db, session_id)


@app.get("/patients/{patient_id}/sessions")
def get_patient_sessions(
    patient_id: uuid.UUID,
    doctor: dict = Depends(get_current_doctor),
    db: DBSession = Depends(get_db),
    limit: int = 10,
):
    """
    Get all sessions for a patient.
    
    - **patient_id**: UUID of the patient
    - **limit**: Maximum number of sessions to return (default: 10)
    
    Returns list of sessions with status and metadata.
    """
    # Verify doctor owns this patient
    patient = storage.get_patient_by_id(db, patient_id, doctor["sub"])
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Patient not found or unauthorized"
        )
    
    sessions = storage.get_patient_sessions(db, patient_id, limit)
    
    return [
        {
            "session_id": str(s.id),
            "patient_id": str(s.patient_id),
            "status": s.status,
            "created_at": s.created_at.isoformat(),
            "has_audio": s.raw_audio_path is not None,
            "metadata": s.metadata
        }
        for s in sessions
    ]


@app.delete("/sessions/{session_id}")
def delete_session(
    session_id: uuid.UUID,
    doctor: dict = Depends(get_current_doctor),
    db: DBSession = Depends(get_db),
):
    """
    Delete a session and its audio.
    
    - **session_id**: UUID of the session to delete
    """
    session = storage.get_session(db, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Session not found"
        )
    
    # Verify doctor owns this patient
    patient = storage.get_patient_by_id(db, session.patient_id, doctor["sub"])
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Patient not found or unauthorized"
        )
    
    deleted = storage.delete_session(db, session_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Session not found"
        )
    
    return {"message": "Session deleted successfully"}


# =============================================================================
# Exception Handlers
# =============================================================================

@app.exception_handler(AudioValidationError)
async def audio_validation_exception_handler(request, exc: AudioValidationError):
    """Handle audio validation errors."""
    return exc.to_http_exception()