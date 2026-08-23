# Guide d'implémentation — Plateforme de Dépistage Alzheimer/MCI par Analyse Vocale
### (Version RabbitMQ au lieu de Celery+Redis)

Ce guide part de zéro et te donne l'ordre exact des étapes, l'arborescence complète des dossiers/fichiers, et le contenu de chaque brique. Suis-le service par service — ne saute pas d'étape, chaque service dépend du précédent.

> **Mise à jour** : cette version aligne le guide sur l'implémentation réelle des services (voir les READMEs individuels de `preprocessing-service`, `stt-service`, `linguistic-feature-service`, `acoustic-feature-service` et `feature-engineering-service`). Le changement principal par rapport à une première ébauche : les étapes de nettoyage, diarisation, matching médecin/patient, masquage et VAD **ne sont pas cinq microservices séparés** — elles sont regroupées dans **un seul service Celery**, `preprocessing-service`, qui orchestre tout ce prétraitement de façon séquentielle avant de déclencher STT et extraction acoustique.

---

## 0. Décisions d'architecture (à valider avant de coder)

- **Message broker** : RabbitMQ remplace Redis comme broker Celery. Celery supporte nativement RabbitMQ (`pyamqp://`), donc tu gardes Celery comme framework de tâches, mais RabbitMQ comme transport. Redis reste utile séparément comme **cache / backend de résultats** (optionnel) — sinon tu peux utiliser PostgreSQL ou RPC pour les résultats.
- **Orchestration locale** : Docker Compose (comme prévu dans le diagramme).
- **Communication inter-services** : asynchrone via RabbitMQ (queues dédiées par étape du pipeline), pas d'appels HTTP synchrones entre microservices de traitement.
- **Chaque microservice = un conteneur Docker indépendant**, avec son propre `Dockerfile`, ses dépendances, et un seul worker Celery qui écoute une queue précise.
- **Prétraitement consolidé** : cleaning, diarization (`pyannote.audio`), matching du médecin par embedding vocal, masquage patient-only et VAD (`Silero VAD`) sont **une seule tâche Celery séquentielle** dans `preprocessing-service`, pas quatre services séparés. Ce choix évite une chaîne de 4 sauts RabbitMQ pour des étapes qui doivent de toute façon s'exécuter dans l'ordre sur le même fichier audio.
- **Fan-out après prétraitement** : `preprocessing-service` déclenche **directement** deux tâches en parallèle : `stt-service` (transcription) et `acoustic-feature-service` (features acoustiques), car les deux ont seulement besoin de l'audio nettoyé + des labels de diarisation, pas du texte transcrit.
- **Fan-out après STT** : `stt-service`, une fois la transcription validée, déclenche `linguistic-feature-service` (qui a besoin des mots transcrits).
- **Fan-in (join)** : `feature-engineering-service` ne dépend d'aucun message de synchronisation particulier — il **sonde MinIO** (polling avec retry/backoff) jusqu'à ce que `acoustic_features.json` **et** `linguistic_features.json` soient tous les deux présents pour la session, puis fusionne.

---

## 1. Arborescence complète du projet

Crée cette structure en premier — c'est le squelette de tout le projet.

