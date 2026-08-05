# scripts/run_denoise.py
"""
Script pour appeler le débruiteur depuis Node.js/Next.js
"""

import sys
import json
import tempfile
import os
from pathlib import Path

# Ajouter le dossier parent au path
sys.path.insert(0, str(Path(__file__).parent))

from denoise_audio import AudioDenoiser

def process_audio(input_data: bytes, sample_rate: int = 48000) -> dict:
    """
    Traite un buffer audio
    
    Args:
        input_data: Bytes du fichier audio
        sample_rate: Fréquence d'échantillonnage
    
    Returns:
        dict: {audio: bytes, metrics: dict}
    """
    try:
        denoiser = AudioDenoiser(sample_rate=sample_rate)
        
        # Sauvegarder temporairement
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            tmp.write(input_data)
            tmp_path = tmp.name
        
        # Générer le nom de sortie
        output_path = tmp_path.replace('.wav', '_denoised.wav')
        
        # Nettoyer
        metrics = denoiser.denoise_file(tmp_path, output_path)
        
        if metrics.get("success"):
            with open(output_path, 'rb') as f:
                cleaned_audio = f.read()
            
            # Nettoyer les fichiers temporaires
            os.unlink(tmp_path)
            os.unlink(output_path)
            
            return {
                "success": True,
                "audio": cleaned_audio.hex(),  # pour JSON
                "metrics": metrics
            }
        else:
            return {
                "success": False,
                "error": metrics.get("error", "Erreur inconnue")
            }
            
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

# ==================== INTERFACE LIGNE DE COMMANDE ====================
if __name__ == "__main__":
    # Lire l'audio depuis stdin (binaire)
    import sys
    import base64
    
    if len(sys.argv) > 1:
        # Mode fichier
        input_file = sys.argv[1]
        sample_rate = int(sys.argv[2]) if len(sys.argv) > 2 else 48000
        
        with open(input_file, 'rb') as f:
            audio_data = f.read()
        
        result = process_audio(audio_data, sample_rate)
        print(json.dumps(result))
    else:
        # Mode stdin (pour appels depuis Node.js)
        audio_data = sys.stdin.buffer.read()
        result = process_audio(audio_data)
        print(json.dumps(result))