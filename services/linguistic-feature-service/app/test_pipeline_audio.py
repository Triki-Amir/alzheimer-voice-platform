#!/usr/bin/env python3
"""
test_pipeline_audio.py

Standalone test of the NEW pause-based pipeline (no LLM punctuation),
using real STT word output + real sentence_boundaries.py output.

Usage:
    docker exec -it -w /app <linguistic_container> python -m app.test_pipeline_audio \
        --stt-json /path/to/stt_chunks.json \
        --boundaries-json /path/to/sentence_boundaries.json
"""
import argparse
import asyncio
import json
import logging
import sys

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def _print_header(title: str) -> None:
    print("\n" + "=" * 70)
    print(title)
    print("=" * 70)


async def run_test(words: list, boundaries: list, show_all: bool):
    try:
        from app.features import LinguisticFeatureExtractor
    except ModuleNotFoundError as e:
        logger.error("Run as: docker exec -it -w /app <container> python -m app.test_pipeline_audio ... | %s", e)
        sys.exit(1)

    import os
    extractor = LinguisticFeatureExtractor(
        pos_model_path=os.getenv("POS_MODEL_PATH"),
    )

    _print_header("INPUT")
    print(f"Words     : {len(words)}")
    print(f"Boundaries: {len(boundaries)}  ({', '.join(sorted(set(b['type'] for b in boundaries)))})")

    result = await extractor.extract_linguistic_features_from_audio(words, boundaries)

    _print_header("SENTENCES")
    for i, s in enumerate(result["sentences"]):
        text = " ".join(w["text"] for w in s["words"])
        pause_note = f" [after {s['preceded_by']}, {s['preceding_pause_dur']:.2f}s]" if s["preceded_by"] else ""
        print(f"  [{i}] ({s['start']:.2f}-{s['end']:.2f}s){pause_note} {text}")

    _print_header("WORD INTEGRITY CHECK")
    original_words = [w["text"].strip() for w in words]
    final_words = [t["mot"] for t in result.get("tokens_pos", [])]
    if original_words == final_words:
        print(f"✅ PASSED — {len(original_words)} words, identical content and order.")
    else:
        print("❌ FAILED — words differ from STT input!")
        min_len = min(len(original_words), len(final_words))
        diff = next((i for i in range(min_len) if original_words[i] != final_words[i]), None)
        if diff is not None:
            print(f"   First mismatch at index {diff}: expected {original_words[diff]!r}, got {final_words[diff]!r}")
        if len(original_words) != len(final_words):
            print(f"   Length mismatch: original={len(original_words)}, final={len(final_words)}")

    untagged = [t for t in result.get("tokens_pos", []) if t["pos"] is None]
    if untagged:
        print(f"⚠️  {len(untagged)} word(s) UNTAGGED:")
        for t in untagged[:20]:
            print(f"   - {t['mot']}")
    else:
        print("✅ No untagged words.")

    _print_header("POS TAGS")
    display = result["tokens_pos"] if show_all else result["tokens_pos"][:40]
    for i, tok in enumerate(display):
        marker = "⚠️  UNTAGGED" if tok["pos"] is None else ""
        print(f"  [{i:>4}] {tok['mot']:<20} -> {tok['pos'] or '???':<12} {marker}")
    if not show_all and len(result["tokens_pos"]) > 40:
        print(f"  ... ({len(result['tokens_pos']) - 40} more not shown, use --show-all)")

    _print_header("CLINICAL SUMMARY")
    print(f"Total sentences         : {len(result['sentences'])}")
    print(f"Significant pause count : {result['significant_pause_count']}")
    pause_types = {}
    for s in result["sentences"]:
        if s["preceded_by"]:
            pause_types[s["preceded_by"]] = pause_types.get(s["preceded_by"], 0) + 1
    for k, v in pause_types.items():
        print(f"  - {k}: {v}")

    _print_header("SUMMARY")
    ok = result.get("aligned") and not result.get("error") and original_words == final_words
    print("✅ PIPELINE OK" if ok else "❌ PIPELINE HAD ISSUES — see above")
    return 0 if ok else 1


def main():
    parser = argparse.ArgumentParser(description="Standalone test for the audio-based linguistic pipeline.")
    parser.add_argument("--stt-json", required=True, help="Path to JSON: STT chunks, [{'text','timestamp':[s,e]}, ...]")
    parser.add_argument("--boundaries-json", required=True, help="Path to JSON: sentence_boundaries.py output")
    parser.add_argument("--show-all", action="store_true")
    args = parser.parse_args()

    with open(args.stt_json, "r", encoding="utf-8") as f:
        raw_words = json.load(f)
    # normalize timestamp format if it was serialized as a list instead of a tuple
    words = [{"text": w["text"], "timestamp": tuple(w["timestamp"])} for w in raw_words]

    with open(args.boundaries_json, "r", encoding="utf-8") as f:
        boundaries_raw = json.load(f)
    # tolerate being handed either the boundaries list directly, or the
    # full preprocessing_metrics.json dict with boundaries nested inside
    if isinstance(boundaries_raw, dict):
        boundaries = boundaries_raw.get("sentence_boundaries", [])
    else:
        boundaries = boundaries_raw

    exit_code = asyncio.run(run_test(words, boundaries, args.show_all))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()