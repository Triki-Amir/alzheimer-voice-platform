import logging

import numpy as np

logger = logging.getLogger("acoustic_service.audio_utils")


def slice_patient_audio(
    audio: np.ndarray,
    sr: int,
    labeled_segments: list,
    gap_sec: float = 0.15,
) -> np.ndarray:
    """
    Build a patient-only, doctor-free waveform for acoustic feature extraction.

    - masked_full.wav (doctor muted -> silence) is right for VAD/pause timing
      but wrong here: it inflates silence proportion (skews loudness/energy
      functionals) and bakes in artificial "pauses" that are just "the doctor
      was talking".
    - cleaned_audio_path used as-is (both speakers) is also wrong: it
      contaminates F0/jitter/shimmer/formants/HNR -- exactly what eGeMAPS
      measures -- with a second speaker's voice.

    So: take labeled_segments, keep only the patient-labeled ones, and
    concatenate them from the UNMUTED cleaned audio, joined by a short fixed
    silence gap purely to avoid click artifacts / spurious MFCC deltas at
    splice points (NOT meant to represent a real pause duration).

    labeled_segments: list of dicts, actual shape produced by
    diarize.py / role_heuristic.assign_roles():
        {
          "start": float_sec, "end": float_sec,
          "speaker": "SPEAKER_00" / "SPEAKER_01",   # raw diarization label
                                                       # -- NOT the role,
                                                       # don't filter on this
          "role": "patient" | "doctor",
        }
    """
    patient_segments = [
        seg for seg in labeled_segments
        if seg.get("role", "").lower() == "patient"
    ]
    if not patient_segments:
        raise ValueError("No patient-labeled segments found in labeled_segments")

    patient_segments.sort(key=lambda s: s["start"])

    gap = np.zeros(int(gap_sec * sr), dtype=audio.dtype)
    chunks = []
    speech_samples = 0
    for seg in patient_segments:
        start_sample = max(0, int(seg["start"] * sr))
        end_sample = min(len(audio), int(seg["end"] * sr))
        if end_sample <= start_sample:
            continue
        chunk = audio[start_sample:end_sample]
        chunks.append(chunk)
        speech_samples += len(chunk)
        chunks.append(gap)

    if not chunks:
        raise ValueError("Patient segments resolved to zero-length audio")

    patient_audio = np.concatenate(chunks[:-1])  # drop trailing gap
    logger.info(
        "Built patient-only audio: %d segment(s), %.2fs of speech, %.2fs total incl. splice gaps",
        len(patient_segments), speech_samples / sr, len(patient_audio) / sr,
    )
    return patient_audio