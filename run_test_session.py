import os
import ssl
import time
import uuid
from pathlib import Path

import psycopg2
from celery import Celery
from dotenv import load_dotenv

load_dotenv()
env_pg_host = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_HOST = "127.0.0.1" if env_pg_host in ("postgres", "localhost") else env_pg_host
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("POSTGRES_DB", "voiceapp_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "voiceapp")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "voiceapp123")

env_rmq_host = os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_HOST = "127.0.0.1" if env_rmq_host in ("rabbitmq", "localhost") else env_rmq_host
RABBITMQ_PORT = int(os.getenv("RABBITMQ_PORT", "5672"))  # Changed from 5671 to 5672
RABBITMQ_USER = os.getenv("RABBITMQ_DEFAULT_USER", "voiceapp")
RABBITMQ_PASS = os.getenv("RABBITMQ_DEFAULT_PASS", "voiceapp123")
RABBITMQ_USE_TLS = os.getenv("RABBITMQ_USE_TLS", "false").lower() == "true"  # Set default to false for local testing


def resolve_ca_cert_path() -> str:
    env_path = os.getenv("CA_CERT_PATH")
    if env_path and Path(env_path).expanduser().exists():
        return env_path

    repo_ca_path = Path(__file__).resolve().parent / "infra" / "ca" / "ca.crt"
    if repo_ca_path.exists():
        return str(repo_ca_path)

    return "/etc/ssl/certs/voiceapp-ca.crt"


CA_CERT_PATH = resolve_ca_cert_path()

DOCTOR_ID = "120a07ec-f26c-45a9-b025-d6845444c1b3"
PATIENT_ID = str(uuid.uuid4())
SESSION_ID = str(uuid.uuid4())

RAW_AUDIO_KEY = "cookies_theft_MCI_001.MP3"


def get_db_connection():
    return psycopg2.connect(
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
    )


def setup_test_patient_and_session(patient_id: str, session_id: str):
    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO patients (id, first_name, last_name) VALUES (%s::uuid, 'Test', 'Patient') ON CONFLICT (id) DO NOTHING;",
            (patient_id,),
        )
        cur.execute(
            """
            INSERT INTO sessions (
                id, patient_id, status, raw_audio_path, patient_audio_path,
                wrapped_data_key, created_at, updated_at
            ) 
            VALUES (%s::uuid, %s::uuid, 'AUDIO_UPLOADED', %s, %s, 'dummy_test_wrapped_key_123', NOW(), NOW()) 
            ON CONFLICT (id) DO NOTHING;
            """,
            (session_id, patient_id, RAW_AUDIO_KEY, f"{session_id}/patient.wav"),
        )
        conn.commit()
    conn.close()
    print(f"👤 Patient linked in database: {patient_id}")
    print(f"📁 Session registered in database: {session_id}")


def monitor_session_status(session_id: str, timeout: int = 180):
    print(f"\n⏳ Monitoring DB status for Session ID: {session_id} ...")
    start_time = time.time()
    last_status = None

    while time.time() - start_time < timeout:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT status FROM sessions WHERE id = %s::uuid;", (session_id,))
            res = cur.fetchone()
            if res:
                current_status = res[0]
                if current_status != last_status:
                    print(f" 🔄 Status changed -> {current_status}")
                    last_status = current_status

                if current_status in ("FEATURES_ENGINEERED", "COMPLETED", "FAILED"):
                    print(f"\n🏁 Pipeline reached terminal state: {current_status}")
                    conn.close()
                    return
        conn.close()
        time.sleep(3)


def main():
    print(f"🚀 Initializing Pipeline Test Run for Session ID: {SESSION_ID}")

    setup_test_patient_and_session(PATIENT_ID, SESSION_ID)

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
            "patient_id": PATIENT_ID,
        },
    }

    result = app.send_task(
        "preprocessing_service.process",
        kwargs={"message": payload},
        queue="preprocessing",
    )

    print(f"📡 Entry task dispatched! Celery Task ID: {result.id}")
    print("\n🔍 Monitor logs using docker:")
    print("   • Preprocessing       : docker logs -f <preprocessing_container>")
    print("   • STT Service         : docker logs -f <stt_container>")
    print("   • Acoustic            : docker logs -f <acoustic_container>")
    print("   • Linguistic          : docker logs -f <linguistic_container>")
    print("   • Feature Engineering : docker logs -f <feature_engineering_container>")

    monitor_session_status(SESSION_ID)


if __name__ == "__main__":
    main()