import os
import logging
import tempfile
import time
import psycopg2
import soundfile as sf

from voiceplatform_shared.celery_app import make_celery_app
from voiceplatform_shared.constants import Queues
from voiceplatform_shared.minio_client import get_minio_client

from .transcribe import transcribe_audio_batch
from .stt_per_segment import slice_patient_segments, transcribe_patient_segments
from .validate_word_timestamps import validate_word_timestamps

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("stt_worker")

STT_QUEUE = getattr(Queues, "STT_TRANSCRIPTION", "stt_transcription")
LINGUISTIC_QUEUE = getattr(Queues, "LINGUISTIC_EXTRACTION", "linguistic_extraction")
app = make_celery_app("stt_service", STT_QUEUE)

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("POSTGRES_DB", "voiceapp_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "voiceapp")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "voiceapp123")


def update_patient_transcription(patient_id: str, text: str):
    conn = psycopg2.connect(
        host=POSTGRES_HOST, port=POSTGRES_PORT,
        dbname=POSTGRES_DB, user=POSTGRES_USER, password=POSTGRES_PASSWORD
    )
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE patients SET transcription_text = %s WHERE id = %s;",
            (text, patient_id)
        )
        conn.commit()
    conn.close()


def _write_wav_fn(arr, sr, path):
    sf.write(path, arr, sr)


@app.task(name="stt_service.process", bind=True, max_retries=3)
def process(self, message: dict):
    t0 = time.perf_counter()
    minio = get_minio_client()

    session_id = message.get("session_id", "unknown")
    patient_id = message.get("patient_id", "unknown")
    metadata = message.get("metadata", {})

    logger.info("🎙️ [START] STT Transcription | Session: %s | Patient: %s", session_id, patient_id)

    try:
        # Use CLEANED audio (pre-mask), not masked_full.wav -- per-segment
        # slicing works directly off labeled_segments, so it doesn't need
        # or want the doctor-muted version. masked_full.wav is only for
        # VAD/pause metrics in preprocessing, not for STT anymore.
        cleaned_audio_path = metadata.get("cleaned_audio_path")
        labeled_segments = metadata.get("labeled_segments")

        if not cleaned_audio_path or not labeled_segments:
            raise ValueError(
                "Missing cleaned_audio_path or labeled_segments in metadata -- "
                "preprocessing must provide both for per-segment STT."
            )

        with tempfile.TemporaryDirectory() as tmp:
            local_wav = os.path.join(tmp, "cleaned.wav")

            # 1. Download from MinIO
            t_sub = time.perf_counter()
            minio.fget_object("patient-audio", cleaned_audio_path, local_wav)
            logger.info("  ├─ 📥 [MinIO] Downloaded audio in %.2fs", time.perf_counter() - t_sub)

            # 2. Slice into merged, context-rich patient clips (doctor
            # excluded, short/nearby turns merged, no artificial silence)
            audio, sample_rate = sf.read(local_wav, dtype="float32")
            if audio.ndim > 1:
                audio = audio.mean(axis=1)
            clips = slice_patient_segments(audio, sample_rate, labeled_segments)
            for c in clips:
                c["sample_rate"] = sample_rate
            logger.info("  ├─ ✂️  [Slicing] %d patient clip(s) extracted", len(clips))

            # 3. Batched GPU inference across all clips at once
            t_sub = time.perf_counter()
            result = transcribe_patient_segments(clips, transcribe_audio_batch, _write_wav_fn, tmp)
            transcription_text = result.get("text", "")
            raw_words = result.get("chunks", [])
            gpu_inference_time = time.perf_counter() - t_sub
            logger.info("  ├─ ⚡ [GPU STT] Transcribed %d clip(s) in %.2fs (%d words)",
                        len(clips), gpu_inference_time, len(raw_words))

            # 3b. Validate word timestamps -- safety net even with clean audio
            validated = validate_word_timestamps(raw_words)
            words = validated["words"]
            if validated["corrupted"]:
                logger.warning(
                    "  ├─ ⚠️ [Validation] %d timestamp issue(s) detected and cleaned, "
                    "%d/%d words kept | Session: %s",
                    len(validated["issues"]), len(words), len(raw_words), session_id,
                )

            # 4. PostgreSQL Update -- text only
            t_sub = time.perf_counter()
            update_patient_transcription(patient_id, transcription_text)
            logger.info("  ├─ 💾 [Postgres] Saved transcription in %.2fs", time.perf_counter() - t_sub)

        # 5. Trigger Downstream Linguistic Feature Extraction Task
        if words:
            logger.info("  ├─ 🚀 [Celery] Dispatching task to linguistic_extraction queue...")
            app.send_task(
                "linguistic_extraction_service.process",
                kwargs={
                    "message": {
                        "session_id": session_id,
                        "patient_id": patient_id,
                        "transcription": transcription_text,
                        "words": words,
                        "metadata": metadata,
                    }
                },
                queue=LINGUISTIC_QUEUE
            )
        else:
            logger.warning("  ├─ ⚠️ No usable words after validation. Skipping linguistic extraction.")

        total_duration = time.perf_counter() - t0
        logger.info("✅ [SUCCESS] STT finished in %.2fs (GPU Core: %.2fs) | Session: %s",
                    total_duration, gpu_inference_time, session_id)

        return {
            "status": "SUCCESS",
            "execution_time_sec": round(total_duration, 2),
            "gpu_inference_sec": round(gpu_inference_time, 2),
            "session_id": session_id,
            "transcription": transcription_text,
            "word_count": len(words),
            "clip_count": len(clips),
            "validation_corrupted": validated["corrupted"],
        }

    except Exception as exc:
        total_duration = time.perf_counter() - t0
        logger.error("❌ [FAILED] STT failed after %.2fs | Session: %s | Error: %s",
                     total_duration, session_id, str(exc))
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)