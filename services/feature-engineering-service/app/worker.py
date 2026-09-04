import io
import json
import logging
import os
import time

import psycopg2
from celery.exceptions import Retry
from minio.error import S3Error

from voiceplatform_shared.celery_app import make_celery_app
from voiceplatform_shared.constants import Queues
from voiceplatform_shared.minio_client import get_minio_client

from .derive_linguistic import structure_linguistic_features

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("feature_engineering_worker")

FEATURE_ENGINEERING_QUEUE = getattr(Queues, "FEATURE_ENGINEERING", "feature_engineering")
app = make_celery_app("feature_engineering_service", FEATURE_ENGINEERING_QUEUE)

PATIENT_AUDIO_BUCKET = os.getenv("PATIENT_AUDIO_BUCKET", "patient-audio")
ACOUSTIC_FILENAME = "acoustic_features.json"
LINGUISTIC_FILENAME = "linguistic_features.json"
OUTPUT_PREFIX = os.getenv("FEATURES_OUTPUT_PREFIX", "features")

POSTGRES_DB = os.getenv("POSTGRES_DB", "voiceapp_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "voiceapp")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "voiceapp123")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")

FANIN_MAX_RETRIES = 15
FANIN_RETRY_COUNTDOWN = 10


def _download_json(minio, object_name: str) -> dict:
    response = None
    try:
        response = minio.get_object(PATIENT_AUDIO_BUCKET, object_name)
        return json.loads(response.read())
    except S3Error as e:
        if e.code == "NoSuchKey":
            raise FileNotFoundError(object_name) from e
        raise
    finally:
        if response is not None:
            response.close()
            response.release_conn()


def _build_json(patient_id: str, session_id: str, acoustic: dict, linguistic: dict) -> dict:
    """
    Structures existing acoustic and linguistic features into an inference-ready JSON payload.
    """
    structured_linguistic = structure_linguistic_features(linguistic)

    return {
        "metadata": {
            "patient_id": patient_id,
            "session_id": session_id,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        "features": {
            "acoustic": acoustic,
            "linguistic": structured_linguistic,
        },
    }


def _update_session_status(session_id: str):
    """Updates database session status upon successful feature aggregation."""
    conn = psycopg2.connect(
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
    )
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE sessions SET status = 'FEATURES_ENGINEERED', updated_at = NOW() WHERE id = %s::uuid;",
            (session_id,),
        )
        conn.commit()
    conn.close()


@app.task(name="feature_engineering_service.process", bind=True, max_retries=FANIN_MAX_RETRIES)
def process(self, message: dict):
    t0 = time.perf_counter()
    minio = get_minio_client()

    session_id = message.get("session_id", "unknown")
    patient_id = message.get("patient_id", "unknown")

    logger.info("🧩 [START] Feature Structuring | Session: %s | Patient: %s", session_id, patient_id)

    acoustic_object = f"{session_id}/{ACOUSTIC_FILENAME}"
    linguistic_object = f"{session_id}/{LINGUISTIC_FILENAME}"

    try:
        try:
            acoustic = _download_json(minio, acoustic_object)
            linguistic = _download_json(minio, linguistic_object)
        except FileNotFoundError as missing:
            logger.info(
                "  ├─ ⏳ [Wait] %s not in MinIO yet -- retry %d/%d in %ds | Session: %s",
                missing,
                self.request.retries + 1,
                FANIN_MAX_RETRIES,
                FANIN_RETRY_COUNTDOWN,
                session_id,
            )
            raise self.retry(exc=missing, countdown=FANIN_RETRY_COUNTDOWN)

        logger.info(
            "  ├─ 📥 [MinIO] Loaded acoustic and linguistic payloads",
        )

        # Structure features directly and serialize to JSON
        combined_features = _build_json(patient_id, session_id, acoustic, linguistic)
        json_bytes = json.dumps(combined_features, indent=2, ensure_ascii=False).encode("utf-8")

        output_object = f"{OUTPUT_PREFIX}/features_{session_id}.json"
        minio.put_object(
            PATIENT_AUDIO_BUCKET,
            output_object,
            data=io.BytesIO(json_bytes),
            length=len(json_bytes),
            content_type="application/json",
        )

        # Update DB session status
        _update_session_status(session_id)

        total_duration = time.perf_counter() - t0
        logger.info(
            "✅ [SUCCESS] Structured Feature JSON written to %s/%s in %.2fs | Session: %s",
            PATIENT_AUDIO_BUCKET,
            output_object,
            total_duration,
            session_id,
        )

        return {
            "status": "SUCCESS",
            "execution_time_sec": round(total_duration, 2),
            "session_id": session_id,
            "patient_id": patient_id,
            "output_path": output_object,
        }

    except Retry:
        raise

    except Exception as exc:
        total_duration = time.perf_counter() - t0
        logger.error(
            "❌ [FAILED] Feature structuring failed after %.2fs | Session: %s | Error: %s",
            total_duration,
            session_id,
            str(exc),
        )
        raise