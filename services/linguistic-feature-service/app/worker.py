# linguistic-feature-service/app/worker.py
import os
import json
import asyncio
import logging
import psycopg2
from voiceplatform_shared.celery_app import make_celery_app
from app.features import LinguisticFeatureExtractor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("linguistic_worker")

app = make_celery_app("linguistic_extraction_service", "linguistic_extraction")

VLLM_BASE_URL = os.getenv("VLLM_BASE_URL", "http://localhost:8000/v1")
VLLM_MODEL_NAME = os.getenv("VLLM_MODEL_NAME", "Qwen/Qwen2.5-32B-Instruct-AWQ")

POSTGRES_DB = os.getenv("POSTGRES_DB", "voiceapp_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "voiceapp")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "voiceapp123")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")

extractor = LinguisticFeatureExtractor(vllm_base_url=VLLM_BASE_URL, model_name=VLLM_MODEL_NAME)


def save_linguistic_features_and_update_session(session_id: str, payload: dict):
    conn = psycopg2.connect(
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        host=POSTGRES_HOST,
        port=POSTGRES_PORT
    )
    
    with conn.cursor() as cur:
        # Upsert into session_features
        upsert_query = """
        INSERT INTO session_features (session_id, feature_type, payload, created_at)
        VALUES (%s::uuid, %s, %s::jsonb, NOW())
        ON CONFLICT (session_id, feature_type) 
        DO UPDATE SET 
            payload = EXCLUDED.payload, 
            created_at = NOW();
        """
        cur.execute(
            upsert_query, 
            (session_id, "linguistic", json.dumps(payload, ensure_ascii=False))
        )

        # Update sessions table tracking state
        session_query = """
        UPDATE sessions
        SET status = 'LINGUISTIC_ANALYZED',
            updated_at = NOW()
        WHERE id = %s::uuid;
        """
        cur.execute(session_query, (session_id,))

        conn.commit()
    conn.close()


@app.task(name="linguistic_extraction_service.process", bind=True, max_retries=3)
def process(self, message: dict):
    session_id = message["session_id"]
    transcription = message["transcription"]
    
    logger.info("🧠 [START] Linguistic Feature Extraction | Session: %s", session_id)

    try:
        # Extract features asynchronously via vLLM Qwen2.5
        payload = asyncio.run(extractor.extract_linguistic_features(raw_text=transcription))
        
        # Persist to session_features and update sessions table status
        save_linguistic_features_and_update_session(session_id=session_id, payload=payload)
        
        logger.info("✅ [SUCCESS] Stored linguistic features and updated session state | Session: %s", session_id)
        
        return {
            "status": "SUCCESS", 
            "session_id": session_id, 
            "feature_type": "linguistic"
        }

    except Exception as exc:
        logger.error("❌ [FAILED] Extraction or DB write failed | Session: %s | Error: %s", session_id, str(exc))
        raise self.retry(exc=exc, countdown=5)