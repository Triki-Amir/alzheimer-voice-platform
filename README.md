# Guide d'implémentation — Plateforme de Dépistage Alzheimer/MCI par Analyse Vocale
### (Version RabbitMQ au lieu de Celery+Redis)

Ce guide part de zéro et te donne l'ordre exact des étapes, l'arborescence complète des dossiers/fichiers, et le contenu de chaque brique. Suis-le service par service — ne saute pas d'étape, chaque service dépend du précédent.

---

## 0. Décisions d'architecture (à valider avant de coder)

- **Message broker** : RabbitMQ remplace Redis comme broker Celery. Celery supporte nativement RabbitMQ (`pyamqp://`), donc tu gardes Celery comme framework de tâches, mais RabbitMQ comme transport. Redis reste utile séparément comme **cache / backend de résultats** (optionnel) — sinon tu peux utiliser PostgreSQL ou RPC pour les résultats.
- **Orchestration locale** : Docker Compose (comme prévu dans le diagramme).
- **Communication inter-services** : asynchrone via RabbitMQ (queues dédiées par étape du pipeline), pas d'appels HTTP synchrones entre microservices de traitement.
- **Chaque microservice = un conteneur Docker indépendant**, avec son propre `Dockerfile`, ses dépendances, et un seul worker Celery qui écoute une queue précise.

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
│   ├── quality-check-service/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── worker.py             # Celery worker (consume queue "quality_check")
│   │   │   ├── checks.py             # LUFS, SNR, clipping, durée
│   │   │   └── publisher.py
│   │   └── tests/
│   │
│   ├── audio-cleaning-service/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── worker.py
│   │   │   └── cleaning.py           # RNNoise / noisereduce
│   │   └── tests/
│   │
│   ├── diarization-service/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── worker.py
│   │   │   ├── diarize.py            # pyannote.audio
│   │   │   └── role_heuristic.py
│   │   └── tests/
│   │
│   ├── voice-extraction-service/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── worker.py
│   │   │   └── extract.py            # découpe/concat segments patient
│   │   └── tests/
│   │
│   ├── vad-segmentation-service/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── worker.py
│   │   │   ├── vad.py                # Silero VAD
│   │   │   └── metrics.py            # pause_metrics.json
│   │   └── tests/
│   │
│   ├── stt-service/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── worker.py
│   │   │   └── transcribe.py         # farukSTT
│   │   └── tests/
│   │
│   ├── acoustic-feature-service/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── worker.py
│   │   │   └── features.py           # openSMILE, librosa, Parselmouth, wav2vec2
│   │   └── tests/
│   │
│   ├── linguistic-feature-service/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── worker.py
│   │   │   └── features.py           # AraBERT, XLM-R/BGE-M3
│   │   └── tests/
│   │
│   ├── feature-engineering-service/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── worker.py             # attend les 2 features (join/barrier)
│   │   │   └── engineer.py           # scaling, VIF, sélection
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
5. Quality Check Service — premier consumer RabbitMQ, valide la chaîne bout en bout
6. Prétraitement (Cleaning → Diarization → Extraction → VAD) — 1 service Celery orchestrateur
7. STT Service
8. Feature extraction (Acoustic + Linguistic, en parallèle)
9. Feature Engineering (le "join" des deux)
10. Fusion & Classification + SHAP
11. Report Service
12. CI (GitHub Actions) + tests d'intégration bout en bout

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
```

Copie ce fichier en `.env.example` (sans les vrais secrets) pour le versionner, et mets `.env` dans `.gitignore`.

### 3.2 `docker-compose.yml` (racine) — squelette infra

```yaml
version: "3.9"

