"""
Structures the pre-calculated linguistic features coming from linguistic_features.json.
No additional feature extraction or computation is performed here.
"""
import logging

logger = logging.getLogger("feature_engineering.linguistic")


def structure_linguistic_features(linguistic: dict) -> dict:
    """
    Passes through pre-computed linguistic features into a clean, structured dictionary.
    """
    return {
        "transcript": linguistic.get("texte_original", ""),
        "general": linguistic.get("general_linguistics", {}),
        "pos_counts": linguistic.get("pos_counts", {}),
        "cookie_theft": linguistic.get("cookie_theft", {}),
        "pause_metrics": {
            "significant_pause_count": linguistic.get("significant_pause_count", 0),
            "aligned": linguistic.get("aligned", True),
        },
    }