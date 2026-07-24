import os
import numpy as np
from pyannote.audio import Model, Inference

_embedding_inference = None

def get_embedding_inference():
    global _embedding_inference
    if _embedding_inference is None:
        model = Model.from_pretrained("pyannote/embedding", use_auth_token=os.environ["HF_TOKEN"])
        _embedding_inference = Inference(model, window="whole")
    return _embedding_inference


def extract_embedding(audio_path: str, start: float, end: float) -> np.ndarray:
    """
    Extrait l'embedding vocal d'un segment [start, end] via pyannote/embedding.
    Retourne None si le segment est trop court pour être fiable.
    """
    if end - start < 0.25:
        return None

    inference = get_embedding_inference()
    embedding = inference.crop({"start": start, "end": end}, audio_path)
    return np.array(embedding)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))