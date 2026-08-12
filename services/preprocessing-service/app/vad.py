import logging
import torch
import torchaudio

logger = logging.getLogger(__name__)
_vad_bundle = None


def get_silero_vad():
    global _vad_bundle
    if _vad_bundle is None:
        _vad_bundle = torch.hub.load(
            repo_or_dir="snakers4/silero-vad", model="silero_vad", force_reload=False,
        )
    return _vad_bundle


def _load_audio(audio_path: str):
    waveform, sr = torchaudio.load(audio_path)
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    waveform = waveform.squeeze(0)
    if sr != 16000:
        waveform = torchaudio.functional.resample(waveform.unsqueeze(0), sr, 16000).squeeze(0)
        sr = 16000
    return waveform, sr


def run_vad(
    audio_path: str,
    threshold: float = 0.5,
    min_silence_duration_ms: int = 200,  # calibré bas pour ne pas fusionner les pauses cliniques courtes
    min_speech_duration_ms: int = 100,
) -> list[dict]:
    """
    Runs VAD on masked_full.wav (or any audio file).
    Since doctor sections have been zeroed out by mask_doctor_audio(),
    VAD will correctly detect only patient speech intervals.
    No changes needed to VAD logic itself - just point it at the new file.
    """
    model, utils = get_silero_vad()
    get_speech_timestamps = utils[0]

    waveform, sr = _load_audio(audio_path)
    timestamps = get_speech_timestamps(
        waveform, model, sampling_rate=sr,
        threshold=threshold,
        min_silence_duration_ms=min_silence_duration_ms,
        min_speech_duration_ms=min_speech_duration_ms,
    )
    segments = [{"start": t["start"] / sr, "end": t["end"] / sr} for t in timestamps]
    logger.info("VAD détecte %d segments de parole", len(segments))
    return segments