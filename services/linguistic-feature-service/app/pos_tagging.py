# pos_tagging.py
"""
ÉTAPE 2 : Étiquetage POS par mot avec le modèle XLM-R fine-tuné localement.

Remplace l'ancienne version basée sur vLLM/Qwen (LLM distant, guided_json)
par une inférence locale directe avec le modèle entraîné dans
annotation_tunisian_training/xlmr-tunisian-pos-final. Plus aucune
dépendance à un serveur LLM externe -- pas de connexion réseau, pas
d'OOM partagé avec vLLM, latence bien plus faible.
"""
import logging
import os
from typing import Any, Dict, List

import torch
from transformers import AutoModelForTokenClassification, AutoTokenizer

logger = logging.getLogger(__name__)

DEFAULT_MODEL_PATH = os.getenv(
    "POS_MODEL_PATH",
    "/models/xlmr-tunisian-pos-final",  # adjust to wherever it's mounted in the container
)

# XLM-R base/large models are typically trained with a 512-token limit.
# Read the real value from the model config at load time instead of
# hardcoding, but keep this as a sane fallback.
DEFAULT_MAX_LENGTH = 512
SAFETY_MARGIN_TOKENS = 20  # room for [CLS]/[SEP] special tokens


def chunk_words_fixed(words: List[str], max_words: int) -> List[List[str]]:
    """Fixed-size fallback chunking -- used only if a sentence-based chunk
    still exceeds the model's max sequence length in subword tokens."""
    if not words:
        return []
    return [words[i:i + max_words] for i in range(0, len(words), max_words)]


def chunk_by_sentence(words_with_punct: List[str], target_words: int = 120) -> List[List[str]]:
    """Splits a punctuated word list into chunks, only cutting right after
    a '.' so a sentence is never split across chunks."""
    if not words_with_punct:
        return []

    chunks: List[List[str]] = []
    current: List[str] = []

    for token in words_with_punct:
        current.append(token)
        if token == "." and len(current) >= target_words:
            chunks.append(current)
            current = []

    if current:
        chunks.append(current)

    return chunks


class POSTaggingService:
    """Local XLM-R inference for word-level POS tagging. No network calls."""

    def __init__(self, model_path: str = None, device: str = None):
        self.model_path = model_path or DEFAULT_MODEL_PATH
        self.device = device or ("cuda:0" if torch.cuda.is_available() else "cpu")

        logger.info("Loading fine-tuned POS model from %s onto %s", self.model_path, self.device)
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_path, use_fast=True)
        self.model = AutoModelForTokenClassification.from_pretrained(self.model_path)
        self.model.to(self.device)
        self.model.eval()

        self.id2label: Dict[int, str] = self.model.config.id2label
        logger.info("Loaded POS model with %d labels: %s", len(self.id2label), list(self.id2label.values()))

        self.max_length = getattr(self.model.config, "max_position_embeddings", DEFAULT_MAX_LENGTH)
        # rough words-per-chunk budget: assume ~1.5-2 subword tokens per
        # word for Tunisian/code-switched text as a conservative estimate
        self.max_words_per_chunk = max(20, (self.max_length - SAFETY_MARGIN_TOKENS) // 2)

    def _tag_chunk_sync(self, words: List[str]) -> Dict[str, Any]:
        """Synchronous inference on one chunk of words -- run off the event
        loop via asyncio.to_thread in tag_words()."""
        if not words:
            return {"tokens_pos": [], "aligned": True}

        encoding = self.tokenizer(
            words,
            is_split_into_words=True,
            return_tensors="pt",
            truncation=True,
            max_length=self.max_length,
        )
        word_ids = encoding.word_ids(batch_index=0)

        input_ids = encoding["input_ids"].to(self.device)
        attention_mask = encoding["attention_mask"].to(self.device)

        with torch.no_grad():
            outputs = self.model(input_ids=input_ids, attention_mask=attention_mask)
            logits = outputs.logits[0]  # (seq_len, num_classes)
            probs = torch.softmax(logits, dim=-1)
            predictions = torch.argmax(logits, dim=-1).tolist()

        # take the FIRST subtoken's prediction for each original word
        # (same convention verified working in the standalone test script)
        word_predictions: Dict[int, dict] = {}
        for token_idx, word_idx in enumerate(word_ids):
            if word_idx is None:
                continue  # special token ([CLS], [SEP], padding)
            if word_idx not in word_predictions:
                pred_id = predictions[token_idx]
                word_predictions[word_idx] = {
                    "pred_id": pred_id,
                    "confidence": probs[token_idx][pred_id].item(),
                }

        tokens_pos = []
        truncated_word_count = max(word_predictions.keys(), default=-1) + 1
        for i, w in enumerate(words):
            if i in word_predictions:
                label = self.id2label[word_predictions[i]["pred_id"]]
                confidence = round(word_predictions[i]["confidence"], 4)
                tokens_pos.append({"mot": w, "pos": label, "confidence": confidence})
            else:
                tokens_pos.append({"mot": w, "pos": None, "confidence": None})  # dropped by truncation

        aligned = truncated_word_count >= len(words)
        if not aligned:
            logger.warning(
                "Chunk truncated: %d/%d words got a tag (max_length=%d tokens)",
                truncated_word_count, len(words), self.max_length,
            )

        return {"tokens_pos": tokens_pos, "aligned": aligned}

    async def tag_words(
        self,
        words_with_punct: List[str],
        sentence_chunk_target: int = 120,
    ) -> Dict[str, Any]:
        """
        Same public interface as the old vLLM-based version, so features.py
        doesn't need to change how it calls this. Internals are now fully
        local -- no network calls, no LLM server dependency.
        """
        import asyncio

        if not words_with_punct:
            return {"tokens_pos": [], "aligned": True}

        chunks = chunk_by_sentence(words_with_punct, target_words=sentence_chunk_target)

        safe_chunks: List[List[str]] = []
        for c in chunks:
            words_only_len = len([t for t in c if t != "."])
            if words_only_len > self.max_words_per_chunk:
                logger.warning(
                    "Sentence-based chunk has %d words, exceeds max_words_per_chunk=%d. Sub-splitting.",
                    words_only_len, self.max_words_per_chunk,
                )
                safe_chunks.extend(chunk_words_fixed(c, self.max_words_per_chunk))
            else:
                safe_chunks.append(c)

        if len(safe_chunks) > 1:
            total_words = sum(len([t for t in c if t != "."]) for c in safe_chunks)
            logger.info(
                "Text has %d words. Split into %d sentence-aware chunks (target ~%d words/chunk).",
                total_words, len(safe_chunks), sentence_chunk_target,
            )

        all_tokens_pos: List[Dict[str, Any]] = []
        all_aligned = True

        for chunk_tokens in safe_chunks:
            chunk_words_only = [t for t in chunk_tokens if t != "."]
            if not chunk_words_only:
                continue

            result = await asyncio.to_thread(self._tag_chunk_sync, chunk_words_only)
            all_tokens_pos.extend(result["tokens_pos"])
            if not result.get("aligned", False):
                all_aligned = False

        return {"tokens_pos": all_tokens_pos, "aligned": all_aligned}