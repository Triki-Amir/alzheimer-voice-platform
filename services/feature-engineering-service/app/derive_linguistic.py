"""
Computes the curated linguistic feature set from the ACTUAL
linguistic_features.json shape (texte_original / sentences / tokens_pos /
pos_counts / significant_pause_count) -- not the disconnected
Whisper-prototype snippet's shape.
"""
import logging
import re
from collections import Counter

logger = logging.getLogger("feature_engineering.linguistic")

# Heuristic substring list for Tunisian dialect "I don't remember" /
# "I forgot" / "it slipped my mind" variants. Spelling is inconsistent
# across transcripts (informal dialectal Arabic has no fixed orthography),
# so this is substring matching, not a strict regex. EXTEND THIS as you see
# real variants show up in transcripts -- treat it as a living list.
NOT_REMEMBER_MARKERS = [
    # "I forgot" / "forgot it"
    "نسيت",
    "نسيتها",
    "نسيتهم",
    "ما ناسي",
    # "I don't remember" (multiple common spellings of the same root)
    "ما نتذكرش",
    "منتذكرش",
    "ما نتفكرش",
    "منتفكرش",
    "مانفتكرش",
    "ما تفكرتش",
    "متفكرتش",
    "ماذكرتش",
    "مامفكرتش",
    "ماني فاكر",
    "ماني متذكر",
    "مش فاكر",
    "موش فاكر",
    "ماهوش حافظ",
    # "I don't know" (often used interchangeably with "don't remember" in
    # dialectal speech when asked about the past)
    "ما نعرفش",
    "منعرفش",
    "منعرش",
    "ما نتضكرش",
    "منتضكرش",
    # "it slipped my mind" idioms
    "خرج من بالي",
    "خرجلي من بالي",
    "طار من بالي",
]


def _count_not_remember(transcript: str) -> int:
    return sum(transcript.count(marker) for marker in NOT_REMEMBER_MARKERS)


def _speech_rate_words_per_min(tokens_pos: list, sentences: list) -> float:
    """Words per minute, using the full span from first word start to last
    word end across all sentences (includes internal pauses -- this is
    articulation-inclusive rate, not pure speaking rate; switch to summing
    each sentence's (end-start) if you want pause-excluded rate instead)."""
    all_starts, all_ends = [], []
    for sent in sentences:
        for w in sent.get("words", []):
            all_starts.append(w["start"])
            all_ends.append(w["end"])

    if not all_starts or not tokens_pos:
        return 0.0

    duration_min = (max(all_ends) - min(all_starts)) / 60.0
    if duration_min <= 0:
        return 0.0

    return round(len(tokens_pos) / duration_min, 4)


def _pause_mean(sentences: list) -> float:
    """Mean over ALL detected inter-sentence pauses (preceded_by is not
    null), not just 'significant' ones -- pause_count below reuses the
    service's own significant_pause_count instead, so these two numbers are
    on slightly different bases by design. Flag if you'd rather have both
    computed the same way."""
    pauses = [
        s["preceding_pause_dur"]
        for s in sentences
        if s.get("preceded_by") is not None
    ]
    if not pauses:
        return 0.0
    return round(sum(pauses) / len(pauses), 4)


def extract_selected_linguistic_features(linguistic: dict) -> dict:
    transcript = linguistic.get("texte_original", "")
    tokens_pos = linguistic.get("tokens_pos", [])
    sentences = linguistic.get("sentences", [])

    words = [t["mot"].lower() for t in tokens_pos if t.get("mot")]
    total_words = len(words)
    unique_words = len(set(words))
    word_counts = Counter(words)

    repetitions = sum(c - 1 for c in word_counts.values() if c > 1)
    filler_count = sum(1 for t in tokens_pos if t.get("pos") == "FILLER")

    return {
        "transcript": transcript,
        "total_words": total_words,
        "unique_words": unique_words,
        "lexical_diversity": round(unique_words / total_words, 4) if total_words else 0.0,
        "repetitions": repetitions,
        "filler_count": filler_count,
        "NotRem": _count_not_remember(transcript),
        "speech_rate": _speech_rate_words_per_min(tokens_pos, sentences),
        "pause_mean": _pause_mean(sentences),
        "pause_count": linguistic.get("significant_pause_count", 0),
    }
