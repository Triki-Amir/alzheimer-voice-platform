FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY shared/ /app/shared
RUN pip install --no-cache-dir -e /app/shared

COPY services/linguistic-feature-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/linguistic-feature-service/ .

CMD ["celery", "-A", "app.worker.app", "worker", "--loglevel=info", "-P", "solo", "-E"]