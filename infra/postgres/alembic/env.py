import os
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from dotenv import load_dotenv

# 1. Charger le fichier .env
dotenv_path = os.getenv("ENV_FILE_PATH", os.path.join(os.path.dirname(__file__), "..", ".env"))
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
else:
    load_dotenv()

# 2. Configurer la chaîne de connexion PostgreSQL depuis le .env
user = os.getenv("POSTGRES_USER", "voiceapp")
password = os.getenv("POSTGRES_PASSWORD", "voiceapp123")
# Si exécuté depuis la machine hôte Ubuntu, on cible localhost sur le port 5432
host = os.getenv("POSTGRES_HOST", "localhost") 
if host == "postgres":  # Fallback si exécuté en local hors Docker
    host = "localhost"
port = os.getenv("POSTGRES_PORT", "5432")
db = os.getenv("POSTGRES_DB", "voiceapp_db")

db_url = f"postgresql://{user}:{password}@{host}:{port}/{db}"

# 3. Configuration d'Alembic
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Injecter l'URL dynamique de la BD dans la config d'Alembic
config.set_main_option("sqlalchemy.url", db_url)

# Laisser à None si vous écrivez les migrations SQL/Python à la main
target_metadata = None

# 4. Fonctions d'exécution d'Alembic
def run_migrations_offline() -> None:
    """Exécution en mode offline (sans connexion directe à la BD)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Exécution en mode online (connexion active à PostgreSQL)."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()