```
alzheimer-voice-platform/
├── docker-compose.yml
├── .env
├── .env.example
├── .gitignore
├── README.md
│
├── infra/
│   ├── nginx/
│   │   ├── nginx.conf
│   │   └── Dockerfile
│   ├── rabbitmq/
│   │   ├── Dockerfile
│   │   └── definitions.json          # queues, exchanges, users prédéfinis
│   ├── postgres/
│   │   ├── Dockerfile
│   │   └── init.sql                  # création des tables de base
│   └── minio/
│       └── init-buckets.sh           # création des buckets au démarrage
│
├── services/
│   ├── auth-service/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── models.py
│   │   │   ├── auth.py               # JWT encode/decode
│   │   │   ├── database.py
│   │   │   └── schemas.py
│   │   └── tests/
│   │
│   ├── ingestion-service/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── main.py               # endpoint HTTP + WebSocket
│   │   │   ├── storage.py            # client MinIO
│   │   │   ├── database.py
│   │   │   └── publisher.py          # publie sur RabbitMQ
│   │   └── tests/
│   │
│   │
│   ├── preprocessing-service/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── worker.py             # Celery worker (consume queue "preprocessing"), orchestre tout le flux ci-dessous
│   │   │   ├── cleaning.py           # mono/16kHz, WebRTC VAD + fallback énergie, noisereduce, pydub loudness
│   │   │   ├── role_heuristic.py     # diarization pyannote + embedding vs profil médecin (PostgreSQL) + masquage + VAD Silero + métriques de pause
│   │   │   └── publisher.py          # publie vers "stt_transcription" ET "acoustic_features"
│   │   └── tests/
│   │
│   ├── stt-service/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── worker.py             # Celery worker (consume queue "stt_transcription")
│   │   │   ├── stt_per_segment.py    # découpe/fusion des régions patient-only, transcription batch GPU (FarukSTT)
│   │   │   └── validate_word_timestamps.py  # détection d'hallucinations / boucles / sauts arrière
│   │   └── tests/
│   │
│   ├── acoustic-feature-service/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── worker.py             # Celery worker (consume queue "acoustic_features")
│   │   │   ├── audio_utils.py        # extraction patient-only à partir de cleaned.wav + labeled_segments (pas le fichier masqué)
│   │   │   └── features.py           # eGeMAPS (openSMILE) + MFCC (librosa)
│   │   └── tests/
│   │
│   ├── linguistic-feature-service/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── worker.py             # Celery worker (consume queue "linguistic_features")
│   │   │   └── features.py           # reconstruction de phrases par timing + POS tagging local (XLM-R Tunisien fine-tuné)
│   │   └── tests/
│   │
│   ├── feature-engineering-service/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   └── worker.py             # sonde MinIO (retry/backoff) pour acoustic_features.json + linguistic_features.json, flatten + CSV long-format
│   │   └── tests/
│   │
│   ├── fusion-classification-service/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── worker.py
│   │   │   ├── fusion.py
│   │   │   ├── classify.py           # LightGBM/XGBoost
│   │   │   └── shap_explain.py
│   │   └── models/                   # modèles entraînés (.pkl / .txt)
│   │
│   └── report-service/
│       ├── Dockerfile
│       ├── requirements.txt
│       ├── app/
│       │   ├── worker.py
│       │   ├── templates/
│       │   │   └── report.html.j2    # template Jinja2
│       │   └── generate_pdf.py       # WeasyPrint
│       └── tests/
│
├── shared/                            # package Python partagé (installé dans chaque image)
│   ├── setup.py
│   └── voiceplatform_shared/
│       ├── __init__.py
│       ├── celery_app.py             # config Celery commune (broker RabbitMQ)
│       ├── models.py                 # schémas Pydantic partagés (SessionMessage, etc.)
│       ├── minio_client.py
│       ├── db_session.py
│       └── constants.py              # noms des queues
│
├── frontend/                          # client web (hors scope détaillé ici)
│   └── ...
│
├── ml-training/                       # entraînement offline du modèle (hors pipeline temps réel)
│   ├── notebooks/
│   └── train.py
│
└── scripts/
    ├── wait-for-it.sh
    └── seed_db.py
```

Crée cette arborescence avec :

```bash
mkdir -p alzheimer-voice-platform/{infra/{nginx,rabbitmq,postgres,minio},services,shared/voiceplatform_shared,frontend,ml-training/notebooks,scripts}
cd alzheimer-voice-platform
for svc in auth-service ingestion-service quality-check-service preprocessing-service stt-service acoustic-feature-service linguistic-feature-service feature-engineering-service fusion-classification-service report-service; do
  mkdir -p services/$svc/app services/$svc/tests
done
```

---

## 2. Ordre d'implémentation recommandé (étapes)

Ne pars pas dans tous les sens. Implémente et teste **dans cet ordre**, chaque étape doit tourner avant de passer à la suivante :

1. Infra de base : RabbitMQ + PostgreSQL + MinIO + Nginx (rien ne calcule encore)
2. Package `shared` (config Celery, modèles Pydantic, clients communs)
3. Auth Service (JWT) — testable seul via curl
4. Ingestion Service — reçoit l'audio, écrit MinIO/Postgres, publie sur RabbitMQ
5. **Preprocessing Service** — un seul worker Celery séquentiel : cleaning → diarization → matching médecin (embedding) → masquage → VAD Silero → métriques de pause → déclenche STT **et** extraction acoustique
6. STT Service (FarukSTT, découpage par segment patient, validation des timestamps) → déclenche l'extraction linguistique
7. Feature extraction (Acoustic + Linguistic, en parallèle, chacune déclenchée indépendamment comme décrit ci-dessus)
8. Feature Engineering (le "join" des deux, par sondage MinIO)
9. Fusion & Classification + SHAP
10. Report Service
11. CI (GitHub Actions) + tests d'intégration bout en bout

---

## 3. Étape 1 — Infrastructure de base

### 3.1 `.env` (racine)

```env
# Postgres
POSTGRES_USER=voiceapp
POSTGRES_PASSWORD=changeme_strong_password
POSTGRES_DB=voiceapp_db
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

# RabbitMQ
RABBITMQ_DEFAULT_USER=voiceapp
RABBITMQ_DEFAULT_PASS=changeme_strong_password
RABBITMQ_HOST=rabbitmq
RABBITMQ_PORT=5672
RABBITMQ_MGMT_PORT=15672

# MinIO
MINIO_ROOT_USER=voiceapp
MINIO_ROOT_PASSWORD=changeme_strong_password
MINIO_HOST=minio
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001

# Auth
JWT_SECRET_KEY=changeme_generate_with_openssl_rand
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60

# Preprocessing (diarization / embeddings)
HF_TOKEN=hf_...

# Linguistic feature service (modèle POS local)
POS_MODEL_PATH=/models/xlmr-tunisian-pos-final
```

Copie ce fichier en `.env.example` (sans les vrais secrets) pour le versionner, et mets `.env` dans `.gitignore`.

