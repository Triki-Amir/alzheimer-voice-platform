FROM python:3.11-slim
RUN apt-get update && apt-get install -y ffmpeg libsndfile1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY shared/ /shared/
RUN pip install /shared
COPY services/audio-cleaning-service/requirements.txt .
RUN pip install -r requirements.txt
COPY services/audio-cleaning-service/app ./app
CMD ["celery", "-A", "app.worker", "worker", "--loglevel=info", "--concurrency=2"]