import logging
import os
import tempfile
from voiceplatform_shared.celery_app import make_celery_app
from voiceplatform_shared.constants import Queues
from voiceplatform_shared.models import SessionMessage
from voiceplatform_shared.minio_client import get_minio_client
from voiceplatform_shared.publisher import publish_session_message
from .cleaning import clean_audio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = make_celery_app("audio_cleaning_service", Queues.AUDIO_CLEANING)


@app.task(name="audio_cleaning_service.process", bind=True, max_retries=3)
def process(self, message: dict):
    msg = SessionMessage(**message)
    minio = get_minio_client()

    try:
        with tempfile.TemporaryDirectory() as tmp:
            local_in = os.path.join(tmp, "raw.wav")
            local_out = os.path.join(tmp, "cleaned.wav")

            minio.fget_object("raw-audio", msg.raw_audio_path, local_in)
            clean_audio(local_in, local_out)

            cleaned_object_name = f"{msg.session_id}/cleaned.wav"
            minio.fput_object("patient-audio", cleaned_object_name, local_out)

        msg.metadata["cleaned_audio_path"] = cleaned_object_name
        logger.info("Session %s nettoyée avec succès", msg.session_id)

        publish_session_message(Queues.DIARIZATION, msg.dict())
        return {"status": "ok"}

    except Exception as exc:
        logger.exception("Échec nettoyage session %s", msg.session_id)
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)