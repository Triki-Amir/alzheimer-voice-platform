import logging
from sqlalchemy import text
from voiceplatform_shared.db_session import SessionLocal
from .embeddings import extract_embedding, cosine_similarity

logger = logging.getLogger(__name__)

SIMILARITY_THRESHOLD = 0.65  # à calibrer empiriquement sur ton dataset


def get_doctor_embedding(doctor_id: str):
    db = SessionLocal()
    try:
        result = db.execute(
            text("SELECT embedding FROM doctor_voice_profiles WHERE doctor_id = :doctor_id"),
            {"doctor_id": doctor_id},
        ).fetchone()
        return result[0] if result else None
    finally:
        db.close()


def assign_roles(audio_path: str, segments: list, doctor_id: str) -> list:
    """
    Pour chaque segment de diarisation, calcule un embedding et le compare
    au profil vocal du médecin. Le locuteur le plus proche du profil médecin
    (au-dessus du seuil) est étiqueté "doctor", tout le reste "patient".
    """
    doctor_embedding = get_doctor_embedding(doctor_id)
    if doctor_embedding is None:
        raise ValueError(f"Aucun profil vocal trouvé pour le médecin {doctor_id}")

    # 1. Calcul de similarité moyenne par speaker_label (SPEAKER_00, SPEAKER_01, ...)
    speaker_scores = {}
    for seg in segments:
        emb = extract_embedding(audio_path, seg["start"], seg["end"])
        if emb is None:
            continue
        sim = cosine_similarity(emb, doctor_embedding)
        speaker_scores.setdefault(seg["speaker"], []).append(sim)

    avg_scores = {
        spk: sum(scores) / len(scores) for spk, scores in speaker_scores.items() if scores
    }

    if not avg_scores:
        raise ValueError("Impossible d'extraire des embeddings exploitables sur cet audio")

    # 2. Le speaker avec la similarité moyenne la plus haute = médecin
    doctor_speaker_label = max(avg_scores, key=avg_scores.get)
    best_score = avg_scores[doctor_speaker_label]

    if best_score < SIMILARITY_THRESHOLD:
        logger.warning(
            "Similarité max %.3f sous le seuil %.2f — assignation incertaine",
            best_score, SIMILARITY_THRESHOLD,
        )

    # 3. Assignation du rôle à chaque segment
    for seg in segments:
        seg["role"] = "doctor" if seg["speaker"] == doctor_speaker_label else "patient"

    return segments