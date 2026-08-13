"""
audio_upload_validation.py

Validation gate for uploaded patient/doctor audio files. Run this
BEFORE any file is encrypted, written to MinIO, or handed to the
Celery pipeline (preprocessing / STT / feature extraction).

Three layers, cheapest-first, fail fast:
  1. Size limit     - reject oversized uploads while streaming, never
                       buffer an unbounded body in memory
  2. MIME / format   - sniff the real file bytes (magic numbers) instead
                       of trusting the client's Content-Type header or
                       filename extension, both fully attacker-controlled
  3. Audio metadata  - actually decode the file with a real audio codec
                       and check duration, sample rate, and channel count
                       are within bounds the pipeline expects

Usage (FastAPI):

    from fastapi import FastAPI, UploadFile, File
    from audio_upload_validation import validate_audio_upload, AudioValidationError

    app = FastAPI()

    @app.post("/ingest")
    async def ingest_audio(file: UploadFile = File(...)):
        try:
            result = await validate_audio_upload(file)
        except AudioValidationError as exc:
            raise exc.to_http_exception()

        # result.tmp_path -> validated file, ready for envelope encryption + MinIO upload
        # delete result.tmp_path once it has been persisted or on any downstream error
        ...

System dependencies required:
    apt-get install -y libmagic1 libsndfile1
Python dependencies required:
    pip install python-magic soundfile
"""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import magic          # python-magic (libmagic bindings) - real content sniffing
import soundfile as sf  # libsndfile bindings - real audio decode, not tag reading
from fastapi import HTTPException, UploadFile


# --------------------------------------------------------------------------
# Configuration - tune per deployment / pipeline requirements
# --------------------------------------------------------------------------

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024   # 25 MB hard cap per upload
MIN_FILE_SIZE_BYTES = 1024               # reject empty / near-empty files

CHUNK_SIZE = 1024 * 1024                 # 1 MB streaming read chunks

# Real MIME types as sniffed from file content, NOT the Content-Type header
# the client sends.
ALLOWED_MIME_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/flac",
    "audio/x-flac",
    "audio/mpeg",     # mp3
    "audio/ogg",
    "audio/webm",     # common output of browser MediaRecorder
}

# Extensions allowed alongside those MIME types (defense in depth only -
# never trusted on its own, checked against the detected MIME type).
ALLOWED_EXTENSIONS = {".wav", ".flac", ".mp3", ".ogg", ".webm"}

# Audio content constraints - tuned for spoken-voice clinical recordings
MIN_DURATION_SECONDS = 1.0
MAX_DURATION_SECONDS = 600.0             # 10 minutes
ALLOWED_SAMPLE_RATES = {8000, 16000, 22050, 32000, 44100, 48000}
ALLOWED_CHANNELS = {1, 2}                # mono or stereo only


# --------------------------------------------------------------------------
# Errors
# --------------------------------------------------------------------------

class AudioValidationError(Exception):
    """Raised when an uploaded file fails any validation stage."""

    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)

    def to_http_exception(self) -> HTTPException:
        return HTTPException(status_code=self.status_code, detail=self.detail)


@dataclass
class ValidatedAudio:
    tmp_path: Path
    size_bytes: int
    mime_type: str
    duration_seconds: float
    sample_rate: int
    channels: int


# --------------------------------------------------------------------------
# Stage 1: streamed size check
# --------------------------------------------------------------------------

async def _stream_to_tempfile_with_size_check(upload: UploadFile) -> Path:
    """
    Write the upload to a temp file while enforcing MAX_FILE_SIZE_BYTES on
    the fly. Never call upload.read() unbounded - a client can send an
    arbitrarily large body regardless of any Content-Length header.
    """
    fd, tmp_path_str = tempfile.mkstemp(suffix=".upload")
    tmp_path = Path(tmp_path_str)
    total_read = 0

    try:
        with os.fdopen(fd, "wb") as tmp_file:
            while True:
                chunk = await upload.read(CHUNK_SIZE)
                if not chunk:
                    break
                total_read += len(chunk)
                if total_read > MAX_FILE_SIZE_BYTES:
                    raise AudioValidationError(
                        status_code=413,
                        detail=f"File exceeds maximum allowed size of "
                                f"{MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB.",
                    )
                tmp_file.write(chunk)
    except AudioValidationError:
        tmp_path.unlink(missing_ok=True)
        raise
    except Exception as exc:
        tmp_path.unlink(missing_ok=True)
        raise AudioValidationError(status_code=400, detail="Failed to read upload stream.") from exc
    finally:
        await upload.close()

    if total_read < MIN_FILE_SIZE_BYTES:
        tmp_path.unlink(missing_ok=True)
        raise AudioValidationError(status_code=422, detail="Uploaded file is empty or too small to be valid audio.")

    return tmp_path


