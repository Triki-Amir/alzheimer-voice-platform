FROM python:3.11-slim
WORKDIR /app

COPY infra/ca/ca.crt /etc/ssl/certs/voiceapp-ca.crt
COPY shared/ /shared/
RUN pip install /shared

# NOTE: this service's code actually lives one level deeper, at
# services/quality-check-service/ingestion-service/ — pointing here
# rather than moving the folder, so nothing else in the repo changes.
COPY services/quality-check-service/ingestion-service/requirements.txt .
RUN pip install -r requirements.txt

COPY services/quality-check-service/ingestion-service/app ./app

# app/worker.py is still an empty stub — swap this CMD back to
# celery -A app.worker worker --loglevel=info once it's implemented.
CMD ["sleep", "infinity"]
