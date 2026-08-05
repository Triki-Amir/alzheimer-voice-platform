# shared/voiceplatform_shared/celery_app.py
import os
from celery import Celery

def make_celery_app(service_name: str, queue_name: str) -> Celery:
    user = os.environ["RABBITMQ_DEFAULT_USER"]
    password = os.environ["RABBITMQ_DEFAULT_PASS"]
    host = os.environ["RABBITMQ_HOST"]
    port = os.environ["RABBITMQ_PORT"]

    broker_url = f"pyamqp://{user}:{password}@{host}:{port}//"

    app = Celery(service_name, broker=broker_url, backend="rpc://")
    app.conf.update(
        task_default_queue=queue_name,
        task_acks_late=True,
        worker_prefetch_multiplier=1,
        task_reject_on_worker_lost=True,
    )
    return app