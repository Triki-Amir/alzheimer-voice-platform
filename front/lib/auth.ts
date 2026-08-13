// lib/auth.ts
//
// Client for the real auth-service, reachable at http://localhost:8000
// This is a two-step login:
//
//   1) POST /token            (email + password, form-encoded)
//      -> pre_auth_token + whether 2FA still needs to be set up
//   2a) requires_2fa_setup = true  -> POST /2fa/setup, show QR code,
//       then POST /2fa/confirm with the 6-digit code
//   2b) requires_2fa_setup = false -> POST /login/verify-2fa with the
//       6-digit code (or a backup code)
//
// Both 2b) and 2a)'s confirm step return the final access_token.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

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
        if (body.message) return body.message
        if (Array.isArray(body.detail)) {
            return body.detail.map((d: any) => d.msg || d.message).join(', ')
        }
        return response.statusText || 'Erreur de connexion au serveur'
    } catch {
        return response.statusText || 'Erreur de connexion au serveur'
    }
}

// ===================== Inscription =====================
export async function registerDoctor(
    email: string,
    password: string,
    name: string,
    familyName: string
): Promise<void> {
    console.log('📝 Inscription:', { email, name, familyName })
    console.log('📍 URL:', `${API_URL}/doctors/register`)
    
    try {
        const response = await fetch(`${API_URL}/doctors/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email, 
                password, 
                name, 
                family_name: familyName 
            }),
        })

        const status = response.status
        const bodyText = await response.text()
        console.log('📝 Réponse status:', status)
        console.log('📝 Réponse body:', bodyText)

        if (!response.ok) {
            let errorMessage = 'Erreur lors de l\'inscription'
            try {
                const json = JSON.parse(bodyText)
                if (json.detail) {
                    if (Array.isArray(json.detail)) {
                        errorMessage = json.detail.map((e: any) => e.msg || e.message).join(', ')
                    } else {
                        errorMessage = json.detail
                    }
                }
                if (json.message) errorMessage = json.message
            } catch {
                errorMessage = bodyText || response.statusText
            }
            throw new AuthError(errorMessage, status)
        }
        
        console.log('✅ Inscription réussie!')
        
    } catch (error) {
        console.error('❌ Erreur:', error)
        if (error instanceof AuthError) throw error
        throw new AuthError('Impossible de contacter le serveur', 0)
    }
}

// ===================== Enrolement vocal (post-2FA) =====================
export async function enrollDoctorVoice(accessToken: string, audioBlob: Blob, filename: string): Promise<void> {
    console.log('🎵 Audio:', filename, audioBlob.size, 'bytes')
    console.log('📍 URL voix:', `${API_URL}/doctors/voice-enroll`)
    
    if (!accessToken) {
        throw new AuthError('Token manquant - Veuillez vous reconnecter', 401)
    }

    const formData = new FormData()
    formData.append('audio', audioBlob, filename)

    try {
        const response = await fetch(`${API_URL}/doctors/voice-enroll`, {
            method: 'POST',
            credentials: 'include',
            body: formData,
        })

        console.log('📝 Status voix:', response.status)

        if (response.status === 401) {
            localStorage.removeItem(USER_KEY)
            throw new AuthError('Session expirée, veuillez vous reconnecter', 401)
        }

        if (!response.ok) {
            throw new AuthError(await parseErrorDetail(response), response.status)
        }
        
        console.log('✅ Voix enregistrée!')
    } catch (error) {
        console.error('❌ Erreur voix:', error)
        if (error instanceof AuthError) throw error
        throw new AuthError('Impossible de contacter le serveur', 0)
    }
}

// ===================== Etape 1 : email + mot de passe =====================
export async function loginStep1(email: string, password: string): Promise<LoginStepOneResult> {
    const body = new URLSearchParams()
    body.set('username', email)
    body.set('password', password)

    console.log('📍 URL login:', `${API_URL}/token`)
    
    try {
        const response = await fetch(`${API_URL}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        })

        if (!response.ok) {
            const bodyText = await response.text()
            console.error('❌ Erreur login:', response.status, bodyText)
            throw new AuthError(await parseErrorDetail(response), response.status)
        }

        const data = await response.json()
        console.log('📝 Login step1 response:', data)
        
        return {
            requiresSetup: data.requires_2fa_setup,
            preAuthToken: data.pre_auth_token,
            message: data.message,
        }
    } catch (error) {
        console.error('❌ Erreur réseau login:', error)
        if (error instanceof AuthError) throw error
        throw new AuthError('Impossible de contacter le serveur', 0)
    }
}

