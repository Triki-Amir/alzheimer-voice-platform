import os
import json
import psycopg2
from voiceplatform_shared.celery_app import make_celery_app
from features import LinguisticFeatureExtractor

app = make_celery_app("linguistic_extraction_service", "linguistic_extraction")

VLLM_BASE_URL = os.getenv("VLLM_BASE_URL", "http://vllm-server:8000/v1")
VLLM_MODEL_NAME = os.getenv("VLLM_MODEL_NAME", "Qwen/Qwen2.5-32B-Instruct-AWQ")

POSTGRES_DB = os.getenv("POSTGRES_DB", "voiceapp_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "voiceapp")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "voiceapp123")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")

extractor = LinguisticFeatureExtractor(vllm_base_url=VLLM_BASE_URL, model_name=VLLM_MODEL_NAME)

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

@app.task(name="linguistic_extraction_service.process", bind=True, max_retries=3)
def process(self, message: dict):
    session_id = message["session_id"]
    transcription = message["transcription"]

    try:
        payload = extractor.extract_linguistic_features(raw_text=transcription)
        save_to_db(session_id=session_id, feature_type="linguistic", payload=payload)
        return {"status": "SUCCESS", "session_id": session_id, "feature_type": "linguistic"}

    except Exception as exc:
        raise self.retry(exc=exc, countdown=5)