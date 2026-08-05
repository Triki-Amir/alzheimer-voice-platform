# scripts/enroll_doctor.py
import os
import numpy as np
from pyannote.audio import Model, Inference
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

POSTGRES_USER = os.getenv("POSTGRES_USER", "voiceapp")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "voiceapp123")
POSTGRES_HOST = "localhost" if os.getenv("POSTGRES_HOST") == "postgres" else os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
POSTGRES_DB = os.getenv("POSTGRES_DB", "voiceapp_db")

DOCTOR_ID = "33333333-2222-3333-3333-333333333333"
AUDIO_PATH = "/home/amir/stage/alzheimer-voice-platform/sample audio/doctor3_sample.WAV"

def main():
    hf_token = os.getenv("HF_TOKEN")
    if not hf_token:
        raise ValueError("❌ HF_TOKEN environment variable is missing!")

    print(f"🎙️ Extracting embedding from {AUDIO_PATH}...")
    model = Model.from_pretrained("pyannote/embedding", use_auth_token=hf_token)
    inference = Inference(model, window="whole")
    
    embedding = inference(AUDIO_PATH)
    embedding_list = np.array(embedding).tolist()

    db_url = f"postgresql+psycopg2://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
    engine = create_engine(db_url)

    with engine.begin() as conn:
        # 1. Insert parent user into 'users' using your exact table schema
        conn.execute(
            text("""
                INSERT INTO users (id, email, hashed_password, role, name, family_name, totp_enabled)
                VALUES (:doctor_id, 'doc3@test.com', 'x', 'clinician', 'Doctor', 'Three', false)
                ON CONFLICT (id) DO NOTHING;
            """),
            {"doctor_id": DOCTOR_ID}
        )

        # 2. Upsert voice profile into 'doctor_voice_profiles'
        conn.execute(
            text("""
                INSERT INTO doctor_voice_profiles (doctor_id, embedding)
                VALUES (:doctor_id, :embedding)
                ON CONFLICT (doctor_id) DO UPDATE SET embedding = :embedding;
            """),
            {"doctor_id": DOCTOR_ID, "embedding": embedding_list},
        )

    print(f"✅ User and Voice Profile successfully created for Doctor ID: {DOCTOR_ID}")

if __name__ == "__main__":
    main() 