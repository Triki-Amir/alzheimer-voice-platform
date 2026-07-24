import os
from minio import Minio

def get_minio_client() -> Minio:
    return Minio(
        f"{os.environ['MINIO_HOST']}:{os.environ['MINIO_PORT']}",
        access_key=os.environ["MINIO_ROOT_USER"],
        secret_key=os.environ["MINIO_ROOT_PASSWORD"],
        secure=False,
    )