### 3.2 `docker-compose.yml` (racine) — squelette infra

```yaml
version: "3.9"

services:
  postgres:
    build:
      context: .
      dockerfile: infra/postgres/Dockerfile
    env_file: .env
    volumes:
      - pg_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER}"]
      interval: 5s
      timeout: 5s
      retries: 10

  rabbitmq:
    build:
      context: .
      dockerfile: infra/rabbitmq/Dockerfile
    env_file: .env
    ports:
      - "5672:5672"     # AMQP
      - "15672:15672"   # Management UI
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 10s
      retries: 10

  minio:
    image: minio/minio:latest
    env_file: .env
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    env_file: .env
    entrypoint: ["/bin/sh", "/scripts/init-buckets.sh"]
    volumes:
      - ./infra/minio/init-buckets.sh:/scripts/init-buckets.sh

  nginx:
    build:
      context: .
      dockerfile: infra/nginx/Dockerfile
    ports:
      - "80:80"
    depends_on:
      - auth-service
      - ingestion-service

  auth-service:
    build:
      context: .
      dockerfile: services/auth-service/Dockerfile
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "8001:8000"

  ingestion-service:
    build:
      context: .
      dockerfile: services/ingestion-service/Dockerfile
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
      minio:
        condition: service_healthy
    ports:
      - "8002:8000"

  quality-check-service:
    build:
      context: .
      dockerfile: services/quality-check-service/Dockerfile
    env_file: .env
    depends_on:
      rabbitmq:
        condition: service_healthy

  preprocessing-service:
    build:
      context: .
      dockerfile: services/preprocessing-service/Dockerfile
    env_file: .env
    environment:
      - HF_TOKEN=${HF_TOKEN}
    depends_on:
      rabbitmq:
        condition: service_healthy
      postgres:
        condition: service_healthy
      minio:
        condition: service_healthy

  stt-service:
    build:
      context: .
      dockerfile: services/stt-service/Dockerfile
    env_file: .env
    environment:
      - HF_TOKEN=${HF_TOKEN}
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    depends_on:
      rabbitmq:
        condition: service_healthy

  acoustic-feature-service:
    build:
      context: .
      dockerfile: services/acoustic-feature-service/Dockerfile
    env_file: .env
    depends_on:
      rabbitmq:
        condition: service_healthy

  linguistic-feature-service:
    build:
      context: .
      dockerfile: services/linguistic-feature-service/Dockerfile
    env_file: .env
    environment:
      - POS_MODEL_PATH=${POS_MODEL_PATH}
    volumes:
      - ./models/xlmr-tunisian-pos-final:/models/xlmr-tunisian-pos-final:ro
    depends_on:
      rabbitmq:
        condition: service_healthy

  feature-engineering-service:
    build:
      context: .
      dockerfile: services/feature-engineering-service/Dockerfile
    env_file: .env
    depends_on:
      rabbitmq:
        condition: service_healthy
      minio:
        condition: service_healthy

  fusion-classification-service:
    build:
      context: .
      dockerfile: services/fusion-classification-service/Dockerfile
    env_file: .env
    depends_on:
      rabbitmq:
        condition: service_healthy

  report-service:
    build:
      context: .
      dockerfile: services/report-service/Dockerfile
    env_file: .env
    depends_on:
      rabbitmq:
        condition: service_healthy
      minio:
        condition: service_healthy

volumes:
  pg_data:
  minio_data:
```

> Note GPU : si tu n'as pas de GPU local, retire le bloc `deploy.resources` du `stt-service` (le service bascule automatiquement sur CPU).
> Note contexte de build : tous les services buildent avec `context: .` (racine du repo) pour que `COPY shared/` fonctionne dans chaque `Dockerfile` — voir section 5.

### 3.3 `infra/rabbitmq/Dockerfile`

```dockerfile
FROM rabbitmq:3.13-management
COPY infra/rabbitmq/definitions.json /etc/rabbitmq/definitions.json
RUN echo "management.load_definitions = /etc/rabbitmq/definitions.json" >> /etc/rabbitmq/rabbitmq.conf
```

### 3.4 `infra/rabbitmq/definitions.json` — déclare toutes les queues à l'avance

C'est ici que tu définis **une queue par étape du pipeline**. Le prétraitement (cleaning, diarization, matching médecin, masquage, VAD) est **une seule queue `preprocessing`**, pas quatre :

