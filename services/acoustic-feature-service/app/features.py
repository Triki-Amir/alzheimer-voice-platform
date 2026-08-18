import logging

import librosa
import numpy as np
import opensmile

logger = logging.getLogger("acoustic_service.extract")

# Loaded once per worker process, not per task.
_SMILE = opensmile.Smile(
    feature_set=opensmile.FeatureSet.eGeMAPSv02,
    feature_level=opensmile.FeatureLevel.Functionals,
)


def extract_egemaps(y: np.ndarray, sr: int) -> dict:
    """
    88 functionals: F0/pitch stats, jitter, shimmer, formants 1-3,
    loudness, HNR, alpha ratio, Hammarberg index, spectral slope,
    MFCC 1-4, spectral flux.
    """
    signal = y if y.ndim == 2 else y.reshape(1, -1)
    df = _SMILE.process_signal(signal, sr)
    row = df.iloc[0]
    return {f"egemaps_{col}": float(row[col]) for col in df.columns}


def extract_mfcc_features(y: np.ndarray, sr: int, n_mfcc: int = 13) -> dict:
    """
    Trimmed MFCC block: mean + std only per coefficient (26 features total).
    Not the old mean/std/min/max/median/range x delta x delta-delta (234
    features) -- eGeMAPS already contributes MFCC 1-4 and spectral
    slope/Hammarberg/alpha-ratio, and delta/delta-delta mostly encode
    temporal dynamics that overlap with your VAD-based timing features.
    """
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc)
    mfcc_mean = np.mean(mfccs, axis=1)
    mfcc_std = np.std(mfccs, axis=1)

    features = {}
    for i, v in enumerate(mfcc_mean, 1):
        features[f"mfcc{i}_mean"] = float(v)
    for i, v in enumerate(mfcc_std, 1):
        features[f"mfcc{i}_std"] = float(v)
    return features


def extract_acoustic_features(y: np.ndarray, sr: int) -> dict:
    if y.ndim > 1:
        y = y.mean(axis=1)
    y = y.astype(np.float32)

    features = {}

    try:
        features.update(extract_egemaps(y, sr))
    except Exception:
        logger.exception("eGeMAPS extraction failed")
        raise

    try:
        features.update(extract_mfcc_features(y, sr))
    except Exception:
        logger.exception("MFCC extraction failed")
        raise

    features["duration_sec"] = float(len(y) / sr)
    return features