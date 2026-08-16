# shared/voiceplatform_shared/csrf.py
"""
Double-submit-cookie CSRF protection, shared by every service that sits
behind the browser session (auth-service, ingestion-service, ...).

Usage:
    from voiceplatform_shared.csrf import set_csrf_cookie, verify_csrf

    # when issuing the session (login/2FA confirm):
    set_csrf_cookie(response)

    # on any mutating route:
    @app.post("/sessions/upload")
    def upload(..., _: None = Depends(verify_csrf)):
        ...
"""
import secrets

from fastapi import Cookie, Header, HTTPException, Response

CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"
CSRF_MAX_AGE_SECONDS = 120 * 60  # keep in sync with JWT_EXPIRE_MINUTES; adjust if that changes


def set_csrf_cookie(response: Response, max_age: int = CSRF_MAX_AGE_SECONDS) -> str:
    """Issue a fresh CSRF token as a non-httpOnly cookie the frontend JS can read."""
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,
        secure=True,
        samesite="lax",
        max_age=max_age,
        path="/",
    )
    return csrf_token


def verify_csrf(
    csrf_cookie: str | None = Cookie(None, alias=CSRF_COOKIE_NAME),
    x_csrf_token: str | None = Header(None, alias=CSRF_HEADER_NAME),
) -> None:
    """Dependency: reject the request unless the header matches the cookie."""
    if not csrf_cookie or not x_csrf_token or not secrets.compare_digest(csrf_cookie, x_csrf_token):
        raise HTTPException(status_code=403, detail="CSRF token invalide")