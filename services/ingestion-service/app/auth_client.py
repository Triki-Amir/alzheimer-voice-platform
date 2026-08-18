import os
import httpx
from fastapi import Depends, HTTPException, status, Request, Cookie
from fastapi.security import OAuth2PasswordBearer

AUTH_SERVICE_URL = os.environ.get("AUTH_SERVICE_URL", "http://auth-service:8000")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)

def get_current_doctor(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    cookie_token: str | None = Cookie(None, alias="ehealth_auth_token"),
) -> dict:
    """Vérifie le token via cookie ou header Bearer."""
    
    # ✅ Priorité au cookie ehealth_auth_token
    auth_token = cookie_token or token
    
    if not auth_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Non authentifié"
        )
    
    try:
        resp = httpx.get(
            f"{AUTH_SERVICE_URL}/verify",
            headers={"Authorization": f"Bearer {auth_token}"},
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