"""
Point d'entrée public du pipeline d'extraction linguistique.

Orchestration :
  1. sentence_alignement.py -> build_sentences()
  2. pos_tagging.py         -> POSTaggingService.tag_words()
  3. Feature Extraction     -> Local POS + Cookie Theft + Lexical/Syntactic Metrics
"""
import logging
import math
import os
import re
from collections import Counter
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

from app.pos_tagging import POSTaggingService
from app.sentence_alignement import build_sentences, sentences_to_words_with_punct

load_dotenv()

logger = logging.getLogger(__name__)

# ═════════════════════════════════════════════
# LEXICONS & PATTERNS (Tunisian AR & FR Mix)
# ═════════════════════════════════════════════

FILLERS = {
    "يعني", "معناها", "مم", "أه", "يعني", "باش", "امm", "euh", "bah", "ben", "heu", "umm", "uh"
}

# Cookie Theft Description Picture Elements
COOKIE_ELEMENTS = {
    "boy": [r"\bboy\b", r"\bولد\b", r"\bوليد\b", r"\bطفل\b", r"\bgarçon\b"],
    "girl": [r"\bgirl\b", r"\bبنت\b", r"\bبنية\b", r"\bطفلة\b", r"\bfille\b"],
    "woman": [r"\bwoman\b", r"\bmother\b", r"\bأم\b", r"\bأمي\b", r"\bمرأة\b", r"\bأمها\b", r"\bmère\b", r"\bfemme\b"],
    "cookie": [r"\bcookie\b", r"\bcookies\b", r"\bكعك\b", r"\bبسكويت\b", r"\bكعكة\b", r"\bgâteau\b", r"\bbiscuit\b"],
    "jar": [r"\bjar\b", r"\bحك\b", r"\bحكة\b", r"\bسطل\b", r"\bbocal\b"],
    "stool": [r"\bstool\b", r"\bchair\b", r"\bكرسي\b", r"\btabouret\b", r"\bchaise\b"],
    "falling": [r"\bfalling\b", r"\bfall\b", r"\bطيحة\b", r"\bطيح\b", r"\bطاح\b", r"\byateh\b", r"\btomber\b", r"\btombe\b"],
    "water": [r"\bwater\b", r"\bماء\b", r"\bالماء\b", r"\beau\b"],
    "overflow": [r"\boverflow\b", r"\bفايض\b", r"\bفاض\b", r"\bيتكفق\b", r"\bdéborder\b", r"\bdéborde\b"],
    "sink": [r"\bsink\b", r"\bإسبال\b", r"\bسبالة\b", r"\bévier\b"],
    "dishes": [r"\bdishes\b", r"\bplates\b", r"\bصحون\b", r"\bماعون\b", r"\bma3oun\b", r"\bvaisselle\b"],
    "window": [r"\bwindow\b", r"\bشباك\b", r"\bfenêtre\b"],
    "curtains": [r"\bcurtains\b", r"\brideau\b", r"\brideaux\b", r"\bستائر\b"],
    "cabinet": [r"\bcabinet\b", r"\bplacard\b", r"\bخزانة\b"],
    "outside": [r"\boutside\b", r"\bبرة\b", r"\bجردينة\b", r"\bjardin\b", r"\bextérieur\b"],
    "apron": [r"\bapron\b", r"\btablier\b", r"\bمئزر\b"]
}

ACTION_WORDS = [
    r"\bياخذ\b", r"\bسرق\b", r"\bطيح\b", r"\bيغسل\b", r"\bفاض\b", r"\bيمسح\b",
    r"\btombe\b", r"\bprend\b", r"\bvole\b", r"\blave\b", r"\bdéborde\b", r"\bessuie\b"
]

SPATIAL_WORDS = [
    r"\bفوق\b", r"\bتحت\b", r"\bبجناب\b", r"\bورى\b", r"\bقدام\b", r"\bداخل\b", r"\bبرة\b",
    r"\bsur\b", r"\bsous\b", r"\bà côté\b", r"\bderrière\b", r"\bdevant\b", r"\bdans\b"
]

