import os
import uuid
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
RABBITMQ_PORT = int(os.getenv("RABBITMQ_PORT", "5672"))
RABBITMQ_USER = os.getenv("RABBITMQ_DEFAULT_USER", "voiceapp")
RABBITMQ_PASS = os.getenv("RABBITMQ_DEFAULT_PASS", "voiceapp123")

DOCTOR_ID = "22222222-2222-2222-2222-222222222222"  # Ensure this matches the doctor enrolled in the database
PATIENT_ID = str(uuid.uuid4())
SESSION_ID = f"test-session-{uuid.uuid4().hex[:6]}"

# Matches the exact object name shown in your MinIO raw-audio bucket
RAW_AUDIO_KEY = "patient2.1_sample.WAV" 

def main():
    print(f"🚀 Initializing test run for Session ID: {SESSION_ID}")

    # 1. Ensure Patient exists in DB so foreign keys don't fail
    conn = psycopg2.connect(
        host=POSTGRES_HOST, port=POSTGRES_PORT,
        dbname=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD
    )
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO patients (id, first_name, last_name) VALUES (%s, 'Test', 'Patient') ON CONFLICT DO NOTHING;",
            (PATIENT_ID,)
        )
        conn.commit()
    conn.close()
    print(f"👤 Patient linked in database: {PATIENT_ID}")

    # 2. Connect to Celery / RabbitMQ
    broker_url = f"pyamqp://{RABBITMQ_USER}:{RABBITMQ_PASS}@{RABBITMQ_HOST}:{RABBITMQ_PORT}//"
    app = Celery("test_publisher", broker=broker_url)

    # Payload referencing the already-uploaded MinIO key
    payload = {
        "session_id": SESSION_ID,
        "raw_audio_path": RAW_AUDIO_KEY,
        "metadata": {
            "doctor_id": DOCTOR_ID,
            "patient_id": PATIENT_ID
        }
    }

    # 3. Publish task to preprocessing queue
    result = app.send_task(
        "preprocessing_service.process",
        kwargs={"message": payload},
        queue="preprocessing"
    )

    print(f"📡 Task successfully dispatched! Task ID: {result.id}")
    print(f"📄 Audio target: raw-audio/{RAW_AUDIO_KEY}")

if __name__ == "__main__":
    main()