# Preprocessing service guide (Ubuntu)

This service is an asynchronous Celery worker.  It receives an audio-processing
message from RabbitMQ, reads the source WAV from MinIO, and stores its outputs
back in MinIO.  It is **not** an HTTP server.

The commands below are intended to be run from the repository root (the
directory containing `docker-compose.yml`, `shared/`, and `services/`).

## What the pipeline does

`app/worker.py` registers the `preprocessing_service.process` Celery task on
the `preprocessing` queue.  The task needs this message shape:

```json
{
  "session_id": "a-session-id",
  "raw_audio_path": "path/in/raw-audio.wav",
  "metadata": { "doctor_id": "doctor-uuid" }
}
```

Processing is performed in this order:

1. **Download and inspect input.** The worker downloads
   `raw-audio/<raw_audio_path>` to a temporary directory and gets its original
   WAV duration.
2. **Clean audio (`cleaning.py`).** It reads the WAV, downmixes stereo to mono,
   resamples it to 16 kHz, finds a non-speech noise sample with WebRTC VAD (or
   an energy-based fallback), selects adaptive noise-reduction settings,
   removes stationary noise, then normalizes volume.  The cleaned WAV is
   uploaded to `patient-audio/<session_id>/cleaned.wav`.
3. **Diarize speakers (`diarize.py`).** Pyannote's
   `speaker-diarization-3.1` model detects time ranges and anonymous speaker
   labels in the cleaned audio.  It downloads from Hugging Face on first use.
4. **Identify the doctor (`embeddings.py`, `role_heuristic.py`).** The worker
   loads the enrolled doctor voice embedding from PostgreSQL
   (`doctor_voice_profiles`), generates Pyannote embeddings for diarized turns
   of at least 0.25 seconds, and compares them by cosine similarity.  The
   speaker with the largest average similarity is labelled `doctor`; all other
   speakers are labelled `patient`.  A score below 0.65 is retained as a
   warning, not a rejection.
5. **Build patient-only audio (`extract.py`).** Patient turns of at least
   100 ms are concatenated without inserted silence.  This deliberately avoids
   counting doctor turns as patient pauses.  The result is uploaded to
   `patient-audio/<session_id>/patient.wav`.  The metadata also records how
   positions in this concatenated file map to original timestamps.
6. **Detect speech and pauses (`vad.py`, `metrics.py`).** Silero VAD finds
   speech intervals in `patient.wav`; overlapping intervals are merged and the
   remaining gaps become pause metrics.
7. **Persist results.** One consolidated document is written to
   `patient-audio/<session_id>/preprocessing_metrics.json`.  The successful
   task result contains paths, timestamp mapping, and the same metrics in its
   metadata.

If an error occurs, Celery retries up to three times with 1, 2, then 4-second
delays.  Common non-retriable-in-practice causes are a missing `doctor_id`, no
enrolled doctor voice profile, only one diarized speaker, unavailable Hugging
Face access, or missing MinIO buckets/objects.

## Prerequisites

- Ubuntu 22.04/24.04, Git, Docker Engine, and Docker Compose v2.
- A Hugging Face token in `HF_TOKEN` that has accepted access conditions for
  `pyannote/speaker-diarization-3.1` and `pyannote/embedding`.
- Running PostgreSQL, RabbitMQ, and MinIO configured with the project values.
- MinIO buckets named `raw-audio` and `patient-audio`.
- An enrolled `doctor_voice_profiles` record for every `doctor_id` submitted
  to this worker.
- For a realistic test, a WAV with both the enrolled doctor's voice and a
  patient's voice.  A single-speaker recording is intentionally rejected.

Install Docker on Ubuntu using Docker's official instructions, then verify:

```bash
docker --version
docker compose version
```

If Docker requires `sudo`, either prefix the commands below with `sudo` or add
your user to the `docker` group and log in again.

## Configure the project

```bash
cd /path/to/alzheimer-voice-platform
cp .env.exemple .env
chmod 600 .env
```

Edit `.env` and use real, non-default secrets.  It must contain the values
used by this worker:

```dotenv
POSTGRES_USER=...
POSTGRES_PASSWORD=...
POSTGRES_DB=...
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
RABBITMQ_DEFAULT_USER=...
RABBITMQ_DEFAULT_PASS=...
RABBITMQ_HOST=rabbitmq
RABBITMQ_PORT=5672
MINIO_ROOT_USER=...
MINIO_ROOT_PASSWORD=...
MINIO_HOST=minio
MINIO_PORT=9000
HF_TOKEN=hf_...
```

Do not commit `.env` or paste the token into scripts, logs, or this guide.

