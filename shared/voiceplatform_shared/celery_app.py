# shared/voiceplatform_shared/celery_app.py
import os
import ssl
from celery import Celery

def make_celery_app(service_name: str, queue_name: str) -> Celery:
    user = os.environ["RABBITMQ_DEFAULT_USER"]
    password = os.environ["RABBITMQ_DEFAULT_PASS"]
    host = os.environ["RABBITMQ_HOST"]
    port = os.environ["RABBITMQ_PORT"]
    use_tls = os.environ.get("RABBITMQ_USE_TLS", "true").lower() == "true"

    broker_url = f"pyamqp://{user}:{password}@{host}:{port}//"

    app = Celery(service_name, broker=broker_url, backend="rpc://")
    app.conf.update(
        task_default_queue=queue_name,
        task_acks_late=True,
        worker_prefetch_multiplier=1,
        task_reject_on_worker_lost=True,
    )
    if use_tls:
        ca_path = os.environ.get("CA_CERT_PATH", "/etc/ssl/certs/voiceapp-ca.crt")
        # Same CN-only cert as the rest of the stack: verify against our CA,
        # skip hostname matching. Applies to both the broker connection and
        # the rpc:// result backend, since kombu shares the connection setup.
        app.conf.broker_use_ssl = {
            "ca_certs": ca_path,
            "cert_reqs": ssl.CERT_REQUIRED,
            "check_hostname": False,
        }
    return app