FROM rabbitmq:3.13-management
COPY definitions.json /etc/rabbitmq/definitions.json
RUN echo "management.load_definitions = /etc/rabbitmq/definitions.json" >> /etc/rabbitmq/rabbitmq.conf