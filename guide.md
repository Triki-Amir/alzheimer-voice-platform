# Alzheimer/MCI Voice Screening Platform — Guide de démarrage

Architecture microservices pour le dépistage Alzheimer/MCI par analyse vocale. Communication asynchrone via **RabbitMQ + Celery**, stockage objet **MinIO**, base relationnelle **PostgreSQL**.

> **État actuel** : ce README couvre uniquement les services **testés et fonctionnels** à ce stade du développement. Les autres services du pipeline (STT, feature extraction, fusion/classification, report) seront documentés au fur et à mesure de leur implémentation.

---

## Prérequis

- Docker Desktop (avec support Docker Compose v2)
- Un compte HuggingFace avec les conditions acceptées pour :
  - [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
  - [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0)
  - [pyannote/embedding](https://huggingface.co/pyannote/embedding)
- Un token HuggingFace en lecture (`HF_TOKEN`)

On Ubuntu, run this:
1. Install system dependency (required)

sudo apt update
sudo apt install ffmpeg
#pyannote.audio (v4+) needs ffmpeg for audio loading via torchcodec.

2. (Recommended) Create a virtual environment

python3 -m venv pyannote-env
source pyannote-env/bin/activate

3. Install the package

pip install --upgrade pip
pip install pyannote.audio

That’s it.

Optional but useful notes
After installation (important)
To use the pretrained models you also need to:

1-Accept the model conditions on Hugging Face
2-Create a Hugging Face access token at https://huggingface.co/settings/tokens
3-Pass the token when loading a pipeline

Example:
Pythonfrom pyannote.audio import Pipeline
pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-community-1",
    token="YOUR_HF_TOKEN"
)

---

## 1. Configuration initiale

Clone le repo, puis crée ton fichier d'environnement à partir du template :

```bash
cp .env.exemple .env
```

Édite `.env` et renseigne au minimum :

```env
POSTGRES_USER=voiceapp
POSTGRES_PASSWORD=changeme_strong_password
POSTGRES_DB=voiceapp_db
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

RABBITMQ_DEFAULT_USER=voiceapp
RABBITMQ_DEFAULT_PASS=changeme_strong_password
RABBITMQ_HOST=rabbitmq
RABBITMQ_PORT=5672

MINIO_ROOT_USER=voiceapp
MINIO_ROOT_PASSWORD=changeme_strong_password
MINIO_HOST=minio
MINIO_PORT=9000

HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxx
```

**Ne commit jamais `.env`** — il est dans `.gitignore`. Seul `.env.example` (sans vrais secrets) doit être versionné.

---

## 2. Lancer l'infrastructure de base

```bash
docker compose up -d postgres rabbitmq minio minio-init
```

Vérifie que tout est sain :

```bash
docker compose ps
```

Tu dois voir `postgres`, `rabbitmq`, et `minio` avec le statut `healthy`, et `minio-init` avec `exited (0)` (normal, c'est un job one-shot qui crée les buckets).

### Accès aux interfaces

| Service | URL | Identifiants |
|---|---|---|
| RabbitMQ Management | http://localhost:15672 | valeurs de `.env` |
| MinIO Console | http://localhost:9001 | valeurs de `.env` |
| PostgreSQL | `localhost:5432` | valeurs de `.env` |

### Vérifier le schéma PostgreSQL

```bash
docker compose exec postgres psql -U voiceapp -d voiceapp_db -c "\dt"
```

Tables attendues : `patients`, `sessions`, `session_features`, `session_results`, `users`, `doctor_voice_profiles`.

### Vérifier les buckets MinIO

Dans la console (http://localhost:9001), tu dois voir les buckets : `raw-audio`, `patient-audio`, `reports`.

---

## 3. Service : Preprocessing (réduction de bruit + diarization + extraction + VAD)

Nettoie l'audio brut : suppression du bruit constant/stationnaire et normalisation d'amplitude de la voix.

### Build & lancement

```bash
docker compose up -d --build preprocessing-service
docker compose logs -f preprocessing-service
```

Attends de voir `celery@... ready.` avant de continuer.

### Test manuel (sans passer par l'ingestion)

1. Upload un fichier `.wav` de test dans MinIO, bucket `raw-audio` (ex: `test1.WAV`), via la console web.
2. Envoie une tâche de test :

```bash
pip install celery
python scripts/test_publish.py
```

(Le script cible maintenant la queue `preprocessing` avec `session_id` et `raw_audio_path` — adapte le chemin si besoin.)

3. Vérifie dans les logs : `Session ... nettoyée avec succès` et `Task ... succeeded`.
4. Vérifie dans MinIO, bucket `patient-audio` : les artefacts `<session_id>/cleaned.wav`, `<session_id>/diarization.json`, `<session_id>/patient.wav` et `<session_id>/pause_metrics.json` doivent être apparus.

---

## 4. Prétraitement unifié : cleaning + diarization + extraction + VAD

Sépare les segments de parole par locuteur, identifie automatiquement le médecin en comparant chaque segment à un profil vocal de référence, extrait les segments patient, puis calcule les métriques de pause.

### 4.1 Enregistrer un profil vocal de médecin (prérequis avant de tester ce service)

Insère un médecin factice en base (à faire une seule fois) :

```bash
docker compose exec postgres psql -U voiceapp -d voiceapp_db -c "
INSERT INTO users (id, email, hashed_password, role)
VALUES ('11111111-1111-1111-1111-111111111111', 'doc@test.com', 'x', 'clinician')
ON CONFLICT DO NOTHING;"
```

Place un court échantillon vocal du médecin (5-15s, voix seule) dans `test-samples/`, puis build l'image et exécute le script d'enrôlement :

```bash
docker compose build preprocessing-service

docker compose run --rm \
  -v ${PWD}/scripts:/scripts \
  -v ${PWD}/test-samples:/test-samples \
  preprocessing-service python /scripts/enroll_doctor.py \
  11111111-1111-1111-1111-111111111111 \
  /test-samples/doctor1_sample.wav
```

Confirme l'insertion :

```bash
docker compose exec postgres psql -U voiceapp -d voiceapp_db -c \
  "SELECT doctor_id, array_length(embedding,1) FROM doctor_voice_profiles;"
```

### 4.2 Lancer le service

```bash
docker compose up -d preprocessing-service
docker compose logs -f preprocessing-service
```

Premier démarrage plus long (téléchargement des modèles pyannote — 1-2 min).

### 4.3 Test manuel

Adapte `scripts/test_publish.py` pour cibler la queue `preprocessing` avec un audio contenant les deux voix (médecin + patient), en incluant `doctor_id` dans `metadata`, puis :

```bash
python scripts/test_publish.py
```

Vérifie dans les logs : `Prétraitement terminé pour session ...`.
Vérifie dans MinIO, bucket `patient-audio` : les artefacts de nettoyage, diarization, extraction patient et VAD doivent être apparus.

---

## Commandes utiles

| Action | Commande |
|---|---|
| Voir l'état de tous les conteneurs | `docker compose ps` |
| Logs d'un service en direct | `docker compose logs -f <service>` |
| Rebuild un service après modification du code | `docker compose up -d --build <service>` |
| Rebuild sans cache (après changement de dépendances) | `docker compose build --no-cache <service>` |
| Arrêter tout | `docker compose down` |
| Arrêter et supprimer aussi les volumes (reset complet) | `docker compose down -v` |
| Purger une queue RabbitMQ bloquée | `docker compose exec rabbitmq rabbitmqctl purge_queue <nom_queue>` |
| Ouvrir un shell Postgres | `docker compose exec postgres psql -U voiceapp -d voiceapp_db` |

---

## Prochaines étapes (non couvertes par ce README)

- Voice Extraction Service (extraction des segments patient uniquement)
- VAD + Segmentation Service (Silero VAD, métriques de pauses)
- STT Service (transcription)
- Acoustic / Linguistic Feature Extraction
- Feature Engineering (fusion des features)
- Fusion & Classification + SHAP
- Report Service (génération PDF)
- Auth Service & Ingestion Service (mis de côté pour le moment)