services:
  postgres:
    build: ./infra/postgres
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
    build: ./infra/rabbitmq
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
    build: ./infra/nginx
    ports:
      - "80:80"
    depends_on:
      - auth-service
      - ingestion-service

  auth-service:
    build: ./services/auth-service
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "8001:8000"

  ingestion-service:
    build: ./services/ingestion-service
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
    build: ./services/quality-check-service
    env_file: .env
    depends_on:
      rabbitmq:
        condition: service_healthy

  preprocessing-service:
    build: ./services/preprocessing-service
    env_file: .env
    environment:
      - HF_TOKEN=${HF_TOKEN}
    depends_on:
      rabbitmq:
        condition: service_healthy

  stt-service:
    build: ./services/stt-service
    env_file: .env
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
    build: ./services/acoustic-feature-service
    env_file: .env
    depends_on:
      rabbitmq:
        condition: service_healthy

  linguistic-feature-service:
    build: ./services/linguistic-feature-service
    env_file: .env
    depends_on:
      rabbitmq:
        condition: service_healthy

  feature-engineering-service:
    build: ./services/feature-engineering-service
    env_file: .env
    depends_on:
      rabbitmq:
        condition: service_healthy

  fusion-classification-service:
    build: ./services/fusion-classification-service
    env_file: .env
    depends_on:
      rabbitmq:
        condition: service_healthy

  report-service:
    build: ./services/report-service
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

> Note GPU : si tu n'as pas de GPU local, retire le bloc `deploy.resources` du `stt-service`.

### 3.3 `infra/rabbitmq/Dockerfile`

```dockerfile
FROM rabbitmq:3.13-management
COPY definitions.json /etc/rabbitmq/definitions.json
RUN echo "management.load_definitions = /etc/rabbitmq/definitions.json" >> /etc/rabbitmq/rabbitmq.conf
```

### 3.4 `infra/rabbitmq/definitions.json` — déclare toutes les queues à l'avance

C'est ici que tu définis **une queue par étape du pipeline** (ce qui remplace les tâches Celery "implicites" de Redis) :

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

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id),
    status TEXT NOT NULL DEFAULT 'created',
    raw_audio_path TEXT,
    patient_audio_path TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
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
COPY nginx.conf /etc/nginx/nginx.conf
```

**Checkpoint 1** : lance `docker compose up postgres rabbitmq minio minio-init nginx` — vérifie que RabbitMQ management UI répond sur `localhost:15672`, MinIO console sur `localhost:9001`, et que les buckets existent.

---

## 4. Étape 2 — Package `shared` (config Celery/RabbitMQ commune)

### 4.1 `shared/voiceplatform_shared/constants.py`

```python
class Queues:
    QUALITY_CHECK = "quality_check"
    AUDIO_CLEANING = "audio_cleaning"
    DIARIZATION = "diarization"
    VOICE_EXTRACTION = "voice_extraction"
    VAD_SEGMENTATION = "vad_segmentation"
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
from typing import Optional

class SessionMessage(BaseModel):
    session_id: str
    raw_audio_path: Optional[str] = None
    patient_audio_path: Optional[str] = None
    transcript_path: Optional[str] = None
    acoustic_features_path: Optional[str] = None
    linguistic_features_path: Optional[str] = None
    pause_metrics_path: Optional[str] = None
    metadata: dict = {}
```

Chaque service reçoit et enrichit ce même objet, puis le republie vers la queue suivante. **C'est le contrat unique entre tous les microservices** — ne le casse jamais sans versionner.

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

> Important : le `docker-compose.yml` doit builder avec **le contexte à la racine du repo** (`context: .`) et `dockerfile: services/auth-service/Dockerfile` pour que `COPY shared/` fonctionne. Ajuste chaque bloc `build:` en conséquence :
> ```yaml
> auth-service:
>   build:
>     context: .
>     dockerfile: services/auth-service/Dockerfile
> ```
> Fais ce changement pour **tous** les services (pas seulement auth).

**Checkpoint 2** : `docker compose up auth-service` puis `curl -X POST localhost:8001/token -d "username=...&password=..."` doit renvoyer un JWT.

---

## 6. Étape 4 — Ingestion Service

Rôle : reçoit l'audio (HTTP/WebSocket), sauvegarde brut sur MinIO (`raw-audio`), crée une ligne `sessions` en Postgres, **publie un message sur la queue `quality_check`**.

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
from fastapi import FastAPI, UploadFile, File, Depends
from voiceplatform_shared.minio_client import get_minio_client
from voiceplatform_shared.constants import Queues
from .publisher import publish_session_message
from .database import create_session_record
import uuid

app = FastAPI(title="Ingestion Service")

@app.post("/sessions")
async def create_session(audio: UploadFile = File(...)):
    session_id = str(uuid.uuid4())
    minio = get_minio_client()
    object_name = f"{session_id}/{audio.filename}"
    minio.put_object("raw-audio", object_name, audio.file, length=-1, part_size=10*1024*1024)

    create_session_record(session_id, raw_audio_path=object_name)

    publish_session_message(Queues.QUALITY_CHECK, {
        "session_id": session_id,
        "raw_audio_path": object_name,
    })
    return {"session_id": session_id, "status": "queued_for_quality_check"}
```

