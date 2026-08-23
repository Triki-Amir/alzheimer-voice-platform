FROM python:3.11-slim

# ffmpeg & libsndfile1 for audio decoding, libgomp1 for opensmile/librosa
# threaded ops, git/build-essential for building any deps without wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    libgomp1 \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY infra/ca/ca.crt /etc/ssl/certs/voiceapp-ca.crt

# Copie et installation des paquets partagés
COPY shared /app/shared
RUN pip install --no-cache-dir -e /app/shared

# Installation des dépendances du service acoustic-feature
COPY services/acoustic-feature-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copie du code applicatif (package app/: worker.py, audio_utils.py, features.py)
COPY services/acoustic-feature-service/app /app/app

# Lancement du worker Celery écoutant sur la file d'extraction acoustique
CMD ["celery", "-A", "app.worker", "worker", "-l", "info", "-Q", "acoustic_extraction"]