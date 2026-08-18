"""
Turns a features JSON dict into a flat list of (feature_name, value) pairs.

Acoustic features are already flat (feature_name -> float), so this is a
no-op for them. Linguistic features are NOT flat -- e.g. the sample you
showed has scalars (aligned, significant_pause_count), a flat sub-dict
(pos_counts: {NOUN: 39, VERB: 29, ...}), and list-valued fields (sentences,
tokens_pos, texte_original as raw text).

For now (this service is explicitly a starting point -- feature SELECTION
is a later step) this flattener:
  - keeps scalars (str, int, float, bool) as-is
  - recurses into dicts, building dotted paths (e.g. "pos_counts.NOUN")
  - SKIPS lists/tuples entirely (sentences, tokens_pos) -- those are
    intermediate representations, not engineered features yet. Revisit this
    once you decide what to derive from them (e.g. avg words per sentence,
    POS-tag transition patterns).
"""
import logging

logger = logging.getLogger("feature_engineering.flatten")

SCALAR_TYPES = (str, int, float, bool)


def flatten_features(data: dict, prefix: str = "") -> list[tuple[str, object]]:
    rows = []
    for key, value in data.items():
        full_key = f"{prefix}.{key}" if prefix else key

        if isinstance(value, dict):
            rows.extend(flatten_features(value, prefix=full_key))
        elif isinstance(value, SCALAR_TYPES) or value is None:
            rows.append((full_key, value))
        else:
            # list/tuple or anything else non-scalar -- skipped on purpose,
            # see module docstring.
            logger.debug("Skipping non-scalar field '%s' (type=%s)", full_key, type(value).__name__)

    return rows
