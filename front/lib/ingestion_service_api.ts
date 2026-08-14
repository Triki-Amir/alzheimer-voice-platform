// lib/api/ingestion_service_api.ts
import { getToken } from '@/lib/auth'

const INGESTION_URL = 'http://localhost:8001'

export interface UploadResponse {
    session_id: string
    status: string
}

export interface SessionStatus {
    session_id: string
    patient_id: string
    status: 'pending' | 'processing' | 'completed' | 'failed'
    created_at: string
    metadata: any
    has_audio: boolean
}

export interface ApiResponse<T> {
    success: boolean
    data?: T
    error?: string
}

export const ingestionApi = {
    /**
     * Upload audio file for a patient
     */
    uploadAudio: async (
        patientId: string,
        audioBlob: Blob,
        testType: string = 'cognitive'
    ): Promise<ApiResponse<UploadResponse>> => {
        const token = getToken()
        if (!token) {
            return { success: false, error: 'Non authentifié' }
        }

        if (!patientId) {
            return { success: false, error: 'ID patient requis' }
        }

        if (!audioBlob || audioBlob.size === 0) {
            return { success: false, error: 'Aucun audio à uploader' }
        }

        try {
            const formData = new FormData()
            
            // ✅ Append patient_id as string
            formData.append('patient_id', patientId)
            
            // ✅ Append audio file with proper filename
            const filename = `${patientId}_${testType}_${Date.now()}.webm`
            formData.append('audio', audioBlob, filename)

            // ✅ Log FormData contents for debugging
            console.log('📤 Uploading audio:', {
                patientId,
                filename,
                fileSize: audioBlob.size,
                fileType: audioBlob.type
            })

            const response = await fetch(`${INGESTION_URL}/sessions/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    // ❌ DON'T set Content-Type header - let the browser set it with boundary
                },
                body: formData,
            })

            if (!response.ok) {
                const errorText = await response.text()
                console.error('❌ Upload failed:', response.status, errorText)
                return {
                    success: false,
                    error: `Erreur ${response.status}: ${errorText}`
                }
            }

            const data = await response.json()
            console.log('✅ Upload successful:', data)
            return { success: true, data }
        } catch (error) {
            console.error('❌ Upload error:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Erreur réseau'
            }
        }
    },

    /**
     * Get session status
     */
    getSessionStatus: async (sessionId: string): Promise<ApiResponse<SessionStatus>> => {
        const token = getToken()
        if (!token) {
            return { success: false, error: 'Non authentifié' }
        }

        try {
            const response = await fetch(`${INGESTION_URL}/sessions/${sessionId}/status`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            })

            if (!response.ok) {
                const error = await response.json()
                return {
                    success: false,
                    error: error.detail || 'Erreur lors de la récupération du statut'
                }
            }

            const data = await response.json()
            return { success: true, data }
        } catch (error) {
            console.error('❌ Get status error:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Erreur réseau'
            }
        }
    },

    /**
     * Get all sessions for a patient
     */
    getPatientSessions: async (patientId: string, limit: number = 10): Promise<ApiResponse<SessionStatus[]>> => {
        const token = getToken()
        if (!token) {
            return { success: false, error: 'Non authentifié' }
        }

        try {
            const response = await fetch(`${INGESTION_URL}/patients/${patientId}/sessions?limit=${limit}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            })

            if (!response.ok) {
                const error = await response.json()
                return {
                    success: false,
                    error: error.detail || 'Erreur lors de la récupération des sessions'
                }
            }

            const data = await response.json()
            return { success: true, data }
        } catch (error) {
            console.error('❌ Get sessions error:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Erreur réseau'
            }
        }
    },

    /**
     * Poll session status until complete or failed
     */
    pollSessionStatus: async (
        sessionId: string,
        interval: number = 2000,
        maxAttempts: number = 30
    ): Promise<ApiResponse<SessionStatus>> => {
        let attempts = 0

        while (attempts < maxAttempts) {
            const result = await ingestionApi.getSessionStatus(sessionId)

            if (!result.success) {
                return result
            }

            const status = result.data?.status

            if (status === 'completed') {
                return result
            }

            if (status === 'failed') {
                return {
                    success: false,
                    error: 'Le traitement de la session a échoué',
                    data: result.data
                }
            }

            // Attendre avant le prochain poll
            await new Promise(resolve => setTimeout(resolve, interval))
            attempts++
        }

        return {
            success: false,
            error: `Délai d'attente dépassé après ${maxAttempts} tentatives`
        }
    }
}