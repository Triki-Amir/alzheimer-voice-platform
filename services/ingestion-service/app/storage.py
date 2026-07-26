from sqlalchemy.orm import Session as DBSession
from voiceplatform_shared.db_models import Session
from voiceplatform_shared.crypto import generate_data_key, wrap_key


def create_session(db: DBSession, patient_id, audio_bytes: bytes) -> Session:
    data_key = generate_data_key()
    wrapped = wrap_key(data_key)
    encrypted_audio = encrypt_bytes(data_key, audio_bytes) 

    session = Session(
        patient_id=patient_id,
        wrapped_data_key=wrapped,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session

