import os
import numpy as np
from pyannote.audio import Model, Inference
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

# Database environment variables
POSTGRES_USER = os.getenv("POSTGRES_USER", "voiceapp")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "voiceapp123")
POSTGRES_HOST = "localhost" if os.getenv("POSTGRES_HOST") == "postgres" else os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
POSTGRES_DB = os.getenv("POSTGRES_DB", "voiceapp_db")

# Target existing user details
DOCTOR_EMAIL = "doctor2.test@gmail.com.tn"  # <-- Update with your registered doctor's email
AUDIO_PATH = "/home/amir/stage/alzheimer-voice-platform/sample audio/doctor2_record.WAV"

def main():
    hf_token = os.getenv("HF_TOKEN")
    if not hf_token:
        raise ValueError("❌ HF_TOKEN environment variable is missing!")

    if not os.path.exists(AUDIO_PATH):
        raise FileNotFoundError(f"❌ Audio file not found at: {AUDIO_PATH}")

    # 1. Extract pyannote embedding
    print(f"🎙️ Extracting embedding from {AUDIO_PATH}...")
    model = Model.from_pretrained("pyannote/embedding", use_auth_token=hf_token)
    inference = Inference(model, window="whole")
    
    embedding = inference(AUDIO_PATH)
    embedding_list = np.array(embedding).tolist()

    # 2. Database Connection
    db_url = f"postgresql+psycopg2://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
    engine = create_engine(db_url)

    with engine.begin() as conn:
        # 3. Retrieve actual doctor ID from users table
        result = conn.execute(
            text("SELECT id FROM users WHERE email = :email;"),
            {"email": DOCTOR_EMAIL}
        ).fetchone()

        if not result:
            raise ValueError(f"❌ Doctor with email '{DOCTOR_EMAIL}' does not exist in the users table.")

        doctor_id = result[0]
        print(f"🔍 Found doctor in database! ID: {doctor_id}")

        # 4. Insert or update embedding in doctor_voice_profiles
        conn.execute(
            text("""
                INSERT INTO doctor_voice_profiles (doctor_id, embedding)
                VALUES (:doctor_id, :embedding)
                ON CONFLICT (doctor_id) DO UPDATE 
                SET embedding = EXCLUDED.embedding,
                    created_at = NOW();
            """),
            {"doctor_id": doctor_id, "embedding": embedding_list},
        )

    print(f"✅ Voice Profile successfully re-injected for Doctor ID: {doctor_id}")

if __name__ == "__main__":
    main()