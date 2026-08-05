# scripts/denoise_alternative.py
# -*- coding: utf-8 -*-

import os
import sys
import json
import glob
import numpy as np
from pathlib import Path

# Forcer l'encodage UTF-8
if sys.platform == 'win32':
    import locale
    locale.setlocale(locale.LC_ALL, 'en_US.UTF-8')

import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

try:
    import soundfile as sf
except ImportError:
    os.system("pip install soundfile")
    import soundfile as sf

try:
    import noisereduce as nr
except ImportError:
    print("Installation de noisereduce...")
    os.system("pip install noisereduce")
    import noisereduce as nr

try:
    from pydub import AudioSegment
except ImportError:
    os.system("pip install pydub")
    from pydub import AudioSegment

def find_latest_audio_file(directory: str = "public/recordings") -> str:
    """Trouve le fichier audio le plus récent"""
    if not os.path.exists(directory):
        print(f"Dossier non trouve: {directory}")
        return None
    
    audio_files = []
    for ext in ['*.wav', '*.webm', '*.mp3', '*.flac']:
        audio_files.extend(glob.glob(os.path.join(directory, ext)))
    
    # Exclure les fichiers avec "denoised" pour éviter les boucles
    audio_files = [f for f in audio_files if '_denoised' not in f]
    
    if not audio_files:
        print(f"Aucun fichier audio trouve dans {directory}")
        return None
    
    latest = max(audio_files, key=os.path.getmtime)
    print(f"Fichier le plus recent: {latest}")
    return latest

def convert_to_wav(input_path: str) -> str:
    """Convertit en WAV 16kHz mono"""
    input_path_obj = Path(input_path)
    wav_path = str(input_path_obj.parent / f"{input_path_obj.stem}.wav")
    
    if input_path.endswith('.wav'):
        return input_path
    
    print(f"Conversion: {input_path} -> {wav_path}")
    
    try:
        audio = AudioSegment.from_file(input_path)
        audio = audio.set_frame_rate(16000).set_channels(1)
        audio.export(wav_path, format="wav")
        print(f"Converti en WAV: {wav_path}")
        return wav_path
    except Exception as e:
        print(f"Erreur conversion: {e}")
        return None

class AudioDenoiser:
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
    
    def denoise_audio(self, audio_data: np.ndarray) -> np.ndarray:
        """Applique la réduction de bruit avec noisereduce"""
        try:
            # Échantillon de bruit (les 3 premiers segments)
            segment_length = 1024
            noise_sample = audio_data[:segment_length * 3]
            
            # ✅ Version compatible avec toutes les versions de noisereduce
            # Utiliser uniquement les paramètres de base
            denoised = nr.reduce_noise(
                y=audio_data,
                sr=self.sample_rate,
                y_noise=noise_sample,
                prop_decrease=0.85,      # Réduction de bruit (0-1)
                n_fft=512,
                win_length=512,
                hop_length=256
            )
            
            # Normalisation
            max_val = np.max(np.abs(denoised))
            if max_val > 0:
                denoised = denoised / max_val * 0.95
            
            return denoised
        except Exception as e:
            print(f"Erreur denoise: {e}")
            return audio_data
    
    def denoise_file(self, input_path: str, output_path: str = None) -> dict:
        try:
            if not os.path.exists(input_path):
                return {"error": f"Fichier non trouve: {input_path}", "success": False}
            
            wav_path = convert_to_wav(input_path)
            if wav_path is None:
                return {"error": "Impossible de convertir le fichier", "success": False}
            
            if output_path is None:
                input_path_obj = Path(input_path)
                output_path = str(input_path_obj.parent / f"{input_path_obj.stem}_denoised.wav")
            
            print(f"Lecture du fichier: {wav_path}")
            audio_data, sr = sf.read(wav_path)
            
            if sr != self.sample_rate:
                try:
                    from scipy import signal
                    audio_data = signal.resample(audio_data, 
                                                  int(len(audio_data) * self.sample_rate / sr))
                except:
                    audio_data = audio_data[::max(1, sr // self.sample_rate)]
            
            print("Nettoyage en cours (noisereduce)...")
            denoised_audio = self.denoise_audio(audio_data)
            
            sf.write(output_path, denoised_audio, self.sample_rate)
            
            metrics = self.analyze_audio(denoised_audio, audio_data)
            metrics["success"] = True
            metrics["output_path"] = output_path
            
            # Supprimer le WAV temporaire
            if wav_path != input_path and os.path.exists(wav_path):
                try:
                    os.remove(wav_path)
                except:
                    pass
            
            return metrics
            
        except Exception as e:
            print(f"Erreur: {e}")
            return {"error": str(e), "success": False}
    
    def analyze_audio(self, denoised: np.ndarray, original: np.ndarray) -> dict:
        eps = 1e-10
        rms_orig = np.sqrt(np.mean(original**2) + eps)
        rms_denoised = np.sqrt(np.mean(denoised**2) + eps)
        
        noise = original - denoised
        noise_power = np.mean(noise**2) + eps
        signal_power = np.mean(denoised**2) + eps
        
        snr = 10 * np.log10(signal_power / noise_power)
        noise_reduction = 1 - (noise_power / (np.mean(original**2) + eps))
        
        return {
            "rms_original": float(rms_orig * 100),
            "rms_denoised": float(rms_denoised * 100),
            "snr_db": float(max(-30, min(60, snr))),
            "noise_reduction": float(max(0, min(100, noise_reduction * 100))),
            "duration": len(denoised) / self.sample_rate,
            "sample_rate": self.sample_rate
        }


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Nettoyage audio avec noisereduce')
    parser.add_argument('input', nargs='?', help='Fichier audio d\'entree')
    parser.add_argument('-o', '--output', help='Fichier audio de sortie')
    parser.add_argument('--json', action='store_true', help='Afficher les metriques en JSON')
    parser.add_argument('--latest', action='store_true', help='Utiliser le dernier fichier')
    
    args = parser.parse_args()
    
    input_path = args.input
    
    if args.latest or input_path is None:
        latest = find_latest_audio_file()
        if latest is None:
            print("Aucun fichier trouve. Enregistrez d'abord un audio.")
            sys.exit(1)
        input_path = latest
    
    if not input_path:
        print("Veuillez specifier un fichier audio ou utiliser --latest")
        sys.exit(1)
    
    if not os.path.exists(input_path):
        print(f"Fichier non trouve: {input_path}")
        sys.exit(1)
    
    denoiser = AudioDenoiser()
    metrics = denoiser.denoise_file(input_path, args.output)
    
    if metrics.get("success"):
        if args.json:
            print(json.dumps(metrics, ensure_ascii=False))
        else:
            print(f"\nMetriques:")
            print(f"  RMS original:   {metrics['rms_original']:.1f}%")
            print(f"  RMS nettoie:    {metrics['rms_denoised']:.1f}%")
            print(f"  SNR:            {metrics['snr_db']:.1f} dB")
            print(f"  Reduction bruit: {metrics['noise_reduction']:.1f}%")
            print(f"  Duree:          {metrics['duration']:.1f}s")
    else:
        print(f"Erreur: {metrics.get('error', 'Inconnue')}")
        sys.exit(1)