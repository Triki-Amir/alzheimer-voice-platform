import logging

logger = logging.getLogger(__name__)

MAX_IDENTICAL_TIMESTAMP_RUN = 4  # more than this many consecutive words at the
                                  # exact same (start, end) is almost certainly
                                  # a repetition hallucination, not real speech


def validate_word_timestamps(words: list[dict]) -> dict:
    """
    words: list of {"text": str, "timestamp": (start, end)} from transcribe_audio.

    Detects the two Whisper hallucination symptoms seen in practice:
      1. A run of consecutive words sharing the exact same zero/near-zero
         duration timestamp (decoder stuck in a repetition loop).
      2. A timestamp that goes backward relative to the previous word
         (tracking collapsed after a hallucination loop).

    Returns a dict with the cleaned word list (corrupted run removed) and
    flags so the caller can log/alert rather than silently trust the output.
    Does NOT attempt to recover the corrupted words -- that segment should
    be treated as missing, not guessed at, for a clinical pipeline.
    """
    if not words:
        return {"words": [], "corrupted": False, "issues": []}

    cleaned = []
    issues = []
    run_start_idx = None
    prev_end = -1.0

    i = 0
    n = len(words)
    while i < n:
        start, end = words[i]["timestamp"]

        # backward jump: timestamps must be non-decreasing
        if start < prev_end - 0.05:  # small tolerance for float rounding
            issues.append({
                "type": "backward_timestamp",
                "index": i,
                "word": words[i]["text"],
                "prev_end": prev_end,
                "jumped_to": start,
            })
            # drop everything from here to the point where timestamps
            # recover to a sane, forward-moving value
            j = i
            while j < n and words[j]["timestamp"][0] < prev_end - 0.05:
                j += 1
            logger.warning(
                "Backward timestamp jump at word %d ('%s'): %.2fs -> %.2fs. "
                "Dropping %d words as corrupted.",
                i, words[i]["text"], prev_end, start, j - i,
            )
            i = j
            continue

        # repetition run: many consecutive words at an identical timestamp
        if abs(end - start) < 0.01:
            run_start_idx = i if run_start_idx is None else run_start_idx
        else:
            if run_start_idx is not None and i - run_start_idx > MAX_IDENTICAL_TIMESTAMP_RUN:
                issues.append({
                    "type": "repetition_loop",
                    "start_index": run_start_idx,
                    "end_index": i,
                    "words": [w["text"] for w in words[run_start_idx:i]],
                })
                logger.warning(
                    "Repetition hallucination detected: %d words at identical "
                    "timestamp near %.2fs, dropped: %s",
                    i - run_start_idx, prev_end,
                    " ".join(w["text"] for w in words[run_start_idx:i]),
                )
                # remove the run from cleaned (it was appended before detection)
                del cleaned[len(cleaned) - (i - run_start_idx):]
            run_start_idx = None

        cleaned.append(words[i])
        prev_end = max(prev_end, end)
        i += 1

    return {
        "words": cleaned,
        "corrupted": len(issues) > 0,
        "issues": issues,
    }


if __name__ == "__main__":
    # mimics the exact pattern seen in the real transcript
    toy_words = (
        [{"text": "فهمت", "timestamp": (49.5, 49.8)}]
        + [{"text": w, "timestamp": (49.98, 49.98)} for w in ["ويحطوه", "فيه"] * 20]
        + [{"text": "ويحطوه", "timestamp": (49.98, 40.38)}]  # backward jump
        + [{"text": "لل", "timestamp": (40.38, 40.52)}]
        + [{"text": "les", "timestamp": (40.52, 40.82)}]
    )
    result = validate_word_timestamps(toy_words)
    print(f"corrupted={result['corrupted']}")
    for issue in result["issues"]:
        print(issue["type"], issue.get("index", issue.get("start_index")))
    print(f"words kept: {len(result['words'])} / {len(toy_words)}")