Ajoute `pika==1.3.2` et `boto3`/`minio` au `requirements.txt`.

---

## 7. Pattern à répéter pour CHAQUE service de traitement (le plus important)

Tous les services de `quality-check` à `report-generation` suivent **exactement le même patron**. Une fois que tu maîtrises celui-ci, tu dupliques.

### 7.1 Template `app/worker.py` générique

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
        publish_session_message(Queues.AUDIO_CLEANING, msg.dict())
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

> Adapte `--concurrency` selon la charge CPU/mémoire de chaque service (mets `--concurrency=1` pour STT/diarisation/fusion qui sont lourds en GPU/RAM).

### 7.3 Ce qui change service par service

| Service | Queue consommée | Module métier | Queue publiée ensuite |
|---|---|---|---|
| quality-check | `quality_check` | `checks.py` (pyloudnorm, librosa SNR) | `audio_cleaning` |
| preprocessing | `preprocessing` | `cleaning.py` + `diarize.py` + `extract.py` + `vad.py` + `metrics.py` | `stt_transcription` |
| stt | `stt_transcription` | `transcribe.py` (farukSTT) | **deux** queues : `acoustic_features` ET `linguistic_features` |
| acoustic-feature | `acoustic_features` | `features.py` (openSMILE, Parselmouth, wav2vec2) | `feature_engineering` |
| linguistic-feature | `linguistic_features` | `features.py` (AraBERT, XLM-R) | `feature_engineering` |
| feature-engineering | `feature_engineering` | `engineer.py` — **attend les 2 messages (acoustic + linguistic) avant de continuer** | `fusion_classification` |
| fusion-classification | `fusion_classification` | `fusion.py`, `classify.py`, `shap_explain.py` | `report_generation` |
| report | `report_generation` | `generate_pdf.py` (Jinja2 + WeasyPrint) | fin de pipeline → update Postgres `session_results` |

### 7.4 Le point délicat : le "join" en `feature-engineering-service`

Comme `stt-service` publie vers deux queues séparées, `feature-engineering-service` doit **attendre les deux résultats** avant de lancer la fusion. Pattern recommandé :

```python
# feature-engineering-service/app/worker.py
@app.task(name="feature_engineering_service.process")
def process(message: dict):
    msg = SessionMessage(**message)
    save_partial_result(msg.session_id, message)   # upsert dans PostgreSQL

    if both_features_ready(msg.session_id):         # SELECT en base: acoustic + linguistic présents ?
        full_msg = load_combined_message(msg.session_id)
        engineered = engineer_features(full_msg)
        publish_session_message(Queues.FUSION_CLASSIFICATION, engineered)
    # sinon: on attend le second message, rien à publier maintenant
```

Utilise la table `session_features` (déjà créée dans `init.sql`, colonne `feature_type`) comme mémoire tampon pour ce join — c'est plus robuste qu'un état en mémoire dans le worker (qui peut être multi-instance).

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
- [ ] Un fichier audio de test envoyé à `/ingest/sessions` traverse tout le pipeline jusqu'à un PDF dans MinIO `reports`
- [ ] Chaque queue RabbitMQ a sa `.dlq` configurée (vérifiable dans l'UI `localhost:15672`)
- [ ] `sessions.status` en Postgres reflète bien chaque étape (created → quality_passed → ... → completed / rejected)
- [ ] Auth JWT est vérifié par Nginx ou en amont de chaque endpoint HTTP exposé
- [ ] Les secrets (`.env`) ne sont jamais commit — seulement `.env.example`
- [ ] CI passe (lint + tests unitaires) sur chaque service
- [ ] Logs structurés (JSON) dans chaque worker pour debug en prod plus tard

---

Une fois ce squelette qui tourne bout-en-bout (même avec des modules métier "factices" au début — retourne juste des valeurs bidon), remplace progressivement chaque module métier (`checks.py`, `diarize.py`, `transcribe.py`, etc.) par la vraie implémentation ML. Ça te permet de valider le plumbing (RabbitMQ, Postgres, MinIO, orchestration) indépendamment du travail ML, qui est la partie la plus longue.
