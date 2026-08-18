import os
from datetime import timedelta
from urllib.parse import urlparse, urlunparse

import urllib3
from minio import Minio


def get_minio_client() -> Minio:
    secure = os.environ.get("MINIO_SECURE", "true").lower() == "true"
    http_client = None

    if secure:
        ca_path = os.environ.get("CA_CERT_PATH", "/etc/ssl/certs/voiceapp-ca.crt")
        http_client = urllib3.PoolManager(
            cert_reqs="CERT_REQUIRED",
            ca_certs=ca_path,
            assert_hostname=False,
        )

    return Minio(
        f"{os.environ['MINIO_HOST']}:{os.environ['MINIO_PORT']}",
        access_key=os.environ["MINIO_ROOT_USER"],
        secret_key=os.environ["MINIO_ROOT_PASSWORD"],
        secure=secure,
        http_client=http_client,
    )


def presigned_get_url(
    bucket: str,
    object_name: str,
    expires_seconds: int = 300,
    *,
    # Optional: rewrite host so the browser can reach MinIO (or nginx)
    public_base_url: str | None = None,
) -> str:
    """
    Return a short-lived GET URL for a private object.
    Default expiry: 5 minutes.
    """
    client = get_minio_client()
    url = client.presigned_get_object(
        bucket,
        object_name,
        expires=timedelta(seconds=expires_seconds),
    )

    # MinIO may return an internal hostname (e.g. https://minio:9000/...).
    # Rewrite to a URL the browser can actually call if PUBLIC_MINIO_URL is set.
    public_base = public_base_url or os.environ.get("PUBLIC_MINIO_URL")
    if public_base:
        parsed = urlparse(url)
        public = urlparse(public_base)
        url = urlunparse(
            (
                public.scheme or parsed.scheme,
                public.netloc or parsed.netloc,
                parsed.path,
                parsed.params,
                parsed.query,
                parsed.fragment,
            )
        )

    return url