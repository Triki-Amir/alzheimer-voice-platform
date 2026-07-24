from setuptools import setup, find_packages

setup(
    name="voiceplatform_shared",
    version="0.1.0",
    packages=find_packages(),
    install_requires=["pydantic", "celery", "minio", "sqlalchemy", "psycopg2-binary", "pika"],
)