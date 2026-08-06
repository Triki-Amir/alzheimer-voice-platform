// lib/auth.ts
//
// Client for the real auth-service, reachable through nginx at
// https://localhost/auth/*. This is a two-step login:
//
//   1) POST /auth/token            (email + password, form-encoded)
//      -> pre_auth_token + whether 2FA still needs to be set up
//   2a) requires_2fa_setup = true  -> POST /auth/2fa/setup, show QR code,
//       then POST /auth/2fa/confirm with the 6-digit code
//   2b) requires_2fa_setup = false -> POST /auth/login/verify-2fa with the
//       6-digit code (or a backup code)
//
// Both 2b) and 2a)'s confirm step return the final access_token.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://localhost'
const AUTH_URL = `${API_URL}/auth`

const TOKEN_KEY = 'ehealth_auth_token'
const USER_KEY = 'user'

export type DoctorRole = 'clinician' | 'superadmin'

export interface AuthUser {
    id: string
    email: string
    role: DoctorRole
    name: string
}

export interface LoginStepOneResult {
    requiresSetup: boolean
    preAuthToken: string
    message: string
}

export interface TwoFactorSetup {
    secret: string
    otpauthUrl: string
    qrCodeBase64: string
}

export interface TwoFactorConfirmResult {
    accessToken: string
    backupCodes: string[]
}

export class AuthError extends Error {
    status: number
    constructor(message: string, status: number) {
        super(message)
        this.status = status
    }
}

async function parseErrorDetail(response: Response): Promise<string> {
    try {
        const body = await response.json()
        if (typeof body.detail === 'string') return body.detail
        return response.statusText || 'Erreur de connexion au serveur'
    } catch {
        return response.statusText || 'Erreur de connexion au serveur'
    }
}

// ===================== Etape 1 : email + mot de passe =====================
export async function loginStep1(email: string, password: string): Promise<LoginStepOneResult> {
    const body = new URLSearchParams()
    body.set('username', email)
    body.set('password', password)

    let response: Response
    try {
        response = await fetch(`${AUTH_URL}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        })
    } catch {
        throw new AuthError('Impossible de contacter le serveur', 0)
    }

    if (!response.ok) {
        throw new AuthError(await parseErrorDetail(response), response.status)
    }

    const data = await response.json()
    return {
        requiresSetup: data.requires_2fa_setup,
        preAuthToken: data.pre_auth_token,
        message: data.message,
    }
}

// ===================== Etape 2a : premiere config 2FA =====================
export async function setup2FA(preAuthToken: string): Promise<TwoFactorSetup> {
    const response = await fetch(
        `${AUTH_URL}/2fa/setup?pre_auth_token=${encodeURIComponent(preAuthToken)}`,
        { method: 'POST' }
    )

    if (!response.ok) {
        throw new AuthError(await parseErrorDetail(response), response.status)
    }

    const data = await response.json()
    return {
        secret: data.secret,
        otpauthUrl: data.otpauth_url,
        qrCodeBase64: data.qr_code_base64,
    }
}

export async function confirm2FA(preAuthToken: string, code: string): Promise<TwoFactorConfirmResult> {
    const response = await fetch(`${AUTH_URL}/2fa/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pre_auth_token: preAuthToken, code }),
    })

    if (!response.ok) {
        throw new AuthError(await parseErrorDetail(response), response.status)
    }

    const data = await response.json()
    return { accessToken: data.access_token, backupCodes: data.backup_codes }
}

// ===================== Etape 2b : verification 2FA =====================
export async function verify2FA(preAuthToken: string, code: string): Promise<string> {
    const response = await fetch(`${AUTH_URL}/login/verify-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pre_auth_token: preAuthToken, code }),
    })

    if (!response.ok) {
        throw new AuthError(await parseErrorDetail(response), response.status)
    }

    const data = await response.json()
    return data.access_token as string
}

// ===================== Session helpers =====================

// Decodes a JWT payload without verifying the signature. Verification
// happens server-side; this is only used to populate the UI (id/email/role).
function decodeJwtPayload(token: string): Record<string, any> | null {
    try {
        const [, payload] = token.split('.')
        const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
        return JSON.parse(json)
    } catch {
        return null
    }
}

/** Persists the final access token and derives a user object from it. */
export function saveSession(accessToken: string): AuthUser | null {
    const payload = decodeJwtPayload(accessToken)
    if (!payload) return null

    const user: AuthUser = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        // The backend doesn't expose a "my profile" endpoint yet (only
        // /doctors/register and the superadmin-only /admin/doctors list
        // return name/family_name), so we fall back to the email handle.
        name: payload.email?.split('@')[0] ?? 'Docteur',
    }

    localStorage.setItem(TOKEN_KEY, accessToken)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    return user
}

export function logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
}

export function getToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(TOKEN_KEY)
}

export function getUser(): AuthUser | null {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
}

export function isAuthenticated(): boolean {
    return !!getToken()
}

/** Confirms the token is present and fully 2FA-verified server-side. */
export async function verifySession(): Promise<boolean> {
    const token = getToken()
    if (!token) return false
    try {
        const response = await fetch(`${AUTH_URL}/verify`, {
            headers: { Authorization: `Bearer ${token}` },
        })
        return response.ok
    } catch {
        return false
    }
}