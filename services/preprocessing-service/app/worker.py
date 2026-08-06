import json
import logging
import os
import tempfile
import time

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
    t0 = time.perf_counter()
    msg = SessionMessage(**message)
    minio = get_minio_client()
    session_id = msg.session_id

    logger.info("🚀 [START] Preprocessing Pipeline | Session: %s", session_id)

    try:
        doctor_id = msg.metadata.get("doctor_id")
        if not doctor_id:
            raise ValueError("doctor_id manquant dans metadata — requis pour l'identification du locuteur")

        with tempfile.TemporaryDirectory() as tmp:
            raw_local = os.path.join(tmp, "raw.wav")
            cleaned_local = os.path.join(tmp, "cleaned.wav")
            patient_local = os.path.join(tmp, "patient.wav")

            # MinIO Download
            t_sub = time.perf_counter()
            minio.fget_object("raw-audio", msg.raw_audio_path, raw_local)
            original_duration = AudioSegment.from_wav(raw_local).duration_seconds
            logger.info("  ├─ 📥 [MinIO] Downloaded raw audio (%.2fs duration) in %.2fs", 
                        original_duration, time.perf_counter() - t_sub)

            # Audio Cleaning & VAD
            t_sub = time.perf_counter()
            _, cleaning_metrics = clean_audio(raw_local, cleaned_local)
            cleaned_object_name = f"{session_id}/cleaned.wav"
            minio.fput_object("patient-audio", cleaned_object_name, cleaned_local)
            logger.info("  ├─ 🧹 [Cleaning] Completed & uploaded in %.2fs", time.perf_counter() - t_sub)

            # Diarization & Role Heuristics
            t_sub = time.perf_counter()
            segments = run_diarization(cleaned_local)
            segments, diarization_confidence = assign_roles(cleaned_local, segments, doctor_id)
            diar_time = time.perf_counter() - t_sub

            confidence_score = (
                diarization_confidence.get('similarity_score', 0.0) 
                if isinstance(diarization_confidence, dict) 
                else diarization_confidence
            )
            logger.info(
                "  ├─ 👤 [Diarization] Completed in %.2fs (Confidence: %.2f)",
                diar_time,
                confidence_score
            )

            # Patient Segment Extraction
            t_sub = time.perf_counter()
            patient_object_name = f"{session_id}/patient.wav"
            _, timestamp_mapping, patient_duration = extract_patient_segments(
                cleaned_local, segments, patient_local
            )
            minio.fput_object("patient-audio", patient_object_name, patient_local)
            logger.info("  ├─ ✂️ [Extraction] Patient audio (%.2fs) saved in %.2fs", 
                        patient_duration, time.perf_counter() - t_sub)

            # Pause Metrics & VAD
            t_sub = time.perf_counter()
            vad_segments = run_vad(patient_local)
            pause_metrics = build_pause_metrics(vad_segments, patient_duration)
            logger.info("  ├─ 📊 [VAD/Metrics] Computed pause metrics in %.2fs", time.perf_counter() - t_sub)

            # Build Metrics File
            consolidated_metrics = build_preprocessing_metrics(
                cleaning_metrics=cleaning_metrics,
                diarization_confidence=diarization_confidence,
                pause_metrics=pause_metrics,
                patient_audio_duration=patient_duration,
                original_audio_duration=original_duration,
            )

            metrics_local = os.path.join(tmp, "preprocessing_metrics.json")
            write_json(metrics_local, consolidated_metrics)
            metrics_object_name = f"{session_id}/preprocessing_metrics.json"
            minio.fput_object("patient-audio", metrics_object_name, metrics_local)

        msg.metadata.update({
            "cleaned_audio_path": cleaned_object_name,
            "patient_audio_path": patient_object_name,
            "preprocessing_metrics_path": metrics_object_name,
            "timestamp_mapping": timestamp_mapping,
            "preprocessing_metrics": consolidated_metrics,
        })

        # Trigger STT Service Task
        patient_id = msg.metadata.get("patient_id")
        stt_payload = {
            "session_id": session_id,
            "patient_id": patient_id,
            "patient_audio_path": patient_object_name,
            "metadata": msg.metadata
        }

        app.send_task(
            "stt_service.process",
            kwargs={"message": stt_payload},
            queue=getattr(Queues, "STT_TRANSCRIPTION", "stt_transcription")
        )

        total_duration = time.perf_counter() - t0
        logger.info("✅ [SUCCESS] Preprocessing completed in %.2fs | Session: %s -> Sent to STT", 
                    total_duration, session_id)

        return {
            "status": "SUCCESS",
            "execution_time_sec": round(total_duration, 2),
            "session_id": session_id,
            "metadata": msg.metadata
        }

    except Exception as exc:
        total_duration = time.perf_counter() - t0
        logger.error("❌ [FAILED] Preprocessing failed after %.2fs | Session: %s | Error: %s", 
                     total_duration, session_id, str(exc))
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)