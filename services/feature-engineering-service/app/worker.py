import csv
import io
import json
import logging
import os
import time

from celery.exceptions import Retry
from minio.error import S3Error

from voiceplatform_shared.celery_app import make_celery_app
from voiceplatform_shared.constants import Queues
from voiceplatform_shared.minio_client import get_minio_client

from .derive_linguistic import extract_selected_linguistic_features
from .flatten import flatten_features

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("feature_engineering_worker")

FEATURE_ENGINEERING_QUEUE = getattr(Queues, "FEATURE_ENGINEERING", "feature_engineering")
app = make_celery_app("feature_engineering_service", FEATURE_ENGINEERING_QUEUE)

PATIENT_AUDIO_BUCKET = os.getenv("PATIENT_AUDIO_BUCKET", "patient-audio")
ACOUSTIC_FILENAME = "acoustic_features.json"
LINGUISTIC_FILENAME = "linguistic_features.json"
OUTPUT_PREFIX = os.getenv("FEATURES_OUTPUT_PREFIX", "features")

# Both acoustic-feature-service and linguistic-feature-service dispatch here
# independently as soon as each finishes. Whichever arrives first won't find
# the other's file yet -- retry with backoff instead of failing, so the
# second dispatch (or a later retry of the first) is what actually succeeds.
# This is a stand-in for a real fan-in/join primitive; fine for now, but if
# one branch fails outright (not just "not ready yet"), nothing currently
# notices -- worth a proper join (e.g. a Redis counter, or a Celery chord)
# once this is more than a starting point.
FANIN_MAX_RETRIES = 15
FANIN_RETRY_COUNTDOWN = 10  # seconds, fixed rather than exponential -- these
                             # are two roughly-parallel jobs of similar
                             # duration, not a flaky dependency


def _download_json(minio, object_name: str) -> dict:
    response = None
    try:
        response = minio.get_object(PATIENT_AUDIO_BUCKET, object_name)
        return json.loads(response.read())
    except S3Error as e:
        if e.code == "NoSuchKey":
            raise FileNotFoundError(object_name) from e
        raise
    finally:
        if response is not None:
            response.close()
            response.release_conn()


def _build_csv(patient_id: str, acoustic: dict, linguistic: dict) -> bytes:
    """
    Long/tidy format: one row per feature. Columns: patient_id, source,
    feature_name, value.

    Acoustic: full flatten (all 115 eGeMAPS/MFCC features) -- not asked to
    curate this side yet.
    Linguistic: curated whitelist only (transcript + 3 temporal + 7
    linguistic fields) via extract_selected_linguistic_features(), not a
    full flatten -- the real linguistic_features.json has sentences/
    tokens_pos which aren't features on their own.
    """
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["patient_id", "source", "feature_name", "value"])

    for feature_name, value in flatten_features(acoustic):
        writer.writerow([patient_id, "acoustic", feature_name, value])

    selected_linguistic = extract_selected_linguistic_features(linguistic)
    for feature_name, value in selected_linguistic.items():
        writer.writerow([patient_id, "linguistic", feature_name, value])

    return buf.getvalue().encode("utf-8")


@app.task(name="feature_engineering_service.process", bind=True, max_retries=FANIN_MAX_RETRIES)
def process(self, message: dict):
    t0 = time.perf_counter()
    minio = get_minio_client()

    session_id = message.get("session_id", "unknown")
    patient_id = message.get("patient_id", "unknown")

    logger.info("🧩 [START] Feature Engineering | Session: %s | Patient: %s", session_id, patient_id)

    acoustic_object = f"{session_id}/{ACOUSTIC_FILENAME}"
    linguistic_object = f"{session_id}/{LINGUISTIC_FILENAME}"

    try:
        try:
            acoustic = _download_json(minio, acoustic_object)
            linguistic = _download_json(minio, linguistic_object)
        except FileNotFoundError as missing:
            logger.info(
                "  ├─ ⏳ [Wait] %s not in MinIO yet -- retry %d/%d in %ds | Session: %s",
                missing, self.request.retries + 1, FANIN_MAX_RETRIES,
                FANIN_RETRY_COUNTDOWN, session_id,
            )
            raise self.retry(exc=missing, countdown=FANIN_RETRY_COUNTDOWN)

        logger.info(
            "  ├─ 📥 [MinIO] Loaded %d acoustic + %d linguistic top-level field(s)",
            len(acoustic), len(linguistic),
        )

        csv_bytes = _build_csv(patient_id, acoustic, linguistic)

        output_object = f"{OUTPUT_PREFIX}/features_{patient_id}.csv"
        minio.put_object(
            PATIENT_AUDIO_BUCKET,
            output_object,
            data=io.BytesIO(csv_bytes),
            length=len(csv_bytes),
            content_type="text/csv",
        )

        total_duration = time.perf_counter() - t0
        logger.info(
            "✅ [SUCCESS] Feature table written to %s/%s in %.2fs | Session: %s",
            PATIENT_AUDIO_BUCKET, output_object, total_duration, session_id,
        )

        return {
            "status": "SUCCESS",
            "execution_time_sec": round(total_duration, 2),
            "session_id": session_id,
            "patient_id": patient_id,
            "output_path": output_object,
        }

    except Retry:
        # self.retry() above -- this is the normal "other file not ready
        # yet" path, not a failure. Let Celery handle it, don't log it as
        # an error.
        raise

    except Exception as exc:
        total_duration = time.perf_counter() - t0
        logger.error(
            "❌ [FAILED] Feature engineering failed after %.2fs | Session: %s | Error: %s",
            total_duration, session_id, str(exc),
        )
        raise