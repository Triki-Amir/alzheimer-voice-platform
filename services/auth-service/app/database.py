from voiceplatform_shared.db_session import SessionLocal


def get_db():
    """Dependency FastAPI : ouvre une session SQLAlchemy et la ferme
    proprement après la requête."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
