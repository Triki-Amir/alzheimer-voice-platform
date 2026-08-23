# Feature Engineering Service

## Overview

The feature engineering service is the fusion layer between the acoustic and linguistic branches. It waits for both feature sets, combines them into a unified table, and produces a machine-readable feature dataset ready for downstream classification or statistical modeling.

This service is designed as a fan-in layer: the acoustic and linguistic workers publish their results independently, and this service patiently joins them when both artifacts are available. The result is a compact feature matrix in CSV format built from a chosen set of curated variables.

---

## Pipeline

The service in `services/feature-engineering-service/app/worker.py` does the following:

1. Receive a work item for a session and patient
2. Probe MinIO for `acoustic_features.json`
3. Probe MinIO for `linguistic_features.json`
4. Retry with backoff until both files are present
5. Flatten the acoustic dictionary into feature rows
6. Select a curated subset of linguistic features
7. Build a long-format CSV with `patient_id`, `source`, `feature_name`, and `value`
8. Save the final table to MinIO under the `features/` prefix

### 1) Why the service waits for both branches

The architecture uses independent parallel computation:

- acoustic pipeline extracts voice quality features
- linguistic pipeline extracts transcript and pause features

These two outputs do not arrive at exactly the same time, so the feature engineering service acts as a join barrier. It is not a data pipeline with synchronous call chaining; it is a resilient aggregation point.

### 2) Input contract

The worker is triggered by the acoustic and linguistic services separately, using a `session_id` and `patient_id` payload.

It then tries to load:

- `session_id/acoustic_features.json`
- `session_id/linguistic_features.json`

If one is missing, it waits and retries rather than failing immediately.

### 3) Feature flattening

The service flattens acoustic features into a consistent scalar representation. It handles nested dictionaries recursively and converts them into dotted keys such as:

```text
egemaps_f0_mean
mfcc1_mean
pos_counts.NOUN
```

This creates a consistent representation for ML inputs.

### 4) Curated linguistic selection

The linguistic feature side is not exported in full because many of its intermediate fields are not useful as final engineered features. Instead, the service picks:

- transcript text
- total words
- unique words
- lexical diversity
- repetitions
- filler count
- NotRem marker count
- speech_rate
- pause_mean
- pause_count

This keeps the model input compact and interpretable.

### 5) CSV generation

The output is written in long format:

```csv
patient_id,source,feature_name,value
p123,acoustic,egemaps_pitch_meanF0,124.7
p123,linguistic,total_words,258
p123,linguistic,pause_count,5
```

This format is especially convenient for classical ML, feature selection, and later diagnostics.

---

## Input and output

### Input

- `session_id`
- `patient_id`
- two MinIO feature documents of the same session: acoustic and linguistic

### Output

The service writes a CSV file to MinIO under the `features` prefix:

```text
features/features_<patient_id>.csv
```

This file is the main artifact used for model training or downstream analysis.

---

## Why this method was chosen

### Why not train directly from nested JSON?

Nested JSON is excellent for storage and traceability, but awkward for model training. A flat feature table is easier for:

- scikit-learn pipelines
- correlation analysis
- feature selection
- debugging and explainability

### Why long format instead of wide format?

Long format is simple, appendable, and easy to inspect. It is easier to add new features later without restructuring the dataset. It also simplifies feature provenance because each row records whether it came from the acoustic or linguistic branch.

### Why a curated linguistic subset?

Full linguistic JSON contains intermediate objects like sentence payloads and token arrays. Those are useful for traceability but not all are model-ready features. A curated subset keeps the table compact and avoids overwhelming the classifier with nested or redundant variables.

---

## Existing approaches and small benchmarking

### Alternative patterns

| Pattern | Strengths | Weaknesses | Project choice |
| --- | --- | --- | --- |
| Raw JSON model inputs | Flexible and easy to store | Harder to train and debug | Not ideal |
| Wide feature matrix | Convenient for modeling | More brittle as features evolve | Possible later improvement |
| Long-format CSV | Easy to inspect and extend | Slightly less compact | Selected |
| Feature-only model with no linguistic branch | Simpler | Loses clinically important language indicators | Not enough |

### Practical benchmark summary

The current design is deliberately simple and robust rather than maximal:

- it yields a consistent, model-ready table
- it supports incremental feature selection
- it keeps the acoustic and linguistic sources separate to preserve interpretability

This is a strong starting point for classical ML and a good stepping stone toward more advanced modeling later.

---

## How to run it

### Docker Compose

From the repository root:

```bash
docker compose up -d --build feature-engineering-service
```

This worker listens to the `feature_engineering` queue and waits for the acoustic and linguistic services to finish their respective tasks.

### Local environment

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r services/feature-engineering-service/requirements.txt
pip install -e shared
```

Then start the Celery worker with the queue configured in Docker Compose.

---

## Technologies included

- Python
- Celery
- MinIO
- PostgreSQL
- standard library CSV/JSON processing
- scientific feature flattening logic
- production-ready retry/backoff pattern for async joins

---

## Conclusion summary

The feature engineering service is the bridge between raw signal-derived features and model-ready input. It ensures that the acoustic and linguistic views of the same patient are combined consistently, traceably, and in a format that is easy to train on.

This service is intentionally lightweight and explicit. It avoids over-engineering the feature layer too early and focuses on making the dataset reliable, explainable, and ready for later classification stages.
