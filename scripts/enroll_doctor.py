# scripts/enroll_doctor.py
import os
import sys
import numpy as np
from pyannote.audio import Model, Inference
from sqlalchemy import create_engine, text

def main():
    doctor_id = sys.argv[1]
    local_wav_path = sys.argv[2]

    model = Model.from_pretrained("pyannote/embedding", use_auth_token=os.environ["HF_TOKEN"])
    inference = Inference(model, window="whole")
    embedding = inference(local_wav_path)
    embedding = np.array(embedding).tolist()

    url = (
        f"postgresql+psycopg2://{os.environ['POSTGRES_USER']}:"
        f"{os.environ['POSTGRES_PASSWORD']}@{os.environ['POSTGRES_HOST']}:"
        f"{os.environ['POSTGRES_PORT']}/{os.environ['POSTGRES_DB']}"
    )
    engine = create_engine(url)
    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO doctor_voice_profiles (doctor_id, embedding)
                VALUES (:doctor_id, :embedding)
                ON CONFLICT (doctor_id) DO UPDATE SET embedding = :embedding
            """),
            {"doctor_id": doctor_id, "embedding": embedding},
        )
    print(f"Embedding inséré pour le médecin {doctor_id}, dimension: {len(embedding)}")

if __name__ == "__main__":
    main()