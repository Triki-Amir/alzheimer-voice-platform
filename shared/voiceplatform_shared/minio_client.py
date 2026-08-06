import os
import urllib3
from minio import Minio


def get_minio_client() -> Minio:
    secure = os.environ.get("MINIO_SECURE", "true").lower() == "true"
    http_client = None

    if secure:
        ca_path = os.environ.get("CA_CERT_PATH", "/etc/ssl/certs/voiceapp-ca.crt")
        # Verify the server cert against our internal CA. assert_hostname is
        # disabled because our leaf certs are CN-only (no SAN entries), so
        # strict hostname matching would fail even for a legitimate server.
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