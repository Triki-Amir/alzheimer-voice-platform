import os
import logging
import torch
from transformers import (
    AutoModelForSpeechSeq2Seq,
    WhisperFeatureExtractor,
    WhisperTokenizer,
    pipeline
)

logger = logging.getLogger(__name__)

MODEL_ID = os.getenv("STT_MODEL_ID", "medyas/FarukSTT")


def load_stt_pipeline():
    """Charge le modèle HF FarukSTT sur le GPU Nvidia alloué."""
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32

    logger.info(f"Chargement du modèle STT '{MODEL_ID}' sur le périphérique : {device} ({torch_dtype})")

    model = AutoModelForSpeechSeq2Seq.from_pretrained(
        MODEL_ID,
        torch_dtype=torch_dtype,
        low_cpu_mem_usage=True,
        use_safetensors=True
    )
    model.to(device)

    feature_extractor = WhisperFeatureExtractor.from_pretrained(MODEL_ID)
    tokenizer = WhisperTokenizer.from_pretrained(MODEL_ID)

    stt_pipe = pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=tokenizer,
        feature_extractor=feature_extractor,
        chunk_length_s=30,
        torch_dtype=torch_dtype,
        device=device,
        ignore_warning=True
    )
    return stt_pipe


pipe = load_stt_pipeline()

GENERATE_KWARGS = {
    "task": "transcribe",
    "num_beams": 1,                     # required -- word timestamps break with beam search
    "repetition_penalty": 1.3,          # suppresses runaway repetition loops
    "condition_on_prev_tokens": False,  # don't let a bad chunk poison the next one
}


def transcribe_audio(audio_path: str) -> dict:
    """
    Transcrit un seul fichier audio et retourne le texte + les horodatages
    mot par mot.
    """
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Fichier audio introuvable : {audio_path}")

    result = pipe(
        audio_path,
        batch_size=4,
        return_timestamps="word",
        generate_kwargs=GENERATE_KWARGS,
    )

    return {
        "text": result.get("text", "").strip(),
        "chunks": result.get("chunks", [])
    }


def transcribe_audio_batch(audio_paths: list) -> list:
    """
    Transcrit plusieurs clips en UN seul appel pipeline au lieu d'une
    boucle appelant transcribe_audio() clip par clip. Corrige le
    ralentissement "using the pipelines sequentially on GPU" -- le
    pipeline HF regroupe les clips en interne (batch_size) au lieu de
    payer le coût de generate() séparément pour chacun.

    Retourne une liste de {"text","chunks"}, dans le même ordre que
    audio_paths.
    """
    if not audio_paths:
        return []

    results = pipe(
        audio_paths,
        batch_size=4,
        return_timestamps="word",
        generate_kwargs=GENERATE_KWARGS,
    )

    return [
        {"text": r.get("text", "").strip(), "chunks": r.get("chunks", [])}
        for r in results
    ]