```json
{
  "rabbit_version": "3.13.0",
  "users": [
    { "name": "voiceapp", "password_hash": "", "tags": "administrator" }
  ],
  "vhosts": [{ "name": "/" }],
  "permissions": [
    { "user": "voiceapp", "vhost": "/", "configure": ".*", "write": ".*", "read": ".*" }
  ],
  "queues": [
    { "name": "quality_check", "vhost": "/", "durable": true },
    { "name": "preprocessing", "vhost": "/", "durable": true },
    { "name": "stt_transcription", "vhost": "/", "durable": true },
    { "name": "acoustic_features", "vhost": "/", "durable": true },
    { "name": "linguistic_features", "vhost": "/", "durable": true },
    { "name": "feature_engineering", "vhost": "/", "durable": true },
    { "name": "fusion_classification", "vhost": "/", "durable": true },
    { "name": "report_generation", "vhost": "/", "durable": true },
    { "name": "quality_check.dlq", "vhost": "/", "durable": true },
    { "name": "preprocessing.dlq", "vhost": "/", "durable": true },
    { "name": "stt_transcription.dlq", "vhost": "/", "durable": true },
    { "name": "acoustic_features.dlq", "vhost": "/", "durable": true },
    { "name": "linguistic_features.dlq", "vhost": "/", "durable": true },
    { "name": "feature_engineering.dlq", "vhost": "/", "durable": true },
    { "name": "fusion_classification.dlq", "vhost": "/", "durable": true },
    { "name": "report_generation.dlq", "vhost": "/", "durable": true }
  ],
  "bindings": []
}
```

> Génère `password_hash` avec : `docker run --rm rabbitmq:3.13-management rabbitmqctl hash_password "changeme_strong_password"` puis colle le résultat.
> Une `.dlq` (dead-letter queue) par queue principale = bonne pratique pour ne jamais perdre un message en échec.

### 3.5 `infra/postgres/init.sql` — schéma minimal de départ

```sql
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_ref TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS doctor_voice_profiles (
    doctor_id UUID PRIMARY KEY,
    embedding FLOAT8[] NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id),
    doctor_id UUID,
    status TEXT NOT NULL DEFAULT 'created',
    raw_audio_path TEXT,
    cleaned_audio_path TEXT,
    masked_audio_path TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patients_transcripts (
    patient_id UUID REFERENCES patients(id) PRIMARY KEY,
    transcription_text TEXT
);

CREATE TABLE IF NOT EXISTS session_features (
    session_id UUID REFERENCES sessions(id),
    feature_type TEXT NOT NULL,      -- 'acoustic' | 'linguistic' | 'fused'
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (session_id, feature_type)
);

CREATE TABLE IF NOT EXISTS session_results (
    session_id UUID REFERENCES sessions(id) PRIMARY KEY,
    prediction TEXT,
    probability FLOAT,
    shap_explanation JSONB,
    report_path TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    role TEXT DEFAULT 'clinician',
    created_at TIMESTAMPTZ DEFAULT now()
);
```

> `doctor_voice_profiles` est consommée par `preprocessing-service/app/role_heuristic.py` pour le matching médecin/patient par similarité cosinus d'embeddings vocaux.

### 3.6 `infra/minio/init-buckets.sh`

```bash
#!/bin/sh
mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mb -p local/raw-audio
mc mb -p local/patient-audio
mc mb -p local/reports
mc anonymous set download local/reports
echo "Buckets créés."
```

> `raw-audio` reçoit l'audio brut de l'ingestion. `patient-audio` reçoit tous les artefacts de `preprocessing-service` (`cleaned.wav`, `labeled_segments.json`, `masked_full.wav`, `preprocessing_metrics.json`), les features acoustiques/linguistiques (`acoustic_features.json`, `linguistic_features.json`) et le CSV final (`features/features_<patient_id>.csv`).

### 3.7 `infra/nginx/nginx.conf`

```nginx
worker_processes auto;

events { worker_connections 1024; }

http {
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

    upstream auth_service { server auth-service:8000; }
    upstream ingestion_service { server ingestion-service:8000; }

    server {
        listen 80;

        location /auth/ {
            limit_req zone=api_limit burst=20 nodelay;
            proxy_pass http://auth_service/;
        }

        location /ingest/ {
            limit_req zone=api_limit burst=20 nodelay;
            proxy_pass http://ingestion_service/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }
}
```

`infra/nginx/Dockerfile` :
```dockerfile
FROM nginx:1.27-alpine
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
```

**Checkpoint 1** : lance `docker compose up postgres rabbitmq minio minio-init nginx` — vérifie que RabbitMQ management UI répond sur `localhost:15672`, MinIO console sur `localhost:9001`, et que les buckets existent.

---

## 4. Étape 2 — Package `shared` (config Celery/RabbitMQ commune)

### 4.1 `shared/voiceplatform_shared/constants.py`

```python
class Queues:
    QUALITY_CHECK = "quality_check"
    PREPROCESSING = "preprocessing"          # cleaning + diarization + matching médecin + masquage + VAD, tout-en-un
    STT_TRANSCRIPTION = "stt_transcription"
    ACOUSTIC_FEATURES = "acoustic_features"
    LINGUISTIC_FEATURES = "linguistic_features"
    FEATURE_ENGINEERING = "feature_engineering"
    FUSION_CLASSIFICATION = "fusion_classification"
    REPORT_GENERATION = "report_generation"
```

### 4.2 `shared/voiceplatform_shared/celery_app.py`

