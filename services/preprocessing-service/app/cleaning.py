#cleaning.py
import logging
import noisereduce as nr
import soundfile as sf
import numpy as np
import webrtcvad
from scipy.signal import resample_poly
from pydub import AudioSegment
from pydub.effects import normalize as pydub_normalize

logger = logging.getLogger(__name__)

VAD_SUPPORTED_RATES = (8000, 16000, 32000, 48000)
TARGET_SR = 16000  # standardise tous les fichiers sur ce taux pour un traitement cohérent


def _rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x)))) if x.size else 0.0


def _estimate_snr(clean: np.ndarray, noisy: np.ndarray) -> float:
    """
    Estimation grossière du SNR (dB) : proxy relatif pour comparer des
    configurations entre elles, pas une mesure perceptuelle validée.
    """
    noise = noisy - clean
    signal_power = np.mean(np.square(clean)) + 1e-12
    noise_power = np.mean(np.square(noise)) + 1e-12
    return float(10 * np.log10(signal_power / noise_power))


def _ensure_mono(audio: np.ndarray) -> np.ndarray:
    return np.mean(audio, axis=1) if audio.ndim > 1 else audio


def _resample_to_target(audio: np.ndarray, sr: int, target_sr: int = TARGET_SR) -> tuple[np.ndarray, int]:
    """
    Standardise le taux d'échantillonnage. Nécessaire car le VAD WebRTC
    n'accepte que 8/16/32/48kHz, et une base commune rend le comportement
    du pipeline cohérent d'un enregistrement à l'autre.
    """
    if sr == target_sr:
        return audio, sr
    gcd = np.gcd(sr, target_sr)
    up, down = target_sr // gcd, sr // gcd
    resampled = resample_poly(audio, up, down)
    return resampled.astype(np.float32), target_sr


def _detect_noise_sample_vad(
    audio: np.ndarray,
    sr: int,
    max_seconds: float = 2.0,
    vad_aggressiveness: int = 2,
) -> np.ndarray | None:
    """
    Détecte des segments non-vocaux via un VAD plutôt qu'un seuil
    d'énergie fixe. Le VAD identifie la parole elle-même (peu importe son
    volume), donc ça généralise correctement entre un enregistrement
    calme et un enregistrement bruyant, contrairement à un pourcentage
    d'énergie codé en dur.
    """
    if sr not in VAD_SUPPORTED_RATES:
        return None

    vad = webrtcvad.Vad(vad_aggressiveness)
    frame_ms = 30
    frame_len = int(sr * frame_ms / 1000)
    audio_int16 = np.clip(audio * 32768, -32768, 32767).astype(np.int16)

    non_speech_starts = []
    for i in range(0, len(audio_int16) - frame_len, frame_len):
        frame_bytes = audio_int16[i:i + frame_len].tobytes()
        try:
            is_speech = vad.is_speech(frame_bytes, sr)
        except Exception:
            continue
        if not is_speech:
            non_speech_starts.append(i)

    if len(non_speech_starts) < 5:
        return None

    # plus longue plage contiguë de non-parole
    non_speech_starts.sort()
    best_start, best_len = non_speech_starts[0], 1
    cur_start, cur_len = non_speech_starts[0], 1
    for i in range(1, len(non_speech_starts)):
        if non_speech_starts[i] == non_speech_starts[i - 1] + frame_len:
            cur_len += 1
        else:
            cur_start, cur_len = non_speech_starts[i], 1
        if cur_len > best_len:
            best_start, best_len = cur_start, cur_len

    max_frames = int(max_seconds * 1000 / frame_ms)
    best_len = min(best_len, max_frames)
    if best_len < 3:
        return None

    start = best_start
    end = start + best_len * frame_len
    return audio[start:end]


