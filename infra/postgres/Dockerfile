FROM postgres:16-alpine

COPY certs/postgres.crt /var/lib/postgresql/certs/server.crt
COPY certs/postgres.key /var/lib/postgresql/certs/server.key

RUN chown postgres:postgres /var/lib/postgresql/certs/server.crt /var/lib/postgresql/certs/server.key \
    && chmod 600 /var/lib/postgresql/certs/server.key
