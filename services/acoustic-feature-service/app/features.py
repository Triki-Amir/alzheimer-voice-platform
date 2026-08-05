import os
import opensmile
import pandas as pd
import numpy as np
from typing import Dict, Any

class AcousticFeatureExtractor:
    def __init__(self):
        self.smile = opensmile.Smile(
            feature_set=opensmile.FeatureSet.eGeMAPSv02,
            feature_level=opensmile.FeatureLevel.Functionals,
        )

    def extract_from_file(self, audio_path: str, pause_metrics: Dict[str, Any] = None) -> Dict[str, Any]:
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file target not found: {audio_path}")

        # Extract features using OpenSMILE
        df_features: pd.DataFrame = self.smile.process_file(audio_path)
        
        # Format metrics to prevent JSON NaN crash in Postgres
        raw_dict = df_features.to_dict(orient="records")[0]
        egemaps_clean = {
            k: (None if pd.isna(v) or np.isinf(v) else float(v))
            for k, v in raw_dict.items()
        }

        return {
            "egemaps": egemaps_clean,
            "pause_metrics": pause_metrics or {}
        }