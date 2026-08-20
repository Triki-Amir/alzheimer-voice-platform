FROM python:3.11-slim

WORKDIR /app

COPY infra/ca/ca.crt /etc/ssl/certs/voiceapp-ca.crt

# Copie et installation des paquets partagés
COPY shared /app/shared
RUN pip install --no-cache-dir -e /app/shared

# Installation des dépendances du service feature-engineering
COPY services/feature-engineering-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copie du code applicatif (package app/: worker.py, flatten.py)
COPY services/feature-engineering-service/app /app/app

# Lancement du worker Celery écoutant sur la file d'ingénierie de features
CMD ["celery", "-A", "app.worker", "worker", "-l", "info", "-Q", "feature_engineering"]
