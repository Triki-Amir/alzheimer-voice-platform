# STT Service

## Overview

The STT service converts patient speech into a transcript with word-level timestamps. It sits directly after preprocessing and before linguistic feature extraction.

This worker is built around a local Whisper-based model, `medyas/FarukSTT`, and is designed for multilingual and dialect-heavy medical speech. It is implemented as a Celery task consuming the `stt_transcription` queue.

The purpose of this service is not merely transcription. It tries to preserve alignment with the original recording so that words, pauses, and sentence boundaries can be mapped back to the session timeline without drift.

---

## Pipeline

The service flow in `services/stt-service/app/worker.py` is:

1. Download the cleaned recording from MinIO
2. Load labeled diarization output from preprocessing metadata
3. Extract patient-only speech clips from the original cleaned audio
4. Batch-transcribe all patient clips together on GPU
5. Reconstruct timestamps aligned to raw session time
6. Validate for hallucination patterns such as repeated timestamp loops
7. Update the patient record in PostgreSQL with the final transcript
8. Dispatch linguistic extraction when usable words exist

### 1) Input from preprocessing

The service expects:

```json
{
  "session_id": "...",
  "patient_id": "...",
  "metadata": {
    "cleaned_audio_path": "session-id/cleaned.wav",
    "labeled_segments": [
      {"start": 12.1, "end": 15.4, "role": "patient"},
      {"start": 15.4, "end": 16.3, "role": "doctor"}
    ]
  }
}
```

The key idea is that STT should not be run on the doctor-masked file. It should operate on the cleaned, original audio and then selectively extract the patient turns from that timeline.

### 2) Segment slicing

The logic in `app/stt_per_segment.py` is central.

Instead of transcribing one long patient audio file in one shot, the service:

- identifies patient-only regions from diarized labels
- merges short nearby patient clips into larger context windows
- keeps real gaps and short doctor backchannels inside regions
- zeroes out short doctor interruptions when needed before transcription

This prevents the model from being confused by isolated fragments or short doctor interruptions. It is one of the strongest design choices in the pipeline.

### 3) GPU batch transcription

The transcription engine uses Hugging Face’s `pipeline` abstraction over Whisper-based speech recognition. The service uses:

- `AutoModelForSpeechSeq2Seq`
- `WhisperFeatureExtractor`
- `WhisperTokenizer`
- batched inference across clips

This choice is much more efficient than running a separate model call per segment. It reduces GPU overhead and keeps inference throughput stable.

### 4) Timestamp validation

The service explicitly validates timestamps using `validate_word_timestamps.py`.

It looks for:

- repeated words at identical timestamps
- backward jumps in the timestamp sequence
- suspicious repetition loops that often happen in ASR hallucinations

If these appear, the service drops the corrupted region rather than trusting it. This is especially important in a clinical pipeline, where silent hallucination is worse than a small data loss.

### 5) Database update

The final transcript is stored in PostgreSQL by updating the patient row with:

```sql
UPDATE patients SET transcription_text = %s WHERE id = %s;
```

The service then dispatches a linguistic extraction task when it has usable words.

---

## Input and output

### Input

- `session_id`
- `patient_id`
- `metadata.cleaned_audio_path`
- `metadata.labeled_segments`

The cleaned audio from preprocessing is the source material because it has already had noise removed and doctor/patient roles assigned.

### Output

The service produces:

- final transcript text
- structured word list with timestamps
- validation flags indicating corruption or cleanup
- a downstream Celery event to the linguistic feature service

The final result returned by the task includes:

```json
{
  "status": "SUCCESS",
  "execution_time_sec": 12.4,
  "gpu_inference_sec": 9.1,
  "session_id": "...",
  "transcription": "...",
  "word_count": 271,
  "clip_count": 4,
  "validation_corrupted": false
}
```

---

## Why this method was chosen

### Why Whisper-based STT instead of a smaller classical ASR engine?

The project deals with conversational medical interviews, not simple read speech. That means ASR needs to cope with:

- interruptions
- variable speaking pace
- informal dialectal Arabic/Tunisian speech
- background noise
- doctor interruptions and backchannels

A robust transformer-based ASR model produces better transcript quality and word timestamps than older lightweight systems.

### Why batch segmentation instead of transcribing the whole patient audio at once?

Transcribing a single long file can produce poor alignment when nearby doctor speech or short interruptions distort the flow. The service slices into patient-only regions and merges nearby ones, preserving context while avoiding confusing unneeded audio.

### Why validate word timestamps?

Whisper is strong, but it can hallucinate repeated words or misordered timestamps, particularly under noisy or fragmented conditions. A validation layer is cheaper and safer than blindly trusting raw output.

---

## Existing approaches and small benchmarking

### Common alternatives

| Approach | Advantages | Limitations | Project choice |
| --- | --- | --- | --- |
| Cloud ASR (Azure/OpenAI/Google) | Very strong general transcription | Privacy risk, cost, network dependency | Not preferred |
| Vosk / Kaldi pipelines | Fast, lightweight, self-hosted | Poorer robustness on dialectal and messy segments | Not ideal |
| Single-file Whisper transcription | Easy setup | Weak alignment and more hallucination on long recordings | We avoid this |
| Local Whisper with per-segment slicing | Better context and stable timestamps | More engineering complexity | Selected |

### Practical benchmark summary

For this project, the improvement comes from the segmentation logic rather than simply using a stronger model.

In practice:

- single long-file transcription often produced repetitive or misaligned word sequences
- segmented transcription significantly improved wording stability
- timestamp validation removed a meaningful fraction of corrupted outputs
- the local batch approach was faster than sequential per-clip transcription on GPU

This is not a formal benchmark paper, but it reflects the real pattern observed in the project: the biggest gains came from better clipping strategy and timestamp cleanup, not just from switching models.

---

## How to run it

### Docker Compose

From the repository root:

```bash
docker compose up -d --build stt-service
docker compose logs -f stt-service
```

The service depends on:

- RabbitMQ
- MinIO
- PostgreSQL
- the cleaned audio uploaded by preprocessing

### Required environment

```dotenv
POSTGRES_HOST=postgres
POSTGRES_DB=voiceapp_db
POSTGRES_USER=voiceapp
POSTGRES_PASSWORD=...
HF_TOKEN=...
```

The service uses GPU if available and falls back to CPU otherwise.

---

## Technologies included

- Python
- Celery
- RabbitMQ
- PostgreSQL
- MinIO
- PyTorch
- Transformers
- Whisper-style ASR pipeline
- SoundFile
- NumPy
- Hugging Face model loading

---

## Conclusion summary

The STT service is where the raw narrative becomes structured text. It is designed to be medically safe, auditable, and temporally faithful to the recorded conversation. The segmentation and timestamp validation layers are critical because they preserve the context needed for sentence modeling and later linguistic analysis.

In short: this is not a simple transcription worker; it is a time-aware audio-to-text alignment stage built specifically for noisy, conversational, multi-speaker clinical recordings.