```python
import os
from celery import Celery

def make_celery_app(service_name: str, queue_name: str) -> Celery:
    user = os.environ["RABBITMQ_DEFAULT_USER"]
    password = os.environ["RABBITMQ_DEFAULT_PASS"]
    host = os.environ["RABBITMQ_HOST"]
    port = os.environ["RABBITMQ_PORT"]

    broker_url = f"pyamqp://{user}:{password}@{host}:{port}//"

    app = Celery(service_name, broker=broker_url, backend="rpc://")
    app.conf.update(
        task_default_queue=queue_name,
        task_acks_late=True,             # ack seulement après succès -> pas de perte si crash
        worker_prefetch_multiplier=1,     # 1 tâche à la fois par worker (charge lourde ML)
        task_reject_on_worker_lost=True,
        task_routes={f"{service_name}.*": {"queue": queue_name}},
    )
    return app
```

### 4.3 `shared/voiceplatform_shared/models.py` — contrat de message partagé

```python
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class SessionMessage(BaseModel):
    session_id: str
    patient_id: Optional[str] = None
    raw_audio_path: Optional[str] = None
    cleaned_audio_path: Optional[str] = None
    masked_audio_path: Optional[str] = None
    preprocessing_metrics_path: Optional[str] = None
    labeled_segments: Optional[List[Dict[str, Any]]] = None
    sentence_boundaries: Optional[List[Dict[str, Any]]] = None
    preprocessing_metrics: Optional[Dict[str, Any]] = None
    words: Optional[List[Dict[str, Any]]] = None
    acoustic_features_path: Optional[str] = None
    linguistic_features_path: Optional[str] = None
    metadata: dict = {}
```

Chaque service reçoit et enrichit ce même objet, puis le republie vers la queue suivante. **C'est le contrat unique entre tous les microservices** — ne le casse jamais sans versionner. Note que `metadata.doctor_id` est **requis** dès l'ingestion, car `preprocessing-service` en a besoin pour le matching de voix du médecin.

### 4.4 `shared/voiceplatform_shared/minio_client.py`

```python
import os
from minio import Minio

def get_minio_client() -> Minio:
    return Minio(
        f"{os.environ['MINIO_HOST']}:{os.environ['MINIO_PORT']}",
        access_key=os.environ["MINIO_ROOT_USER"],
        secret_key=os.environ["MINIO_ROOT_PASSWORD"],
        secure=False,
    )
```

### 4.5 `shared/voiceplatform_shared/db_session.py`

```python
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

def get_engine():
    url = (
        f"postgresql+psycopg2://{os.environ['POSTGRES_USER']}:"
        f"{os.environ['POSTGRES_PASSWORD']}@{os.environ['POSTGRES_HOST']}:"
        f"{os.environ['POSTGRES_PORT']}/{os.environ['POSTGRES_DB']}"
    )
    return create_engine(url)

SessionLocal = sessionmaker(bind=get_engine())
```

### 4.6 `shared/setup.py`

```python
from setuptools import setup, find_packages

setup(
    name="voiceplatform_shared",
    version="0.1.0",
    packages=find_packages(),
    install_requires=["pydantic", "celery", "minio", "sqlalchemy", "psycopg2-binary"],
)
```

Chaque `Dockerfile` de service devra faire `COPY shared/ /shared/` puis `pip install /shared` (voir plus bas).

---

## 5. Étape 3 — Auth Service

### `services/auth-service/requirements.txt`
```
fastapi==0.115.0
uvicorn[standard]==0.30.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
sqlalchemy==2.0.30
psycopg2-binary==2.9.9
```

### `services/auth-service/app/main.py`
```python
from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm
from . import auth, database, schemas

app = FastAPI(title="Auth Service")

@app.post("/token", response_model=schemas.Token)
def login(form: OAuth2PasswordRequestForm = Depends()):
    user = auth.authenticate_user(form.username, form.password)
    if not user:
        raise HTTPException(status_code=401, detail="Identifiants invalides")
    token = auth.create_access_token({"sub": user.email, "role": user.role})
    return {"access_token": token, "token_type": "bearer"}

@app.get("/verify")
def verify(token: str):
    payload = auth.decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token invalide")
    return payload
```

`app/auth.py` gère le hash bcrypt + encode/decode JWT avec `python-jose`, en lisant `JWT_SECRET_KEY` depuis l'env. `app/database.py` réutilise `voiceplatform_shared.db_session`. `app/models.py` définit la table `users` (déjà créée par `init.sql`).

### `services/auth-service/Dockerfile`
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY shared/ /shared/
RUN pip install /shared
COPY services/auth-service/requirements.txt .
RUN pip install -r requirements.txt
COPY services/auth-service/app ./app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

> Important : le `docker-compose.yml` doit builder avec **le contexte à la racine du repo** (`context: .`) et `dockerfile: services/auth-service/Dockerfile` pour que `COPY shared/` fonctionne (déjà fait section 3.2). Fais ce changement pour **tous** les services (pas seulement auth).

**Checkpoint 2** : `docker compose up auth-service` puis `curl -X POST localhost:8001/token -d "username=...&password=..."` doit renvoyer un JWT.

---

## 6. Étape 4 — Ingestion Service

Rôle : reçoit l'audio (HTTP/WebSocket), sauvegarde brut sur MinIO (`raw-audio`), crée une ligne `sessions` en Postgres **avec `doctor_id` et `patient_id`**, **publie un message sur la queue `quality_check`**.

