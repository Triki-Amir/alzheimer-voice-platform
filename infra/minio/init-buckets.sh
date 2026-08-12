#!/bin/sh
mc alias set local https://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" --insecure
mc mb -p local/raw-audio
mc mb -p local/patient-audio
mc mb -p local/reports
mc anonymous set download local/reports
echo "Buckets créés."