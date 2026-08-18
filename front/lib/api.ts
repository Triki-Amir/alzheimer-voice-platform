// lib/api.ts
//
// Auth lives in lib/auth.ts (real 2-step password + TOTP flow against
// auth-service via nginx). This file covers everything that comes after
// login: patients (also served by auth-service today), reports, uploads.
//
// JWT is carried by the HttpOnly cookie (credentials: 'include').
// Never read the token from localStorage.

// ✅ Utiliser HTTP pour le développement
const API_URL = 'http://localhost:8000'
const WS_URL = 'ws://localhost:8000'
import type { Patient } from '@/types'

function getCsrfToken(): string {
    if (typeof document === 'undefined') return ''
    const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/)
    return match ? decodeURIComponent(match[1]) : ''
}

// Types
export interface ApiResponse<T> {
    success: boolean
    data?: T
    error?: string
    message?: string
}
/*
export interface Patient {
    id: string
    name: string
    initials: string
    age: number
    birthDate: string
    dmiId: string
    phone?: string
    gender?: string
    lastSession: string
    color: string
    createdAt?: string
}
*/
export interface PatientReport {
    id?: string
    patient_id?: string
    [key: string]: any
}

function getToken(): string {
    if (typeof document === 'undefined') return ''
    
    // ✅ Chercher d'abord dans localStorage
    const token = localStorage.getItem('access_token') || localStorage.getItem('token')
    if (token) return token
    
    // ✅ Sinon chercher dans les cookies
    const match = document.cookie.match(/(?:^|; )(?:token|access_token)=([^;]*)/)
    return match ? decodeURIComponent(match[1]) : ''
}

