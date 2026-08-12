FROM minio/minio:latest

# MinIO auto-enables TLS when it finds public.crt/private.key at this path
# (server runs as root in this image, so HOME=/root).
COPY infra/minio/certs/minio.crt /root/.minio/certs/public.crt
COPY infra/minio/certs/minio.key /root/.minio/certs/private.key
COPY infra/ca/ca.crt /root/.minio/certs/CAs/ca.crt

ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