def _detect_noise_sample_energy_fallback(
    audio: np.ndarray, sr: int, max_seconds: float = 2.0
) -> np.ndarray | None:
    """
    Repli si le VAD échoue (taux non supporté, trop peu de frames, etc.) :
    heuristique par énergie, moins précise mais mieux que rien.
    """
    win = int(0.05 * sr)
    n_windows = len(audio) // win
    if n_windows < 3:
        return None

    energies = [_rms(audio[i * win:(i + 1) * win]) for i in range(n_windows)]
    threshold = np.percentile(energies, 10)
    quiet_idxs = sorted(i for i, e in enumerate(energies) if e <= threshold)
    if len(quiet_idxs) < 3:
        return None

    best_start, best_len, cur_start, cur_len = quiet_idxs[0], 1, quiet_idxs[0], 1
    for i in range(1, len(quiet_idxs)):
        if quiet_idxs[i] == quiet_idxs[i - 1] + 1:
            cur_len += 1
        else:
            cur_start, cur_len = quiet_idxs[i], 1
        if cur_len > best_len:
            best_start, best_len = cur_start, cur_len

    max_windows = int(max_seconds * sr) // win
    best_len = min(best_len, max_windows)
    start = best_start * win
    end = start + best_len * win
    return audio[start:end]


def _get_noise_sample(audio: np.ndarray, sr: int) -> tuple[np.ndarray | None, str]:
    sample = _detect_noise_sample_vad(audio, sr)
    if sample is not None:
        return sample, "vad"

    sample = _detect_noise_sample_energy_fallback(audio, sr)
    if sample is not None:
        return sample, "energy_fallback"

    return None, "none"


def _adaptive_params(audio: np.ndarray, noise_sample: np.ndarray | None) -> tuple[float, float]:
    """
    Calcule prop_decrease et n_std_thresh_stationary en fonction du
    rapport bruit/signal réel du fichier, plutôt que d'utiliser des
    valeurs fixes réglées sur un seul enregistrement de test.

    - Plus de bruit relatif au signal -> on peut se permettre une
      suppression plus forte sans perdre les voix faibles, car le bruit
      est clairement dominant dans les zones détectées.
    - Peu de bruit / échantillon incertain -> on reste prudent pour ne
      pas abîmer les voix faibles, quitte à laisser un peu plus de bruit
      résiduel.
    """
    if noise_sample is None or len(noise_sample) == 0:
        # pas d'échantillon fiable -> réglages prudents par défaut
        return 0.5, 1.5

    noise_rms = _rms(noise_sample)
    signal_rms = _rms(audio)
    ratio = noise_rms / (signal_rms + 1e-9)

    if ratio > 0.5:
        prop_decrease, n_std = 0.75, 1.3
    elif ratio > 0.3:
        prop_decrease, n_std = 0.6, 1.7
    elif ratio > 0.15:
        prop_decrease, n_std = 0.5, 2.0
    else:
        prop_decrease, n_std = 0.4, 2.3

    return prop_decrease, n_std


def remove_constant_noise(audio: np.ndarray, sr: int) -> tuple[np.ndarray, dict]:
    """
    Suppression de bruit adaptative : détecte un échantillon de bruit réel
    via VAD, en déduit des paramètres de suppression proportionnés au
    rapport bruit/signal du fichier, au lieu d'utiliser des valeurs fixes.
    """
    noise_sample, detection_method = _get_noise_sample(audio, sr)
    prop_decrease, n_std_thresh = _adaptive_params(audio, noise_sample)

    kwargs = dict(
        y=audio,
        sr=sr,
        stationary=True,
        prop_decrease=prop_decrease,
        n_std_thresh_stationary=n_std_thresh,
    )
    if noise_sample is not None:
        kwargs["y_noise"] = noise_sample

    denoised = nr.reduce_noise(**kwargs)

    metrics = {
        "noise_detection_method": detection_method,
        "noise_sample_seconds": (len(noise_sample) / sr) if noise_sample is not None else 0.0,
        "prop_decrease_used": prop_decrease,
        "n_std_thresh_used": n_std_thresh,
        "rms_before": _rms(audio),
        "rms_after": _rms(denoised),
        "estimated_snr_gain_db": _estimate_snr(denoised, audio),
    }
    return denoised, metrics


def normalize_voice(input_path: str, output_path: str) -> None:
    segment = AudioSegment.from_wav(input_path)
    normalized = pydub_normalize(segment)
    normalized.export(output_path, format="wav")


def clean_audio(input_path: str, output_path: str) -> tuple[str, dict]:
    audio, sr = sf.read(input_path)
    audio = _ensure_mono(audio)
    audio, sr = _resample_to_target(audio, sr)

    denoised, metrics = remove_constant_noise(audio, sr)
    sf.write(output_path, denoised, sr)

    normalize_voice(output_path, output_path)

    logger.info("Nettoyage audio - métriques: %s", metrics)
    return output_path, metrics