import os
import ssl
import uuid
from pathlib import Path

import psycopg2
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

# Database & Infrastructure Credentials
POSTGRES_HOST = "localhost" if os.getenv("POSTGRES_HOST") == "postgres" else os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("POSTGRES_DB", "voiceapp_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "voiceapp")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "voiceapp123")

RABBITMQ_HOST = "localhost" if os.getenv("RABBITMQ_HOST") == "rabbitmq" else os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_PORT = int(os.getenv("RABBITMQ_PORT", "5671"))
RABBITMQ_USER = os.getenv("RABBITMQ_DEFAULT_USER", "voiceapp")
RABBITMQ_PASS = os.getenv("RABBITMQ_DEFAULT_PASS", "voiceapp123")
RABBITMQ_USE_TLS = os.getenv("RABBITMQ_USE_TLS", "true").lower() == "true"


def resolve_ca_cert_path() -> str:
    env_path = os.getenv("CA_CERT_PATH")
    if env_path and Path(env_path).expanduser().exists():
        return env_path

    repo_ca_path = Path(__file__).resolve().parent / "infra" / "ca" / "ca.crt"
    if repo_ca_path.exists():
        return str(repo_ca_path)

    return "/etc/ssl/certs/voiceapp-ca.crt"


CA_CERT_PATH = resolve_ca_cert_path()

DOCTOR_ID = "44444444-4444-4444-4444-444444444444"  # Unique UUID for the doctor
PATIENT_ID = str(uuid.uuid4())
SESSION_ID = str(uuid.uuid4())

# Matches the object name in your MinIO raw-audio bucket
RAW_AUDIO_KEY = "patient-test.wav" 


def get_db_connection():
    return psycopg2.connect(
        host=POSTGRES_HOST, 
        port=POSTGRES_PORT,
        dbname=POSTGRES_DB, 
        user=POSTGRES_USER, 
        password=POSTGRES_PASSWORD
    )


def setup_test_patient_and_session(patient_id: str, session_id: str):
    """Inserts required DB entities for foreign key consistency."""
    conn = get_db_connection()
    with conn.cursor() as cur:
        # 1. Insert patient
        cur.execute(
            "INSERT INTO patients (id, first_name, last_name) VALUES (%s::uuid, 'Test', 'Patient') ON CONFLICT (id) DO NOTHING;",
            (patient_id,)
        )
        # 2. Insert session initial state including required schema columns
        cur.execute(
            """
            INSERT INTO sessions (
                id, 
                patient_id, 
                status, 
                raw_audio_path, 
                patient_audio_path,
                wrapped_data_key, 
                created_at, 
                updated_at
            ) 
            VALUES (
                %s::uuid, 
                %s::uuid, 
                'AUDIO_UPLOADED', 
                %s, 
                %s,
                'dummy_test_wrapped_key_123', 
                NOW(), 
                NOW()
            ) 
            ON CONFLICT (id) DO NOTHING;
            """,
            (session_id, patient_id, RAW_AUDIO_KEY, f"{session_id}/patient.wav")
        )
        conn.commit()
    conn.close()
    print(f"👤 Patient linked in database: {patient_id}")
    print(f"📁 Session registered in database: {session_id}")


def main():
    print(f"🚀 Initializing E2E Test Run for Session ID: {SESSION_ID}")

    # 1. Setup DB records
    setup_test_patient_and_session(PATIENT_ID, SESSION_ID)

    # 2. Connect to Celery / RabbitMQ
    broker_url = f"pyamqp://{RABBITMQ_USER}:{RABBITMQ_PASS}@{RABBITMQ_HOST}:{RABBITMQ_PORT}//"
    app = Celery("test_publisher", broker=broker_url)
    if RABBITMQ_USE_TLS:
        app.conf.broker_use_ssl = {
            "ca_certs": CA_CERT_PATH,
            "cert_reqs": ssl.CERT_REQUIRED,
        }

    payload = {
        "session_id": SESSION_ID,
        "patient_id": PATIENT_ID,
        "raw_audio_path": RAW_AUDIO_KEY,
        "metadata": {
            "doctor_id": DOCTOR_ID,
            "patient_id": PATIENT_ID
        }
    }

    # 3. Dispatch task to entry point queue
    result = app.send_task(
        "preprocessing_service.process",
        kwargs={"message": payload},
        queue="preprocessing"
    )

    print(f"📡 Task dispatched! Celery Task ID: {result.id}")
    print("\n🔍 You can now monitor task progression across workers using docker logs:")
    print("   • Preprocessing : docker logs -f <preprocessing_container_name>")
    print("   • STT Service   : docker logs -f <stt_container_name>")
    print("   • Acoustic      : docker logs -f <acoustic_container_name>")
    print("   • Linguistic    : docker logs -f <linguistic_container_name>")


if __name__ == "__main__":
    main()