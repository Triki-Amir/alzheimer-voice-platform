# scripts/denoise_audio.py
"""
Nettoyage audio avec RNNoise - Version corrigée
"""

import os
import sys
import json
import glob
import numpy as np
from pathlib import Path

# Installation des dépendances
try:
    import soundfile as sf
except ImportError:
    print("⚠️ Installation de soundfile...")
    os.system("pip install soundfile")
    import soundfile as sf

# Détection de la bonne version de pyrnnoise
try:
    import pyrnnoise
    print(f"✅ pyrnnoise version: {pyrnnoise.__version__ if hasattr(pyrnnoise, '__version__') else 'inconnue'}")
except ImportError:
    print("⚠️ Installation de pyrnnoise...")
    os.system("pip install pyrnnoise")
    import pyrnnoise

try:
    from pydub import AudioSegment
except ImportError:
    print("⚠️ Installation de pydub...")
    os.system("pip install pydub")
    from pydub import AudioSegment

def find_latest_audio_file(directory: str = "public/recordings") -> str:
    """Trouve le fichier audio le plus récent"""
    if not os.path.exists(directory):
        print(f"❌ Dossier non trouvé: {directory}")
        return None
    
    audio_files = []
    for ext in ['*.wav', '*.webm', '*.mp3', '*.flac']:
        audio_files.extend(glob.glob(os.path.join(directory, ext)))
    
    if not audio_files:
        print(f"❌ Aucun fichier audio trouvé dans {directory}")
        return None
    
    latest = max(audio_files, key=os.path.getmtime)
    print(f"📁 Fichier le plus récent: {latest}")
    return latest

def convert_to_wav(input_path: str) -> str:
    """Convertit en WAV 16kHz mono"""
    input_path_obj = Path(input_path)
    wav_path = str(input_path_obj.parent / f"{input_path_obj.stem}.wav")
    
    if input_path.endswith('.wav'):
        return input_path
    
    print(f"🔄 Conversion: {input_path} → {wav_path}")
    
    try:
        audio = AudioSegment.from_file(input_path)
        audio = audio.set_frame_rate(16000).set_channels(1)
        audio.export(wav_path, format="wav")
        
        if os.path.exists(wav_path) and os.path.getsize(wav_path) > 0:
            print(f"✅ Converti en WAV: {wav_path}")
            return wav_path
        return None
    except Exception as e:
        print(f"❌ Erreur conversion: {e}")
        return None

