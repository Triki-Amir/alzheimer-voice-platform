import os
import logging
import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline

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

    processor = AutoProcessor.from_pretrained(MODEL_ID)

    stt_pipe = pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        chunk_length_s=30,      # Fenêtrage de 30 secondes
        torch_dtype=torch_dtype,
        device=device,
        ignore_warning=True     # Silencie les logs verbeux
    )
    return stt_pipe

# Initialisation du pipeline au démarrage du module / worker
pipe = load_stt_pipeline()

def transcribe_audio(audio_path: str) -> dict:
    """
    Exécute la transcription ultra-rapide optimisée pour GPU (46 Go VRAM)
    et extrait le texte ainsi que les horodatages des segments.
    """
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Fichier audio introuvable : {audio_path}")

    # Transcription optimisée avec batching et greedy search
    result = pipe(
        audio_path,
        batch_size=16,          # Exploit la VRAM pour traiter les segments en parallèle
        return_timestamps=True,
        generate_kwargs={
            "task": "transcribe",
            "num_beams": 1      # Greedy search pour maximiser la vitesse (2-3s)
        }
    )
    
    return {
        "text": result.get("text", "").strip(),
        "chunks": result.get("chunks", [])
    }