INFERENCE_WORDS = [
    r"\bخاطر\b", r"\bعلى خاطر\b", r"\bظهرلي\b", r"\bيمكن\b", r"\bنظن\b",
    r"\bparce que\b", r"\bcar\b", r"\bsemble\b", r"\bpeut-être\b", r"\bcrois\b"
]


def count_pos_tags(tokens_pos: list) -> dict:
    """Counts occurrences of each POS tag from XLM-R outputs."""
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
        self.pos_tagging_service = POSTaggingService(
            model_path=self.pos_model_path,
            device=device,
        )

    def _extract_cookie_theft_features(self, text: str, sentences: List[dict]) -> dict:
        text_low = text.lower()
        words = re.findall(r"\b\w+\b", text_low)
        total_words = len(words)
        feats = {}

        element_scores = {}
        for element, patterns in COOKIE_ELEMENTS.items():
            mentioned = any(re.search(p, text_low) for p in patterns)
            feats[f"ct_{element}"] = int(mentioned)
            element_scores[element] = int(mentioned)

        feats["ct_content_score"] = round(sum(element_scores.values()) / len(COOKIE_ELEMENTS), 4)

        action_count = sum(1 for p in ACTION_WORDS if re.search(p, text_low))
        feats["ct_action_count"] = action_count
        feats["ct_action_ratio"] = round(action_count / total_words, 4) if total_words > 0 else 0.0

        spatial_count = sum(1 for p in SPATIAL_WORDS if re.search(p, text_low))
        feats["ct_spatial_count"] = spatial_count
        feats["ct_spatial_ratio"] = round(spatial_count / total_words, 4) if total_words > 0 else 0.0

        inference_count = sum(1 for p in INFERENCE_WORDS if re.search(p, text_low))
        feats["ct_inference_count"] = inference_count
        feats["ct_inference_ratio"] = round(inference_count / total_words, 4) if total_words > 0 else 0.0

        revisit_count = 0
        for element, patterns in COOKIE_ELEMENTS.items():
            mentions = sum(len(re.findall(p, text_low)) for p in patterns)
            if mentions > 1:
                revisit_count += mentions - 1
        feats["ct_element_revisit"] = revisit_count

        # Time to first key element (using local pause-sentence timestamps)
        key_patterns = [p for el in ["boy", "woman", "cookie", "water", "overflow", "falling", "stool"] for p in COOKIE_ELEMENTS[el]]
        first_mention_time = 0.0
        for sent in sentences:
            sent_text = " ".join(w["text"] for w in sent["words"]).lower()
            if any(re.search(p, sent_text) for p in key_patterns):
                first_mention_time = sent["start"]
                break
        feats["ct_first_element_time"] = round(float(first_mention_time), 4)

        element_sequence = []
        for sent in sentences:
            sent_text = " ".join(w["text"] for w in sent["words"]).lower()
            for element, patterns in COOKIE_ELEMENTS.items():
                if any(re.search(p, sent_text) for p in patterns):
                    if not element_sequence or element_sequence[-1] != element:
                        element_sequence.append(element)
        feats["ct_description_switches"] = max(0, len(element_sequence) - 1)

        main_elements = ["boy", "girl", "woman", "cookie", "water", "overflow", "stool", "falling"]
        peripheral = ["curtains", "cabinet", "outside", "apron", "window"]
        feats["ct_main_elements"] = sum(element_scores.get(e, 0) for e in main_elements)
        feats["ct_peripheral_elements"] = sum(element_scores.get(e, 0) for e in peripheral)

        return feats

    def _extract_general_linguistics(self, text: str, sentences: List[dict]) -> dict:
        text_low = text.lower()
        words = re.findall(r"\b\w+\b", text_low)
        total_words = len(words)

        if total_words == 0:
            return {
                "total_words": 0, "unique_words": 0, "lexical_diversity": 0.0,
                "brunet_index": 0.0, "repetitions": 0, "filler_count": 0,
                "filler_ratio": 0.0, "SpeechErr": 0, "NotRem": 0,
                "mean_word_length": 0.0, "sentence_count": 0,
                "words_per_sentence": 0.0, "words_per_minute": 0.0
            }

        unique_words = len(set(words))
        word_counts = Counter(words)

        lexical_diversity = round(unique_words / total_words, 4)
        brunet_index = round(total_words ** (unique_words ** -0.165), 4) if unique_words > 0 else 0.0
        repetitions = sum(c - 1 for c in word_counts.values() if c > 1)

        filler_count = sum(word_counts.get(f, 0) for f in FILLERS)
        filler_ratio = round(filler_count / total_words, 4)

        speech_err = 0
        for i in range(len(words) - 1):
            if words[i] == words[i + 1] and len(words[i]) <= 3:
                speech_err += 1
        speech_err += sum(1 for w in words if len(w) == 1 and w not in {"ا", "و", "ي", "a", "i"})

        not_rem_patterns = [
            r"نسيت", r"مش فاكر", r"مش متذكر", r"مانيش متذكر", r"نسيتها", r"مانتفكرش", r"غابت من بالي",
            r"je ne me rappelle pas", r"j'ai oublié", r"je sais pas"
        ]
        not_rem = sum(len(re.findall(p, text_low)) for p in not_rem_patterns)

        mean_word_length = round(sum(len(w) for w in words) / total_words, 4)
        sentence_count = len(sentences)
        words_per_sentence = round(total_words / sentence_count, 4) if sentence_count > 0 else 0.0

        total_audio_duration = sentences[-1]["end"] - sentences[0]["start"] if sentences else 0.0
        wpm = round((total_words / total_audio_duration) * 60, 2) if total_audio_duration > 0 else 0.0

        return {
            "total_words": total_words,
            "unique_words": unique_words,
            "lexical_diversity": lexical_diversity,
            "brunet_index": brunet_index,
            "repetitions": repetitions,
            "filler_count": filler_count,
            "filler_ratio": filler_ratio,
            "SpeechErr": speech_err,
            "NotRem": not_rem,
            "mean_word_length": mean_word_length,
            "sentence_count": sentence_count,
            "words_per_sentence": words_per_sentence,
            "words_per_minute": wpm,
        }

    async def extract_linguistic_features_from_audio(
        self,
        words: list,
        boundaries: list,
        sentence_chunk_target: int = 120,
    ) -> dict:
        if not words:
            return {
                "texte_original": "",
                "sentences": [],
                "tokens_pos": [],
                "aligned": True,
                "pos_counts": {},
                "cookie_theft": {},
                "general_linguistics": {},
            }

        # 1. Pause-based sentence alignment
        sentences = build_sentences(words, boundaries)
        words_with_punct = sentences_to_words_with_punct(sentences)

        # 2. Local XLM-R POS tagging
        tagging_result = await self.pos_tagging_service.tag_words(
            words_with_punct,
            sentence_chunk_target=sentence_chunk_target,
        )

        original_words = [w["text"].strip() for w in words]
        full_text = " ".join(original_words)

        # 3. Features extraction
        pos_counts = count_pos_tags(tagging_result["tokens_pos"])
        ct_features = self._extract_cookie_theft_features(full_text, sentences)
        gen_features = self._extract_general_linguistics(full_text, sentences)

        significant_pause_count = sum(
            1 for s in sentences if s.get("preceded_by") in ("hesitation_pause", "long_silence")
        )

        return {
            "texte_original": full_text,
            "sentences": sentences,
            "tokens_pos": tagging_result["tokens_pos"],
            "pos_counts": pos_counts,
            "cookie_theft": ct_features,
            "general_linguistics": gen_features,
            "aligned": tagging_result["aligned"],
            "significant_pause_count": significant_pause_count,
        }