`doctor_id` doit être capturé dès cette étape (par exemple via le token JWT du clinicien connecté, ou un champ de formulaire) : `preprocessing-service` le requiert plus loin dans `metadata.doctor_id` pour retrouver le profil vocal du médecin en base.

### `app/publisher.py`
```python
import json
import pika
import os

def publish_session_message(queue_name: str, message: dict):
    credentials = pika.PlainCredentials(
        os.environ["RABBITMQ_DEFAULT_USER"], os.environ["RABBITMQ_DEFAULT_PASS"]
    )
    params = pika.ConnectionParameters(
        host=os.environ["RABBITMQ_HOST"], port=int(os.environ["RABBITMQ_PORT"]),
        credentials=credentials,
    )
    with pika.BlockingConnection(params) as conn:
        channel = conn.channel()
        channel.queue_declare(queue=queue_name, durable=True)
        channel.basic_publish(
            exchange="",
            routing_key=queue_name,
            body=json.dumps(message),
            properties=pika.BasicProperties(delivery_mode=2),  # persistant
        )
```

### `app/main.py` (extrait)
```python
from fastapi import FastAPI, UploadFile, File, Form, Depends
from voiceplatform_shared.minio_client import get_minio_client
from voiceplatform_shared.constants import Queues
from .publisher import publish_session_message
from .database import create_session_record
import uuid

app = FastAPI(title="Ingestion Service")

@app.post("/sessions")
async def create_session(audio: UploadFile = File(...), doctor_id: str = Form(...), patient_id: str = Form(...)):
    session_id = str(uuid.uuid4())
    minio = get_minio_client()
    object_name = f"{session_id}/{audio.filename}"
    minio.put_object("raw-audio", object_name, audio.file, length=-1, part_size=10*1024*1024)

    create_session_record(session_id, raw_audio_path=object_name, doctor_id=doctor_id, patient_id=patient_id)

    publish_session_message(Queues.QUALITY_CHECK, {
        "session_id": session_id,
        "raw_audio_path": object_name,
        "metadata": {"doctor_id": doctor_id, "patient_id": patient_id},
    })
    return {"session_id": session_id, "status": "queued_for_quality_check"}
```

Ajoute `pika==1.3.2` et `boto3`/`minio` au `requirements.txt`.

---

## 7. Pattern à répéter pour CHAQUE service de traitement (le plus important)

Tous les services de `quality-check` à `report-generation` suivent **globalement le même patron** de worker Celery : consommer un message, traiter, republier. `preprocessing-service` est un peu plus riche car il exécute une **séquence de sous-étapes** avant de publier (voir 7.1bis), et `feature-engineering-service` est différent car il **sonde MinIO** plutôt que d'attendre un message unique (voir 7.4).

### 7.1 Template `app/worker.py` générique (services simples)

```python
import json
import logging
from voiceplatform_shared.celery_app import make_celery_app
from voiceplatform_shared.constants import Queues
from voiceplatform_shared.models import SessionMessage
from .checks import run_quality_checks          # <- module métier spécifique au service
from ..publisher import publish_session_message  # publie vers la queue suivante

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = make_celery_app("quality_check_service", Queues.QUALITY_CHECK)

@app.task(name="quality_check_service.process", bind=True, max_retries=3)
def process(self, message: dict):
    msg = SessionMessage(**message)
    try:
        result = run_quality_checks(msg.raw_audio_path)
        if not result.passed:
            # rejeté : on met à jour Postgres, PAS de publication vers la suite
            update_session_status(msg.session_id, "rejected", reason=result.reason)
            return {"status": "rejected", "reason": result.reason}

        update_session_status(msg.session_id, "quality_passed")
        publish_session_message(Queues.PREPROCESSING, msg.dict())
        return {"status": "ok"}

    except Exception as exc:
        logger.exception("Échec traitement session %s", msg.session_id)
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)
```

Points clés à respecter dans **chaque** service :
- `task_acks_late=True` (déjà dans `celery_app.py`) → si le worker crashe pendant le traitement (ex: OOM sur un modèle ML), le message revient dans la queue, pas de perte.
- `max_retries` + backoff exponentiel sur échec transitoire (ex: MinIO temporairement indisponible).
- Sur échec définitif → publier sur la `.dlq` correspondante plutôt que de silencieusement échouer (configure `task_routes` avec un `dead_letter_exchange` dans RabbitMQ, ou fais-le manuellement dans le `except`).
- Toujours mettre à jour le statut en PostgreSQL (`sessions.status`) à chaque étape — c'est ce qui permet au frontend de suivre la progression.

### 7.1bis `preprocessing-service/app/worker.py` — orchestrateur séquentiel

