FROM rabbitmq:3.13-management

COPY infra/ca/ca.crt /etc/rabbitmq/certs/ca.crt
COPY infra/rabbitmq/certs/rabbitmq.crt /etc/rabbitmq/certs/rabbitmq.crt
COPY infra/rabbitmq/certs/rabbitmq.key /etc/rabbitmq/certs/rabbitmq.key
COPY infra/rabbitmq/rabbitmq.conf /etc/rabbitmq/conf.d/10-tls.conf

# The broker process runs as the "rabbitmq" user, not root — files copied in
# during the build are root-owned, so without this the TLS listener fails to
# read its own key and the container exits right after startup.
RUN chown rabbitmq:rabbitmq /etc/rabbitmq/certs/*.crt /etc/rabbitmq/certs/*.key \
    && chmod 600 /etc/rabbitmq/certs/rabbitmq.key
