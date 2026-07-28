#worker.py
import json
import logging
import os
import tempfile

from pydub import AudioSegment

from voiceplatform_shared.celery_app import make_celery_app
from voiceplatform_shared.constants import Queues
from voiceplatform_shared.models import SessionMessage
from voiceplatform_shared.minio_client import get_minio_client

from .cleaning import clean_audio
from .diarize import run_diarization
from .extract import extract_patient_segments
from .metrics import build_pause_metrics, build_preprocessing_metrics, write_json
from .role_heuristic import assign_roles
from .vad import run_vad

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = make_celery_app("preprocessing_service", Queues.PREPROCESSING)


@app.task(name="preprocessing_service.process", bind=True, max_retries=3)
def process(self, message: dict):
    msg = SessionMessage(**message)
    minio = get_minio_client()

    try:
        doctor_id = msg.metadata.get("doctor_id")
        if not doctor_id:
            raise ValueError("doctor_id manquant dans metadata — requis pour l'identification du locuteur")

        with tempfile.TemporaryDirectory() as tmp:
            raw_local = os.path.join(tmp, "raw.wav")
            cleaned_local = os.path.join(tmp, "cleaned.wav")
            patient_local = os.path.join(tmp, "patient.wav")

            minio.fget_object("raw-audio", msg.raw_audio_path, raw_local)
            original_duration = AudioSegment.from_wav(raw_local).duration_seconds

            _, cleaning_metrics = clean_audio(raw_local, cleaned_local)
            cleaned_object_name = f"{msg.session_id}/cleaned.wav"
            minio.fput_object("patient-audio", cleaned_object_name, cleaned_local)

            segments = run_diarization(cleaned_local)
            segments, diarization_confidence = assign_roles(cleaned_local, segments, doctor_id)

            patient_object_name = f"{msg.session_id}/patient.wav"
            _, timestamp_mapping, patient_duration = extract_patient_segments(
                cleaned_local, segments, patient_local
            )
            minio.fput_object("patient-audio", patient_object_name, patient_local)

            vad_segments = run_vad(patient_local)
            pause_metrics = build_pause_metrics(vad_segments, patient_duration)

            consolidated_metrics = build_preprocessing_metrics(
                cleaning_metrics=cleaning_metrics,
                diarization_confidence=diarization_confidence,
                pause_metrics=pause_metrics,
                patient_audio_duration=patient_duration,
                original_audio_duration=original_duration,
            )

            metrics_local = os.path.join(tmp, "preprocessing_metrics.json")
            write_json(metrics_local, consolidated_metrics)
            metrics_object_name = f"{msg.session_id}/preprocessing_metrics.json"
            minio.fput_object("patient-audio", metrics_object_name, metrics_local)

        msg.metadata.update({
            "cleaned_audio_path": cleaned_object_name,
            "patient_audio_path": patient_object_name,
            "preprocessing_metrics_path": metrics_object_name,
            "timestamp_mapping": timestamp_mapping,
            "preprocessing_metrics": consolidated_metrics,
        })

        logger.info("Prétraitement terminé pour session %s", msg.session_id)
        return {"status": "ok", "metadata": msg.metadata}

    except Exception as exc:
        logger.exception("Échec prétraitement session %s", msg.session_id)
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)