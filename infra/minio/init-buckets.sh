#!/bin/sh
set -e

mc alias set local https://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" --insecure

mc mb -p local/raw-audio --insecure
mc mb -p local/patient-audio --insecure
mc mb -p local/reports --insecure
mc mb -p local/doctor-voice-enrollment --insecure

mc anonymous set none local/raw-audio --insecure
mc anonymous set none local/patient-audio --insecure
mc anonymous set none local/reports --insecure
mc anonymous set none local/doctor-voice-enrollment --insecure

echo "Buckets créés (private)."