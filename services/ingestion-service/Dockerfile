FROM python:3.11-slim
WORKDIR /app
COPY shared/ /shared/
RUN pip install /shared
COPY services/ingestion-service/requirements.txt .
RUN pip install -r requirements.txt
COPY services/ingestion-service/app ./app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]