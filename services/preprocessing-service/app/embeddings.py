import os
import numpy as np
from pyannote.audio import Inference, Model
from pyannote.core import Segment

_embedding_inference = None
MIN_SEGMENT_DURATION = 0.25


def get_embedding_inference():
    global _embedding_inference
    if _embedding_inference is None:
        model = Model.from_pretrained("pyannote/embedding", use_auth_token=os.environ["HF_TOKEN"])
        _embedding_inference = Inference(model, window="whole")
    return _embedding_inference


def extract_embedding(audio_path: str, start: float, end: float) -> np.ndarray | None:
    if end - start < MIN_SEGMENT_DURATION:
        return None
    inference = get_embedding_inference()
    segment = Segment(start, end)
    embedding = inference.crop(audio_path, segment)
    return np.asarray(embedding).flatten()


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    a, b = np.asarray(a).flatten(), np.asarray(b).flatten()
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    return float(np.dot(a, b) / denom) if denom > 0 else 0.0