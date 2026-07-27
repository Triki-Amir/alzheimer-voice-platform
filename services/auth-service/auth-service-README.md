# Auth Service

Handles doctor accounts and login. Doctors are the **only** users who log in —
patients never authenticate, they're just records owned by a doctor.

Login is **two-factor, mandatory**: password first, then a TOTP code (Google
Authenticator / Authy style). A request never gets a usable access token from
password alone.

- Base URL (direct): `http://localhost:8001`
- Base URL (through nginx): `http://<host>/auth/`
- Interactive API docs: `http://localhost:8001/docs`

---

## Quick mental model

```
POST /doctors/register        →  create an account
POST /token                   →  step 1: password  → pre_auth_token (short-lived)
POST /2fa/setup + /2fa/confirm →  first-time 2FA setup → access_token
POST /login/verify-2fa        →  every login after that → access_token
GET  /verify                  →  used by OTHER SERVICES to check a token
```

Only the **access_token** from `/2fa/confirm` or `/login/verify-2fa` proves
someone is fully logged in. The `pre_auth_token` from `/token` is *not* a
valid access token — it only unlocks the `/2fa/*` routes for 5 minutes.

---

## Endpoints

### `POST /doctors/register`
Creates a doctor account. **Not protected** — anyone can call it right now.
This is fine for local dev but must be locked down (admin-only, or replaced
by `scripts/enroll_doctor.py`) before any real deployment.

**Input (JSON body):**
```json
{
  "email": "doc@test.com",
  "password": "plaintext_password",
  "name": "Jane",
  "family_name": "Doe"
}
```

**Output — `201 Created`:**
```json
{
  "id": "uuid",
  "email": "doc@test.com",
  "name": "Jane",
  "family_name": "Doe",
  "role": "clinician",
  "totp_enabled": false
}
```

**Errors:** `400` if the email is already registered.

---

### `POST /token` — login step 1 (password)
Standard OAuth2 form login (**not JSON** — form-urlencoded body, this is a
FastAPI/OAuth2 convention).

**Input (`application/x-www-form-urlencoded`):**
```
username=doc@test.com&password=plaintext_password
```

**Output:**
```json
{
  "requires_2fa_setup": true,
  "pre_auth_token": "eyJ...",
  "message": "..."
}
```
- `requires_2fa_setup: true` → this doctor has never set up 2FA. Call
  `/2fa/setup` then `/2fa/confirm` next.
- `requires_2fa_setup: false` → 2FA is already active. Call
  `/login/verify-2fa` next.

**Errors:** `401` on wrong email/password.

`pre_auth_token` expires in `PRE_AUTH_EXPIRE_MINUTES` (default 5 min) and
only works on `/2fa/*` routes — it will be rejected by every protected route
(`/patients`, etc.).

---

### `POST /2fa/setup` — first-time 2FA setup (one time per account)
**Input (query param):** `pre_auth_token` (from `/token`)

**Output:**
```json
{
  "secret": "BASE32SECRET",
  "otpauth_url": "otpauth://totp/...",
  "qr_code_base64": "iVBORw0KG..."
}
```
- `qr_code_base64` → show this as an image so the doctor can scan it with
  an authenticator app.
- `secret` → same thing in text form (manual entry / testing without an app).

Calling this again before `/2fa/confirm` **overwrites** the previous secret —
only the latest one is valid. `totp_enabled` stays `false` until confirmed.

**Errors:** `401` if `pre_auth_token` is invalid/expired. `400` if 2FA is
already enabled for this account (use `/login/verify-2fa` instead).

---

### `POST /2fa/confirm` — finish first-time 2FA setup
**Input (JSON body):**
```json
{
  "pre_auth_token": "eyJ...",
  "code": "123456"
}
```
`code` = the 6-digit code from the authenticator app right now.

**Output:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "backup_codes": ["3f9a1c02", "a1b2c3d4", "..."]
}
```
This is the **first real access_token** the doctor ever gets. `totp_enabled`
flips to `true` from this point on.

`backup_codes` are shown **once, here only** — 8 single-use codes for account
recovery if the phone is lost. Tell the doctor to save them; they're not
retrievable again.

**Errors:** `400` wrong/expired TOTP code, or `/2fa/setup` was never called.

---

### `POST /login/verify-2fa` — every login *after* the first
**Input (JSON body):**
```json
{
  "pre_auth_token": "eyJ...",
  "code": "123456"
}
```
`code` = a fresh 6-digit TOTP code, **or** one unused backup code.

**Output:** same as `/2fa/confirm`, minus `backup_codes` (they're only ever
handed out once, at setup time):
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer"
}
```

**Errors:** `401` if `pre_auth_token` invalid/expired. `400` if the code is
wrong (tries TOTP first, then falls back to checking backup codes). If a
backup code is used, it's consumed and can't be reused.

---

### `GET /verify` — for OTHER SERVICES to call, not for doctors/UI
Any other microservice (or nginx via `auth_request`) can call this to check
whether a token is valid and fully authenticated, without re-implementing
JWT logic.

**Input (query param):** `token` (the access_token to check)

**Output — `200`:** the decoded JWT payload:
```json
{
  "sub": "doctor-uuid",
  "email": "doc@test.com",
  "role": "clinician",
  "amr": ["pwd", "totp"],
  "exp": 1785150000
}
```

**Errors:** `401` if the token is invalid, expired, or missing full 2FA
(`amr` doesn't contain both `"pwd"` and `"totp"` — this rejects pre-auth
tokens too).

---

### `POST /patients` and `GET /patients` — protected, example pattern
These are the only currently-implemented "real" resources, and exist mainly
to demonstrate the pattern every other service should copy:

**Required header on every call:**
```
Authorization: Bearer <access_token>
```

`GET /patients` returns only the patients belonging to the calling doctor
(filtered by `doctor_id`) — never all patients in the system.

---

## How OTHER SERVICES should check a doctor is logged in

Two options — pick one per-service, don't mix inconsistently:

**Option A — call this service's `/verify` endpoint** (simplest, one extra
network hop per request):
```
GET http://auth-service:8000/verify?token=<the_bearer_token>
```
If it returns `200`, trust the payload (contains `sub` = doctor id,
`role`, etc.). If `401`, reject the request.

**Option B — decode the JWT locally** (faster, no network hop, but every
service needs the same `JWT_SECRET_KEY`/`JWT_ALGORITHM` env vars):
```python
from jose import jwt
payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=["HS256"])
assert "pwd" in payload["amr"] and "totp" in payload["amr"]
```
This is exactly what `get_current_doctor` in this service's own `main.py`
does — copy that dependency function into any other FastAPI service that
needs to protect a route.

Either way: **never** treat a `pre_auth_token` as proof of login. The only
signal that both factors were checked is `amr` containing both `"pwd"` and
`"totp"`.

---

## Required environment variables

| Variable | Purpose | Example |
|---|---|---|
| `JWT_SECRET_KEY` | Signs/verifies all tokens — must be shared with any service using Option B above | `openssl rand -hex 32` |
| `JWT_ALGORITHM` | JWT signing algorithm | `HS256` |
| `JWT_EXPIRE_MINUTES` | Access token lifetime | `60` |
| `PRE_AUTH_EXPIRE_MINUTES` | Pre-auth token lifetime | `5` |
| `TOTP_ISSUER` | Name shown in the authenticator app | `Alzheimer Voice Platform` |

## Known gaps (as of this doc)

- `/doctors/register` has no auth — needs to be restricted before prod.
- No account lockout / rate limiting on failed password or TOTP attempts.
- No token revocation — a leaked access_token stays valid until it expires,
  there's no logout/blocklist.
