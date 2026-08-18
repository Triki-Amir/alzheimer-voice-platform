#!/bin/sh
set -e

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" --insecure

mc mb -p local/raw-audio
mc mb -p local/patient-audio
mc mb -p local/reports

# Keep buckets private — never use anonymous download/upload
mc anonymous set none local/raw-audio
mc anonymous set none local/patient-audio
mc anonymous set none local/reports

echo "Buckets créés (private)."