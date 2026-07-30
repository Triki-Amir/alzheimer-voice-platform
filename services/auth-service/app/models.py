# Ré-exporte les modèles ORM partagés pour que
# `from . import models` fonctionne comme dans le README.
from voiceplatform_shared.db_models import Base, Doctor, Patient, DoctorRole  # noqa: F401
