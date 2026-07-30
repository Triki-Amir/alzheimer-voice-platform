"""
Cree un compte superadmin directement en base de donnees.

Volontairement PAS un endpoint HTTP : un superadmin peut tout dechiffrer
(audio patient) et tout supprimer (medecins, patients). Le seul moyen de
creer ce role doit rester un acces direct au serveur/conteneur - jamais
un appel API - pour eviter qu'un utilisateur puisse s'auto-promouvoir.

Usage (depuis l'hote, conteneur auth-service deja demarre) :

    docker compose exec auth-service python -m app.scripts.create_superadmin

Le script demande l'email, le prenom, le nom et le mot de passe de facon
interactive (mot de passe jamais affiche a l'ecran, jamais passe en argument
de ligne de commande pour eviter qu'il finisse dans l'historique du shell
ou dans `docker inspect`).
"""
import getpass
import sys

from app.auth import hash_password
from app.models import Doctor, DoctorRole
from voiceplatform_shared.db_session import SessionLocal


def prompt_email() -> str:
    email = input("Email du superadmin : ").strip()
    if not email or "@" not in email:
        print("Email invalide.")
        sys.exit(1)
    return email


def prompt_password() -> str:
    password = getpass.getpass("Mot de passe : ")
    if len(password) < 8:
        print("Le mot de passe doit contenir au moins 8 caracteres.")
        sys.exit(1)
    confirm = getpass.getpass("Confirmer le mot de passe : ")
    if password != confirm:
        print("Les mots de passe ne correspondent pas.")
        sys.exit(1)
    return password


def main() -> None:
    email = prompt_email()
    name = input("Prenom : ").strip()
    family_name = input("Nom : ").strip()
    password = prompt_password()

    db = SessionLocal()
    try:
        existing = db.query(Doctor).filter(Doctor.email == email).first()
        if existing:
            print(f"Un compte existe deja pour {email} (role actuel: {existing.role}).")
            sys.exit(1)

        superadmin = Doctor(
            email=email,
            hashed_password=hash_password(password),
            name=name,
            family_name=family_name,
            role=DoctorRole.SUPERADMIN,
            # totp_enabled reste False : le superadmin passe par le meme
            # parcours obligatoire /2fa/setup + /2fa/confirm que tout le
            # monde a sa premiere connexion. Pas de contournement de la 2FA.
        )
        db.add(superadmin)
        db.commit()
        db.refresh(superadmin)

        print(f"Superadmin cree avec succes : {superadmin.email} (id={superadmin.id})")
        print("Connectez-vous via /token puis configurez la 2FA via /2fa/setup + /2fa/confirm.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
