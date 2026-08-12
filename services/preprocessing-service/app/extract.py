#extract.py
"""
Replaces the old "concatenate patient clips" approach in extract.py.

Instead of building a new, shorter patient-only file (which required a
timestamp-mapping table back to the original recording), this keeps the
FULL original audio and just silences the doctor's speech in place.
Every timestamp downstream (VAD, sentence boundaries, STT) now refers
directly to the original recording -- no remapping needed anywhere.
"""

import logging
import numpy as np

logger = logging.getLogger(__name__)


def mask_doctor_audio(audio: np.ndarray, sample_rate: int, labeled_segments: list) -> np.ndarray:
    """
    audio: full mono waveform, shape (n_samples,), already cleaned/resampled.
    labeled_segments: output of assign_roles() -- list of dicts with
                       "start", "end", "role" ("doctor"/"patient").
    Returns a COPY of audio with every doctor-labeled interval zeroed out.
    Patient audio and all real silence (including inter-turn gaps) are
    left completely untouched, on the original timeline.
    """
    masked = audio.copy()
    n_samples = len(masked)

    for seg in labeled_segments:
        if seg["role"] != "doctor":
            continue
        start_sample = max(0, int(seg["start"] * sample_rate))
        end_sample = min(n_samples, int(seg["end"] * sample_rate))
        if start_sample < end_sample:
            masked[start_sample:end_sample] = 0.0

    return masked


def compute_pause_ratio(labeled_segments: list, total_duration: float) -> dict:
    """
    Global pause metric: fraction of the recording where neither speaker
    was talking. NOTE: this does not distinguish patient hesitation from
    doctor hesitation or ordinary turn-taking silence -- it's a coarse,
    whole-recording signal. Keep labeled_segments around separately if you
    also want per-sentence, patient-attributed pause features later --
    those need the segment list, not just these aggregate totals.
    """
    doctor_time = sum(s["end"] - s["start"] for s in labeled_segments if s["role"] == "doctor")
    patient_time = sum(s["end"] - s["start"] for s in labeled_segments if s["role"] == "patient")
    gap_time = max(0.0, total_duration - doctor_time - patient_time)

    return {
        "total_duration": round(total_duration, 3),
        "doctor_speaking_time": round(doctor_time, 3),
        "patient_speaking_time": round(patient_time, 3),
        "gap_time": round(gap_time, 3),
        "pause_ratio": round(gap_time / total_duration, 4) if total_duration > 0 else 0.0,
    }

