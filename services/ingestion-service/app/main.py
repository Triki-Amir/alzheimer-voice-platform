# main.py
import io
import uuid
from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException
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


@app.post("/sessions/upload", status_code=202)
async def upload_session_audio(
    patient_id: uuid.UUID = Form(...),
    audio: UploadFile = File(...),
    doctor: dict = Depends(get_current_doctor),
    db: DBSession = Depends(get_db),
):
    # --- 2. Authorization: doctor must own this patient ---
    patient = (
        db.query(Patient)
        .filter(Patient.id == patient_id, Patient.doctor_id == doctor["sub"])
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient introuvable")

    # --- 3. Validate the audio file ---
    try:
        validated = await validate_audio_upload(audio)
    except AudioValidationError as exc:
        raise exc.to_http_exception()

    try:
        # --- 4. Encrypt + create the Session DB row ---
        audio_bytes = validated.tmp_path.read_bytes()
        session, encrypted_audio = storage.create_session(db, patient_id, audio_bytes)

        # --- 5. Upload the encrypted bytes to MinIO ---
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

        # --- 6. Publish to the pipeline ---
        publish_session_message(
            Queues.PREPROCESSING,
            {
                "session_id": str(session.id),
                "patient_id": str(patient_id),
                "raw_audio_path": object_name,
                "wrapped_data_key": session.wrapped_data_key,
            },
        )
    finally:
        # --- 7. Always clean up the temp file ---
        validated.tmp_path.unlink(missing_ok=True)

    return {"session_id": str(session.id), "status": "queued"}