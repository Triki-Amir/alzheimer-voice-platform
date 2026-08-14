FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (libmagic for python-magic)
RUN apt-get update && apt-get install -y \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

COPY infra/ca/ca.crt /etc/ssl/certs/voiceapp-ca.crt
COPY shared/ /shared/
RUN pip install /shared
COPY services/ingestion-service/requirements.txt .
RUN pip install -r requirements.txt
COPY services/ingestion-service/app ./app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]