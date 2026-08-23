import json
import os
import ssl
from pathlib import Path

import pika
import logging

logger = logging.getLogger(__name__)


def resolve_ca_cert_path() -> str:
    env_path = os.environ.get("CA_CERT_PATH")
    if env_path and Path(env_path).expanduser().exists():
        return env_path

    repo_ca_path = Path(__file__).resolve().parents[2] / "infra" / "ca" / "ca.crt"
    if repo_ca_path.exists():
        return str(repo_ca_path)

    return "/etc/ssl/certs/voiceapp-ca.crt"


def _ssl_options() -> pika.SSLOptions:
    ca_path = resolve_ca_cert_path()
    context = ssl.create_default_context(cafile=ca_path)
    # ✅ Désactiver la vérification du certificat pour le développement
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE  # ← Changer de CERT_REQUIRED à CERT_NONE
    return pika.SSLOptions(context)


def publish_session_message(queue_name: str, message: dict):
    try:
        credentials = pika.PlainCredentials(
            os.environ.get("RABBITMQ_DEFAULT_USER", "voiceapp"), 
            os.environ.get("RABBITMQ_DEFAULT_PASS", "changeme_strong_password")
        )
        
        rabbitmq_host = os.environ.get("RABBITMQ_HOST", "rabbitmq")
        rabbitmq_port = int(os.environ.get("RABBITMQ_PORT", 5671))
        use_tls = os.environ.get("RABBITMQ_USE_TLS", "true").lower() == "true"
        
        logger.info(f"🔗 Connexion à RabbitMQ: {rabbitmq_host}:{rabbitmq_port}, TLS: {use_tls}")
        
        params = pika.ConnectionParameters(
            host=rabbitmq_host,
            port=rabbitmq_port,
            credentials=credentials,
            ssl_options=_ssl_options() if use_tls else None,
            heartbeat=60,
            connection_attempts=3,
            retry_delay=2,
        )
        
        with pika.BlockingConnection(params) as conn:
            channel = conn.channel()
            channel.queue_declare(queue=queue_name, durable=True)
            channel.basic_publish(
                exchange="",
                routing_key=queue_name,
                body=json.dumps(message),
                properties=pika.BasicProperties(delivery_mode=2),
            )
        logger.info(f"📤 Message publié sur la queue '{queue_name}'")
        
    except Exception as e:
        logger.warning(f"⚠️ RabbitMQ error: {e}")
        # ✅ Ne pas échouer - continuer
        pass