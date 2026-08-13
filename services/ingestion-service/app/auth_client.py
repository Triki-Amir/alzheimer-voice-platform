import os
import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

AUTH_SERVICE_URL = os.environ["AUTH_SERVICE_URL"]
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def get_current_doctor(token: str = Depends(oauth2_scheme)) -> dict:
    """Verifie le token aupres de auth-service. Accepte tout medecin
    pleinement authentifie (clinician ou superadmin)."""
    try:
        resp = httpx.get(
            f"{AUTH_SERVICE_URL}/verify",
            headers={"Authorization": f"Bearer {token}"},
            timeout=5.0,
        )
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="auth-service injoignable")

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Token invalide")

    payload = resp.json()
    if payload.get("role") not in {"clinician", "superadmin"}:
        raise HTTPException(status_code=403, detail="Acces reserve aux medecins")

    return payload  # dict avec sub, email, role, amr, exp