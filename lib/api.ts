// lib/api.ts

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'

// Types
export interface ApiResponse<T> {
    success: boolean
    data?: T
    error?: string
    message?: string
}

export interface LoginRequest {
    email: string
    password: string
}

export interface LoginResponse {
    token: string
    refresh_token: string
    user: {
        id: string
        email: string
        name: string
        role: 'admin' | 'doctor' | 'researcher'
    }
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

// ===================== AUTH API =====================
export const authApi = {
    login: async (email: string, password: string): Promise<ApiResponse<LoginResponse>> => {
        try {
            const response = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            })
            
            const data = await response.json()
            
            if (response.ok && data.token) {
                // Stocker le token
                localStorage.setItem('ehealth_auth_token', data.token)
                localStorage.setItem('ehealth_user', JSON.stringify(data.user))
                return { success: true, data }
            }
            
            return { success: false, error: data.message || 'Erreur de connexion' }
        } catch (error) {
            return { success: false, error: 'Erreur réseau' }
        }
    },

    logout: () => {
        localStorage.removeItem('ehealth_auth_token')
        localStorage.removeItem('ehealth_user')
    },

    getToken: (): string | null => {
        return localStorage.getItem('ehealth_auth_token')
    },

    getUser: (): LoginResponse['user'] | null => {
        const user = localStorage.getItem('ehealth_user')
        return user ? JSON.parse(user) : null
    }
}

// ===================== PATIENT API =====================
export const patientsApi = {
    getAll: async (): Promise<ApiResponse<Patient[]>> => {
        const token = authApi.getToken()
        if (!token) return { success: false, error: 'Non authentifié' }

        try {
            const response = await fetch(`${API_URL}/api/patients`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            
            if (response.ok) {
                return { success: true, data }
            }
            return { success: false, error: data.message }
        } catch (error) {
            return { success: false, error: 'Erreur réseau' }
        }
    },

    getById: async (id: string): Promise<ApiResponse<Patient>> => {
        const token = authApi.getToken()
        if (!token) return { success: false, error: 'Non authentifié' }

        try {
            const response = await fetch(`${API_URL}/api/patients/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            
            if (response.ok) {
                return { success: true, data }
            }
            return { success: false, error: data.message }
        } catch (error) {
            return { success: false, error: 'Erreur réseau' }
        }
    },

    create: async (patientData: Partial<Patient>): Promise<ApiResponse<Patient>> => {
        const token = authApi.getToken()
        if (!token) return { success: false, error: 'Non authentifié' }

        try {
            const response = await fetch(`${API_URL}/api/patients`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(patientData)
            })
            const data = await response.json()
            
            if (response.ok) {
                return { success: true, data }
            }
            return { success: false, error: data.message }
        } catch (error) {
            return { success: false, error: 'Erreur réseau' }
        }
    }
}

// ===================== REPORT API =====================
export const reportsApi = {
    getByPatientId: async (patientId: string): Promise<ApiResponse<PatientReport>> => {
        const token = authApi.getToken()
        if (!token) return { success: false, error: 'Non authentifié' }

        try {
            const response = await fetch(`${API_URL}/api/reports/${patientId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            
            if (response.ok) {
                return { success: true, data }
            }
            return { success: false, error: data.message }
        } catch (error) {
            return { success: false, error: 'Erreur réseau' }
        }
    },

    exportPdf: async (patientId: string): Promise<Blob | null> => {
        const token = authApi.getToken()
        if (!token) return null

        try {
            const response = await fetch(`${API_URL}/api/reports/${patientId}/pdf`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            
            if (response.ok) {
                return await response.blob()
            }
            return null
        } catch (error) {
            return null
        }
    }
}

// ===================== UPLOAD API =====================
export const uploadApi = {
    audio: async (
        audioBlob: Blob,
        patientId: string,
        testType: string,
        onProgress?: (progress: number) => void
    ): Promise<ApiResponse<{ uploadId: string; status: string }>> => {
        const token = authApi.getToken()
        if (!token) return { success: false, error: 'Non authentifié' }

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
                        const data = JSON.parse(xhr.responseText)
                        resolve({ success: true, data })
                    } else {
                        resolve({ success: false, error: 'Erreur upload' })
                    }
                })

                xhr.addEventListener('error', () => {
                    resolve({ success: false, error: 'Erreur réseau' })
                })
            })

            xhr.open('POST', `${API_URL}/api/upload`)
            xhr.setRequestHeader('Authorization', `Bearer ${token}`)
            xhr.send(formData)

            return await promise
        } catch (error) {
            return { success: false, error: 'Erreur upload' }
        }
    }
}

// ===================== WEBSOCKET =====================
export const metricsWebSocket = {
    connect: (
        patientId: string,
        onMetrics: (metrics: any) => void,
        onStatus: (status: any) => void,
        onError: (error: string) => void
    ): WebSocket => {
        const token = authApi.getToken()
        if (!token) {
            onError('Non authentifié')
            return null as any
        }

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
    }
}