# --------------------------------------------------------------------------
# Stage 2: real MIME sniffing (magic numbers) + extension cross-check
# --------------------------------------------------------------------------

def _check_mime_and_extension(tmp_path: Path, declared_filename: Optional[str]) -> str:
    detected_mime = magic.from_file(str(tmp_path), mime=True)

    if detected_mime not in ALLOWED_MIME_TYPES:
        raise AudioValidationError(
            status_code=415,
            detail=f"Unsupported file type detected ({detected_mime}). "
                    f"Allowed formats: WAV, FLAC, MP3, OGG, WEBM.",
        )

    if declared_filename:
        ext = Path(declared_filename).suffix.lower()
        if ext and ext not in ALLOWED_EXTENSIONS:
            # Extension disagrees with what the actual bytes say - reject
            # rather than silently trust either side.
            raise AudioValidationError(
                status_code=415,
                detail="File extension does not match the detected audio format.",
            )

    return detected_mime


# --------------------------------------------------------------------------
# Stage 3: audio metadata validation via real decode (not tag reading)
# --------------------------------------------------------------------------

def _check_audio_metadata(tmp_path: Path) -> tuple[float, int, int]:
    try:
        info = sf.info(str(tmp_path))
    except Exception as exc:
        # Passed MIME sniffing but libsndfile can't open it - likely
        # truncated, corrupted, or a crafted file with a spoofed header.
        raise AudioValidationError(
            status_code=422,
            detail="File could not be decoded as valid audio.",
        ) from exc

    duration = info.frames / info.samplerate if info.samplerate else 0.0

    if not (MIN_DURATION_SECONDS <= duration <= MAX_DURATION_SECONDS):
        raise AudioValidationError(
            status_code=422,
            detail=f"Audio duration ({duration:.1f}s) is outside the allowed "
                    f"range of {MIN_DURATION_SECONDS}-{MAX_DURATION_SECONDS} seconds.",
        )

    if info.samplerate not in ALLOWED_SAMPLE_RATES:
        raise AudioValidationError(
            status_code=422,
            detail=f"Unsupported sample rate ({info.samplerate} Hz).",
        )

    if info.channels not in ALLOWED_CHANNELS:
        raise AudioValidationError(
            status_code=422,
            detail=f"Unsupported channel count ({info.channels}). Only mono or stereo audio is accepted.",
        )

    return duration, info.samplerate, info.channels


# --------------------------------------------------------------------------
# Public entry point
# --------------------------------------------------------------------------

async def validate_audio_upload(upload: UploadFile) -> ValidatedAudio:
    """
    Run all three validation stages against an incoming FastAPI UploadFile.
    Returns a ValidatedAudio pointing at a temp file with confirmed size,
    real MIME type, and decodable audio content within accepted bounds.

    Caller must delete result.tmp_path once the file has been encrypted
    and moved to permanent storage, or on any downstream error.
    """
    tmp_path = await _stream_to_tempfile_with_size_check(upload)

    try:
        mime_type = _check_mime_and_extension(tmp_path, upload.filename)
        duration, sample_rate, channels = _check_audio_metadata(tmp_path)
    except AudioValidationError:
        tmp_path.unlink(missing_ok=True)
        raise

    size_bytes = tmp_path.stat().st_size

    return ValidatedAudio(
        tmp_path=tmp_path,
        size_bytes=size_bytes,
        mime_type=mime_type,
        duration_seconds=duration,
        sample_rate=sample_rate,
        channels=channels,
    )
