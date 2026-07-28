import logging
from pydub import AudioSegment

logger = logging.getLogger(__name__)
MIN_SEGMENT_MS = 100  # ignore les micro-segments quasi nuls (artefacts diarization)


def extract_patient_segments(audio_path: str, segments: list, output_path: str) -> tuple[str, list, float]:
    """
    Concatène uniquement les segments patient, SANS silence de comblement :
    insérer du silence pour les tours du médecin fausserait ensuite les
    métriques de pause (le VAD confondrait "médecin parle" et "patient
    fait une pause"). Le VAD est appliqué APRÈS sur cet audio continu,
    donc les seules pauses détectées seront de vraies pauses du patient.
    """
    audio = AudioSegment.from_wav(audio_path)
    patient_segments = sorted(
        [seg for seg in segments if seg.get("role") == "patient"],
        key=lambda seg: seg["start"],
    )
    if not patient_segments:
        raise ValueError("Aucun segment patient exploitable n'a été trouvé")

    combined = AudioSegment.empty()
    timestamp_mapping = []  # traçabilité: position dans patient.wav -> timestamp original
    cursor_ms = 0

    for seg in patient_segments:
        start_ms, end_ms = int(seg["start"] * 1000), int(seg["end"] * 1000)
        if end_ms - start_ms < MIN_SEGMENT_MS:
            continue
        clip = audio[start_ms:end_ms]
        combined += clip
        timestamp_mapping.append({
            "original_start": seg["start"],
            "original_end": seg["end"],
            "patient_audio_start": round(cursor_ms / 1000, 3),
            "patient_audio_end": round((cursor_ms + len(clip)) / 1000, 3),
        })
        cursor_ms += len(clip)

    if len(combined) == 0:
        raise ValueError("Les segments patient calculés sont vides après filtrage")

    combined.export(output_path, format="wav")
    duration_seconds = len(combined) / 1000
    logger.info("Segments patient extraits: %d, durée totale: %.2fs", len(timestamp_mapping), duration_seconds)
    return output_path, timestamp_mapping, duration_seconds