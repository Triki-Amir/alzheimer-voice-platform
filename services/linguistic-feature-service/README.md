# Linguistic Feature Service

## Overview

The linguistic feature service transforms the patient transcript into a set of language-based clinical features. It takes the word-level STT output and sentence boundaries produced by preprocessing, then builds a structured linguistic representation that can later be fused with acoustic features.

This service is intentionally local and deterministic. It avoids an external LLM endpoint and instead relies on a local Tunisian-dialect POS tagging pipeline plus pause-aware sentence segmentation. The goal is to produce explainable features such as noun/verb counts, speaker pauses, repetition markers, and lexical diversity without requiring a heavy cloud inference stack.

---

## Pipeline

The pipeline in `services/linguistic-feature-service/app/features.py` is deliberately simple but effective:

1. Receive words from STT and sentence boundaries from preprocessing
2. Build sentence segments based on pause structure and timing
3. Convert the transcript to punctuation-aware word objects
4. Run local POS tagging with a fine-tuned XLM-R model
5. Count part-of-speech tags and detect relevant clinical markers
6. Save a JSON payload to MinIO and update the session status in PostgreSQL

### 1) Input from STT

The worker receives a message similar to:

```json
{
  "session_id": "abc",
  "patient_id": "p123",
  "words": [
    {"text": "أنا", "timestamp": [1.0, 1.5]},
    {"text": "ننسى", "timestamp": [1.5, 2.0]}
  ],
  "metadata": {
    "sentence_boundaries": [
      {"start": 0.0, "end": 6.0, "type": "pause"}
    ]
  }
}
```

The words come from STT validation after timestamp cleanup. The sentence boundaries come from preprocessing, which keeps doctor and patient timing separated.

### 2) Sentence reconstruction

The service uses a timeline-aware sentence builder rather than a generic language model chunking heuristic.

The idea is to reconstruct sentences from:

- word timestamps
- pause boundaries
- real silence lengths between utterances

This produces a structured sequence of sentence objects, which keeps the transcript aligned with the underlying audio timeline.

### 3) POS tagging

The service loads a local Tunisian POS model from:

```text
/models/xlmr-tunisian-pos-final
```

and uses `POSTaggingService` from the local app modules. This is a crucial design choice: the project is built around a Tunisian dialect resource, not a generic multilingual parser with poorer local coverage.

The tagging result includes entries like:

```json
{
  "mot": "أنا",
  "pos": "PRON",
  "start": 1.2,
  "end": 1.8
}
```

### 4) Derived clinical features

The service computes:

- POS counts (`NOUN`, `VERB`, `PRON`, `FILLER`, etc.)
- `UNTAGGED` count
- significant pause count
- sentence count
- transcript completeness
- alignment status

This is where the project turns raw text into structured clinical variables.

### 5) Persistence

The result is saved as a JSON document in MinIO under the session prefix:

- `session_id/linguistic_features.json`

At the same time, the worker updates the session status in PostgreSQL to `LINGUISTIC_ANALYZED`.

---

## Input and output

### Input

- `session_id`
- `words` from STT output
- `metadata.sentence_boundaries`
- optional patient metadata

### Output

The service outputs a rich JSON structure such as:

```json
{
  "texte_original": "...",
  "sentences": [...],
  "tokens_pos": [...],
  "pos_counts": {
    "NOUN": 27,
    "VERB": 18,
    "FILLER": 5,
    "UNTAGGED": 2
  },
  "aligned": true,
  "significant_pause_count": 4
}
```

This object is later consumed by the feature engineering service, which selects a curated subset of linguistic variables for the final ML table.

---

## Why this method was chosen

### Why local POS tagging instead of sending the transcript to an LLM?

For a production clinical pipeline, the main concerns are:

- reproducibility
- privacy
- cost
- low latency
- explainability

Using a local model keeps all inference on protected infrastructure and avoids the risk of cloud API variability. The project also wants features that remain interpretable and stable across sessions.

### Why not just count words without POS tagging?

A pure word-frequency approach loses a lot of clinically relevant structure. For example:

- noun/verb ratio is more informative than total word count
- filler counts may reflect hesitation and cognitive slowing
- repetition and pause patterns are meaningful markers

POS tagging adds a layer of semantic structure that answers the clinical question, not just the transcription question.

### Why sentence boundaries from timing rather than LLM-based summarization?

The project already has precise timing from preprocessing, so reconstructing sentence boundaries from pauses is stable and explainable. That is much better than using an opaque summarization step that would add unnecessary variability.

---

## Existing approaches and small benchmarking

### Alternative methods

| Method | Advantages | Weaknesses | Project choice |
| --- | --- | --- | --- |
| LLM-based tagging | Strong generalization | Expensive, non-deterministic, privacy issues | Not selected |
| Rule-based keyword counting | Simple and fast | Weak grammar understanding | Too shallow |
| Word-count only | Easy to compute | Poor clinical signal | Not enough |
| Local transformer POS model | Better dialect fit and interpretability | Needs local model hosting | Selected |

### Practical benchmark summary

The model-based approach is preferred because the project is not trying to summarize the text; it is trying to derive reliable linguistic markers from actual patient speech.

In this stack, the biggest advantages are:

- better handling of Tunisian dialect text than generic English-centric parsers
- more stable throughput than calling an external model every time
- direct compatibility with downstream feature engineering

The service is deliberately “feature-first” rather than “conversation-understanding-first.” That is the correct tradeoff for this use case.

---

## How to run it

### Docker Compose

From the repository root:

```bash
docker compose up -d --build linguistic-feature-service
```

The service requires the POS model to be mounted under the path configured through `POS_MODEL_PATH`:

```dotenv
POS_MODEL_PATH=/models/xlmr-tunisian-pos-final
```

This is set in the Compose file.

### Local development

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r services/linguistic-feature-service/requirements.txt
pip install -e shared
```

Then run the Celery worker with the same queue configuration used by Docker Compose.

---

## Technologies included

- Python
- Celery
- PostgreSQL
- MinIO
- Transformers
- XLM-R / local POS model
- AsyncIO
- PyTorch
- Pydantic / validation layer
- Hugging Face model weights

---

## Conclusion summary

The linguistic feature service turns raw transcript text into a clinically useful linguistic fingerprint. It combines real timing information with a local, explainable POS model, which is better suited to the project’s Tunisian dialect and privacy constraints than cloud LLM-based tagging.

This service is not just “transcript processing”; it is the linguistic layer that makes cognitive signals measurable in a reproducible, interpretable way.
