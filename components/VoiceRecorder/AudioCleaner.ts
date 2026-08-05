// components/VoiceRecorder/AudioCleaner.ts

interface CleanResult {
    success: boolean
    filename?: string
    path?: string
    audioBase64?: string
    metrics?: {
        rms_original: number
        rms_denoised: number
        snr_db: number
        noise_reduction: number
        duration: number
    }
    error?: string
}

export class AudioCleaner {
    /**
     * Nettoie un fichier audio via l'API Next.js
     * @param audioBlob - Le blob audio à nettoyer
     * @param patientId - L'ID du patient
     * @param testType - Le type de test
     * @returns Le résultat du nettoyage
     */
    static async cleanAudio(
        audioBlob: Blob,
        patientId: string,
        testType: string
    ): Promise<CleanResult> {
        try {
            const formData = new FormData()
            formData.append('audio', audioBlob, `${patientId}_${testType}.webm`)
            formData.append('patientId', patientId)
            formData.append('testType', testType)

            const response = await fetch('/api/denoise', {
                method: 'POST',
                body: formData
            })

            const result = await response.json()

            if (!response.ok) {
                return {
                    success: false,
                    error: result.error || 'Erreur lors du nettoyage'
                }
            }

            return {
                success: true,
                filename: result.filename,
                path: result.path,
                audioBase64: result.audioBase64,
                metrics: result.metrics
            }

        } catch (error) {
            console.error('❌ Erreur cleanAudio:', error)
            return {
                success: false,
                error: 'Erreur réseau lors du nettoyage'
            }
        }
    }

    /**
     * Convertit une chaîne base64 en Blob
     */
    static base64ToBlob(base64: string, mimeType: string = 'audio/wav'): Blob {
        const byteCharacters = atob(base64)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        return new Blob([byteArray], { type: mimeType })
    }
}