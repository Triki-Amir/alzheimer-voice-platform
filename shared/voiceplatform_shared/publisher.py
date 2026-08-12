import json
import os
import ssl
import pika


def _ssl_options() -> pika.SSLOptions:
    ca_path = os.environ.get("CA_CERT_PATH", "/etc/ssl/certs/voiceapp-ca.crt")
    context = ssl.create_default_context(cafile=ca_path)
    # Leaf cert is CN-only (no SAN), so hostname matching is disabled while
    # still requiring a chain of trust back to our internal CA.
    context.check_hostname = False
    context.verify_mode = ssl.CERT_REQUIRED
    return pika.SSLOptions(context)


def publish_session_message(queue_name: str, message: dict):
    credentials = pika.PlainCredentials(
        os.environ["RABBITMQ_DEFAULT_USER"], os.environ["RABBITMQ_DEFAULT_PASS"]
    )
    use_tls = os.environ.get("RABBITMQ_USE_TLS", "true").lower() == "true"
    params = pika.ConnectionParameters(
        host=os.environ["RABBITMQ_HOST"],
        port=int(os.environ["RABBITMQ_PORT"]),
        credentials=credentials,
        ssl_options=_ssl_options() if use_tls else None,
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