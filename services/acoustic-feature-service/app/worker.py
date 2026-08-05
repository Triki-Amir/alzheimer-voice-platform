import os
import json
import tempfile
import psycopg2
from minio import Minio
from voiceplatform_shared.celery_app import make_celery_app
from features import AcousticFeatureExtractor

app = make_celery_app("acoustic_extraction_service", "acoustic_extraction")

MINIO_HOST = os.getenv("MINIO_HOST", "minio")
MINIO_PORT = os.getenv("MINIO_PORT", "9000")
MINIO_USER = os.getenv("MINIO_ROOT_USER", "voiceapp")
MINIO_PASS = os.getenv("MINIO_ROOT_PASSWORD", "voiceapp123")

POSTGRES_DB = os.getenv("POSTGRES_DB", "voiceapp_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "voiceapp")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "voiceapp123")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")

minio_client = Minio(
    f"{MINIO_HOST}:{MINIO_PORT}",
    access_key=MINIO_USER,
    secret_key=MINIO_PASS,
    secure=False
)

extractor = AcousticFeatureExtractor()

def save_to_db(session_id: str, feature_type: str, payload: dict):
    conn = psycopg2.connect(
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        host=POSTGRES_HOST,
        port=POSTGRES_PORT
    )
    cursor = conn.cursor()
    query = """
    INSERT INTO session_features (session_id, feature_type, payload)
    VALUES (%s, %s, %s)
    ON CONFLICT (session_id, feature_type) 
    DO UPDATE SET payload = EXCLUDED.payload, created_at = now();
    """
    cursor.execute(query, (session_id, feature_type, json.dumps(payload)))
    conn.commit()
    cursor.close()
    conn.close()

@app.task(name="acoustic_extraction_service.process", bind=True, max_retries=3)
def process(self, message: dict):
    session_id = message["session_id"]
    patient_audio_path = message["patient_audio_path"]
    metadata = message.get("metadata", {})
    pause_metrics = metadata.get("preprocessing_metrics", {}).get("pause_metrics", {})

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
        local_wav = tmp_file.name

    try:
        minio_client.fget_object("patient-audio", patient_audio_path, local_wav)
        payload = extractor.extract_from_file(local_wav, pause_metrics=pause_metrics)
        save_to_db(session_id=session_id, feature_type="acoustic", payload=payload)
        return {"status": "SUCCESS", "session_id": session_id, "feature_type": "acoustic"}

    except Exception as exc:
        raise self.retry(exc=exc, countdown=5)
    finally:
        if os.path.exists(local_wav):
            os.remove(local_wav)