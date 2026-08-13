// lib/api.ts
//
// Auth lives in lib/auth.ts (real 2-step password + TOTP flow against
// auth-service via nginx). This file covers everything that comes after
// login: patients (also served by auth-service today), reports, uploads.

import { getToken } from '@/lib/auth'
import type { Patient, PatientReport, TestResult } from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'

// Types
export interface ApiResponse<T> {
    success: boolean
    data?: T
    error?: string
    message?: string
}

// ===================== PATIENT API =====================
export const patientsApi = {
    getAll: async (): Promise<ApiResponse<Patient[]>> => {
        const token = getToken()
        if (!token) return { success: false, error: 'Non authentifié' }

        try {
            const response = await fetch(`${API_URL}/patients`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            
            if (response.ok) {
                // Transformer la réponse du backend en format frontend
                const patients: Patient[] = data.map((p: any) => ({
                    id: p.id,
                    name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                    initials: `${(p.first_name || '')[0]}${(p.last_name || '')[0]}`,
                    age: p.date_of_birth ? new Date().getFullYear() - new Date(p.date_of_birth).getFullYear() : 0,
                    birthDate: p.date_of_birth || '',
                    dmiId: p.external_ref || '',
                    lastSession: new Date().toLocaleDateString('fr-FR'),
                    color: ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'][Math.floor(Math.random() * 6)]
                }))
                return { success: true, data: patients }
            }
            return { success: false, error: data.detail || 'Erreur' }
        } catch (error) {
            console.error('Erreur réseau:', error)
            return { success: false, error: 'Erreur réseau' }
        }
    },

    // ✅ NEW: Get a single patient by ID
    getById: async (patientId: string): Promise<ApiResponse<Patient>> => {
        const token = getToken()
        if (!token) return { success: false, error: 'Non authentifié' }

        try {
            const response = await fetch(`${API_URL}/patients/${patientId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            
            if (response.ok) {
                // Transformer la réponse du backend en format frontend
                const frontendPatient: Patient = {
                    id: data.id,
                    name: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
                    initials: `${(data.first_name || '')[0]}${(data.last_name || '')[0]}`,
                    age: data.date_of_birth ? new Date().getFullYear() - new Date(data.date_of_birth).getFullYear() : 0,
                    birthDate: data.date_of_birth || '',
                    dmiId: data.external_ref || '',
                    phone: data.phone || '',
                    gender: data.gender || '',
                    lastSession: data.last_session || new Date().toLocaleDateString('fr-FR'),
                    color: ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'][Math.floor(Math.random() * 6)],
                    // Additional fields for statistics
                    createdAt: data.created_at || new Date().toISOString()
                }
                return { success: true, data: frontendPatient }
            }
            return { success: false, error: data.detail || 'Patient non trouvé' }
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
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(patientData)
            })
            const data = await response.json()
            
            console.log('📥 Réponse:', response.status, data)

            if (response.ok) {
                // Transformer la réponse en Patient frontend
                const frontendPatient: Patient = {
                    id: data.id,
                    name: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
                    initials: `${(data.first_name || '')[0]}${(data.last_name || '')[0]}`,
                    age: data.date_of_birth ? new Date().getFullYear() - new Date(data.date_of_birth).getFullYear() : 0,
                    birthDate: data.date_of_birth || '',
                    dmiId: data.external_ref || '',
                    lastSession: new Date().toLocaleDateString('fr-FR'),
                    color: ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'][Math.floor(Math.random() * 6)]
                }
                return { success: true, data: frontendPatient }
            }
            return { success: false, error: data.detail || 'Erreur' }
        } catch (error) {
            console.error('❌ Erreur réseau:', error)
            return { success: false, error: 'Erreur réseau' }
        }
    },

    // ✅ NEW: Update a patient
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
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(patientData)
            })
            const data = await response.json()
            
            if (response.ok) {
                const frontendPatient: Patient = {
                    id: data.id,
                    name: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
                    initials: `${(data.first_name || '')[0]}${(data.last_name || '')[0]}`,
                    age: data.date_of_birth ? new Date().getFullYear() - new Date(data.date_of_birth).getFullYear() : 0,
                    birthDate: data.date_of_birth || '',
                    dmiId: data.external_ref || '',
                    phone: data.phone || '',
                    gender: data.gender || '',
                    lastSession: data.last_session || new Date().toLocaleDateString('fr-FR'),
                    color: ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'][Math.floor(Math.random() * 6)]
                }
                return { success: true, data: frontendPatient }
            }
            return { success: false, error: data.detail || 'Erreur' }
        } catch (error) {
            console.error('Erreur réseau:', error)
            return { success: false, error: 'Erreur réseau' }
        }
    },

    // ✅ NEW: Delete a patient
    delete: async (patientId: string): Promise<ApiResponse<void>> => {
        const token = getToken()
        if (!token) return { success: false, error: 'Non authentifié' }

        try {
            const response = await fetch(`${API_URL}/patients/${patientId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            
            if (response.ok) {
                return { success: true }
            }
            const data = await response.json()
            return { success: false, error: data.detail || 'Erreur' }
        } catch (error) {
            console.error('Erreur réseau:', error)
            return { success: false, error: 'Erreur réseau' }
        }
    }
}

// ===================== REPORT API =====================
export const reportsApi = {
    getByPatientId: async (patientId: string): Promise<ApiResponse<PatientReport>> => {
        const token = getToken()
        if (!token) return { success: false, error: 'Non authentifié' }

        try {
            const response = await fetch(`${API_URL}/reports/${patientId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            
            if (response.ok) {
                return { success: true, data }
            }
            return { success: false, error: data.detail || 'Erreur' }
        } catch (error) {
            return { success: false, error: 'Erreur réseau' }
        }
    },

    exportPdf: async (patientId: string): Promise<Blob | null> => {
        const token = getToken()
        if (!token) return null

        try {
            const response = await fetch(`${API_URL}/reports/${patientId}/pdf`, {
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
    ): Promise<ApiResponse<{ session_id: string; status: string }>> => {
        const token = getToken()
        if (!token) return { success: false, error: 'Non authentifié' }

        try {
            const formData = new FormData()
            formData.append('audio', audioBlob, `${patientId}_${testType}_${Date.now()}.webm`)
            formData.append('patient_id', patientId)
            formData.append('test_type', testType)

            const response = await fetch(`${API_URL}/ingest/sessions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            })

            const data = await response.json()
            
            if (response.ok) {
                return { success: true, data }
            }
            return { success: false, error: data.detail || 'Erreur' }
        } catch (error) {
            console.error('❌ Erreur upload:', error)
            return { success: false, error: 'Erreur réseau' }
        }
    },

    getStatus: async (sessionId: string): Promise<ApiResponse<any>> => {
        const token = getToken()
        if (!token) return { success: false, error: 'Non authentifié' }

        try {
            const response = await fetch(`${API_URL}/ingest/sessions/${sessionId}/status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            
            if (response.ok) {
                return { success: true, data }
            }
            return { success: false, error: data.detail || 'Erreur' }
        } catch (error) {
            return { success: false, error: 'Erreur réseau' }
        }
    }
}

// ===================== DOCTORS API =====================
export const doctorsApi = {
    uploadVoice: async (accessToken: string, audioBlob: Blob, filename: string): Promise<ApiResponse<any>> => {
        try {
            const formData = new FormData()
            formData.append('audio', audioBlob, filename)

            const response = await fetch(`${API_URL}/doctors/voice-enroll`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}` },
                body: formData
            })
            const data = await response.json()
            if (response.ok) return { success: true, data }
            return { success: false, error: data.detail || 'Erreur' }
        } catch {
            return { success: false, error: 'Erreur réseau' }
        }
    },

    getAll: async (): Promise<ApiResponse<any[]>> => {
        const token = getToken()
        if (!token) return { success: false, error: 'Non authentifié' }

        try {
            const response = await fetch(`${API_URL}/doctors`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            const data = await response.json()
            if (response.ok) return { success: true, data }
            return { success: false, error: data.detail || 'Erreur' }
        } catch {
            return { success: false, error: 'Erreur réseau' }
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

            ws.onerror = () => onError('Erreur WebSocket')
            ws.onclose = () => console.log('WebSocket fermé')

            return ws
        } catch {
            onError('Erreur connexion WebSocket')
            return null
        }
    },

    disconnect: (ws: WebSocket | null) => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.close()
    }
}