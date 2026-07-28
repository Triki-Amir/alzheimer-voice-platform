import os
from celery import Celery

os.environ.setdefault("RABBITMQ_DEFAULT_USER", "voiceapp")
os.environ.setdefault("RABBITMQ_DEFAULT_PASS", "voiceapp123")
os.environ.setdefault("RABBITMQ_HOST", "localhost")
os.environ.setdefault("RABBITMQ_PORT", "5672")

broker_url = (
    f"pyamqp://{os.environ['RABBITMQ_DEFAULT_USER']}:"
    f"{os.environ['RABBITMQ_DEFAULT_PASS']}@"
    f"{os.environ['RABBITMQ_HOST']}:{os.environ['RABBITMQ_PORT']}//"
)

app = Celery("test_publisher", broker=broker_url)

result = app.send_task(
    "preprocessing_service.process",
    args=[{
        "session_id": "test-session-1",
        "raw_audio_path": "test1.WAV",
        "metadata": {
            "doctor_id": "11111111-1111-1111-1111-111111111111",
        },
    }],
    queue="preprocessing",
)

print("Tâche envoyée, id:", result.id)