// ===================== PATIENT API =====================
export const patientsApi = {
    getAll: async (): Promise<ApiResponse<Patient[]>> => {
        try {
            const token = getToken()
            const headers: HeadersInit = {
                'Content-Type': 'application/json',
            }
            if (token) {
                headers['Authorization'] = `Bearer ${token}`
            }

            const response = await fetch(`${API_URL}/patients`, {
                method: 'GET',
                credentials: 'include',
                headers,
            })

            if (response.status === 401) {
                return { success: false, error: 'Non authentifié' }
            }

            const data = await response.json()

            if (response.ok) {
                const patients: Patient[] = Array.isArray(data)
                    ? data.map((p: any) => ({
                        id: String(p.id),
                        name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                        initials: `${(p.first_name || '')[0] || ''}${(p.last_name || '')[0] || ''}`,
                        age: p.date_of_birth ? new Date().getFullYear() - new Date(p.date_of_birth).getFullYear() : 0,
                        birthDate: p.date_of_birth || '',
                        dmiId: p.external_ref || '',
                        lastSession: p.last_session || new Date().toLocaleDateString('fr-FR'),
                        color: ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'][Math.floor(Math.random() * 6)],
                        phone: p.phone || '',
                        gender: p.gender || '',
                        createdAt: p.created_at || new Date().toISOString(),
                    }))
                    : []
                return { success: true, data: patients }
            }
            return { success: false, error: data.detail || data.message || 'Erreur' }
        } catch (error) {
            console.error('Erreur réseau:', error)
            return { success: false, error: 'Erreur réseau' }
        }
    },

    getById: async (patientId: string): Promise<ApiResponse<Patient>> => {
        try {
            const token = getToken()
            const headers: HeadersInit = {
                'Content-Type': 'application/json',
            }
            if (token) {
                headers['Authorization'] = `Bearer ${token}`
            }

            const response = await fetch(`${API_URL}/patients/${patientId}`, {
                method: 'GET',
                credentials: 'include',
                headers,
            })

            if (response.status === 401) {
                return { success: false, error: 'Non authentifié' }
            }

            const data = await response.json()

            if (response.ok) {
                const patient: Patient = {
                    id: String(data.id),
                    name: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
                    initials: `${(data.first_name || '')[0] || ''}${(data.last_name || '')[0] || ''}`,
                    age: data.date_of_birth ? new Date().getFullYear() - new Date(data.date_of_birth).getFullYear() : 0,
                    birthDate: data.date_of_birth || '',
                    dmiId: data.external_ref || '',
                    lastSession: data.last_session || new Date().toLocaleDateString('fr-FR'),
                    color: ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'][Math.floor(Math.random() * 6)],
                    phone: data.phone || '',
                    gender: data.gender || '',
                    createdAt: data.created_at || new Date().toISOString(),
                }
                return { success: true, data: patient }
            }
            return { success: false, error: data.detail || data.message || 'Patient non trouvé' }
        } catch (error) {
            console.error('Erreur réseau:', error)
            return { success: false, error: 'Erreur réseau' }
        }
    },

    create: async (patientData: {
        first_name: string
        last_name: string
        date_of_birth: string
        external_ref: string
    }): Promise<ApiResponse<Patient>> => {
        const token = getToken()
        if (!token) return { success: false, error: 'Non authentifié' }

        console.log('📤 Envoi patient:', patientData)

        try {
            const response = await fetch(`${API_URL}/patients`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-CSRF-Token': getCsrfToken(),
                },
                body: JSON.stringify(patientData),
            })

            if (response.status === 401) {
                return { success: false, error: 'Non authentifié' }
            }

            const data = await response.json()

            if (response.ok) {
                const createdPatient: Patient = {
                    id: String(data.id),
                    name: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
                    initials: `${(data.first_name || '')[0] || ''}${(data.last_name || '')[0] || ''}`,
                    age: data.date_of_birth ? new Date().getFullYear() - new Date(data.date_of_birth).getFullYear() : 0,
                    birthDate: data.date_of_birth || '',
                    dmiId: data.external_ref || '',
                    phone: data.phone || '',
                    gender: data.gender || '',
                    lastSession: data.last_session || new Date().toLocaleDateString('fr-FR'),
                    color: ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'][Math.floor(Math.random() * 6)],
                    createdAt: data.created_at || new Date().toISOString(),
                }
                return { success: true, data: createdPatient }
            }
            return { success: false, error: data.detail || data.message || 'Erreur' }
        } catch (error) {
            console.error('Erreur réseau:', error)
            return { success: false, error: 'Erreur réseau' }
        }
    },

    update: async (patientId: string, patientData: {
        first_name?: string
        last_name?: string
        date_of_birth?: string
        external_ref?: string
        phone?: string
        gender?: string
    }): Promise<ApiResponse<Patient>> => {
        const token = getToken()
        if (!token) return { success: false, error: 'Non authentifié' }

        try {
            const response = await fetch(`${API_URL}/patients/${patientId}`, {
                method: 'PUT',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-CSRF-Token': getCsrfToken(),
                },
                body: JSON.stringify(patientData),
            })

            if (response.status === 401) {
                return { success: false, error: 'Non authentifié' }
            }

            const data = await response.json()

            if (response.ok) {
                const updatedPatient: Patient = {
                    id: String(data.id),
                    name: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
                    initials: `${(data.first_name || '')[0] || ''}${(data.last_name || '')[0] || ''}`,
                    age: data.date_of_birth ? new Date().getFullYear() - new Date(data.date_of_birth).getFullYear() : 0,
                    birthDate: data.date_of_birth || '',
                    dmiId: data.external_ref || '',
                    phone: data.phone || '',
                    gender: data.gender || '',
                    lastSession: data.last_session || new Date().toLocaleDateString('fr-FR'),
                    color: ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'][Math.floor(Math.random() * 6)],
                    createdAt: data.created_at || new Date().toISOString(),
                }
                return { success: true, data: updatedPatient }
            }
            return { success: false, error: data.detail || data.message || 'Erreur' }
        } catch (error) {
            console.error('Erreur réseau:', error)
            return { success: false, error: 'Erreur réseau' }
        }
    },

    delete: async (patientId: string): Promise<ApiResponse<void>> => {
        const token = getToken()
        if (!token) return { success: false, error: 'Non authentifié' }

        try {
            const response = await fetch(`${API_URL}/patients/${patientId}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-CSRF-Token': getCsrfToken(),
                },
            })

            if (response.status === 401) {
                return { success: false, error: 'Non authentifié' }
            }

            if (response.ok) {
                return { success: true }
            }

            const data = await response.json()
            return { success: false, error: data.detail || data.message || 'Erreur' }
        } catch (error) {
            console.error('Erreur réseau:', error)
            return { success: false, error: 'Erreur réseau' }
        }
    },
}

// ===================== REPORT API =====================
export const reportsApi = {
    getByPatientId: async (patientId: string): Promise<ApiResponse<PatientReport>> => {
        try {
            const token = getToken()
            const headers: HeadersInit = {
                'Content-Type': 'application/json',
            }
            if (token) {
                headers['Authorization'] = `Bearer ${token}`
            }

            const response = await fetch(`${API_URL}/reports/${patientId}`, {
                method: 'GET',
                credentials: 'include',
                headers,
            })

            if (response.status === 401) {
                return { success: false, error: 'Non authentifié' }
            }

            const data = await response.json()

            if (response.ok) {
                return { success: true, data }
            }
            return { success: false, error: data.message || data.detail || 'Erreur' }
        } catch (error) {
            console.error('Erreur réseau:', error)
            return { success: false, error: 'Erreur réseau' }
        }
    },

    exportPdf: async (patientId: string): Promise<Blob | null> => {
        try {
            const token = getToken()
            const headers: HeadersInit = {}
            if (token) {
                headers['Authorization'] = `Bearer ${token}`
            }

            const response = await fetch(`${API_URL}/reports/${patientId}/pdf`, {
                method: 'GET',
                credentials: 'include',
                headers,
            })

            if (response.ok) {
                return await response.blob()
            }
            return null
        } catch (error) {
            console.error('Erreur export PDF:', error)
            return null
        }
    },
}

// ===================== UPLOAD API =====================
export const uploadApi = {
    /**
     * Upload audio file for a patient
     * @param audioBlob - The audio blob to upload
     * @param patientId - The patient ID
     * @param testType - Type of test (cognitive, memory, language, attention)
     * @param onProgress - Optional progress callback
     */
    audio: async (
        audioBlob: Blob,
        patientId: string,
        testType: string = 'cognitive',
        onProgress?: (progress: number) => void
    ): Promise<ApiResponse<{ session_id: string; status: string }>> => {
        const token = getToken()
        if (!token) return { success: false, error: 'Non authentifié' }

        try {
            const formData = new FormData()
            formData.append('audio', audioBlob, `${patientId}_${testType}_${Date.now()}.webm`)
            formData.append('patient_id', patientId)
            formData.append('test_type', testType)

            const xhr = new XMLHttpRequest()

            const promise = new Promise<ApiResponse<{ session_id: string; status: string }>>((resolve) => {
                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable && onProgress) {
                        const progress = Math.round((event.loaded / event.total) * 100)
                        onProgress(progress)
                    }
                })

                xhr.addEventListener('load', () => {
                    if (xhr.status === 200 || xhr.status === 201 || xhr.status === 202) {
                        try {
                            const data = JSON.parse(xhr.responseText)
                            resolve({ success: true, data })
                        } catch {
                            resolve({ success: false, error: 'Réponse invalide' })
                        }
                    } else if (xhr.status === 401) {
                        resolve({ success: false, error: 'Non authentifié' })
                    } else {
                        try {
                            const data = JSON.parse(xhr.responseText)
                            resolve({ success: false, error: data.detail || data.message || 'Erreur upload' })
                        } catch {
                            resolve({ success: false, error: `Erreur ${xhr.status}` })
                        }
                    }
                })

                xhr.addEventListener('error', () => {
                    resolve({ success: false, error: 'Erreur réseau' })
                })
            })

            xhr.open('POST', `${API_URL}/sessions/upload`)
            xhr.withCredentials = true
            xhr.setRequestHeader('Authorization', `Bearer ${token}`)
            xhr.send(formData)

            return await promise
        } catch (error) {
            console.error('Erreur upload:', error)
            return { success: false, error: 'Erreur réseau' }
        }
    },

    getStatus: async (sessionId: string): Promise<ApiResponse<any>> => {
        try {
            const token = getToken()
            const headers: HeadersInit = {
                'Content-Type': 'application/json',
            }
            if (token) {
                headers['Authorization'] = `Bearer ${token}`
            }

            const response = await fetch(`${API_URL}/sessions/${sessionId}/status`, {
                method: 'GET',
                credentials: 'include',
                headers,
            })

            if (response.status === 401) {
                return { success: false, error: 'Non authentifié' }
            }

            const data = await response.json()

            if (response.ok) {
                return { success: true, data }
            }
            return { success: false, error: data.detail || data.message || 'Erreur' }
        } catch (error) {
            console.error('Erreur réseau:', error)
            return { success: false, error: 'Erreur réseau' }
        }
    },

    getPatientSessions: async (patientId: string, limit: number = 10): Promise<ApiResponse<any[]>> => {
        try {
            const token = getToken()
            const headers: HeadersInit = {
                'Content-Type': 'application/json',
            }
            if (token) {
                headers['Authorization'] = `Bearer ${token}`
            }

            const response = await fetch(`${API_URL}/patients/${patientId}/sessions?limit=${limit}`, {
                method: 'GET',
                credentials: 'include',
                headers,
            })

            if (response.status === 401) {
                return { success: false, error: 'Non authentifié' }
            }

            const data = await response.json()

            if (response.ok) {
                return { success: true, data }
            }
            return { success: false, error: data.detail || data.message || 'Erreur' }
        } catch (error) {
            console.error('Erreur réseau:', error)
            return { success: false, error: 'Erreur réseau' }
        }
    },
}

// ===================== WEBSOCKET =====================
async function fetchWsTicket(): Promise<string | null> {
    try {
        const token = getToken()
        const headers: HeadersInit = {}
        if (token) {
            headers['Authorization'] = `Bearer ${token}`
        }

        const response = await fetch(`${API_URL}/ws-ticket`, {
            method: 'GET',
            credentials: 'include',
            headers,
        })
        if (!response.ok) return null
        const data = await response.json()
        return data.ticket
    } catch {
        return null
    }
}

export const metricsWebSocket = {
    connect: (
        patientId: string,
        onMetrics: (metrics: any) => void,
        onStatus: (status: any) => void,
        onError: (error: string) => void
    ): WebSocket | null => {
        const token = getToken()
        if (!token) {
            onError('Non authentifié')
            return null
        }

        try {
            const ws = new WebSocket(`${WS_URL}/ws/metrics?patient_id=${patientId}&token=${token}`)

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    if (data.type === 'metrics') {
                        onMetrics(data.payload)
                    } else if (data.type === 'status') {
                        onStatus(data.payload)
                    }
                } catch (e) {
                    console.error('WebSocket parse error:', e)
                }
            }

            ws.onerror = () => {
                onError('Erreur WebSocket')
            }

            ws.onclose = () => {
                console.log('WebSocket fermé')
            }

            return ws
        } catch (e) {
            console.error('WebSocket connection error:', e)
            onError('Erreur de connexion WebSocket')
            return null
        }
    },

    disconnect: (ws: WebSocket | null) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close()
        }
    }
}