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
from .extract import mask_doctor_audio  # replaces extract_patient_segments
from .metrics import build_pause_metrics, build_preprocessing_metrics, write_json
from .role_heuristic import assign_roles
from .sentence_boundaries import detect_sentence_boundaries
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
            masked_local = os.path.join(tmp, "masked_full.wav")

            # MinIO Download
            t_sub = time.perf_counter()
            minio.fget_object("raw-audio", msg.raw_audio_path, raw_local)
            original_duration = AudioSegment.from_wav(raw_local).duration_seconds
            logger.info("  ├─ 📥 [MinIO] Downloaded raw audio (%.2fs duration) in %.2fs",
                        original_duration, time.perf_counter() - t_sub)

            # Audio Cleaning
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
            labeled_segments_local = os.path.join(tmp, "labeled_segments.json")
            with open(labeled_segments_local, "w", encoding="utf-8") as f:
                json.dump(segments, f, indent=2, ensure_ascii=False)
            labeled_segments_object_name = f"{session_id}/labeled_segments.json"
            minio.fput_object("patient-audio", labeled_segments_object_name, labeled_segments_local)
            logger.info("  ├─ 💾 [Debug] Saved labeled_segments.json to MinIO")
            
            # Mask doctor audio in place -- keeps ORIGINAL timeline intact,
            # no timestamp remapping needed anywhere downstream
            t_sub = time.perf_counter()
            audio_arr, sample_rate = _load_wav_as_array(cleaned_local)
            masked_arr = mask_doctor_audio(audio_arr, sample_rate, segments)
            _write_wav_from_array(masked_arr, sample_rate, masked_local)
            masked_object_name = f"{session_id}/masked_full.wav"
            minio.fput_object("patient-audio", masked_object_name, masked_local)
            logger.info("  ├─ 🔇 [Masking] Doctor audio masked in %.2fs", time.perf_counter() - t_sub)

            # VAD on the masked full file -- picks up patient speech only,
            # doctor sections are literal silence
            t_sub = time.perf_counter()
            vad_segments = run_vad(
                masked_local,
                threshold=0.3,
                min_silence_duration_ms=150,
            )

            # Pause metrics: labeled_segments passed so doctor turns inside
            # gaps are subtracted, not counted as patient pause (see metrics.py fix)
            pause_metrics = build_pause_metrics(
                segments=vad_segments,
                total_duration=original_duration,
                labeled_segments=segments,
            )

            # Sentence boundaries: same doctor-exclusion fix applied
            sentence_boundaries = detect_sentence_boundaries(vad_segments, segments)

            logger.info(
                "  ├─ 📊 [VAD/Metrics] %d pauses, %d sentence boundaries in %.2fs",
                pause_metrics["pause_count"], len(sentence_boundaries),
                time.perf_counter() - t_sub,
            )

            # Build Metrics File
            consolidated_metrics = build_preprocessing_metrics(
                cleaning_metrics=cleaning_metrics,
                diarization_confidence=diarization_confidence,
                pause_metrics=pause_metrics,
                patient_audio_duration=pause_metrics["speech_duration_seconds"],
                original_audio_duration=original_duration,
                labeled_segments=segments,
            )
            consolidated_metrics["sentence_boundaries"] = sentence_boundaries

            metrics_local = os.path.join(tmp, "preprocessing_metrics.json")
            write_json(metrics_local, consolidated_metrics)
            metrics_object_name = f"{session_id}/preprocessing_metrics.json"
            minio.fput_object("patient-audio", metrics_object_name, metrics_local)

        # NOTE: "labeled_segments" (doctor+patient) and "sentence_boundaries"
        # are threaded into metadata here so STT and linguistic-feature
        # services can consume them downstream -- this is the data that was
        # previously getting silently dropped between services.
        msg.metadata.update({
            "cleaned_audio_path": cleaned_object_name,
            "masked_audio_path": masked_object_name,
            "preprocessing_metrics_path": metrics_object_name,
            "labeled_segments": segments,
            "sentence_boundaries": sentence_boundaries,
            "preprocessing_metrics": consolidated_metrics,
        })

        # Trigger STT Service Task
        patient_id = msg.metadata.get("patient_id")
        stt_payload = {
            "session_id": session_id,
            "patient_id": patient_id,
            "patient_audio_path": masked_object_name,
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


def _load_wav_as_array(path: str):
    """
    Adjust this to whatever your codebase already uses elsewhere
    (e.g. soundfile.read, or torchaudio.load then .numpy()) --
    placeholder using soundfile since it's a common choice for this stack.
    """
    import soundfile as sf
    audio, sr = sf.read(path, dtype="float32")
    if audio.ndim > 1:
        audio = audio.mean(axis=1)  # should already be mono from clean_audio
    return audio, sr


def _write_wav_from_array(audio, sample_rate, path: str):
    import soundfile as sf
    sf.write(path, audio, sample_rate)