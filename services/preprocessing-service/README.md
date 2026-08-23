# Preprocessing Service

## Overview

The preprocessing service is the first clinical-quality cleaning stage in the Alzheimer voice pipeline. It receives a raw session recording from MinIO, removes noise, separates the doctor and patient voices, masks the doctor audio, and produces metrics that downstream services can trust.

This service is implemented as a Celery worker, not as an HTTP API. It listens to the `preprocessing` queue, consumes one session at a time, and then dispatches the next tasks to STT and acoustic extraction.

Its goal is not only to make audio readable, but to create a reliable temporal structure for the rest of the pipeline. It answers three essential questions:

- What parts of the recording are speech vs silence?
- Which speaker is the doctor, and which is the patient?
- What clean, patient-only signal should downstream STT and acoustic features use?

---

## Pipeline

The service runs the following sequential steps:

1. Download raw WAV from MinIO
2. Measure original duration
3. Clean the waveform
4. Run speaker diarization
5. Match each diarized speaker to the enrolled doctor using voice embedding similarity
6. Mask the doctor segments in the cleaned audio
7. Run VAD on the patient-only signal
8. Compute pause and speech timing metrics
9. Save structured outputs to MinIO
10. Trigger the STT and acoustic feature tasks

This flow is orchestrated in `services/preprocessing-service/app/worker.py`.

### 1) Input acquisition

The worker receives a message shaped like:

```json
{
  "session_id": "a-session-id",
  "raw_audio_path": "path/in/raw-audio.wav",
  "metadata": {
    "doctor_id": "doctor-uuid",
    "patient_id": "patient-uuid"
  }
}
```

The service downloads the raw audio from the MinIO bucket `raw-audio`, and it requires a valid `doctor_id` in metadata because doctor/patient role assignment is based on a spoken voice profile.

### 2) Cleaning stage

The cleaning logic lives in `app/cleaning.py`.

It does the following:

- converts stereo signal to mono
- resamples to 16 kHz
- estimates stationary background noise
- uses WebRTC VAD to locate non-speech frames when possible
- falls back to an energy-based heuristic if VAD is weak
- applies adaptive noise reduction using `noisereduce`
- normalizes loudness with `pydub`

This is intentionally more robust than a fixed threshold noise gate because real clinical recordings vary in room acoustics, microphone quality, and speaking style.

### 3) Speaker diarization

The diarization stage uses `pyannote.audio` model `pyannote/speaker-diarization-3.1`.

It generates time segments like:

```python
[
  {"start": 0.42, "end": 3.2, "speaker": "SPEAKER_00"},
  {"start": 5.5, "end": 9.1, "speaker": "SPEAKER_01"}
]
```

These segments are then assigned a role by comparing each speaker's embedding with the enrolled doctor's embedding retrieved from PostgreSQL.

### 4) Doctor-vs-patient role assignment

The role heuristic logic in `app/role_heuristic.py` does the following:

- loads the doctor's voice embedding from `doctor_voice_profiles`
- computes segment embeddings using the diarized speech regions
- calculates cosine similarity against the doctor's embedding
- labels the speaker with the highest similarity as `doctor`
- keeps other speakers as `patient`
- logs a warning if the best similarity is below `0.65`, without immediately failing

This keeps the pipeline resilient, even when the doctor pattern is not perfectly clean.

### 5) Patient-only masking and VAD

The service then creates a masked waveform in which doctor turns are silenced but their original timestamps are retained. This is important because it preserves the real timeline of the conversation while making patient speech the only active signal for downstream patient segmentation.

After masking, `Silero VAD` is applied to detect patient speech intervals. The resulting intervals are compared against the diarized labels to compute:

- total speech duration
- pause count
- pause duration distribution
- speech ratio
- sentence-level timing hints

---

## Input and output

### Input

The worker expects a Celery message containing:

- `session_id`
- `raw_audio_path`
- `metadata.doctor_id`
- optional `patient_id`

The raw file is read from MinIO in the bucket `raw-audio`.

### Output

The service uploads the following objects to the bucket `patient-audio` under the session prefix:

- `session_id/cleaned.wav`
- `session_id/labeled_segments.json`
- `session_id/masked_full.wav`
- `session_id/preprocessing_metrics.json`

The consolidated metrics include:

- audio quality estimates
- noise reduction statistics
- diarization confidence and similarity score
- patient speech duration
- pause metrics
- sentence boundaries

The task returns metadata that is forwarded to downstream services, including:

- `cleaned_audio_path`
- `masked_audio_path`
- `preprocessing_metrics_path`
- `labeled_segments`
- `sentence_boundaries`
- `preprocessing_metrics`

These objects are then used by STT and acoustic feature extraction.

---

## Why this method was chosen

The preprocessing design intentionally favors a robust multi-step pipeline rather than a single magic-step approach.

### Why not use only a fixed denoising filter?

A single static filter fails across microphones and rooms. The service instead estimates noise adaptively using non-speech segments from the recording itself.

### Why not use naive diarization only?

Diarization alone does not identify the doctor. Without a voice-profile matching stage, the system would not know which speaker should be removed or treated as the active patient.

### Why not use speech activity detection alone?

VAD helps detect speaking intervals, but it cannot determine speaker identity. The preprocessing service combines VAD with diarization and enrollment matching, which is crucial for clinical analysis.

### Why use a masked patient-only waveform instead of a fully edited audio file?

Because doctor speech must not be counted as patient pauses. The service retains the original timeline and masks only doctor turns, which keeps interval timing trustworthy while still making patient speech available for downstream analysis.

---

## Existing approaches and small benchmarking

### Alternatives considered

| Approach | Strengths | Weaknesses | Verdict |
| --- | --- | --- | --- |
| Simple spectral subtraction | Fast and easy | Produces artifacts, poor on variable noise | Not robust enough |
| Fixed VAD thresholding | Lightweight | Fails on quiet or reverberant audio | Too brittle |
| Pure VAD without diarization | Good for segmentation | Cannot separate roles | Insufficient |
| Speaker diarization only | Good role separation | Cannot identify doctor without enrollment | Not enough |
| Full model-based end-to-end voice separation | Very strong in ideal conditions | Expensive, unstable, not reliable on clinical recordings | Overkill |

### Practical benchmark summary

In realistic clinical recordings, a hybrid pipeline performs best:

- `noisereduce` + adaptive noise estimation is significantly more stable than fixed denoising
- `pyannote` diarization gives better speaker separation than threshold-only speech masking
- doctor enrollment matching increases role accuracy substantially compared to assuming the first or loudest speaker is the patient
- VAD on the masked signal improves pause detection compared with raw-file VAD

This is not a benchmark from formal research paper results; it is a practical engineering comparison based on the project’s real recordings, where the main failure mode is noisy, multi-speaker consultations rather than clean single-speaker dictation.

---

## How to run it

### With Docker Compose

From the repository root:

```bash
docker compose up -d --build postgres rabbitmq minio preprocessing-service
docker compose logs -f preprocessing-service
```

The service expects the project environment variables to be present in `.env`, especially:

```dotenv
POSTGRES_HOST=postgres
RABBITMQ_HOST=rabbitmq
MINIO_HOST=minio
HF_TOKEN=hf_...
```

### Local Python execution

This is mainly for debugging and development:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r services/preprocessing-service/requirements.txt
pip install -e shared
pip install webrtcvad pytest
```

Then run the worker or tests as needed.

---

## Technologies included

- Python 3.11
- Celery
- RabbitMQ
- MinIO
- PostgreSQL + SQLAlchemy
- Pyannote Audio
- WebRTC VAD
- noisereduce
- pydub
- librosa / soundfile / numpy
- torchaudio
- Hugging Face Hub

---

## Conclusion summary

The preprocessing service is the gatekeeper of the entire clinical pipeline. It transforms raw consultation audio into a clinical-grade patient signal and a trustworthy timeline. Without this service, STT would hallucinate on doctor speech, acoustic features would be contaminated, and linguistic analysis would become unreliable.

For this project, the chosen strategy is a hybrid: adaptive denoising, speaker diarization, doctor enrollment matching, patient masking, and VAD-based timing. It is more robust than any single simplistic method and is the right foundation for the downstream intelligence layers.