```python
from voiceplatform_shared.celery_app import make_celery_app
from voiceplatform_shared.constants import Queues
from voiceplatform_shared.models import SessionMessage
from .cleaning import clean_waveform
from .role_heuristic import diarize_and_assign_roles, mask_doctor_segments, run_patient_vad
from .publisher import publish_session_message

app = make_celery_app("preprocessing_service", Queues.PREPROCESSING)

@app.task(name="preprocessing_service.process", bind=True, max_retries=3)
def process(self, message: dict):
    msg = SessionMessage(**message)
    assert msg.metadata.get("doctor_id"), "doctor_id manquant : rôle médecin/patient impossible"

    raw = download_from_minio("raw-audio", msg.raw_audio_path)
    cleaned = clean_waveform(raw)                                   # app/cleaning.py
    segments = diarize_and_assign_roles(cleaned, msg.metadata["doctor_id"])  # app/role_heuristic.py
    masked = mask_doctor_segments(cleaned, segments)
    metrics = run_patient_vad(masked, segments)

    outputs = upload_all_to_minio(msg.session_id, cleaned, segments, masked, metrics)  # -> patient-audio/<session_id>/...

    enriched = msg.copy(update={
        "cleaned_audio_path": outputs.cleaned_audio_path,
        "masked_audio_path": outputs.masked_audio_path,
        "preprocessing_metrics_path": outputs.preprocessing_metrics_path,
        "labeled_segments": outputs.labeled_segments,
        "sentence_boundaries": outputs.sentence_boundaries,
        "preprocessing_metrics": outputs.preprocessing_metrics,
    })

    update_session_status(msg.session_id, "preprocessed")
    # fan-out : STT et extraction acoustique démarrent en parallèle, tous deux dès que le prétraitement est prêt
    publish_session_message(Queues.STT_TRANSCRIPTION, enriched.dict())
    publish_session_message(Queues.ACOUSTIC_FEATURES, enriched.dict())
    return {"status": "ok"}
```

> `stt-service` transcrit le fichier `cleaned.wav` (pas `masked_full.wav`) en utilisant `labeled_segments` pour ne découper que les régions patient. `acoustic-feature-service` fait de même : il reslice `cleaned.wav` avec `labeled_segments`, il n'utilise jamais le fichier masqué (le silence artificiel fausserait les mesures d'énergie/pitch).

### 7.2 Lancer le worker (dans le Dockerfile de chaque service)

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY shared/ /shared/
RUN pip install /shared
COPY services/quality-check-service/requirements.txt .
RUN pip install -r requirements.txt
COPY services/quality-check-service/app ./app
CMD ["celery", "-A", "app.worker", "worker", "--loglevel=info", "--concurrency=2"]
```

> Adapte `--concurrency` selon la charge CPU/mémoire de chaque service (mets `--concurrency=1` pour `preprocessing-service`, `stt-service` et `fusion-classification-service`, qui sont lourds en GPU/RAM).
> Pour `preprocessing-service`, le `requirements.txt` doit inclure `pyannote.audio`, `webrtcvad`, `noisereduce`, `pydub`, `torchaudio`, et le Dockerfile doit copier les dépendances audio système (`ffmpeg`, `libsndfile1`).

### 7.3 Ce qui change service par service

| Service | Queue consommée | Module métier | Queue(s) publiée(s) ensuite |
|---|---|---|---|
| quality-check | `quality_check` | `checks.py` (pyloudnorm, librosa SNR) | `preprocessing` |
| **preprocessing** | `preprocessing` | `cleaning.py` (mono/16kHz, noisereduce, pydub) + `role_heuristic.py` (pyannote diarization, embedding vs médecin, masquage, Silero VAD, métriques de pause) | **`stt_transcription` ET `acoustic_features`** (fan-out direct, les deux démarrent en parallèle) |
| stt | `stt_transcription` | `stt_per_segment.py` (découpe/fusion régions patient, transcription batch GPU FarukSTT) + `validate_word_timestamps.py` | `linguistic_features` (uniquement si mots utilisables après validation) |
| acoustic-feature | `acoustic_features` | `audio_utils.py` (reslice patient-only depuis `cleaned.wav` + `labeled_segments`) + `features.py` (eGeMAPS via openSMILE, MFCC via librosa) | `feature_engineering` |
| linguistic-feature | `linguistic_features` | `features.py` (reconstruction de phrases par timing/pauses + POS tagging local XLM-R Tunisien) | `feature_engineering` |
| feature-engineering | `feature_engineering` | sonde MinIO avec retry/backoff pour `acoustic_features.json` **et** `linguistic_features.json`, aplatit en clés pointées, sélectionne un sous-ensemble curé des variables linguistiques, écrit un CSV long-format | `fusion_classification` |
| fusion-classification | `fusion_classification` | `fusion.py`, `classify.py`, `shap_explain.py` | `report_generation` |
| report | `report_generation` | `generate_pdf.py` (Jinja2 + WeasyPrint) | fin de pipeline → update Postgres `session_results` |

### 7.4 Le point délicat : le "join" en `feature-engineering-service`

Contrairement à un design par table Postgres de coordination, l'implémentation réelle de `feature-engineering-service` **sonde directement MinIO** pour vérifier la présence des deux fichiers de features, avec retry/backoff, plutôt que d'attendre un deuxième message RabbitMQ corrélé. Comme `preprocessing-service` déclenche `acoustic_features` directement (et non `stt-service`), et que `linguistic_features` dépend du résultat STT, les deux branches n'arrivent jamais en même temps — ce join doit être résilient à l'attente.

```python
# feature-engineering-service/app/worker.py
import time
from voiceplatform_shared.minio_client import get_minio_client

