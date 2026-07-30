from voiceplatform_shared.db_models import AuditLog


def log_action(db, actor_id, action, target_type=None, target_id=None, details=None):
    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=details,
    )
    db.add(entry)
    # pas de db.commit() ici : on veut que le log fasse partie de la MEME
    # transaction que l'action elle-meme (ex: suppression du docteur).
    # Si l'un echoue, l'autre est annule aussi -> pas de log orphelin,
    # pas de suppression sans trace.