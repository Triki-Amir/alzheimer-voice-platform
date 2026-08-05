import sys
import os
import json
import time

# Permet d'importer le module app.transcribe
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVICE_DIR = os.path.dirname(CURRENT_DIR)
sys.path.insert(0, SERVICE_DIR)
sys.path.insert(0, "/app")

from app.transcribe import transcribe_audio

def main():
    if len(sys.argv) < 2:
        print("❌ Usage: python test_local.py <chemin_vers_audio.wav>")
        sys.exit(1)

    audio_path = sys.argv[1]

    if not os.path.exists(audio_path):
        print(f"❌ Fichier non trouvé : {audio_path}")
        sys.exit(1)

    print(f"🎙️ Chargement du modèle et transcription de : {audio_path}...")
    start_time = time.time()

    # Exécution de la transcription
    result = transcribe_audio(audio_path)

    elapsed_time = time.time() - start_time

    print("\n" + "="*50)
    print("      RÉSULTAT DE LA TRANSCRIPTION (FarukSTT)")
    print("="*50)
    print(f"\n📝 Texte transcrit :\n{result['text']}\n")
    print(f"⏱️ Temps d'exécution : {elapsed_time:.2f} secondes")
    print("="*50)

    # Affichage optionnel des segments avec timestamps
    if result.get("chunks"):
        print("\n📍 Segments / Horodatage :")
        for chunk in result["chunks"]:
            timestamp = chunk.get("timestamp", (0, 0))
            text = chunk.get("text", "")
            print(f"  [{timestamp[0]}s -> {timestamp[1]}s] {text}")

if __name__ == "__main__":
    main()