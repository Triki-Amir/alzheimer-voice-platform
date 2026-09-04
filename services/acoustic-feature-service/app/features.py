import logging
from typing import Optional

import librosa
import numpy as np

logger = logging.getLogger("acoustic_service.extract")

# Global Frame Configuration
FRAME_SEC = 5.0
OVERLAP_SEC = 2.5

# Optional Praat Integration Check
try:
    import parselmouth
    from parselmouth.praat import call
    PRAAT_AVAILABLE = True
except ImportError:
    PRAAT_AVAILABLE = False


def safe_float(val) -> float:
    """Safely cast numeric outputs to float, substituting NaN/Inf with 0.0."""
    try:
        val_float = float(val)
        return 0.0 if np.isnan(val_float) or np.isinf(val_float) else val_float
    except (TypeError, ValueError):
        return 0.0


def split_into_frames(
    y: np.ndarray,
    sr: int,
    frame_sec: float = FRAME_SEC,
    overlap_sec: float = OVERLAP_SEC,
) -> list[np.ndarray]:
    """Split audio signal into overlapping frames."""
    frame_samples = int(frame_sec * sr)
    hop_samples = int((frame_sec - overlap_sec) * sr)
    frames = []
    start = 0

    while start + frame_samples <= len(y):
        frames.append(y[start : start + frame_samples])
        start += hop_samples

    # Include remaining trailing partial frame if longer than 2 seconds
    if start < len(y) and (len(y) - start) > 2 * sr:
        frames.append(y[start:])

    return frames if frames else [y]


