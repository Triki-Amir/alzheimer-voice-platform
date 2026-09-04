# linguistic-feature-service/app/worker.py
import os
import json
import asyncio
import logging
import psycopg2
import tempfile
from voiceplatform_shared.minio_client import get_minio_client
from voiceplatform_shared.celery_app import make_celery_app
from voiceplatform_shared.constants import Queues
from app.features import LinguisticFeatureExtractor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("linguistic_worker")

app = make_celery_app("linguistic_extraction_service", "linguistic_extraction")

FEATURE_ENGINEERING_QUEUE = getattr(Queues, "FEATURE_ENGINEERING", "feature_engineering")

POS_MODEL_PATH = os.getenv("POS_MODEL_PATH", "/models/xlmr-tunisian-pos-final")

POSTGRES_DB = os.getenv("POSTGRES_DB", "voiceapp_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "voiceapp")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "voiceapp123")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")

extractor = LinguisticFeatureExtractor(pos_model_path=POS_MODEL_PATH)

def save_linguistic_features_and_update_session(session_id: str, payload: dict) -> str:
    """
    Writes the full linguistic payload to MinIO (same bucket/pattern as
    preprocessing_metrics.json) instead of Postgres jsonb -- easier to pull
    down directly (mc cp / fget_object) than querying and unwrapping a
    jsonb column. Still updates session status in Postgres so the rest of
    the app can track pipeline progress. Returns the MinIO object name.
    """
    minio = get_minio_client()
    with tempfile.TemporaryDirectory() as tmp:
        local_path = os.path.join(tmp, "linguistic_features.json")
        with open(local_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False, default=str)
 
        object_name = f"{session_id}/linguistic_features.json"
        minio.fput_object("patient-audio", object_name, local_path)
 
    conn = psycopg2.connect(
        dbname=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD,
        host=POSTGRES_HOST, port=POSTGRES_PORT
    )
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE sessions SET status = 'LINGUISTIC_ANALYZED', updated_at = NOW() WHERE id = %s::uuid;",
            (session_id,),
        )
        conn.commit()
    conn.close()
 
    return object_name
 
 
@app.task(name="linguistic_extraction_service.process", bind=True, max_retries=3)
def process(self, message: dict):
    session_id = message["session_id"]
    patient_id = message.get("patient_id", "unknown")
    words = message.get("words", [])
    metadata = message.get("metadata", {})
    boundaries = metadata.get("sentence_boundaries", [])

    logger.info(
        "🧠 [START] Linguistic Feature Extraction | Session: %s | %d words, %d boundaries",
        session_id, len(words), len(boundaries),
    )

    try:
        payload = asyncio.run(
            extractor.extract_linguistic_features_from_audio(
                words=words,
                boundaries=boundaries,
            )
        )

        object_name = save_linguistic_features_and_update_session(session_id=session_id, payload=payload)

        # Updated success log to surface new metrics
        ct_score = payload.get("cookie_theft", {}).get("ct_content_score", 0.0)
        total_words = payload.get("general_linguistics", {}).get("total_words", 0)

        logger.info(
            "✅ [SUCCESS] Stored linguistic features to MinIO (%s) | Session: %s | aligned=%s, words=%d, CT_score=%.4f",
            object_name, session_id, payload.get("aligned"), total_words, ct_score,
        )

        # Notify feature-engineering service
        app.send_task(
            "feature_engineering_service.process",
            kwargs={
                "message": {
                    "session_id": session_id,
                    "patient_id": patient_id,
                }
            },
            queue=FEATURE_ENGINEERING_QUEUE,
        )

        # Extended return payload for task status monitoring
        return {
            "status": "SUCCESS",
            "session_id": session_id,
            "feature_type": "linguistic",
            "linguistic_features_path": object_name,
            "aligned": payload.get("aligned"),
            "significant_pause_count": payload.get("significant_pause_count", 0),
            "cookie_theft_score": ct_score,
            "total_words": total_words,
        }

    except Exception as exc:
        logger.error("❌ [FAILED] Extraction or storage failed | Session: %s | Error: %s", session_id, str(exc))
        raise self.retry(exc=exc, countdown=5)