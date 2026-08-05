FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY shared/ /app/shared
RUN pip install --no-cache-dir -e /app/shared

COPY services/linguistic-extraction-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/linguistic-extraction-service/ .

CMD ["celery", "-A", "worker.app", "worker", "--loglevel=info", "-P", "solo", "-E"]FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY shared/ /app/shared
RUN pip install --no-cache-dir -e /app/shared

COPY services/linguistic-extraction-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/linguistic-extraction-service/ .

CMD ["celery", "-A", "worker.app", "worker", "--loglevel=info", "-P", "solo", "-E"]