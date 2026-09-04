#sentence_alignement.py
"""
Merges two independently-produced but same-timeline outputs into one
structure ready for POS tagging and feature extraction:

  - words:      from stt-service, transcribe_audio()["chunks"]
                 -> [{"text": str, "timestamp": (start, end)}, ...]
  - boundaries: from preprocessing-service, detect_sentence_boundaries()
                 -> [{"start", "end", "duration", "type"}, ...]

Both are already on the same patient.wav timeline (confirmed earlier in
this conversation), so no time-offset reconciliation is needed here --
just interleaving by timestamp.
"""

import logging

logger = logging.getLogger(__name__)

# boundary types that end a sentence / utterance chunk. "phrase_boundary"
# (short breath/comma-level gaps) does NOT split -- those stay inside
# the same sentence.
SPLIT_TYPES = {"sentence_boundary", "hesitation_pause", "long_silence"}


def build_sentences(words: list, boundaries: list) -> list:
    """
    Returns a time-ordered list of sentence dicts:
        {
            "words": [{"text": str, "start": float, "end": float}, ...],
            "start": float,           # first word's start
            "end": float,             # last word's end
            "preceded_by": str | None,  # boundary type before this sentence
                                         # (None for the very first sentence)
            "preceding_pause_dur": float,  # 0.0 for the first sentence
        }

    Words are assigned to a sentence based on which side of each
    SPLIT_TYPES boundary they fall on. A boundary's own (start, end) window
    IS the gap itself -- any word starting at or after boundary["end"]
    belongs to the next sentence.
    """
    if not words:
        return []

    # only boundaries that actually split get used for chunking
    split_boundaries = sorted(
        (b for b in boundaries if b["type"] in SPLIT_TYPES),
        key=lambda b: b["start"],
    )

    sentences = []
    current_words = []
    current_pause_type = None
    current_pause_dur = 0.0
    split_idx = 0
    n_splits = len(split_boundaries)

    for w in words:
        w_start, w_end = w["timestamp"]
        if w_start is None or w_end is None:
            logger.warning("Skipping word with missing timestamp: %r", w.get("text"))
            continue

        # advance past any split boundary that ends before this word starts
        while split_idx < n_splits and split_boundaries[split_idx]["end"] <= w_start:
            if current_words:
                sentences.append(_finalize(current_words, current_pause_type, current_pause_dur))
                current_words = []
            current_pause_type = split_boundaries[split_idx]["type"]
            current_pause_dur = split_boundaries[split_idx]["duration"]
            split_idx += 1

        current_words.append({"text": w["text"].strip(), "start": w_start, "end": w_end})

    if current_words:
        sentences.append(_finalize(current_words, current_pause_type, current_pause_dur))

    logger.info("build_sentences: %d words -> %d sentence chunks", len(words), len(sentences))
    return sentences


def _finalize(words, pause_type, pause_dur):
    return {
        "words": words,
        "start": words[0]["start"],
        "end": words[-1]["end"],
        "preceded_by": pause_type,
        "preceding_pause_dur": pause_dur,
    }


def sentences_to_words_with_punct(sentences: list) -> list:
    """
    sentences: output of build_sentences() -- list of
               {"words": [{"text","start","end"}, ...], "preceded_by", "preceding_pause_dur", ...}

    Returns a flat list matching the shape pos_tagging_service.tag_words()
    already expects (same shape punctuation_service.punctuate() used to
    produce): every word's text, in order, with a literal "." inserted
    after the last word of each sentence. No text is rewritten -- this is
    a pure reformatting step, same guarantee the old LLM punctuation step
    was supposed to uphold, just structurally impossible to violate here
    since we're not generating anything, only relabeling boundaries we
    already computed from real pauses.
    """
    words_with_punct = []
    for sentence in sentences:
        for w in sentence["words"]:
            words_with_punct.append(w["text"])
        words_with_punct.append(".")
    return words_with_punct


if __name__ == "__main__":
    # toy example combining the two real formats seen in this conversation
    toy_words = [
        {"text": "لا", "timestamp": (2.04, 2.36)},
        {"text": "لا", "timestamp": (2.36, 2.72)},
        {"text": "لا", "timestamp": (2.72, 2.86)},
        {"text": "هو", "timestamp": (2.86, 2.96)},
        {"text": "بيدو", "timestamp": (2.96, 3.24)},
        {"text": "فهمت", "timestamp": (49.48, 49.78)},
        {"text": "سير", "timestamp": (53.28, 53.5)},
        {"text": "معناها", "timestamp": (53.5, 53.88)},
    ]
    toy_boundaries = [
        {"start": 3.24, "end": 3.9, "duration": 0.66, "type": "sentence_boundary"},
        {"start": 49.78, "end": 53.28, "duration": 3.5, "type": "long_silence"},
    ]

    print("=== build_sentences() demo ===")
    sentences = build_sentences(toy_words, toy_boundaries)
    for s in sentences:
        text = " ".join(w["text"] for w in s["words"])
        print(f"[{s['start']:.2f}-{s['end']:.2f}] (after={s['preceded_by']}, "
              f"pause={s['preceding_pause_dur']:.2f}s) {text}")

    print("\n=== sentences_to_words_with_punct() demo ===")
    result = sentences_to_words_with_punct(sentences)
    print(result)

    # integrity check, same spirit as test_pipeline.py's check
    original_words = [w["text"] for s in sentences for w in s["words"]]
    reconstructed = [w for w in result if w != "."]
    assert original_words == reconstructed, "word content/order must be untouched"
    print("\n✅ word integrity check passed")