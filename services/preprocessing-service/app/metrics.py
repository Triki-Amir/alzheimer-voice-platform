import json


def _merge_segments(segments: list[dict]) -> list[dict]:
    ordered = sorted(
        [{"start": float(s["start"]), "end": float(s["end"])} for s in segments],
        key=lambda s: s["start"],
    )
    if not ordered:
        return []
    merged = [ordered[0]]
    for seg in ordered[1:]:
        current = merged[-1]
        if seg["start"] <= current["end"]:
            current["end"] = max(current["end"], seg["end"])
        else:
            merged.append(seg)
    return merged


def build_pause_metrics(segments: list[dict], total_duration: float) -> dict:
    merged = _merge_segments(segments)
    speech_duration = sum(s["end"] - s["start"] for s in merged)
    pauses = []
    if merged:
        if merged[0]["start"] > 0:
            pauses.append(merged[0]["start"])
        for left, right in zip(merged, merged[1:]):
            gap = max(0.0, right["start"] - left["end"])
            if gap > 0:
                pauses.append(gap)
        if total_duration > merged[-1]["end"]:
            pauses.append(total_duration - merged[-1]["end"])
    else:
        pauses.append(total_duration)

    pause_duration = sum(pauses)
    return {
        "total_duration_seconds": round(float(total_duration), 3),
        "speech_duration_seconds": round(float(speech_duration), 3),
        "pause_duration_seconds": round(float(pause_duration), 3),
        "pause_count": len(pauses),
        "mean_pause_seconds": round(pause_duration / len(pauses), 3) if pauses else 0.0,
        "max_pause_seconds": round(max(pauses), 3) if pauses else 0.0,
        "speech_ratio": round(speech_duration / total_duration, 3) if total_duration else 0.0,
        "pause_durations_list": [round(p, 3) for p in pauses],
    }


def build_preprocessing_metrics(
    cleaning_metrics: dict,
    diarization_confidence: dict,
    pause_metrics: dict,
    patient_audio_duration: float,
    original_audio_duration: float,
) -> dict:
    """
    Consolide toutes les métriques du prétraitement en un seul objet,
    stocké dans preprocessing_metrics.json — utile pour le monitoring
    et pour tracer la qualité de chaque session.
    """
    return {
        "audio_quality": {
            "snr_estimated_gain_db": cleaning_metrics.get("estimated_snr_gain_db"),
            "rms_before": cleaning_metrics.get("rms_before"),
            "rms_after": cleaning_metrics.get("rms_after"),
            "noise_detection_method": cleaning_metrics.get("noise_detection_method"),
        },
        "diarization": {
            "doctor_similarity_score": diarization_confidence.get("similarity_score"),
            "below_confidence_threshold": diarization_confidence.get("below_threshold"),
            "all_speaker_scores": diarization_confidence.get("all_speaker_scores"),
        },
        "patient_audio": {
            "original_duration_seconds": round(original_audio_duration, 3),
            "patient_speaking_duration_seconds": round(patient_audio_duration, 3),
            "patient_talk_ratio": round(patient_audio_duration / original_audio_duration, 3)
            if original_audio_duration else 0.0,
        },
        "pauses": pause_metrics,
    }


def write_json(output_path: str, payload: dict) -> None:
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)