import uuid

from sqlalchemy.orm import Session as DBSession
from voiceplatform_shared.db_models import Session
from voiceplatform_shared.crypto import generate_data_key, wrap_key, encrypt_bytes


def create_session(db: DBSession, patient_id, audio_bytes: bytes) -> tuple[Session, bytes]:
    # Generated up front (instead of relying on the DB default) so it can be
    # used as AAD: binds the wrapped key and the ciphertext to *this* session
    # row, so neither can be silently swapped onto a different session.
    session_id = uuid.uuid4()
    aad = str(session_id).encode("ascii")

    data_key = generate_data_key()
    wrapped = wrap_key(data_key, aad=aad)
    encrypted_audio = encrypt_bytes(data_key, audio_bytes, aad=aad)

    session = Session(
        id=session_id,
        patient_id=patient_id,
        wrapped_data_key=wrapped,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    # NOTE: caller is responsible for uploading `encrypted_audio` to MinIO
    # (e.g. under raw_audio_path) — not done here, this function only
    # creates the DB row and returns the ciphertext.
    return session, encrypted_audio