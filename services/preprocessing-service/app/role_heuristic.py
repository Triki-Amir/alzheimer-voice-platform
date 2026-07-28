import json
import logging

import numpy as np
from sqlalchemy import text

from voiceplatform_shared.db_session import SessionLocal

from .embeddings import cosine_similarity, extract_embedding

logger = logging.getLogger(__name__)
SIMILARITY_THRESHOLD = 0.65


def get_doctor_embedding(doctor_id: str) -> np.ndarray | None:
    db = SessionLocal()
    try:
        result = db.execute(
            text("SELECT embedding FROM doctor_voice_profiles WHERE doctor_id = :doctor_id"),
            {"doctor_id": doctor_id},
        ).fetchone()
        if not result:
            return None
        raw = result[0]
        # selon le type de colonne (JSONB/TEXT vs pgvector), raw peut déjà être une liste
        vec = json.loads(raw) if isinstance(raw, str) else raw
        return np.asarray(vec, dtype=np.float32)
    finally:
        db.close()


def assign_roles(audio_path: str, segments: list, doctor_id: str) -> tuple[list, dict]:
    """
    Retourne (segments annotés avec 'role', infos de confiance à logger).
    Lève ValueError si l'assignation n'est pas exploitable (pas de profil,
    pas d'embeddings, un seul locuteur détecté).
    """
    doctor_embedding = get_doctor_embedding(doctor_id)
    if doctor_embedding is None:
        raise ValueError(f"Aucun profil vocal trouvé pour le médecin {doctor_id}")

    unique_speakers = {seg["speaker"] for seg in segments}
    if len(unique_speakers) < 2:
        raise ValueError(
            f"Un seul locuteur détecté ({unique_speakers}) — diarization probablement "
            "défaillante, impossible de distinguer médecin/patient"
        )

    speaker_scores: dict[str, list[float]] = {}
    for seg in segments:
        emb = extract_embedding(audio_path, seg["start"], seg["end"])
        if emb is None:
            continue
        sim = cosine_similarity(emb, doctor_embedding)
        speaker_scores.setdefault(seg["speaker"], []).append(sim)

    avg_scores = {spk: float(np.mean(s)) for spk, s in speaker_scores.items() if s}
    if not avg_scores:
        raise ValueError("Impossible d'extraire des embeddings exploitables sur cet audio")

    doctor_speaker_label = max(avg_scores, key=avg_scores.get)
    best_score = avg_scores[doctor_speaker_label]

    confidence_info = {
        "doctor_speaker_label": doctor_speaker_label,
        "similarity_score": round(best_score, 4),
        "all_speaker_scores": {k: round(v, 4) for k, v in avg_scores.items()},
        "below_threshold": best_score < SIMILARITY_THRESHOLD,
    }
    if confidence_info["below_threshold"]:
        logger.warning(
            "Similarité max %.3f sous le seuil %.2f — assignation incertaine, "
            "à signaler pour validation manuelle",
            best_score, SIMILARITY_THRESHOLD,
        )

    for seg in segments:
        seg["role"] = "doctor" if seg["speaker"] == doctor_speaker_label else "patient"

    return segments, confidence_info