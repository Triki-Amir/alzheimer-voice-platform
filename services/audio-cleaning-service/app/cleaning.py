import noisereduce as nr
import soundfile as sf
import numpy as np
from pydub import AudioSegment
from pydub.effects import normalize as pydub_normalize


def remove_constant_noise(audio: np.ndarray, sr: int) -> np.ndarray:
    """
    Suppression de bruit constant / stationnaire (ventilateur, bourdonnement,
    bruit de fond stable). Le mode stationary=True estime un profil de bruit
    unique sur tout le signal plutôt que de le ré-estimer en continu — plus
    adapté à un bruit constant qu'à un bruit qui varie dans le temps.
    """
    return nr.reduce_noise(y=audio, sr=sr, stationary=True)


def normalize_voice(input_path: str, output_path: str) -> None:
    """
    Normalisation d'amplitude de la voix : ramène le niveau sonore à une
    cible cohérente sans écrêter (peak normalization via pydub).
    """
    segment = AudioSegment.from_wav(input_path)
    normalized = pydub_normalize(segment)  # ramène le pic max à ~0 dBFS
    normalized.export(output_path, format="wav")


def clean_audio(input_path: str, output_path: str) -> str:
    audio, sr = sf.read(input_path)
    if audio.ndim > 1:
        audio = np.mean(audio, axis=1)  # force mono

    # Étape 1 : réduction / suppression du bruit constant
    denoised = remove_constant_noise(audio, sr)
    sf.write(output_path, denoised, sr)

    # Étape 2 : normalisation de la voix
    normalize_voice(output_path, output_path)

    return output_path