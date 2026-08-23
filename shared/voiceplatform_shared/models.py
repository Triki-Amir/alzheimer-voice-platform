from pydantic import BaseModel
from typing import Optional

class SessionMessage(BaseModel):
    session_id: str
    raw_audio_path: Optional[str] = None
    patient_audio_path: Optional[str] = None
    wrapped_data_key: Optional[str] = None
    transcript_path: Optional[str] = None
    acoustic_features_path: Optional[str] = None
    linguistic_features_path: Optional[str] = None
    pause_metrics_path: Optional[str] = None
    metadata: dict = {}