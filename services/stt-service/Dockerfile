FROM python:3.11-slim

# Installation des dépendances système (ffmpeg & libsndfile pour l'audio)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copie et installation des paquets partagés
COPY shared /app/shared
RUN pip install --no-cache-dir -e /app/shared

# Installation des dépendances du service STT
COPY services/stt-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copie du code applicatif
COPY services/stt-service/app /app/app

# Lancement du worker Celery écoutant sur la file de transcription STT
CMD ["celery", "-A", "app.worker", "worker", "-l", "info", "-Q", "stt_transcription"]