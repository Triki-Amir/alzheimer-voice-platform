#!/bin/bash
set -e

# Déterminer le mode
ENVIRONMENT=${ENVIRONMENT:-development}
RABBITMQ_USE_TLS=${RABBITMQ_USE_TLS:-false}

echo "🚀 Starting RabbitMQ"
echo "📦 Environment: ${ENVIRONMENT}"
echo "🔒 TLS-Only: ${RABBITMQ_USE_TLS}"

# Fonction pour activer TLS-Only (production)
enable_tls() {
    echo "🔒 TLS-Only mode enabled (production)"
    # Activer la config TLS-Only
    mv /etc/rabbitmq/conf.d/20-tls-only.conf.disabled /etc/rabbitmq/conf.d/20-tls-only.conf 2>/dev/null || true
    # Désactiver la config développement
    mv /etc/rabbitmq/conf.d/10-development.conf /etc/rabbitmq/conf.d/10-development.conf.disabled 2>/dev/null || true
    echo "✅ TLS-Only configuration activated"
}

# Fonction pour désactiver TLS (développement)
disable_tls() {
    echo "🔓 Development mode (no TLS)"
    # Désactiver la config TLS-Only
    mv /etc/rabbitmq/conf.d/20-tls-only.conf /etc/rabbitmq/conf.d/20-tls-only.conf.disabled 2>/dev/null || true
    # Activer la config développement
    mv /etc/rabbitmq/conf.d/10-development.conf.disabled /etc/rabbitmq/conf.d/10-development.conf 2>/dev/null || true
    echo "✅ Development configuration activated"
}

# Choisir le mode
if [ "$RABBITMQ_USE_TLS" = "true" ] && [ "$ENVIRONMENT" = "production" ]; then
    enable_tls
else
    disable_tls
    if [ "$RABBITMQ_USE_TLS" = "true" ] && [ "$ENVIRONMENT" != "production" ]; then
        echo "⚠️ TLS requested but environment is not 'production' - using development mode"
    fi
fi

# Afficher la configuration active
echo "📋 Active configuration:"
ls -la /etc/rabbitmq/conf.d/ | grep -v ".disabled"

# Démarrer RabbitMQ
echo "🚀 Starting RabbitMQ server..."
exec rabbitmq-server "$@"