## Build and run the container

The Dockerfile's `COPY shared/` and `COPY services/...` paths require the
**repository root** as Docker build context.  Do not run `docker build` from
this service directory.

### Required dependency fix before the first build

As committed, the worker image cannot import `app.cleaning`: that module
imports `webrtcvad`, but `requirements.txt` does not install it.  Add a
runtime-compatible provider before building (the wheel package exposes the
same `webrtcvad` Python import):

```text
# services/preprocessing-service/requirements.txt
webrtcvad-wheels==2.0.14
```

Alternatively, install `webrtcvad` from source and add a compiler to the
Docker image.  The prebuilt-wheel option is simpler on Ubuntu and the supplied
`python:3.11-slim` image.

Start the stack and build this service:

```bash
docker compose up -d --build postgres rabbitmq minio preprocessing-service
docker compose logs -f preprocessing-service
```

On the first worker job, Pyannote and Silero model downloads can take time.
The Compose volume `diarization_models` caches Hugging Face artifacts between
container restarts.  A healthy worker eventually logs that it is ready.

To rebuild only after editing this service:

```bash
docker compose build preprocessing-service
docker compose up -d preprocessing-service
```

## Local Python environment (optional)

Use this for code exploration and unit tests; Docker remains the closest match
to production.  On Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-venv python3-dev build-essential ffmpeg libsndfile1 git
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r services/preprocessing-service/requirements.txt
pip install -e shared
pip install webrtcvad pytest
```

`webrtcvad` is imported by `app/cleaning.py` but is currently absent from
`services/preprocessing-service/requirements.txt`.  `pytest` is also absent
because it is a test-only dependency.  Add both to the project dependency
management before treating this setup as reproducible CI.

## Test the code

Run the small unit-test suite from the repository root:

```bash
source .venv/bin/activate
pytest -q services/preprocessing-service/tests
```

### Current test correction required

At the time of writing, `test_extract.py` is stale: it unpacks two values,
whereas `extract_patient_segments()` now returns three values:
`(output_path, timestamp_mapping, duration_seconds)`.  Change its assignment
to the following before expecting the suite to pass:

```python
extracted_path, extracted_segments, duration_seconds = extract_patient_segments(
    str(input_path), segments, str(output_path)
)
```

The existing assertions for `extracted_path`, `extracted_segments`, and file
existence can remain; optionally assert `duration_seconds == 2.0`.  This is a
test-code mismatch, not a Docker or environment failure.

## End-to-end worker test

1. Start the dependencies and worker using the Build and run section.
2. In MinIO, create `raw-audio` and `patient-audio` if the platform has not
   already created them.  Upload a test WAV to `raw-audio`, for example
   `test1.WAV`.
3. Ensure PostgreSQL contains the matching doctor's enrolled voice embedding.
   The repository's `scripts/enroll_doctor.py` can create one from a 5--15
   second doctor-only WAV.  Put the sample in `test-samples/` and run:

```bash
docker compose run --rm \
  -v "$PWD/scripts:/scripts" \
  -v "$PWD/test-samples:/test-samples" \
  preprocessing-service python /scripts/enroll_doctor.py \
  "<doctor-uuid>" /test-samples/doctor_sample.wav
```

   The doctor UUID passed here must be the one in the published task metadata.
4. Publish a task.  The repository provides `scripts/test_publish.py`; it
   targets the `preprocessing` queue and expects `test1.WAV` plus its configured
   doctor UUID.  With the local virtual environment active:

```bash
pip install celery
python scripts/test_publish.py
```

5. Watch the worker:

```bash
docker compose logs -f preprocessing-service
```

6. Verify all actual outputs in MinIO under `patient-audio/<session_id>/`:

```text
cleaned.wav
patient.wav
preprocessing_metrics.json
```

`diarization.json` and `pause_metrics.json` are **not** current outputs; older
project notes that list them no longer match `worker.py`.  Diarization scores
and pause metrics are consolidated in `preprocessing_metrics.json`, while the
timestamp mapping is returned in the Celery task result metadata.

## Operational checks

- Verify the worker is consuming the `preprocessing` queue and RabbitMQ is
  reachable using the values in `.env`.
- If model loading fails, validate `HF_TOKEN` and model-access approval, then
  restart the worker after correcting the environment.
- If role assignment fails, verify the doctor profile exists and use audio with
  two clear voices and turns longer than 0.25 seconds.
- If MinIO access fails, check bucket names, endpoint host/port, and credentials.
- If audio conversion fails, verify `ffmpeg` and `libsndfile1` are installed;
  the supplied Dockerfile installs both.
