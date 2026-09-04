# services/ingestion-service/app/publisher.py
import json
import os
import logging
import ssl
import pika
from typing import Dict, Any

logger = logging.getLogger(__name__)

def get_rabbitmq_connection():
    credentials = pika.PlainCredentials(
        os.environ.get("RABBITMQ_DEFAULT_USER", "voiceapp"),
        os.environ.get("RABBITMQ_DEFAULT_PASS", "changeme_strong_password"),
    )

    use_tls = os.environ.get("RABBITMQ_USE_TLS", "false").lower() in ("1", "true", "yes")
    port = int(os.environ.get("RABBITMQ_PORT", "5671" if use_tls else "5672"))

    ssl_options = None
    if use_tls:
        context = ssl.create_default_context()
        # local self-signed certs
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        ssl_options = pika.SSLOptions(context)

    params = pika.ConnectionParameters(
        host=os.environ.get("RABBITMQ_HOST", "rabbitmq"),
        port=port,
        credentials=credentials,
        heartbeat=60,
        ssl_options=ssl_options,
    )
    return pika.BlockingConnection(params)


def publish_session_message(queue_name: str, message: Dict[str, Any]):
    """
    Publie un message sur une queue RabbitMQ.
    
    Args:
        queue_name: Nom de la queue (ex: "preprocessing", "quality_check")
        message: Dictionnaire contenant le message à envoyer
    """
    try:
        connection = get_rabbitmq_connection()
        channel = connection.channel()
        
        # Déclarer la queue comme durable
        channel.queue_declare(
            queue=queue_name,
            durable=True,
            arguments={
                "x-queue-type": "classic"
            }
        )
        
        # Publier le message
        channel.basic_publish(
            exchange="",
            routing_key=queue_name,
            body=json.dumps(message).encode("utf-8"),
            properties=pika.BasicProperties(
                delivery_mode=2,  # 2 = persistant (survit au redémarrage)
                content_type="application/json",
            )
        )
        
        logger.info(f"📤 Message publié sur la queue '{queue_name}': {message.get('session_id', 'unknown')}")
        connection.close()
        
    except Exception as e:
        logger.error(f"❌ Erreur lors de la publication sur '{queue_name}': {e}")
        raise


def publish_to_preprocessing(session_id: str, patient_id: str, raw_audio_path: str, wrapped_data_key: str):
    """
    Publie un message sur la queue PREPROCESSING.
    """
    message = {
        "session_id": session_id,
        "patient_id": patient_id,
        "raw_audio_path": raw_audio_path,
        "wrapped_data_key": wrapped_data_key,
        "timestamp": "2026-08-16T00:00:00Z",  # À remplacer par datetime.utcnow().isoformat()
    }
    publish_session_message("preprocessing", message)


def publish_to_quality_check(session_id: str, raw_audio_path: str):
    """
    Publie un message sur la queue QUALITY_CHECK.
    """
    message = {
        "session_id": session_id,
        "raw_audio_path": raw_audio_path,
        "timestamp": "2026-08-16T00:00:00Z",
    }
    publish_session_message("quality_check", message)