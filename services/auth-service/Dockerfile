FROM python:3.11-slim
WORKDIR /app
COPY infra/ca/ca.crt /etc/ssl/certs/voiceapp-ca.crt
COPY shared/ /shared/
RUN pip install /shared
COPY services/auth-service/requirements.txt .
RUN pip install -r requirements.txt
COPY services/auth-service/app ./app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
