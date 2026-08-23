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
// Both 2b) and 2a)'s confirm step set the access_token in an HttpOnly cookie.
// The frontend NEVER reads the token directly - it's handled by the browser.

const API_URL = 'http://localhost:8000'

const USER_KEY = 'user'
const TOKEN_KEY = 'access_token'

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

<<<<<<< HEAD
// ===================== Enrolement vocal (post-2FA) =====================
export async function enrollDoctorVoice(audioBlob: Blob, filename: string): Promise<void> {
=======
// ===================== Enrôlement vocal =====================
export async function enrollDoctorVoice(
    audioBlob: Blob, 
    filename: string
): Promise<void> {
>>>>>>> b056e8f36ec665af29dbd0b03746f8c8dc046b34
    console.log('🎵 Audio:', filename, audioBlob.size, 'bytes')
    console.log('📍 URL voix:', `${API_URL}/doctors/voice-enroll`)

    const formData = new FormData()
    formData.append('audio', audioBlob, filename)

    try {
        console.log('📤 Envoi de la requête...')
        
        const response = await fetch(`${API_URL}/doctors/voice-enroll`, {
            method: 'POST',
            credentials: 'include',  // ✅ Envoie le cookie automatiquement
            body: formData,
        })

        console.log('📥 Status voix:', response.status)

        if (response.status === 401) {
            localStorage.removeItem(USER_KEY)
            localStorage.removeItem(TOKEN_KEY)
            throw new AuthError('Session expirée, veuillez vous reconnecter', 401)
        }

        if (!response.ok) {
            const errorText = await response.text()
            console.error('❌ Erreur voix:', errorText)
            throw new AuthError(await parseErrorDetail(response), response.status)
        }
<<<<<<< HEAD

        console.log('✅ Voix enregistrée!')
=======
        
        const data = await response.json()
        console.log('✅ Voix enregistrée!', data)
>>>>>>> b056e8f36ec665af29dbd0b03746f8c8dc046b34
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

// ===================== Etape 2a : confirmer la 2FA (premiere fois) =====================
export async function confirm2FA(preAuthToken: string, code: string): Promise<TwoFactorConfirmResult> {
    console.log('📍 URL 2FA confirm:', `${API_URL}/2fa/confirm`)
    console.log('📌 preAuthToken:', preAuthToken?.substring(0, 30) + '...')
    console.log('📌 code:', code)
    
    try {
        const response = await fetch(`${API_URL}/2fa/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',  // ✅ Important pour le cookie
            body: JSON.stringify({ pre_auth_token: preAuthToken, code }),
        })

        const responseText = await response.text()
        console.log('📝 2FA confirm response:', responseText)
        
        let data
        try {
            data = JSON.parse(responseText)
        } catch (e) {
            console.error('❌ Erreur de parsing JSON:', e)
            throw new AuthError('Réponse invalide du serveur', response.status)
        }

        if (!response.ok) {
            console.error('❌ Erreur confirm 2FA:', response.status)
            throw new AuthError(data.detail || 'Échec de la confirmation 2FA', response.status)
        }

        // ✅ Le token est dans le cookie HttpOnly - pas besoin de le récupérer
        // On retourne juste les backup codes
        return {
            backupCodes: data.backup_codes || [],
        }
    } catch (error) {
        console.error('❌ Erreur confirm 2FA:', error)
        if (error instanceof AuthError) throw error
        throw new AuthError('Impossible de contacter le serveur', 0)
    }
}

<<<<<<< HEAD
// ===================== Etape 2b : verification 2FA =====================
export async function verify2FA(preAuthToken: string, code: string): Promise<void> {
    const response = await fetch(`${API_URL}/login/verify-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pre_auth_token: preAuthToken, code }),
    })
    if (!response.ok) {
        throw new AuthError(await parseErrorDetail(response), response.status)
=======
// ===================== Etape 2b : verification 2FA (connexions suivantes) =====================
export async function verify2FA(preAuthToken: string, code: string): Promise<void> {
    console.log('🔍 === verify2FA ===')
    console.log('📍 URL:', `${API_URL}/login/verify-2fa`)
    console.log('📌 preAuthToken:', preAuthToken?.substring(0, 30) + '...')
    console.log('📌 code:', code)
    
    try {
        const response = await fetch(`${API_URL}/login/verify-2fa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',  // ✅ Important pour le cookie
            body: JSON.stringify({ pre_auth_token: preAuthToken, code }),
        })
        
        console.log('📝 2FA verify response status:', response.status)
        
        // ✅ Lire la réponse en texte brut pour debug
        const responseText = await response.text()
        console.log('📝 Response body:', responseText)
        
        // ✅ Parser la réponse
        let data
        try {
            data = JSON.parse(responseText)
        } catch (e) {
            console.error('❌ Erreur de parsing JSON:', e)
            throw new AuthError('Réponse invalide du serveur', response.status)
        }

        if (!response.ok) {
            const detail = data.detail || data.message || 'Échec de la vérification 2FA'
            console.error('❌ Erreur:', detail)
            throw new AuthError(detail, response.status)
        }

        // ✅ Le token est dans le cookie HttpOnly - pas besoin de le récupérer
        // Le cookie a été défini par le backend
        console.log('✅ 2FA vérifiée avec succès! Le token est dans le cookie.')
        
    } catch (error) {
        console.error('❌ Erreur verify2FA:', error)
        if (error instanceof AuthError) throw error
        throw new AuthError('Impossible de contacter le serveur', 0)
>>>>>>> 0552d5bd3c2412f0f216ee213eaa7db32aa02280
    }
}

// ===================== Récupérer l'utilisateur depuis le backend =====================
export async function fetchUserFromBackend(): Promise<AuthUser | null> {
    try {
        console.log('🔍 Récupération de l\'utilisateur depuis /verify...')
        
        const response = await fetch(`${API_URL}/verify`, {
            credentials: 'include',  // ✅ Envoie le cookie automatiquement
        })
        
        if (!response.ok) {
            console.error('❌ /verify a retourné:', response.status)
            return null
        }
        
        const data = await response.json()
        console.log('📝 Données utilisateur:', data)
        
        const user: AuthUser = {
            id: data.sub,
            email: data.email,
            role: data.role || 'clinician',
            name: data.email?.split('@')[0] ?? 'Docteur',
        }
        
        localStorage.setItem(USER_KEY, JSON.stringify(user))
        console.log('✅ Utilisateur sauvegardé:', user)
        return user
    } catch (error) {
        console.error('❌ Erreur récupération utilisateur:', error)
        return null
    }
}

// ===================== Session helpers =====================

export function saveSession(): AuthUser | null {
    console.log('💾 === saveSession ===')
    // ✅ Le token est dans le cookie, on récupère juste l'utilisateur
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
    localStorage.removeItem(TOKEN_KEY)
}

export function getToken(): string | null {
    // ✅ Le token est dans le cookie HttpOnly, on ne peut pas le lire
    // On retourne null car on n'utilise plus le token dans le frontend
    console.log('ℹ️ Le token est dans le cookie HttpOnly - pas accessible en JS')
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
            localStorage.removeItem(TOKEN_KEY)
            return false
        }
        // ✅ Mettre à jour l'utilisateur si nécessaire
        const data = await response.json()
        const user: AuthUser = {
            id: data.sub,
            email: data.email,
            role: data.role || 'clinician',
            name: data.email?.split('@')[0] ?? 'Docteur',
        }
        localStorage.setItem(USER_KEY, JSON.stringify(user))
        return true
    } catch {
        return false
    }
}
export async function refreshSession(): Promise<AuthUser | null> {
    try {
        const response = await fetch(`${API_URL}/verify`, {
            credentials: 'include',
        })
        if (!response.ok) return null

        const payload = await response.json()
        const user: AuthUser = {
            id: payload.sub,
            email: payload.email,
            role: payload.role,
            name: payload.email?.split('@')[0] ?? 'Docteur',
        }
        localStorage.setItem(USER_KEY, JSON.stringify(user))
        return user
    } catch {
        return null
    }
}