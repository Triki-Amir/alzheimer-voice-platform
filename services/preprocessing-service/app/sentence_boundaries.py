import logging
import statistics

logger = logging.getLogger(__name__)

PHRASE_BOUNDARY_MAX_S_DEFAULT = 0.3
SENTENCE_BOUNDARY_MAX_S_DEFAULT = 2.0
MIN_GAPS_FOR_ADAPTIVE = 8


def _adaptive_thresholds(gaps: list) -> tuple:
    if len(gaps) < MIN_GAPS_FOR_ADAPTIVE:
        return PHRASE_BOUNDARY_MAX_S_DEFAULT, SENTENCE_BOUNDARY_MAX_S_DEFAULT
    sorted_gaps = sorted(gaps)
    phrase_max = max(statistics.quantiles(sorted_gaps, n=5)[1], 0.15)
    sentence_max = max(statistics.quantiles(sorted_gaps, n=20)[16], phrase_max + 0.3)
    return phrase_max, sentence_max


def _doctor_time_within(gap_start: float, gap_end: float, labeled_segments: list) -> float:
    if not labeled_segments:
        return 0.0
    total = 0.0
    for seg in labeled_segments:
        if seg["role"] != "doctor":
            continue
        overlap_start = max(gap_start, seg["start"])
        overlap_end = min(gap_end, seg["end"])
        if overlap_start < overlap_end:
            total += overlap_end - overlap_start
    return total


def detect_sentence_boundaries(vad_segments: list, labeled_segments: list = None) -> list:
    """
    vad_segments: PATIENT speech intervals detected by VAD on masked_full.wav.
    labeled_segments: full doctor+patient diarization list (from assign_roles).
                       Used to subtract real doctor speaking time from each
                       gap before classifying it -- without this, a doctor's
                       real question gets misclassified as a huge patient
                       "long_silence"/"hesitation_pause", same bug that was
                       just fixed in metrics.py.

    Returns boundaries classified into four types, based on the PATIENT-
    attributable portion of each gap (doctor speaking time subtracted out):
      - phrase_boundary   : short breath/comma-level gap
      - sentence_boundary : likely sentence end
      - hesitation_pause  : probable word-finding difficulty (kept, not dropped)
      - long_silence      : likely task-level break (kept, not dropped)

    Boundaries where the ENTIRE gap is explained by a real doctor turn
    (patient-attributable remainder ~0) are dropped -- there's no patient
    pause there at all, just conversational turn-taking.
    """
    if len(vad_segments) < 2:
        return []

    raw_gaps = []
    for left, right in zip(vad_segments, vad_segments[1:]):
        gap = right["start"] - left["end"]
        if gap < 0:
            continue
        doctor_dur = _doctor_time_within(left["end"], right["start"], labeled_segments)
        remainder = max(0.0, gap - doctor_dur)
        raw_gaps.append({
            "start": left["end"],
            "end": right["start"],
            "raw_duration": gap,
            "patient_duration": remainder,
        })

    patient_durations = [g["patient_duration"] for g in raw_gaps if g["patient_duration"] > 0.01]
    phrase_max, sentence_max = _adaptive_thresholds(patient_durations)
    hesitation_cap = sentence_max * 3

    boundaries = []
    for g in raw_gaps:
        dur = g["patient_duration"]
        if dur <= 0.01:
            continue  # entire gap was a real doctor turn, no patient pause here

        if dur <= phrase_max:
            boundary_type = "phrase_boundary"
        elif dur <= sentence_max:
            boundary_type = "sentence_boundary"
        elif dur <= hesitation_cap:
            boundary_type = "hesitation_pause"
        else:
            boundary_type = "long_silence"

        boundaries.append({
            "start": round(g["start"], 3),
            "end": round(g["end"], 3),
            "duration": round(dur, 3),
            "raw_duration": round(g["raw_duration"], 3),
            "type": boundary_type,
        })

    counts = {}
    for b in boundaries:
        counts[b["type"]] = counts.get(b["type"], 0) + 1
    logger.info(
        "Frontieres detectees: %d sur %d segments VAD (phrase_max=%.2fs, sentence_max=%.2fs) -- %s",
        len(boundaries), len(vad_segments), phrase_max, sentence_max, counts,
    )
    return boundaries


if __name__ == "__main__":
    vad_segments = [
        {"start": 0.0, "end": 4.0},
        {"start": 7.5, "end": 10.0},   # gap 3.5s = 3.0s real doctor turn + 0.5s real hesitation
        {"start": 10.3, "end": 13.0},  # gap 0.3s = phrase boundary, no doctor
    ]
    labeled_segments = [
        {"start": 4.0, "end": 7.0, "role": "doctor"},
    ]

    without_exclusion = detect_sentence_boundaries(vad_segments)
    with_exclusion = detect_sentence_boundaries(vad_segments, labeled_segments)

    print("WITHOUT doctor exclusion:")
    for b in without_exclusion:
        print(" ", b)
    print("WITH doctor exclusion:")
    for b in with_exclusion:
        print(" ", b)