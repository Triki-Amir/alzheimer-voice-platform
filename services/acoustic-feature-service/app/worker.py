import io
import json
import logging
import os
import tempfile
import time

import soundfile as sf

from voiceplatform_shared.celery_app import make_celery_app
from voiceplatform_shared.constants import Queues
from voiceplatform_shared.minio_client import get_minio_client

from .audio_utils import slice_patient_audio
from .features import extract_acoustic_features  # rename import if your fn lives elsewhere

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("acoustic_worker")

ACOUSTIC_QUEUE = getattr(Queues, "ACOUSTIC_EXTRACTION", "acoustic_extraction")
FEATURE_ENGINEERING_QUEUE = getattr(Queues, "FEATURE_ENGINEERING", "feature_engineering")

app = make_celery_app("acoustic_feature_service", ACOUSTIC_QUEUE)

FEATURES_BUCKET = os.getenv("ACOUSTIC_FEATURES_BUCKET", "patient-audio")


def upload_features_json(minio, patient_id: str, session_id: str, features: dict) -> str:
    # patient_id kept in the signature for logging/future use even though
    # it's no longer part of the path -- session_id is now the sole key,
    # matching where linguistic_features.json already lives.
    object_name = f"{session_id}/acoustic_features.json"
    payload = json.dumps(features, indent=2).encode("utf-8")
    minio.put_object(
        FEATURES_BUCKET,
        object_name,
        data=io.BytesIO(payload),
        length=len(payload),
        content_type="application/json",
    )
    return object_name


@app.task(name="acoustic_feature_service.process", bind=True, max_retries=3)
def process(self, message: dict):
    t0 = time.perf_counter()
    minio = get_minio_client()

    session_id = message.get("session_id", "unknown")
    patient_id = message.get("patient_id", "unknown")
    metadata = message.get("metadata", {})

    logger.info("🎧 [START] Acoustic Extraction | Session: %s | Patient: %s", session_id, patient_id)

    try:
        cleaned_audio_path = metadata.get("cleaned_audio_path")
        labeled_segments = metadata.get("labeled_segments")

        if not cleaned_audio_path or not labeled_segments:
            raise ValueError(
                "Missing cleaned_audio_path or labeled_segments in metadata -- "
                "acoustic extraction needs the unmuted cleaned audio plus segment "
                "labels to build a patient-only signal."
            )

        with tempfile.TemporaryDirectory() as tmp:
            local_wav = os.path.join(tmp, "cleaned.wav")

            t_sub = time.perf_counter()
            minio.fget_object("patient-audio", cleaned_audio_path, local_wav)
            logger.info("  ├─ 📥 [MinIO] Downloaded audio in %.2fs", time.perf_counter() - t_sub)

            audio, sr = sf.read(local_wav, dtype="float32")
            if audio.ndim > 1:
                audio = audio.mean(axis=1)

            patient_audio = slice_patient_audio(audio, sr, labeled_segments)

            t_sub = time.perf_counter()
            features = extract_acoustic_features(patient_audio, sr)
            extraction_time = time.perf_counter() - t_sub
            logger.info(
                "  ├─ 🧮 [Features] Extracted %d acoustic features in %.2fs",
                len(features), extraction_time,
            )

            t_sub = time.perf_counter()
            features_object_name = upload_features_json(minio, patient_id, session_id, features)
            logger.info(
                "  ├─ 📤 [MinIO] Saved features to %s/%s in %.2fs",
                FEATURES_BUCKET, features_object_name, time.perf_counter() - t_sub,
            )

        # Notify feature-engineering service. It waits for BOTH this and
        # linguistic-feature-service to land before it can build the combined
        # table -- see that service's worker.py for how it handles the race.
        app.send_task(
            "feature_engineering_service.process",
            kwargs={
                "message": {
                    "session_id": session_id,
                    "patient_id": patient_id,
                }
            },
            queue=FEATURE_ENGINEERING_QUEUE,
        )

        total_duration = time.perf_counter() - t0
        logger.info(
            "✅ [SUCCESS] Acoustic extraction finished in %.2fs | Session: %s",
            total_duration, session_id,
        )

        return {
            "status": "SUCCESS",
            "execution_time_sec": round(total_duration, 2),
            "session_id": session_id,
            "features_path": features_object_name,
            "feature_count": len(features),
        }

    except Exception as exc:
        total_duration = time.perf_counter() - t0
        logger.error(
            "❌ [FAILED] Acoustic extraction failed after %.2fs | Session: %s | Error: %s",
            total_duration, session_id, str(exc),
        )
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)