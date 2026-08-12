import logging
import numpy as np

logger = logging.getLogger(__name__)

MIN_SEGMENT_DUR_FOR_STT = 0.3  # skip fragments too short to transcribe meaningfully
MIN_CLIP_DUR_TARGET = 5.0      # merge clips shorter than this with a neighbor when possible
MAX_MERGE_GAP = 2.0            # don't merge across gaps bigger than this (would pull in
                                # unrelated content or a real doctor turn)
BACKCHANNEL_MAX_DUR = 1.0      # doctor segment shorter than this, sandwiched between two
                                # patient segments, gets muted in-place and merged through
                                # rather than treated as a hard boundary


def merge_short_patient_clips(labeled_segments: list) -> list:
    """
    labeled_segments: from assign_roles() -- [{"start","end","role"}, ...],
                       time-ordered, full doctor+patient list.

    Merges short, closely-spaced patient segments into fewer, longer
    contiguous clips before STT. This gives Whisper more context per call,
    which directly reduces per-clip language misdetection (the cause of
    the occasional Hebrew-script output on isolated short clips).

    Unlike the earlier "build_patient_turns_with_pauses" approach (which
    tried to stitch DISTANT turns from across the whole recording into one
    file), this only merges NEARBY turns -- so the merged region is a
    genuinely CONTIGUOUS slice of the original audio, not a fabricated
    concatenation. Real gaps and any short doctor backchannel within the
    region are preserved as real audio; a backchannel is muted in place
    (short, sub-second silence -- not the multi-second blocks that
    destabilized Whisper before).

    Returns a list of clip regions:
        {"start": float, "end": float, "mute_ranges": [(start, end), ...]}
    "mute_ranges" are doctor-backchannel windows inside the region that
    must be zeroed out of the audio slice before sending it to STT.
    """
    segs = sorted(labeled_segments, key=lambda s: s["start"])
    n = len(segs)

    regions = []
    i = 0
    while i < n:
        if segs[i]["role"] != "patient":
            i += 1
            continue

        region_start = segs[i]["start"]
        region_end = segs[i]["end"]
        mute_ranges = []
        j = i + 1

        while j < n:
            nxt = segs[j]
            gap = nxt["start"] - region_end
            region_dur = region_end - region_start

            if gap > MAX_MERGE_GAP:
                break  # too far apart, stop extending this region

            if nxt["role"] == "doctor":
                is_backchannel = (nxt["end"] - nxt["start"]) < BACKCHANNEL_MAX_DUR
                has_patient_after = j + 1 < n and segs[j + 1]["role"] == "patient"
                if is_backchannel and has_patient_after and region_dur < MIN_CLIP_DUR_TARGET:
                    mute_ranges.append((nxt["start"], nxt["end"]))
                    region_end = segs[j + 1]["end"]
                    j += 2
                    continue
                else:
                    break  # real doctor turn, or region already long enough -- stop here
            else:  # patient
                if region_dur >= MIN_CLIP_DUR_TARGET:
                    break  # already long enough, don't keep merging unnecessarily
                region_end = nxt["end"]
                j += 1

        regions.append({"start": region_start, "end": region_end, "mute_ranges": mute_ranges})
        i = j

    return regions


def slice_patient_segments(audio: np.ndarray, sample_rate: int, labeled_segments: list) -> list:
    """
    labeled_segments: from assign_roles() -- [{"start","end","role"}, ...]
    Returns [{"audio": np.ndarray, "offset": float}, ...] -- merged,
    context-rich patient clips (short/nearby turns combined via
    merge_short_patient_clips), each a contiguous slice of the ORIGINAL
    audio with any short doctor backchannel muted in place. No long
    artificial silence blocks, no isolated single-word clips.
    """
    regions = merge_short_patient_clips(labeled_segments)
    n_samples = len(audio)

    clips = []
    for region in regions:
        if region["end"] - region["start"] < MIN_SEGMENT_DUR_FOR_STT:
            continue

        start_sample = max(0, int(region["start"] * sample_rate))
        end_sample = min(n_samples, int(region["end"] * sample_rate))
        if start_sample >= end_sample:
            continue

        clip_audio = audio[start_sample:end_sample].copy()

        for mute_start, mute_end in region["mute_ranges"]:
            m_start = max(0, int((mute_start - region["start"]) * sample_rate))
            m_end = min(len(clip_audio), int((mute_end - region["start"]) * sample_rate))
            if m_start < m_end:
                clip_audio[m_start:m_end] = 0.0

        clips.append({"audio": clip_audio, "offset": region["start"]})

    return clips


def transcribe_patient_segments(clips: list, transcribe_batch_fn, write_wav_fn, tmp_dir: str) -> dict:
    """
    clips: output of slice_patient_segments(), each with "sample_rate" added.
    transcribe_batch_fn: transcribe_audio_batch(paths) -> [{"text","chunks"}, ...]
                         (ONE call for all clips, not a loop -- fixes the
                         sequential-on-GPU slowdown).
    write_wav_fn: your existing wav-writing helper (audio, sample_rate, path).

    Writes every clip to disk, transcribes them all in a single batched
    pipeline call, then shifts each clip's word timestamps by its original
    offset so everything lands back on the same original timeline
    build_sentences() expects.
    """
    import os

    if not clips:
        return {"text": "", "chunks": []}

    clip_paths = []
    for i, clip in enumerate(clips):
        clip_path = os.path.join(tmp_dir, f"patient_clip_{i}.wav")
        write_wav_fn(clip["audio"], clip["sample_rate"], clip_path)
        clip_paths.append(clip_path)

    logger.info("Transcribing %d patient clips in a single batched call...", len(clip_paths))
    batch_results = transcribe_batch_fn(clip_paths)

    all_words = []
    all_text_parts = []

    for clip, result in zip(clips, batch_results):
        offset = clip["offset"]
        for w in result.get("chunks", []):
            start, end = w["timestamp"]
            if start is None or end is None:
                continue
            all_words.append({
                "text": w["text"],
                "timestamp": (round(start + offset, 3), round(end + offset, 3)),
            })
        if result.get("text"):
            all_text_parts.append(result["text"].strip())

    all_words.sort(key=lambda w: w["timestamp"][0])
    return {"text": " ".join(all_text_parts), "chunks": all_words}