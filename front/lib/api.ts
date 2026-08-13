// lib/api.ts
//
// Auth lives in lib/auth.ts (real 2-step password + TOTP flow against
// auth-service via nginx). This file covers everything that comes after
// login: patients (also served by auth-service today), reports, uploads.
//
// JWT is carried by the HttpOnly cookie (credentials: 'include').
// Never read the token from localStorage.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://localhost:8000'
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'wss://localhost:8000'

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

export interface Patient {
    id: string
    name: string
    initials: string
    age: number
    birthDate: string
    phone?: string
    email?: string
    gender?: 'Homme' | 'Femme'
    address?: string
    lastSession: string
    color: string
    createdAt?: string
}

export interface PatientReport {
    patientId: string
    patientName: string
    lastSession: string
    totalTests: number
    completedTests: number
    overallScore?: number
    diagnosis?: 'control' | 'mci' | 'ad'
    confidence?: number
    tests: TestResult[]
}

export interface TestResult {
    testId: string
    testName: string
    date: string
    duration: number
    score: number
    quality: 'excellent' | 'good' | 'poor'
    diagnosis?: 'control' | 'mci' | 'ad'
    confidence?: number
}

// ===================== PATIENT API =====================
// NOTE: patient CRUD lives inside auth-service (not a separate
// patients/report service), reachable at /auth/patients through nginx.
// The shapes below (name/initials/color/etc.) are the frontend's mock
// Patient model and don't match auth-service's PatientOut yet
// (first_name/last_name/date_of_birth/external_ref) — mapping that is a
// separate task from wiring the transport itself.
export const patientsApi = {
    getAll: async (): Promise<ApiResponse<Patient[]>> => {
        try {
            const response = await fetch(`${API_URL}/auth/patients`, {
                credentials: 'include',
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
            return { success: false, error: 'Erreur réseau' }
        }
    },

    create: async (patientData: Partial<Patient>): Promise<ApiResponse<Patient>> => {
        try {
            const response = await fetch(`${API_URL}/auth/patients`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': getCsrfToken(),
                },
                body: JSON.stringify(patientData),
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
            return { success: false, error: 'Erreur réseau' }
        }
    },
}

// ===================== REPORT API =====================
export const reportsApi = {
    getByPatientId: async (patientId: string): Promise<ApiResponse<PatientReport>> => {
        try {
            const response = await fetch(`${API_URL}/api/reports/${patientId}`, {
                credentials: 'include',
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
            return { success: false, error: 'Erreur réseau' }
        }
    },

    exportPdf: async (patientId: string): Promise<Blob | null> => {
        try {
            const response = await fetch(`${API_URL}/api/reports/${patientId}/pdf`, {
                credentials: 'include',
            })

            if (response.ok) {
                return await response.blob()
            }
            return null
        } catch (error) {
            return null
        }
    },
}

// ===================== UPLOAD API =====================
export const uploadApi = {
    audio: async (
        audioBlob: Blob,
        patientId: string,
        testType: string,
        onProgress?: (progress: number) => void
    ): Promise<ApiResponse<{ uploadId: string; status: string }>> => {
        try {
            const formData = new FormData()
            formData.append('audio', audioBlob, `${patientId}_${testType}_${Date.now()}.webm`)
            formData.append('patient_id', patientId)
            formData.append('test_type', testType)

            const xhr = new XMLHttpRequest()

            const promise = new Promise<ApiResponse<{ uploadId: string; status: string }>>((resolve) => {
                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable && onProgress) {
                        const progress = Math.round((event.loaded / event.total) * 100)
                        onProgress(progress)
                    }
                })

                xhr.addEventListener('load', () => {
                    if (xhr.status === 200) {
                        try {
                            const data = JSON.parse(xhr.responseText)
                            resolve({ success: true, data })
                        } catch {
                            resolve({ success: false, error: 'Réponse invalide' })
                        }
                    } else if (xhr.status === 401) {
                        resolve({ success: false, error: 'Non authentifié' })
                    } else {
                        resolve({ success: false, error: 'Erreur upload' })
                    }
                })

                xhr.addEventListener('error', () => {
                    resolve({ success: false, error: 'Erreur réseau' })
                })
            })

            xhr.open('POST', `${API_URL}/api/upload`)
            xhr.withCredentials = true
            // If the upload endpoint is CSRF-protected, uncomment the next line:
            // xhr.setRequestHeader('X-CSRF-Token', getCsrfToken())
            xhr.send(formData)

            return await promise
        } catch (error) {
            return { success: false, error: 'Erreur upload' }
        }
    },
}

// ===================== WEBSOCKET =====================
async function fetchWsTicket(): Promise<string | null> {
    try {
        const response = await fetch(`${API_URL}/auth/ws-ticket`, {
            credentials: 'include',
        })
        if (!response.ok) return null
        const data = await response.json()
        return data.ticket
    } catch {
        return null
    }
}

export const metricsWebSocket = {
    connect: async (
        patientId: string,
        onMetrics: (metrics: any) => void,
        onStatus: (status: any) => void,
        onError: (error: string) => void
    ): Promise<WebSocket | null> => {
        const ticket = await fetchWsTicket()
        if (!ticket) {
            onError('Non authentifié')
            return null
        }

        const ws = new WebSocket(`${WS_URL}/ws/metrics?patient_id=${patientId}&ticket=${ticket}`)

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
    },
}