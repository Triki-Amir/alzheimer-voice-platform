import logging
import os
import tempfile
import json
from voiceplatform_shared.celery_app import make_celery_app
from voiceplatform_shared.constants import Queues
from voiceplatform_shared.models import SessionMessage
from voiceplatform_shared.minio_client import get_minio_client
from voiceplatform_shared.publisher import publish_session_message
from .diarize import run_diarization
from .role_assignment import assign_roles

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = make_celery_app("diarization_service", Queues.DIARIZATION)


@app.task(name="diarization_service.process", bind=True, max_retries=3)
def process(self, message: dict):
    msg = SessionMessage(**message)
    minio = get_minio_client()

    try:
        cleaned_path = msg.metadata.get("cleaned_audio_path")
        doctor_id = msg.metadata.get("doctor_id")
        if not doctor_id:
            raise ValueError("doctor_id manquant dans metadata — requis pour l'identification du locuteur")

        with tempfile.TemporaryDirectory() as tmp:
            local_audio = os.path.join(tmp, "cleaned.wav")
            minio.fget_object("patient-audio", cleaned_path, local_audio)

            segments = run_diarization(local_audio)
            segments = assign_roles(local_audio, segments, doctor_id)

            rttm_path = os.path.join(tmp, "diarization.rttm")
            with open(rttm_path, "w") as f:
                for seg in segments:
                    f.write(json.dumps(seg) + "\n")

            rttm_object_name = f"{msg.session_id}/diarization.json"
            minio.fput_object("patient-audio", rttm_object_name, rttm_path)

        msg.metadata["diarization_path"] = rttm_object_name
        msg.metadata["diarization_segments"] = segments  # transmis directement, évite un second fetch

        logger.info(
            "Diarisation terminée pour session %s — %d segments, rôles assignés",
            msg.session_id, len(segments),
        )

        publish_session_message(Queues.VOICE_EXTRACTION, msg.dict())
        return {"status": "ok"}

    except Exception as exc:
        logger.exception("Échec diarisation session %s", msg.session_id)
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)