// ===================== Etape 2a : premiere config 2FA =====================
export async function setup2FA(preAuthToken: string): Promise<TwoFactorSetup> {
    console.log('📍 URL 2FA setup:', `${API_URL}/2fa/setup`)
    
    try {
        const response = await fetch(
            `${API_URL}/2fa/setup?pre_auth_token=${encodeURIComponent(preAuthToken)}`,
            { method: 'POST' }
        )

        if (!response.ok) {
            throw new AuthError(await parseErrorDetail(response), response.status)
        }

        const data = await response.json()
        console.log('📝 2FA setup response:', data)
        
        return {
            secret: data.secret,
            otpauthUrl: data.otpauth_url,
            qrCodeBase64: data.qr_code_base64,
        }
    } catch (error) {
        console.error('❌ Erreur setup 2FA:', error)
        if (error instanceof AuthError) throw error
        throw new AuthError('Impossible de contacter le serveur', 0)
    }
}

export async function confirm2FA(preAuthToken: string, code: string): Promise<TwoFactorConfirmResult> {
    console.log('📍 URL 2FA confirm:', `${API_URL}/2fa/confirm`)
    
    try {
        const response = await fetch(`${API_URL}/2fa/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ pre_auth_token: preAuthToken, code }),
        })

        if (!response.ok) {
            throw new AuthError(await parseErrorDetail(response), response.status)
        }

        const data = await response.json()
        console.log('📝 2FA confirm response:', data)

        
        return {
            accessToken: '',
            backupCodes: data.backup_codes || [],
        }
    } catch (error) {
        console.error('❌ Erreur confirm 2FA:', error)
        if (error instanceof AuthError) throw error
        throw new AuthError('Impossible de contacter le serveur', 0)
    }
}

// ===================== Etape 2b : verification 2FA =====================
export async function verify2FA(preAuthToken: string, code: string): Promise<void> {
    const response = await fetch(`${API_URL}/login/verify-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pre_auth_token: preAuthToken, code }),
    })
DFVRGB THNYJ?UK.IIYTGR5BFE4D3ZSA2Q  1<    if (!response.ok) {
        throw new AuthError(await parseErrorDetail(response), response.status)
    }
    // Cookie is set by the backend — nothing to store
}
// ===================== Session helpers =====================

function decodeJwtPayload(token: string): Record<string, any> | null {
    try {
        const [, payload] = token.split('.')
        const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
        return JSON.parse(json)
    } catch {
        return null
    }
}

export function saveSession(accessToken: string): AuthUser | null {
    if (accessToken) {
        const payload = decodeJwtPayload(accessToken)
        if (payload) {
            const user: AuthUser = {
                id: payload.sub,
                email: payload.email,
                role: payload.role,
                name: payload.email?.split('@')[0] ?? 'Docteur',
            }
            localStorage.setItem(USER_KEY, JSON.stringify(user))
            return user
        }
    }
    return getUser()
}

export async function logout(): Promise<void> {
    try {
        await fetch(`${API_URL}/logout`, {
            method: 'POST',
            credentials: 'include',
        })
    } catch {
        // ignore network errors on logout
    }
    localStorage.removeItem(USER_KEY)
    // Do NOT touch any token key – there shouldn't be one anymore
}

export function getToken(): string | null {
    return null
}

export function getUser(): AuthUser | null {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
}

export function isAuthenticated(): boolean {
    return !!getUser()
}

export async function verifySession(): Promise<boolean> {
    try {
        const response = await fetch(`${API_URL}/verify`, {
            credentials: 'include',
        })
        if (!response.ok) {
            localStorage.removeItem(USER_KEY)
            return false
        }
        return true
    } catch {
        return false
    }
}