ACOUSTIC_KEY = "{session_id}/acoustic_features.json"
LINGUISTIC_KEY = "{session_id}/linguistic_features.json"

@app.task(name="feature_engineering_service.process", bind=True, max_retries=10)
def process(self, message: dict):
    session_id = message["session_id"]
    minio = get_minio_client()

    acoustic = try_load_json(minio, "patient-audio", ACOUSTIC_KEY.format(session_id=session_id))
    linguistic = try_load_json(minio, "patient-audio", LINGUISTIC_KEY.format(session_id=session_id))

    if acoustic is None or linguistic is None:
        # l'autre branche n'a pas encore terminé -> retente avec backoff exponentiel plutôt que d'échouer
        raise self.retry(countdown=min(2 ** self.request.retries, 60))

    flat_acoustic = flatten(acoustic)                       # egemaps_f0_mean, mfcc1_mean, ...
    curated_linguistic = select_curated_linguistic_fields(linguistic)  # total_words, lexical_diversity, pause_count, ...

    csv_path = build_long_format_csv(message["patient_id"], flat_acoustic, curated_linguistic)
    upload_to_minio("patient-audio", f"features/features_{message['patient_id']}.csv", csv_path)

    publish_session_message(Queues.FUSION_CLASSIFICATION, {**message, "features_path": csv_path})
    return {"status": "ok"}
```

> Cette tâche est appelée **deux fois par session** (une fois déclenchée par `acoustic-feature-service`, une fois par `linguistic-feature-service`) : la première invocation trouvera un seul fichier présent et retentera/échouera intentionnellement jusqu'à ce que le second arrive ; la seconde invocation (déclenchée par l'autre branche) trouvera les deux fichiers et complètera la fusion. C'est acceptable car la tâche est idempotente (elle réécrit le même CSV).

---

## 8. Étape finale — Report Service

Consomme `report_generation`, rend `templates/report.html.j2` avec Jinja2, convertit en PDF via WeasyPrint, upload sur bucket MinIO `reports`, génère une URL signée (`minio.presigned_get_object`), et écrit tout dans `session_results`. Fin du pipeline → `sessions.status = 'completed'`.

---

## 9. CI — `.github/workflows/ci.yml`

```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service:
          - auth-service
          - ingestion-service
          - quality-check-service
          - preprocessing-service
          - stt-service
          - acoustic-feature-service
          - linguistic-feature-service
          - feature-engineering-service
          - fusion-classification-service
          - report-service
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - name: Install shared package
        run: pip install ./shared
      - name: Install service deps
        run: pip install -r services/${{ matrix.service }}/requirements.txt
      - name: Lint
        run: pip install ruff && ruff check services/${{ matrix.service }}/app
      - name: Unit tests
        run: pytest services/${{ matrix.service }}/tests --maxfail=1
```

---

## 10. Checklist finale avant de considérer que le POC est "complet"

- [ ] `docker compose up --build` démarre tous les services sans erreur
- [ ] Un fichier audio de test envoyé à `/ingest/sessions` (avec `doctor_id` et `patient_id`) traverse tout le pipeline jusqu'à un PDF dans MinIO `reports`
- [ ] `preprocessing-service` produit bien les 4 objets attendus dans `patient-audio/<session_id>/` : `cleaned.wav`, `labeled_segments.json`, `masked_full.wav`, `preprocessing_metrics.json`
- [ ] `stt-service` et `acoustic-feature-service` démarrent bien en parallèle juste après le prétraitement (pas l'un après l'autre)
- [ ] `linguistic-feature-service` ne démarre qu'après la validation des timestamps STT
- [ ] `feature-engineering-service` produit `features/features_<patient_id>.csv` seulement une fois les deux JSON de features présents
- [ ] Chaque queue RabbitMQ a sa `.dlq` configurée (vérifiable dans l'UI `localhost:15672`)
- [ ] `sessions.status` en Postgres reflète bien chaque étape (created → quality_passed → preprocessed → ... → completed / rejected)
- [ ] Auth JWT est vérifié par Nginx ou en amont de chaque endpoint HTTP exposé
- [ ] Les secrets (`.env`) ne sont jamais commit — seulement `.env.example`
- [ ] CI passe (lint + tests unitaires) sur chaque service
- [ ] Logs structurés (JSON) dans chaque worker pour debug en prod plus tard

---

Une fois ce squelette qui tourne bout-en-bout (même avec des modules métier "factices" au début — retourne juste des valeurs bidon), remplace progressivement chaque module métier (`checks.py`, `cleaning.py`, `role_heuristic.py`, `stt_per_segment.py`, etc.) par la vraie implémentation ML. Ça te permet de valider le plumbing (RabbitMQ, Postgres, MinIO, orchestration) indépendamment du travail ML, qui est la partie la plus longue.