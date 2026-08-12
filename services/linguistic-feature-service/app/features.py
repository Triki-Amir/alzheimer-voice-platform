# features.py
"""
Point d'entrée public du pipeline d'extraction linguistique.

Orchestration en 2 étapes :
  1. sentence_alignement.py -> build_sentences()          (frontières de phrases,
                                dérivées des pauses réelles, sans LLM)
  2. pos_tagging.py         -> POSTaggingService.tag_words() (XLM-R local, sans LLM)

Ce fichier ne contient AUCUNE logique métier : il assemble juste les deux
étapes et expose une API simple pour le reste de l'application (ex: la
tâche Celery). Plus aucune dépendance à vLLM/Qwen -- tout tourne en local.
"""
import logging
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv

from app.pos_tagging import POSTaggingService
from app.sentence_alignement import build_sentences
from app.sentence_alignement import sentences_to_words_with_punct

load_dotenv()

logger = logging.getLogger(__name__)


def count_pos_tags(tokens_pos: list) -> dict:
    """
    Counts occurrences of each POS tag across the tagged output. This is
    the actual clinical feature set -- noun count, verb count, pronoun
    count, filler count, etc. -- used downstream for the linguistic
    analysis (noun/verb ratio, pronoun rate, filler rate, and so on).
    Untagged words (pos=None) are counted separately, not silently dropped,
    so a high untagged count stays visible rather than hidden.
    """
    counts: Dict[str, int] = {}
    untagged = 0
    for t in tokens_pos:
        tag = t.get("pos")
        if tag is None:
            untagged += 1
        else:
            counts[tag] = counts.get(tag, 0) + 1
    counts["UNTAGGED"] = untagged
    return counts


class LinguisticFeatureExtractor:
    def __init__(
        self,
        pos_model_path: Optional[str] = None,
        device: Optional[str] = None,
    ):
        self.pos_model_path = pos_model_path or os.getenv(
            "POS_MODEL_PATH", "/models/xlmr-tunisian-pos-final"
        )

        # Local XLM-R inference, no HTTP client, no LLM server dependency.
        self.pos_tagging_service = POSTaggingService(
            model_path=self.pos_model_path,
            device=device,
        )

    async def extract_linguistic_features_from_audio(
        self,
        words: list,
        boundaries: list,
        sentence_chunk_target: int = 120,
    ) -> dict:
        """
        words:      STT chunks, already cleaned by validate_word_timestamps()
                    -> [{"text": str, "timestamp": (start, end)}, ...]
        boundaries: sentence_boundaries.py output (doctor-exclusion-corrected)
                    -> [{"start", "end", "duration", "type"}, ...]

        STEP 1: build_sentences() -- deterministic, pause-based, no LLM.
        STEP 2: pos_tagging_service.tag_words() -- local XLM-R, no LLM.
        """
        if not words:
            return {
                "texte_original": "",
                "sentences": [],
                "tokens_pos": [],
                "aligned": True,
            }

        # --- STEP 1: pause-based sentence chunking ---
        sentences = build_sentences(words, boundaries)
        words_with_punct = sentences_to_words_with_punct(sentences)

        # --- STEP 2: local POS tagging ---
        tagging_result = await self.pos_tagging_service.tag_words(
            words_with_punct,
            sentence_chunk_target=sentence_chunk_target,
        )

        # word integrity check -- should be structurally guaranteed here,
        # but checking costs nothing and catches any future regression
        original_words = [w["text"].strip() for w in words]
        final_words = [t["mot"] for t in tagging_result.get("tokens_pos", [])]
        if original_words != final_words:
            logger.warning(
                "Word integrity check FAILED after audio-based pipeline: "
                "expected %d words, got %d",
                len(original_words), len(final_words),
            )

        significant_pause_count = sum(
            1 for s in sentences if s["preceded_by"] in ("hesitation_pause", "long_silence")
        )

        pos_counts = count_pos_tags(tagging_result["tokens_pos"])

        output: Dict[str, Any] = {
            "texte_original": " ".join(original_words),
            "sentences": sentences,  # keeps timestamps + pause context per sentence
            "tokens_pos": tagging_result["tokens_pos"],
            "pos_counts": pos_counts,  # the actual noun/verb/pronoun/etc. counts
            "aligned": tagging_result["aligned"],
            "significant_pause_count": significant_pause_count,
        }
        if "error" in tagging_result:
            output["error"] = tagging_result["error"]

        return output