import os
import logging
import tempfile
import time
import psycopg2

from voiceplatform_shared.celery_app import make_celery_app
from voiceplatform_shared.constants import Queues
from voiceplatform_shared.minio_client import get_minio_client

# Module d'inférence GPU FarukSTT
from .transcribe import transcribe_audio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("stt_worker")

STT_QUEUE = getattr(Queues, "STT_TRANSCRIPTION", "stt_transcription")
LINGUISTIC_QUEUE = getattr(Queues, "LINGUISTIC_EXTRACTION", "linguistic_extraction")
app = make_celery_app("stt_service", STT_QUEUE)

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("POSTGRES_DB", "voiceapp_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "voiceapp")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "voiceapp123")


def update_patient_transcription(patient_id: str, text: str):
    conn = psycopg2.connect(
        host=POSTGRES_HOST, port=POSTGRES_PORT,
        dbname=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD
    )
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE patients SET transcription_text = %s WHERE id = %s;",
            (text, patient_id)
        )
        conn.commit()
    conn.close()


@app.task(name="stt_service.process", bind=True, max_retries=3)
def process(self, message: dict):
    t0 = time.perf_counter()
    minio = get_minio_client()
    
    session_id = message.get("session_id", "unknown")
    patient_id = message.get("patient_id", "unknown")
    metadata = message.get("metadata", {})

    logger.info("🎙️ [START] STT Transcription | Session: %s | Patient: %s", session_id, patient_id)

    try:
        patient_audio_path = (
            metadata.get("patient_audio_path") 
            or message.get("patient_audio_path") 
            or f"{session_id}/patient.wav"
        )

        with tempfile.TemporaryDirectory() as tmp:
            local_wav = os.path.join(tmp, "patient.wav")

            # 1. Download from MinIO
            t_sub = time.perf_counter()
            minio.fget_object("patient-audio", patient_audio_path, local_wav)
            logger.info("  ├─ 📥 [MinIO] Downloaded audio in %.2fs", time.perf_counter() - t_sub)

            # 2. GPU Inference
            t_sub = time.perf_counter()
            result = transcribe_audio(local_wav)
            transcription_text = result.get("text", "")
            gpu_inference_time = time.perf_counter() - t_sub
            logger.info("  ├─ ⚡ [GPU STT] Transcribed audio in %.2fs", gpu_inference_time)

            # 3. PostgreSQL Update
            t_sub = time.perf_counter()
            update_patient_transcription(patient_id, transcription_text)
            logger.info("  ├─ 💾 [Postgres] Saved transcription in %.2fs", time.perf_counter() - t_sub)

        # 4. Trigger Downstream Linguistic Feature Extraction Task
        if transcription_text.strip():
            logger.info("  ├─ 🚀 [Celery] Dispatching task to linguistic_extraction queue...")
            app.send_task(
                "linguistic_extraction_service.process",
                kwargs={
                    "message": {
                        "session_id": session_id,
                        "patient_id": patient_id,
                        "transcription": transcription_text
                    }
                },
                queue=LINGUISTIC_QUEUE
            )
        else:
            logger.warning("  ├─ ⚠️ Empty transcription text. Skipping linguistic extraction.")

        total_duration = time.perf_counter() - t0
        logger.info("✅ [SUCCESS] STT finished in %.2fs (GPU Core: %.2fs) | Session: %s", 
                    total_duration, gpu_inference_time, session_id)

        return {
            "status": "SUCCESS",
            "execution_time_sec": round(total_duration, 2),
            "gpu_inference_sec": round(gpu_inference_time, 2),
            "session_id": session_id,
            "transcription": transcription_text
        }

    except Exception as exc:
        total_duration = time.perf_counter() - t0
        logger.error("❌ [FAILED] STT failed after %.2fs | Session: %s | Error: %s", 
                     total_duration, session_id, str(exc))
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)