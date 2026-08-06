FROM python:3.11-slim
WORKDIR /app

COPY infra/ca/ca.crt /etc/ssl/certs/voiceapp-ca.crt
COPY shared/ /shared/
RUN pip install /shared

COPY services/fusion-classification-service/requirements.txt .
RUN pip install -r requirements.txt

COPY services/fusion-classification-service/app ./app

# app/worker.py is still an empty stub — swap this CMD back to
# celery -A app.worker worker --loglevel=info once it's implemented.
CMD ["sleep", "infinity"]
