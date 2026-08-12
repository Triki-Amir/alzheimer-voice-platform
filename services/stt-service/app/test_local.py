import sys
import os
import json
import time

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVICE_DIR = os.path.dirname(CURRENT_DIR)
sys.path.insert(0, SERVICE_DIR)
sys.path.insert(0, "/app")
from app.transcribe import transcribe_audio_batch
from app.transcribe import transcribe_audio
from app.stt_per_segment import slice_patient_segments, transcribe_patient_segments
from app.validate_word_timestamps import validate_word_timestamps

import soundfile as sf  # adjust if your codebase uses a different audio I/O lib


def main():
    if len(sys.argv) < 3:
        print("❌ Usage: python test_local.py <audio.wav> <labeled_segments.json>")
        print("   labeled_segments.json: output of assign_roles(), e.g.")
        print('   [{"start": 0.0, "end": 4.0, "role": "patient"}, ...]')
        sys.exit(1)

    audio_path = sys.argv[1]
    segments_path = sys.argv[2]

    if not os.path.exists(audio_path):
        print(f"❌ Fichier audio non trouvé : {audio_path}")
        sys.exit(1)
    if not os.path.exists(segments_path):
        print(f"❌ Fichier segments non trouvé : {segments_path}")
        sys.exit(1)

    with open(segments_path, "r", encoding="utf-8") as f:
        labeled_segments = json.load(f)

    print(f"🎙️ Chargement audio : {audio_path}")
    audio, sample_rate = sf.read(audio_path, dtype="float32")
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    print(f"   {len(audio) / sample_rate:.2f}s @ {sample_rate}Hz")

    clips = slice_patient_segments(audio, sample_rate, labeled_segments)
    for c in clips:
        c["sample_rate"] = sample_rate
    print(f"✂️  {len(clips)} patient clip(s) extracted (doctor segments excluded, "
          f"no artificial silence sent to Whisper)")

    tmp_dir = os.path.join(CURRENT_DIR, "_tmp_test_clips")
    os.makedirs(tmp_dir, exist_ok=True)

    def write_wav_fn(arr, sr, path):
        sf.write(path, arr, sr)

    print("\n⚡ Transcribing per-segment (this replaces one full-file transcription)...")
    start_time = time.time()
    result = transcribe_patient_segments(clips, transcribe_audio_batch, write_wav_fn, tmp_dir)
    elapsed_time = time.time() - start_time
    
    with open("stt_output.json", "w", encoding="utf-8") as f:
        json.dump(result["chunks"], f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 50)
    print("      RÉSULTAT DE LA TRANSCRIPTION (per-segment)")
    print("=" * 50)
    print(f"\n📝 Texte transcrit :\n{result['text']}\n")
    print(f"⏱️ Temps d'exécution total : {elapsed_time:.2f} secondes ({len(clips)} clip(s))")
    print("=" * 50)

    raw_words = result.get("chunks", [])
    print(f"\n📍 {len(raw_words)} mots (avant validation) :")
    for w in raw_words:
        start, end = w["timestamp"]
        dur = end - start if start is not None and end is not None else None
        flag = "  ⚠️" if dur is not None and dur > 3.0 else ""
        print(f"  [{start}s -> {end}s]{flag} {w['text']}")

    validated = validate_word_timestamps(raw_words)

    print("\n" + "=" * 50)
    print("      VALIDATION REPORT")
    print("=" * 50)
    print(f"Corrupted   : {validated['corrupted']}")
    print(f"Words kept  : {len(validated['words'])}/{len(raw_words)}")
    if validated["issues"]:
        print("Issues found:")
        for issue in validated["issues"]:
            print(f"  - {issue['type']}: {issue.get('word')} "
                  f"({issue.get('duration', issue.get('jumped_to', ''))})")
    else:
        print("✅ No timestamp artifacts detected -- per-segment approach looks clean on this file.")

    # quick before/after sanity: also report max single-word duration seen,
    # since that's the clearest signal of whether masking-related corruption
    # is actually gone
    durations = [
        (w["timestamp"][1] - w["timestamp"][0])
        for w in raw_words
        if w["timestamp"][0] is not None and w["timestamp"][1] is not None
    ]
    if durations:
        print(f"\nMax single-word duration: {max(durations):.2f}s "
              f"(anything > ~1-2s on real speech is suspicious)")


if __name__ == "__main__":
    main()