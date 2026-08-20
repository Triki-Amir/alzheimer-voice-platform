# Acoustic Feature Service

## Overview

The acoustic feature service measures the patient’s voice quality and spectral characteristics after preprocessing. It extracts a compact but clinically meaningful feature set that captures tone, timbre, prosody, and vocal stability.

This service is intentionally built around a feature-engineering-first philosophy: instead of feeding raw audio directly into a black-box classifier, it extracts well-understood descriptors such as eGeMAPS functionals and MFCC-based statistics. These are easier to interpret, more stable across recordings, and more compatible with logistic modeling or classical machine learning.

---

## Pipeline

The worker in `services/acoustic-feature-service/app/worker.py` follows this path:

1. Receive the cleaned audio path and diarization labels from preprocessing metadata
2. Download the cleaned recording from MinIO
3. Slice out patient-only regions from the full cleaned signal
4. Build a patient-only audio signal from labeled patient segments
5. Extract acoustic features
6. Save the result to MinIO as `acoustic_features.json`
7. Trigger feature engineering once both acoustic and linguistic branches are ready

### 1) Input design

The worker expects:

```json
{
  "session_id": "abc",
  "patient_id": "p123",
  "metadata": {
    "cleaned_audio_path": "abc/cleaned.wav",
    "labeled_segments": [
      {"start": 0.0, "end": 1.3, "role": "patient"},
      {"start": 1.3, "end": 2.0, "role": "doctor"}
    ]
  }
}
```

The important idea is that acoustic features must be computed from the patient-only waveform, not from the doctor-masked version. If the doctor’s voice remained in the signal, pitch, jitter, and formant measures would be corrupted.

### 2) Patient-only slicing

The helper in `app/audio_utils.py` is the critical step.

It does not simply take a masked file. Instead, it:

- reads the full cleaned audio
- keeps only segments labeled as `patient`
- concatenates them with a small constant silence gap to avoid click artifacts
- avoids using the doctor-muted waveform because that artificially inflates silence and distorts energy-based features

This is why the service uses the cleaned audio plus diarization labels rather than the later masked signal.

### 3) Feature extraction

The extraction logic lives in `app/features.py`.

It computes:

- eGeMAPS functionals via `openSMILE`
- MFCC statistics using `librosa`
- duration and waveform length

The feature set includes things such as:

- F0 statistics
- jitter/shimmer proxies
- formant-related descriptors
- loudness and HNR
- spectral flux and slope attributes
- MFCC mean/std coefficients

This is a strong general-purpose voice quality feature set, particularly appropriate for cognitive and neurological speech analysis.

### 4) Storage

The output is saved to MinIO:

- `session_id/acoustic_features.json`

This JSON is then consumed by the feature-engineering service, which combines it with linguistic features.

---

## Input and output

### Input

- `session_id`
- `patient_id`
- `metadata.cleaned_audio_path`
- `metadata.labeled_segments`

### Output

A single JSON object similar to:

```json
{
  "egemaps_pitch_meanF0": 123.4,
  "egemaps_jitterLocal": 0.023,
  "mfcc1_mean": 11.2,
  "mfcc1_std": 7.9,
  "duration_sec": 18.7
}
```

The content is intended to be flat and ML-friendly. The feature engineering service later flattens and merges it with the linguistic features table.

---

## Why this method was chosen

### Why eGeMAPS + MFCC instead of raw waveform or CNN features?

The project favors interpretable and low-complexity features for a clinical analysis stack.

Benefits:

- stable across sessions and recording conditions
- explainable to clinicians and researchers
- lower compute requirements than full feature learning models
- easier to compare with existing speech pathology literature

A raw model-based deep representation may achieve strong performance, but it is harder to debug, explain, and deploy in a multi-service setup with smaller compute budgets.

### Why not use a masked full recording?

The masked signal is useful for pause analysis and VAD, but it is a poor representation for acoustic quality features because it artificially introduces silence. This would distort pitch, energy, and speech quality metrics.

### Why not compute features from the whole cleaned recording?

The second speaker would pollute the measurements. The service slices the patient-only waveform to keep the feature set faithful to the patient’s own voice.

---

## Existing approaches and small benchmarking

### Alternatives surveyed

| Method | Advantages | Drawbacks | Project choice |
| --- | --- | --- | --- |
| Raw waveform + CNN | Strong learning power | Very data-hungry, harder to explain | Not preferred |
| Pitch-only features | Simple | Too narrow, misses spectral quality | Not sufficient |
| MFCC-only | Good for general acoustics | Less clinically interpretable | Partial support |
| eGeMAPS + MFCC | Interpretable and broad | Requires more careful preprocessing | Selected |

### Practical benchmark summary

For this project, the “eGeMAPS + MFCC” approach is a good engineering tradeoff:

- more stable than raw learned embeddings on small clinical datasets
- much easier to inspect than a black-box representation
- sufficiently expressive for cognitive/voice quality analysis
- compatible with classical models and later feature selection

It is not the most modern deep representation, but it is the right compromise between signal quality, interpretability, and production simplicity.

---

## How to run it

### Docker Compose

From the repository root:

```bash
docker compose up -d --build acoustic-feature-service
```

The service listens on the `acoustic_extraction` queue and is triggered by preprocessing after the patient audio and labels are ready.

### Local development

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r services/acoustic-feature-service/requirements.txt
pip install -e shared
```

Then run the Celery worker with the same queue configuration declared in Docker Compose.

---

## Technologies included

- Python
- Celery
- MinIO
- NumPy
- SoundFile
- Librosa
- openSMILE
- RabbitMQ
- Scientific Python ecosystem

---

## Conclusion summary

The acoustic feature service is the voice-quality layer of the platform. It turns patient audio into interpretable measures of timbre, pitch, loudness, and spectral structure. This is essential for any downstream model that wants to distinguish subtle cognitive patterns rather than relying only on transcript text.

In short: it prepares the acoustic fingerprint of the patient in a way that is robust, explainable, and compatible with later feature fusion and classification.