def frame_acoustic_features(y_frame: np.ndarray, sr: int) -> dict:
    """Extract per-frame spectral, prosodic, and timbral features."""
    feats = {}

    # ── MFCCs + Deltas ──
    mfccs = librosa.feature.mfcc(y=y_frame, sr=sr, n_mfcc=13)
    delta = librosa.feature.delta(mfccs)
    delta2 = librosa.feature.delta(mfccs, order=2)

    for i, v in enumerate(np.mean(mfccs, axis=1), 1):
        feats[f"mfcc{i}"] = safe_float(v)
    for i, v in enumerate(np.mean(delta, axis=1), 1):
        feats[f"mfcc_d{i}"] = safe_float(v)
    for i, v in enumerate(np.mean(delta2, axis=1), 1):
        feats[f"mfcc_d2_{i}"] = safe_float(v)

    # ── Spectral Features ──
    feats["spectral_centroid"] = safe_float(
        np.mean(librosa.feature.spectral_centroid(y=y_frame, sr=sr))
    )
    feats["spectral_bandwidth"] = safe_float(
        np.mean(librosa.feature.spectral_bandwidth(y=y_frame, sr=sr))
    )
    feats["spectral_rolloff"] = safe_float(
        np.mean(librosa.feature.spectral_rolloff(y=y_frame, sr=sr))
    )
    feats["spectral_flatness"] = safe_float(
        np.mean(librosa.feature.spectral_flatness(y=y_frame))
    )
    feats["spectral_contrast"] = safe_float(
        np.mean(librosa.feature.spectral_contrast(y=y_frame, sr=sr))
    )
    feats["zcr"] = safe_float(
        np.mean(librosa.feature.zero_crossing_rate(y=y_frame))
    )
    feats["rms_energy"] = safe_float(np.mean(librosa.feature.rms(y=y_frame)))
    feats["rms_std"] = safe_float(np.std(librosa.feature.rms(y=y_frame)))

    # ── Pitch Tracking (pYIN) ──
    try:
        f0, voiced_flag, _ = librosa.pyin(
            y_frame,
            sr=sr,
            fmin=librosa.note_to_hz("C2"),
            fmax=librosa.note_to_hz("C7"),
        )
        f0_voiced = (
            f0[voiced_flag] if voiced_flag is not None else np.array([])
        )
        feats["pitch_mean"] = safe_float(
            np.mean(f0_voiced) if len(f0_voiced) > 0 else 0.0
        )
        feats["pitch_std"] = safe_float(
            np.std(f0_voiced) if len(f0_voiced) > 0 else 0.0
        )
        feats["pitch_range"] = safe_float(
            np.ptp(f0_voiced) if len(f0_voiced) > 0 else 0.0
        )
        feats["voiced_ratio"] = safe_float(
            np.mean(voiced_flag) if voiced_flag is not None else 0.0
        )
    except Exception:
        feats["pitch_mean"] = feats["pitch_std"] = feats["pitch_range"] = (
            feats["voiced_ratio"]
        ) = 0.0

    # ── Energy & Pause Metrics ──
    frame_length = min(2048, len(y_frame) // 4)
    hop_length = max(1, frame_length // 4)

    if len(y_frame) >= frame_length * 2:
        frames_e = librosa.util.frame(
            y_frame, frame_length=frame_length, hop_length=hop_length
        )
        energy = np.sum(frames_e**2, axis=0)
        thresh = np.mean(energy) * 0.5
        is_speech = energy > thresh
        feats["speech_rate"] = safe_float(np.mean(is_speech))
        feats["pause_mean"] = safe_float(1.0 - np.mean(is_speech))
        feats["pause_count"] = float(
            np.sum(np.diff(is_speech.astype(int)) != 0)
        )
    else:
        feats["speech_rate"] = feats["pause_mean"] = 0.0
        feats["pause_count"] = 0.0

    return feats


def aggregate_frame_features(frame_feat_list: list[dict]) -> dict:
    """Compute summary statistics across all extracted frame dictionaries."""
    if not frame_feat_list:
        return {}

    keys = frame_feat_list[0].keys()
    agg = {}

    for key in keys:
        vals = np.array(
            [
                f[key]
                for f in frame_feat_list
                if isinstance(f.get(key), (int, float))
            ]
        )
        if len(vals) == 0:
            continue
        agg[f"{key}_mean"] = safe_float(np.mean(vals))
        agg[f"{key}_std"] = safe_float(np.std(vals))
        agg[f"{key}_min"] = safe_float(np.min(vals))
        agg[f"{key}_max"] = safe_float(np.max(vals))
        agg[f"{key}_median"] = safe_float(np.median(vals))
        agg[f"{key}_range"] = safe_float(np.max(vals) - np.min(vals))

    return agg


def extract_praat_features(y: np.ndarray, sr: int) -> dict:
    """Extract clinical-grade Praat features directly from a NumPy array in memory."""
    feats = {
        "praat_pitch_mean": 0.0,
        "praat_pitch_std": 0.0,
        "praat_jitter_local": 0.0,
        "praat_jitter_rap": 0.0,
        "praat_shimmer_local": 0.0,
        "praat_shimmer_apq3": 0.0,
        "praat_hnr": 0.0,
        "praat_f1": 0.0,
        "praat_f2": 0.0,
        "praat_voiced_fraction": 0.0,
    }

    if not PRAAT_AVAILABLE or len(y) == 0:
        return feats

    try:
        # Load directly from NumPy array into memory (values must be float64 or float32)
        sound = parselmouth.Sound(y.astype(np.float64), sampling_frequency=float(sr))

        # Pitch statistics
        pitch = call(sound, "To Pitch", 0.0, 75, 600)
        feats["praat_pitch_mean"] = safe_float(
            call(pitch, "Get mean", 0, 0, "Hertz")
        )
        feats["praat_pitch_std"] = safe_float(
            call(pitch, "Get standard deviation", 0, 0, "Hertz")
        )

        # Voiced fraction calculation
        total_dur = sound.duration
        voiced_dur = safe_float(
            call(pitch, "Get total duration of voiced frames")
        )
        feats["praat_voiced_fraction"] = (
            voiced_dur / total_dur if total_dur > 0 else 0.0
        )

        # PointProcess for jitter and shimmer analysis
        pp = call(sound, "To PointProcess (periodic, cc)", 75, 600)
        feats["praat_jitter_local"] = safe_float(
            call(pp, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)
        )
        feats["praat_jitter_rap"] = safe_float(
            call(pp, "Get jitter (rap)", 0, 0, 0.0001, 0.02, 1.3)
        )
        feats["praat_shimmer_local"] = safe_float(
            call(
                [sound, pp],
                "Get shimmer (local)",
                0,
                0,
                0.0001,
                0.02,
                1.3,
                1.6,
            )
        )
        feats["praat_shimmer_apq3"] = safe_float(
            call(
                [sound, pp], "Get shimmer (apq3)", 0, 0, 0.0001, 0.02, 1.3, 1.6
            )
        )

        # Harmonicity (HNR)
        harmonicity = call(sound, "To Harmonicity (cc)", 0.01, 75, 0.1, 1.0)
        feats["praat_hnr"] = safe_float(call(harmonicity, "Get mean", 0, 0))

        # Formant F1/F2 frequencies
        formants = call(sound, "To Formant (burg)", 0.0, 5, 5500, 0.025, 50)
        feats["praat_f1"] = safe_float(
            call(formants, "Get mean", 1, 0, 0, "Hertz")
        )
        feats["praat_f2"] = safe_float(
            call(formants, "Get mean", 2, 0, 0, "Hertz")
        )

    except Exception:
        logger.exception("Praat extraction failed")

    return feats


def extract_acoustic_features(y: np.ndarray, sr: int) -> dict:
    """Primary pipeline interface to extract frame-aggregated and Praat acoustic features."""
    if y.ndim > 1:
        y = y.mean(axis=1)
    y = y.astype(np.float32)

    features = {}

    # 1. Frame-based signal feature extraction
    try:
        frames = split_into_frames(y, sr)
        frame_feats = [frame_acoustic_features(f, sr) for f in frames]
        aggregated_feats = aggregate_frame_features(frame_feats)
        features.update(aggregated_feats)
    except Exception:
        logger.exception("Frame feature extraction failed")
        raise

    # 2. Praat in-memory feature extraction (No disk read/write)
    try:
        praat_feats = extract_praat_features(y, sr)
        features.update(praat_feats)
    except Exception:
        logger.exception("Praat feature extraction failed")

    features["duration_sec"] = float(len(y) / sr)
    return features