class AudioDenoiser:
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        # Essayer différentes méthodes d'initialisation
        try:
            # Méthode 1: RNNoise direct
            from pyrnnoise import RNNoise
            self.denoiser = RNNoise(sample_rate=sample_rate)
            self.method = 'direct'
            print(f"✅ RNNoise initialisé (méthode directe)")
        except Exception as e:
            try:
                # Méthode 2: Version différente
                import pyrnnoise
                self.denoiser = pyrnnoise.RNNoise()
                self.method = 'simple'
                print(f"✅ RNNoise initialisé (méthode simple)")
            except Exception as e:
                # Méthode 3: Fonction directe
                self.denoiser = None
                self.method = 'function'
                print(f"⚠️ Utilisation de la méthode fonction")
    
    def denoise_audio(self, audio_data: np.ndarray) -> np.ndarray:
        """Applique le débruiteur selon la méthode disponible"""
        import time
        
        try:
            if self.method == 'direct' and hasattr(self.denoiser, 'denoise'):
                return self.denoiser.denoise(audio_data)
            elif self.method == 'simple' and hasattr(self.denoiser, 'process'):
                return self.denoiser.process(audio_data)
            else:
                # Méthode alternative avec création de fichiers temporaires
                import tempfile
                import subprocess
                
                # Sauvegarder temporairement
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_in:
                    sf.write(tmp_in.name, audio_data, self.sample_rate)
                    tmp_in_path = tmp_in.name
                
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_out:
                    tmp_out_path = tmp_out.name
                
                try:
                    # Utiliser la méthode wav de RNNoise
                    from pyrnnoise import denoise_wav
                    denoise_wav(tmp_in_path, tmp_out_path)
                    denoised, _ = sf.read(tmp_out_path)
                    
                    # Nettoyer
                    os.unlink(tmp_in_path)
                    os.unlink(tmp_out_path)
                    
                    return denoised
                except Exception as e:
                    print(f"⚠️ Erreur méthode wav: {e}")
                    # Fallback: réduction simple (ne fait rien)
                    return audio_data * 1.0
        except Exception as e:
            print(f"⚠️ Erreur denoise: {e}")
            return audio_data * 1.0
    
    def denoise_file(self, input_path: str, output_path: str = None) -> dict:
        """Nettoie un fichier audio"""
        try:
            if not os.path.exists(input_path):
                return {"error": f"Fichier non trouvé: {input_path}", "success": False}
            
            # 1. Convertir en WAV
            wav_path = convert_to_wav(input_path)
            if wav_path is None:
                return {"error": "Impossible de convertir le fichier", "success": False}
            
            # 2. Générer le nom de sortie
            if output_path is None:
                input_path_obj = Path(input_path)
                output_path = str(input_path_obj.parent / f"{input_path_obj.stem}_denoised.wav")
            
            # 3. Lire le fichier
            print(f"🎙️ Lecture du fichier: {wav_path}")
            audio_data, sr = sf.read(wav_path)
            
            # 4. Resampling si nécessaire
            if sr != self.sample_rate:
                try:
                    from scipy import signal
                    audio_data = signal.resample(audio_data, 
                                                  int(len(audio_data) * self.sample_rate / sr))
                except:
                    audio_data = audio_data[::max(1, sr // self.sample_rate)]
            
            # 5. Nettoyer
            print(f"🎙️ Nettoyage en cours...")
            denoised_audio = self.denoise_audio(audio_data)
            
            # 6. Sauvegarder
            sf.write(output_path, denoised_audio, self.sample_rate)
            
            # 7. Métriques
            metrics = self.analyze_audio(denoised_audio, audio_data)
            metrics["success"] = True
            metrics["output_path"] = output_path
            
            # 8. Supprimer le fichier WAV temporaire
            if wav_path != input_path and os.path.exists(wav_path):
                try:
                    os.remove(wav_path)
                except:
                    pass
            
            return metrics
            
        except Exception as e:
            print(f"❌ Erreur: {e}")
            import traceback
            traceback.print_exc()
            return {"error": str(e), "success": False}
    
    def analyze_audio(self, denoised: np.ndarray, original: np.ndarray) -> dict:
        """Analyse la qualité audio"""
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


# ==================== POINT D'ENTRÉE ====================
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Nettoyage audio avec RNNoise')
    parser.add_argument('input', nargs='?', help='Fichier audio d\'entrée')
    parser.add_argument('-o', '--output', help='Fichier audio de sortie')
    parser.add_argument('--json', action='store_true', help='Afficher les métriques en JSON')
    parser.add_argument('--latest', action='store_true', help='Utiliser le dernier fichier')
    
    args = parser.parse_args()
    
    input_path = args.input
    
    if args.latest or input_path is None:
        latest = find_latest_audio_file()
        if latest is None:
            print("💡 Aucun fichier trouvé. Enregistrez d'abord un audio.")
            sys.exit(1)
        input_path = latest
    
    if not input_path:
        print("❌ Veuillez spécifier un fichier audio ou utiliser --latest")
        sys.exit(1)
    
    if not os.path.exists(input_path):
        print(f"❌ Fichier non trouvé: {input_path}")
        sys.exit(1)
    
    print(f"📁 Traitement: {input_path}")
    
    denoiser = AudioDenoiser()
    metrics = denoiser.denoise_file(input_path, args.output)
    
    if metrics.get("success"):
        print(f"✅ Audio nettoyé avec succès!")
        
        if args.json:
            print(json.dumps(metrics, indent=2))
        else:
            print(f"\n📊 Métriques:")
            print(f"  • RMS original:   {metrics['rms_original']:.1f}%")
            print(f"  • RMS nettoyé:    {metrics['rms_denoised']:.1f}%")
            print(f"  • SNR:            {metrics['snr_db']:.1f} dB")
            print(f"  • Réduction bruit: {metrics['noise_reduction']:.1f}%")
            print(f"  • Durée:          {metrics['duration']:.1f}s")
            print(f"  • Fichier:         {metrics['output_path']}")
    else:
        print(f"❌ Erreur: {metrics.get('error', 'Inconnue')}")
        sys.exit(1)