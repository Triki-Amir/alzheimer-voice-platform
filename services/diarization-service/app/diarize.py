import os
from pyannote.audio import Pipeline

_pipeline = None

def get_diarization_pipeline():
    global _pipeline
    if _pipeline is None:
        _pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=os.environ["HF_TOKEN"],  # token HuggingFace nécessaire
        )
    return _pipeline


def run_diarization(audio_path: str):
    """
    Retourne une liste de segments : [{"start": float, "end": float, "speaker": "SPEAKER_00"}, ...]
    """
    pipeline = get_diarization_pipeline()
    diarization = pipeline(audio_path)

    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append({"start": turn.start, "end": turn.end, "speaker": speaker})
    return segments